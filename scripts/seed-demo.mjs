import { existsSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { client, ok, config, signIn, siteArgs, taskArgs, transitionArgs } from './common.mjs'

const { url, key, file } = config()
if (existsSync(file)) throw new Error('Use a new path for the private credentials file.')
const adminKey = process.env.CRM_SUPABASE_ADMIN_KEY
if (!adminKey) throw new Error('Set CRM_SUPABASE_ADMIN_KEY in the server-side shell.')
const admin = client(url, adminKey)
const run = randomBytes(4).toString('hex')
const people = [
  ['manager', 'Постановщик', 'manager'],
  ['executor-a', 'Исполнитель 1', 'executor'],
  ['executor-b', 'Исполнитель 2', 'executor'],
]
const accounts = people.map(([label, name, role]) => ({
  label, name, role, email: label + '+' + run + '@crm-demo.example.com', password: randomBytes(24).toString('base64url'),
}))
// Keep credentials recoverable even if a later provisioning call fails.
writeFileSync(file, JSON.stringify(accounts, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
for (const person of accounts) {
  const { user } = ok(await admin.auth.admin.createUser({ email: person.email, password: person.password, email_confirm: true }))
  ok(await admin.from('profiles').insert({ id: user.id, name: person.name, role: person.role }))
}
const [manager, a, b] = await Promise.all(accounts.map(account => signIn(url, key, account)))
const sites = []
for (const [name, address] of [
  ['ЖК «Северный парк»', 'ул. Лесная, 18'],
  ['Деловой центр «Горизонт»', 'пр. Строителей, 7'],
  ['Школа на Садовой', 'ул. Садовая, 32'],
]) sites.push(ok(await manager.db.rpc('save_object', siteArgs(name, address))))

async function create(site, assignee, title, description) {
  return ok(await manager.db.rpc('save_task', taskArgs(site, assignee.id, title, description)))
}
async function move(account, id, from, to, note) {
  ok(await account.db.rpc('transition_task', transitionArgs(id, from, to, note)))
}
await create(sites[0], a, 'Проверить разметку первого этажа', 'Сверить размеры с планом и отметить расхождения перед началом работ.')
const fence = await create(sites[0], b, 'Осмотреть ограждение', 'Проверить проходы и целостность секций по периметру.')
await move(b, fence, 'new', 'in_progress')
const wiring = await create(sites[1], a, 'Подготовить схему освещения', 'Указать расположение светильников в коридорах и на лестницах.')
await move(a, wiring, 'new', 'in_progress')
await move(a, wiring, 'in_progress', 'in_review')
const delivery = await create(sites[2], b, 'Принять поставку плитки', 'Сверить количество коробок и отметить повреждения.')
await move(b, delivery, 'new', 'in_progress')
await move(b, delivery, 'in_progress', 'in_review')
await move(manager, delivery, 'in_review', 'revision', 'Добавьте количество коробок по каждому цвету.')
console.log('Created three demo users, three objects and four tasks. Credentials saved to the private file.')
