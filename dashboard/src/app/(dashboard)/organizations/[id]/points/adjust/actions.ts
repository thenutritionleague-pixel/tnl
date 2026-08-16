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
  transactionDate?: string,
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
  if (Math.abs(amount) > 10000) return { error: 'Amount cannot exceed ±10,000 points.' }

  const client = await createAdminClient()

  // Verify the target user belongs to this org.
  // Check org_members, not profiles.org_id — profiles.org_id is only the
  // member's ACTIVE org, so a multi-org member offered by the picker (which
  // reads org_members) would otherwise be rejected here.
  const { data: targetUser } = await client
    .from('org_members')
    .select('user_id')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!targetUser) return { error: 'User not found in this organization.' }

  const { error } = await client.from('points_transactions').insert({
    user_id: userId,
    org_id: orgId,
    amount,
    reason: `${reason.trim()} [by ${profile.name}]`,
    is_manual: true,
    transaction_date: transactionDate ?? new Date().toISOString().slice(0, 10),
  })

  if (error) return { error: error.message }

  // Update profile total_points atomically
  await client.rpc('increment_member_points', { p_user_id: userId, p_amount: amount })

  revalidatePath(`/organizations/${orgId}/points`)
  revalidatePath(`/organizations/${orgId}/members/${userId}`)
  revalidatePath(`/organizations/${orgId}/members`)
  revalidatePath(`/organizations/${orgId}/teams`)
  return { success: true }
}

export async function updateManualAdjustment(
  orgId: string,
  userId: string,
  txnId: string,
  newAmount: number,
  newReason: string,
  newTransactionDate: string,
): Promise<{ success?: true; error?: string }> {
  const profile = await getAdminProfile()
  if (!profile) return { error: 'Unauthorized.' }
  if (!ALLOWED_ROLES.includes(profile.role)) return { error: 'Unauthorized.' }
  if (['org_admin', 'sub_admin'].includes(profile.role) && profile.org_id !== orgId) {
    return { error: 'Unauthorized.' }
  }
  if (!newReason.trim()) return { error: 'Reason is required.' }
  if (!Number.isFinite(newAmount) || newAmount === 0) return { error: 'Amount must be a non-zero number.' }
  if (Math.abs(newAmount) > 10000) return { error: 'Amount cannot exceed ±10,000 points.' }

  const client = await createAdminClient()

  // Fetch existing row to calculate delta
  const { data: existing } = await client
    .from('points_transactions')
    .select('amount, user_id, org_id')
    .eq('id', txnId)
    .eq('is_manual', true)
    .single()
  if (!existing) return { error: 'Adjustment not found.' }
  if (existing.org_id !== orgId || existing.user_id !== userId) return { error: 'Unauthorized.' }

  const delta = newAmount - (existing.amount as number)

  const { error } = await client
    .from('points_transactions')
    .update({
      amount: newAmount,
      reason: `${newReason.trim()} [by ${profile.name}]`,
      transaction_date: newTransactionDate,
    })
    .eq('id', txnId)
  if (error) return { error: error.message }

  if (delta !== 0) {
    await client.rpc('increment_member_points', { p_user_id: userId, p_amount: delta })
  }

  revalidatePath(`/organizations/${orgId}/points`)
  revalidatePath(`/organizations/${orgId}/members/${userId}`)
  revalidatePath(`/organizations/${orgId}/members`)
  revalidatePath(`/organizations/${orgId}/teams`)
  return { success: true }
}

export async function deleteManualAdjustment(
  orgId: string,
  userId: string,
  txnId: string,
): Promise<{ success?: true; error?: string }> {
  const profile = await getAdminProfile()
  if (!profile) return { error: 'Unauthorized.' }
  if (!ALLOWED_ROLES.includes(profile.role)) return { error: 'Unauthorized.' }
  if (['org_admin', 'sub_admin'].includes(profile.role) && profile.org_id !== orgId) {
    return { error: 'Unauthorized.' }
  }

  const client = await createAdminClient()

  // Fetch the amount to reverse
  const { data: existing } = await client
    .from('points_transactions')
    .select('amount, user_id, org_id')
    .eq('id', txnId)
    .eq('is_manual', true)
    .single()
  if (!existing) return { error: 'Adjustment not found.' }
  if (existing.org_id !== orgId || existing.user_id !== userId) return { error: 'Unauthorized.' }

  const { error } = await client
    .from('points_transactions')
    .delete()
    .eq('id', txnId)
  if (error) return { error: error.message }

  // Reverse the points
  await client.rpc('increment_member_points', { p_user_id: userId, p_amount: -(existing.amount as number) })

  revalidatePath(`/organizations/${orgId}/points`)
  revalidatePath(`/organizations/${orgId}/members/${userId}`)
  revalidatePath(`/organizations/${orgId}/members`)
  revalidatePath(`/organizations/${orgId}/teams`)
  return { success: true }
}
