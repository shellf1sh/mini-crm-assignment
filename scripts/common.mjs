import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

export function client(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
}
export function ok(response) {
  if (response.error) throw new Error(response.error.message)
  return response.data
}
export function config() {
  const { CRM_SUPABASE_URL: url, CRM_SUPABASE_PUBLISHABLE_KEY: key, CRM_DEMO_FILE: file } = process.env
  if (!url || !key || !file) throw new Error('Set CRM_SUPABASE_URL, CRM_SUPABASE_PUBLISHABLE_KEY and CRM_DEMO_FILE.')
  return { url, key, file }
}
export async function signIn(url, key, credentials) {
  const db = client(url, key)
  const { user } = ok(await db.auth.signInWithPassword({ email: credentials.email, password: credentials.password }))
  return { db, id: user.id }
}
export const readDemo = file => JSON.parse(readFileSync(file, 'utf8'))
export const siteArgs = (name, address, id = null) => ({ p_id: id, p_name: name, p_address: address })
export const taskArgs = (site, assignee, title, description, id = null) => ({ p_id: id, p_object_id: site, p_assignee_id: assignee, p_title: title, p_description: description })
export const transitionArgs = (task, previous, next, comment = '') => ({ p_id: task, p_expected: previous, p_next: next, p_comment: comment })
