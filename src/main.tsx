import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient, type Session } from '@supabase/supabase-js'
import { HashRouter, Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router'
import { ArrowLeft, ArrowRight, Building2, ClipboardList, HardHat, LogOut, MapPin, Plus, RefreshCw, X } from 'lucide-react'
import './style.css'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const db = url && key ? createClient(url, key) : null
type Role = 'manager' | 'executor'
const statusLabel = { new: 'Новая', in_progress: 'В работе', in_review: 'На проверке', accepted: 'Принята', revision: 'На доработке' }
type Status = keyof typeof statusLabel
type Profile = { id: string; name: string; role: Role }
type Site = { id: string; name: string; address: string }
type Task = { id: string; object_id: string; assignee_id: string; author_id: string; title: string; description: string; status: Status; created_at: string }
type History = { id: number; actor_name: string; old_status: Status | null; new_status: Status; comment: string | null; created_at: string }
type Data = { me: Profile; profiles: Profile[]; sites: Site[]; tasks: Task[] }
type Popup = { kind: 'site'; site?: Site } | { kind: 'task'; task?: Task; siteId: string } | { kind: 'revision'; task: Task } | { kind: 'delete'; item: 'site' | 'task'; id: string; title: string }
const time = (s: string) => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(s))
const errText = (e: unknown) => typeof e === 'object' && e && 'message' in e ? String(e.message) : 'Не удалось выполнить действие.'

