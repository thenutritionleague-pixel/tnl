import { cache } from 'react'
import { createClient, createAdminClient } from './supabase/server'

// React cache deduplicates these calls within a single request.
// Layout and page both call these, but they only hit the DB once.

export const getUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

export const getAdminProfile = cache(async () => {
  const user = await getUser()
  if (!user) return null
  const adminClient = await createAdminClient()

  // Normal case: look up by user_id
  const { data } = await adminClient
    .from('admin_users')
    .select('id, user_id, org_id, name, email, role, status, created_by, created_at')
    .eq('user_id', user.id)
    .single()
  if (data) return data

  // Fallback: match by email and sync user_id (handles first-time login or auth re-creation)
  const { data: byEmail } = await adminClient
    .from('admin_users')
    .select('id, user_id, org_id, name, email, role, status, created_by, created_at')
    .eq('email', user.email!)
    .single()
  if (byEmail) {
    if (byEmail.user_id !== user.id) {
      await adminClient.from('admin_users').update({ user_id: user.id }).eq('id', byEmail.id)
    }
    return { ...byEmail, user_id: user.id }
  }

  return null
})
