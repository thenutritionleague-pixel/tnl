'use server'

import { createAdminClient } from '@/lib/supabase/server'

export async function checkAdminEmail(email: string) {
  const client = await createAdminClient()
  const { data } = await client
    .from('admin_users')
    .select('status')
    .eq('email', email.toLowerCase().trim())
    .single()

  if (!data) return { error: 'You are not authorized to access this dashboard. Contact your administrator.' }
  if (data.status === 'inactive') return { error: 'Your account has been deactivated. Contact your administrator.' }
  return { allowed: true }
}