function Brand() {
  return <div className="brand"><div className="brand-icon"><HardHat size={20} /></div><div>Объекты и задачи<small>Рабочее пространство</small></div></div>
}
function StatusBadge({ status }: { status: Status }) {
  return <span className={'badge ' + status}><i />{statusLabel[status]}</span>
}
function Empty({ children }: { children: ReactNode }) {
  return <div className="empty"><ClipboardList size={23} /><p>{children}</p></div>
}
function Login() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true)
    setError('')
    try {
      const { error } = await db!.auth.signInWithPassword({ email: String(form.get('email')).trim(), password: String(form.get('password')) })
      if (error) setError(error.code === 'invalid_credentials' ? 'Неверная почта или пароль.' : 'Не удалось войти. Попробуйте ещё раз.')
    } catch { setError('Проверьте подключение и попробуйте ещё раз.') }
    finally { setBusy(false) }
  }
  return <main className="login"><section className="login-card"><Brand /><h1>Вход</h1><p className="muted">Войдите, чтобы открыть рабочее пространство.</p>
    <form onSubmit={submit} className="form">
      <label>Электронная почта<input name="email" type="email" required autoComplete="username" placeholder="name@example.com" /></label>
      <label>Пароль<input name="password" type="password" required autoComplete="current-password" /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? 'Входим…' : 'Войти'}<ArrowRight size={16} /></button>
    </form>
  </section></main>
}
function Dialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} aria-labelledby="dialog-title" onCancel={e => { e.preventDefault(); close() }}>
    <div className="dialog-head"><h2 id="dialog-title">{title}</h2><button aria-label="Закрыть" className="icon" onClick={close}><X size={20} /></button></div>
    {children}
  </dialog>
}
function TaskList({ tasks, data }: { tasks: Task[]; data: Data }) {
  if (!tasks.length) return <Empty>Здесь пока нет задач.</Empty>
  return <div className="task-list">{tasks.map(task => <Link className="task-row" to={'/tasks/' + task.id} key={task.id}>
    <div className="row-icon"><ClipboardList size={17} /></div>
    <div className="grow"><strong>{task.title}</strong><small>{data.sites.find(s => s.id === task.object_id)?.name}{data.me.role === 'manager' && ' · ' + (data.profiles.find(p => p.id === task.assignee_id)?.name ?? 'Исполнитель')}</small></div>
    <StatusBadge status={task.status} /><ArrowRight className="chevron" size={16} />
  </Link>)}</div>
}
function SiteDetail({ data, open }: { data: Data; open: (p: Popup) => void }) {
  const { id } = useParams()
  const site = data.sites.find(s => s.id === id)
  if (!site) return <Unavailable />
  const manager = data.me.role === 'manager'
  const tasks = data.tasks.filter(t => t.object_id === site.id)
  return <>
    <Link className="back" to="/"><ArrowLeft size={16} /> Объекты</Link>
    <div className="page-head"><div><h1>{site.name}</h1><p className="muted inline"><MapPin size={16} />{site.address}</p></div>
      {manager && <div className="actions"><button onClick={() => open({ kind: 'site', site })}>Редактировать</button><button className="danger" onClick={() => open({ kind: 'delete', item: 'site', id: site.id, title: site.name })}>Удалить</button></div>}
    </div>
    <div className="section-head"><h2>Задачи объекта <span className="count">{tasks.length}</span></h2>
      {manager && <button className="primary" onClick={() => open({ kind: 'task', siteId: site.id })}><Plus size={17} />Новая задача</button>}
    </div>
    <TaskList tasks={tasks} data={data} />
  </>
}
function Unavailable() {
  return <><Link className="back" to="/"><ArrowLeft size={16} /> К объектам</Link><Empty>Запись недоступна или удалена.</Empty></>
}
function TaskDetail({ data, open, change, version, busy }: { data: Data; open: (p: Popup) => void; change: (t: Task, s: Status) => void; version: number; busy: boolean }) {
  const { id } = useParams()
  const task = data.tasks.find(t => t.id === id)
  const [history, setHistory] = useState<History[] | null>(null)
  const [historyError, setHistoryError] = useState('')
  useEffect(() => {
    let active = true
    setHistory(null)
    setHistoryError('')
    if (task) {
      db!.from('task_history').select('id,actor_name,old_status,new_status,comment,created_at')
        .eq('task_id', task.id).order('id', { ascending: false }).returns<History[]>()
        .then(({ data, error }) => { if (active) { setHistory(data); if (error) setHistoryError('Не удалось загрузить историю.') } })
    }
    return () => { active = false }
  }, [task?.id, version])
  if (!task) return <Unavailable />
  const site = data.sites.find(s => s.id === task.object_id)
  const manager = data.me.role === 'manager'
  const assignee = data.profiles.find(p => p.id === task.assignee_id)
  const author = data.profiles.find(p => p.id === task.author_id)?.name ?? history?.find(h => h.old_status === null)?.actor_name
  return <>
    <Link className="back" to={'/objects/' + task.object_id}><ArrowLeft size={16} /> {site?.name ?? 'Объект'}</Link>
    <div className="page-head"><div><StatusBadge status={task.status} /><h1>{task.title}</h1></div>
      {manager && <div className="actions"><button onClick={() => open({ kind: 'task', task, siteId: task.object_id })}>Редактировать</button><button className="danger" onClick={() => open({ kind: 'delete', item: 'task', id: task.id, title: task.title })}>Удалить</button></div>}
    </div>
    <div className="details">
      <section className="panel"><h2>Описание</h2><p className="description">{task.description || 'Описание не добавлено.'}</p>
        <div className="actions">
          {!manager && (task.status === 'new' || task.status === 'revision') && <button className="primary" disabled={busy} onClick={() => change(task, 'in_progress')}>Взять в работу</button>}
          {!manager && task.status === 'in_progress' && <button className="primary" disabled={busy} onClick={() => change(task, 'in_review')}>Отправить на проверку</button>}
          {manager && task.status === 'in_review' && <><button className="primary" disabled={busy} onClick={() => change(task, 'accepted')}>Принять</button><button disabled={busy} onClick={() => open({ kind: 'revision', task })}>Вернуть на доработку</button></>}
        </div>
      </section>
      <aside className="panel"><dl><dt>Объект</dt><dd><Link to={'/objects/' + task.object_id}>{site?.name}</Link></dd><dt>Исполнитель</dt><dd>{assignee?.name ?? '—'}</dd><dt>Постановщик</dt><dd>{author ?? '—'}</dd><dt>Создана</dt><dd>{time(task.created_at)}</dd></dl></aside>
    </div>
    <section className="history"><h2>История</h2>{historyError ? <p className="error" role="alert">{historyError}</p> : !history ? <p role="status">Загружаем историю…</p> : history.length === 0 ? <Empty>Изменений пока нет.</Empty> :
      <ol>{history.map(h => <li key={h.id}><div className="history-dot" /><div><strong>{h.old_status ? statusLabel[h.old_status] + ' → ' + statusLabel[h.new_status] : 'Задача создана'}</strong><small>{h.actor_name} · {time(h.created_at)}</small>{h.comment && <p>{h.comment}</p>}</div></li>)}</ol>}
    </section>
  </>
}
function Workspace({ session }: { session: Session }) {
  const [data, setData] = useState<Data | null>(null)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [popup, setPopup] = useState<Popup | null>(null)
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [version, setVersion] = useState(0)
  const nav = useNavigate()
  async function reload() {
    setRefreshing(true)
    setLoadError('')
    try {
      const [profiles, sites, tasks] = await Promise.all([
        db!.from('profiles').select('id,name,role').order('name').returns<Profile[]>(),
        db!.from('objects').select('id,name,address').order('name').returns<Site[]>(),
        db!.from('tasks').select('id,object_id,assignee_id,author_id,title,description,status,created_at').order('created_at', { ascending: false }).returns<Task[]>(),
      ])
      if (profiles.error || sites.error || tasks.error) throw profiles.error ?? sites.error ?? tasks.error
      const people = profiles.data!
      const me = people.find(p => p.id === session.user.id)
      if (!me) throw new Error('Для этого аккаунта не назначена роль.')
      setData({ me, profiles: people, sites: sites.data!, tasks: tasks.data! })
      setVersion(v => v + 1)
    } catch (e) { setLoadError(errText(e)) }
    finally { setRefreshing(false) }
  }
  useEffect(() => { void reload() }, [session.user.id])
  function open(p: Popup) { setActionError(''); setPopup(p) }
  async function run(fn: string, args: Record<string, unknown>, done?: (id: string) => void) {
    setBusy(true)
    setActionError('')
    try {
      const { data: result, error } = await db!.rpc(fn, args)
      if (error) throw error
      setPopup(null)
      await reload()
      done?.(result as string)
    } catch (e) { setActionError(errText(e)) }
    finally { setBusy(false) }
  }
  const transition = (task: Task, next: Status, comment = '') => run('transition_task', { p_id: task.id, p_expected: task.status, p_next: next, p_comment: comment })
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!popup || busy) return
    const fields = new FormData(e.currentTarget)
    const field = (name: string) => String(fields.get(name) ?? '').trim()
    if (popup.kind === 'site') return run('save_object', { p_id: popup.site?.id ?? null, p_name: field('name'), p_address: field('address') }, id => nav('/objects/' + id))
    if (popup.kind === 'task') return run('save_task', { p_id: popup.task?.id ?? null, p_object_id: field('site'), p_assignee_id: field('assignee'), p_title: field('title'), p_description: field('description') }, id => nav('/tasks/' + id))
    if (popup.kind === 'revision') return transition(popup.task, 'revision', field('comment'))
    const parent = data?.tasks.find(t => t.id === popup.id)?.object_id
    return run(popup.item === 'site' ? 'archive_object' : 'archive_task', { p_id: popup.id }, () => nav(parent ? '/objects/' + parent : '/'))
  }
  return <>
    <header><div className="bar"><Link to="/" aria-label="Объекты"><Brand /></Link><div className="account">{data && <div><strong>{data.me.name}</strong><small>{data.me.role === 'manager' ? 'Постановщик' : 'Исполнитель'}</small></div>}<button className="icon" aria-label="Выйти" title="Выйти" onClick={() => void db!.auth.signOut()}><LogOut size={19} /></button></div></div></header>
    <main className="workspace">
      <div className="toolbar"><nav aria-label="Разделы"><NavLink end to="/"><Building2 size={17} />Объекты</NavLink>{data?.me.role === 'executor' && <NavLink to="/my-tasks"><ClipboardList size={17} />Мои задачи</NavLink>}</nav><button className="icon" title="Обновить" aria-label="Обновить" disabled={refreshing || busy} onClick={() => void reload()}><RefreshCw size={17} /></button></div>
      {loadError && <p className="error" role="alert">{loadError}</p>}
      {!popup && actionError && <p className="error" role="alert">{actionError}</p>}
      {data ? <Routes>
        <Route path="/" element={<><div className="page-head"><div><h1>Объекты</h1><p className="muted">Стройки и задачи по ним</p></div>{data.me.role === 'manager' && <button className="primary" onClick={() => open({ kind: 'site' })}><Plus size={17} />Новый объект</button>}</div>
          {data.sites.length ? <div className="sites">{data.sites.map(site => <Link className="site-card" key={site.id} to={'/objects/' + site.id}><div className="site-icon"><Building2 size={22} /></div><h2>{site.name}</h2><p className="muted">{site.address}</p><div className="site-foot"><span>Задач: {data.tasks.filter(t => t.object_id === site.id).length}</span><ArrowRight size={17} /></div></Link>)}</div> : <Empty>Пока нет доступных объектов.</Empty>}</>} />
        <Route path="/objects/:id" element={<SiteDetail data={data} open={open} />} />
        <Route path="/tasks/:id" element={<TaskDetail data={data} open={open} change={transition} version={version} busy={busy} />} />
        {data.me.role === 'executor' && <Route path="/my-tasks" element={<><div className="page-head"><div><h1>Мои задачи</h1><p className="muted">Назначенные вам задачи по всем объектам</p></div></div><TaskList tasks={data.tasks} data={data} /></>} />}
        <Route path="*" element={<Unavailable />} />
      </Routes> : !loadError && <p role="status">Загружаем рабочее пространство…</p>}
    </main>
    {popup && data && <Dialog close={() => { if (!busy) { setPopup(null); setActionError('') } }} title={popup.kind === 'site' ? (popup.site ? 'Редактирование объекта' : 'Новый объект') : popup.kind === 'task' ? (popup.task ? 'Редактирование задачи' : 'Новая задача') : popup.kind === 'revision' ? 'Вернуть на доработку' : 'Подтвердите удаление'}>
      <form className="form" onSubmit={submit}>
        {popup.kind === 'site' && <><label>Название<input name="name" defaultValue={popup.site?.name} required maxLength={120} autoFocus /></label><label>Адрес<input name="address" defaultValue={popup.site?.address} required maxLength={240} /></label></>}
        {popup.kind === 'task' && <><label>Название<input name="title" defaultValue={popup.task?.title} required maxLength={140} autoFocus /></label><label>Описание<textarea name="description" defaultValue={popup.task?.description} rows={4} maxLength={4000} /></label><label>Объект<select name="site" defaultValue={popup.siteId} required>{data.sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Исполнитель<select name="assignee" defaultValue={popup.task?.assignee_id ?? ''} required><option value="" disabled>Выберите исполнителя</option>{data.profiles.filter(p => p.role === 'executor').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></>}
        {popup.kind === 'revision' && <label>Что нужно доработать<textarea name="comment" rows={4} required maxLength={1500} autoFocus /></label>}
        {popup.kind === 'delete' && <p>Удалить «{popup.title}»?</p>}
        {actionError && <p className="error" role="alert">{actionError}</p>}
        <div className="actions"><button type="button" disabled={busy} onClick={() => { setPopup(null); setActionError('') }}>Отмена</button><button className={popup.kind === 'delete' ? 'danger-fill' : 'primary'} disabled={busy}>{busy ? 'Сохраняем…' : popup.kind === 'delete' ? 'Удалить' : popup.kind === 'revision' ? 'Вернуть' : 'Сохранить'}</button></div>
      </form>
    </Dialog>}
  </>
}
function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    const listener = db?.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => listener?.data.subscription.unsubscribe()
  }, [])
  if (!db) return <main className="login"><p className="error">Приложение ещё не подключено к Supabase.</p></main>
  if (session === undefined) return <main className="login"><p role="status">Загружаем приложение…</p></main>
  return session ? <Workspace key={session.user.id} session={session} /> : <Login />
}
createRoot(document.getElementById('root')!).render(<HashRouter><App /></HashRouter>)
