'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getAdminProfile } from '@/lib/auth'

const ALLOWED_ROLES = ['super_admin', 'sub_super_admin', 'org_admin', 'sub_admin']

export async function addManualAdjustment(
  orgId: string,
  userId: string,
  amount: number,
  reason: string,
): Promise<{ success?: true; error?: string }> {
  const profile = await getAdminProfile()
  if (!profile) return { error: 'Unauthorized.' }
  if (!ALLOWED_ROLES.includes(profile.role)) return { error: 'Unauthorized.' }

  // Org-scoped admins can only adjust within their own org
  if (['org_admin', 'sub_admin'].includes(profile.role) && profile.org_id !== orgId) {
    return { error: 'Unauthorized.' }
  }

  if (!reason.trim()) return { error: 'Reason is required.' }
  if (!Number.isFinite(amount) || amount === 0) return { error: 'Amount must be a non-zero number.' }

  const client = await createAdminClient()
  const { error } = await client.from('points_transactions').insert({
    user_id: userId,
    org_id: orgId,
    amount,
    reason: `${reason.trim()} [by ${profile.name}]`,
    is_manual: true,
  })

  if (error) return { error: error.message }
  revalidatePath(`/organizations/${orgId}/points`)
  return { success: true }
}
