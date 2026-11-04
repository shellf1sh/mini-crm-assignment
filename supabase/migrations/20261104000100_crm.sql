begin;

create schema crm_private;
revoke all on schema crm_private from public, anon, authenticated;
grant usage on schema crm_private to authenticated;

create type public.crm_role as enum ('manager', 'executor');
create type public.task_status as enum ('new', 'in_progress', 'in_review', 'accepted', 'revision');

create table public.profiles (
  id uuid primary key references auth.users(id),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  role public.crm_role not null
);
create table public.objects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  address text not null check (char_length(btrim(address)) between 1 and 240),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references public.objects(id),
  assignee_id uuid not null references public.profiles(id),
  author_id uuid not null references public.profiles(id),
  title text not null check (char_length(btrim(title)) between 1 and 140),
  description text not null check (char_length(description) <= 4000),
  status public.task_status not null default 'new',
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create table public.task_history (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks(id),
  actor_id uuid not null references public.profiles(id),
  actor_name text not null,
  old_status public.task_status,
  new_status public.task_status not null,
  comment text check (char_length(comment) <= 1500),
  created_at timestamptz not null default clock_timestamp()
);

create index tasks_object_active on public.tasks(object_id) where archived_at is null;
create index tasks_assignee_active on public.tasks(assignee_id, object_id) where archived_at is null;
create index history_task_order on public.task_history(task_id, id desc);

-- Use the authenticated identity; role data cannot be edited by a browser client.
create function crm_private.my_role() returns public.crm_role
language sql stable security definer set search_path = ''
as $$ select role from public.profiles where id = (select auth.uid()) $$;
revoke all on function crm_private.my_role() from public, anon, authenticated;
grant execute on function crm_private.my_role() to authenticated;

create function crm_private.require_manager() returns uuid
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if crm_private.my_role() is distinct from 'manager' then
    raise exception using errcode = '42501', message = 'Действие доступно только постановщику.';
  end if;
  return auth.uid();
end;
$$;
revoke all on function crm_private.require_manager() from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.objects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_history enable row level security;

revoke all on public.profiles, public.objects, public.tasks, public.task_history from public, anon, authenticated;
grant select on public.profiles, public.objects, public.tasks, public.task_history to authenticated;
grant select, insert, update on public.profiles to service_role;

create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select crm_private.my_role()) = 'manager');
create policy tasks_read on public.tasks for select to authenticated
  using (archived_at is null and (
    (select crm_private.my_role()) = 'manager'
    or ((select crm_private.my_role()) = 'executor' and assignee_id = (select auth.uid()))
  ));
create policy objects_read on public.objects for select to authenticated
  using (archived_at is null and (
    (select crm_private.my_role()) = 'manager'
    or exists (select 1 from public.tasks where tasks.object_id = objects.id
      and tasks.assignee_id = (select auth.uid()) and tasks.archived_at is null)
  ));
create policy history_read on public.task_history for select to authenticated
  using (exists (select 1 from public.tasks where tasks.id = task_history.task_id));

create function public.save_object(p_id uuid, p_name text, p_address text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare result uuid;
begin
  perform crm_private.require_manager();
  if p_id is null then
    insert into public.objects(name, address) values (btrim(p_name), btrim(p_address)) returning id into result;
  else
    update public.objects set name = btrim(p_name), address = btrim(p_address)
      where id = p_id and archived_at is null returning id into result;
    if not found then raise exception 'Объект не найден.'; end if;
  end if;
  return result;
end;
$$;

create function public.archive_object(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform crm_private.require_manager();
  perform 1 from public.objects where id = p_id and archived_at is null for update;
  if not found then raise exception 'Объект не найден.'; end if;
  if exists (select 1 from public.tasks where object_id = p_id and archived_at is null) then
    raise exception 'Сначала удалите задачи объекта или перенесите их на другой объект.';
  end if;
  update public.objects set archived_at = clock_timestamp() where id = p_id;
end;
$$;

create function public.save_task(p_id uuid, p_object_id uuid, p_assignee_id uuid, p_title text, p_description text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := crm_private.require_manager();
  result uuid;
begin
  perform 1 from public.objects where id = p_object_id and archived_at is null for share;
  if not found then raise exception 'Объект не найден.'; end if;
  if not exists (select 1 from public.profiles where id = p_assignee_id and role = 'executor') then
    raise exception 'Выберите исполнителя.';
  end if;
  if p_id is null then
    insert into public.tasks(object_id, assignee_id, author_id, title, description)
      values (p_object_id, p_assignee_id, actor, btrim(p_title), btrim(p_description))
      returning id into result;
    insert into public.task_history(task_id, actor_id, actor_name, new_status)
      select result, id, name, 'new' from public.profiles where id = actor;
  else
    update public.tasks set object_id = p_object_id, assignee_id = p_assignee_id,
      title = btrim(p_title), description = btrim(p_description)
      where id = p_id and archived_at is null returning id into result;
    if not found then raise exception 'Задача не найдена.'; end if;
  end if;
  return result;
end;
$$;

create function public.archive_task(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform crm_private.require_manager();
  update public.tasks set archived_at = clock_timestamp() where id = p_id and archived_at is null;
  if not found then raise exception 'Задача не найдена.'; end if;
end;
$$;

create function public.transition_task(p_id uuid, p_expected public.task_status, p_next public.task_status, p_comment text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_role public.crm_role := crm_private.my_role();
  item public.tasks;
  note text := nullif(regexp_replace(p_comment, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
begin
  if actor_role is null then
    raise exception using errcode = '42501', message = 'Войдите в приложение.';
  end if;
  select * into item from public.tasks
    where id = p_id and archived_at is null and (actor_role = 'manager' or assignee_id = actor)
    for update;
  if not found then raise exception using errcode = '42501', message = 'Задача недоступна.'; end if;
  if item.status is distinct from p_expected then
    raise exception using errcode = '40001', message = 'Статус уже изменился. Обновите карточку.';
  end if;
  if not coalesce(
    (actor_role = 'executor' and item.assignee_id = actor and (
      (item.status in ('new', 'revision') and p_next = 'in_progress')
      or (item.status = 'in_progress' and p_next = 'in_review')
    )) or (actor_role = 'manager' and item.status = 'in_review' and p_next in ('accepted', 'revision')),
    false
  ) then
    raise exception using errcode = '42501', message = 'Этот переход недоступен.';
  end if;
  if p_next = 'revision' and note is null then
    raise exception using errcode = '22023', message = 'Укажите, что нужно доработать.';
  end if;
  update public.tasks set status = p_next where id = item.id;
  insert into public.task_history(task_id, actor_id, actor_name, old_status, new_status, comment)
    select item.id, id, name, item.status, p_next, note from public.profiles where id = actor;
end;
$$;

revoke all on function public.save_object(uuid,text,text), public.archive_object(uuid),
  public.save_task(uuid,uuid,uuid,text,text), public.archive_task(uuid),
  public.transition_task(uuid,public.task_status,public.task_status,text) from public, anon, authenticated;
grant execute on function public.save_object(uuid,text,text), public.archive_object(uuid),
  public.save_task(uuid,uuid,uuid,text,text), public.archive_task(uuid),
  public.transition_task(uuid,public.task_status,public.task_status,text) to authenticated;

commit;
