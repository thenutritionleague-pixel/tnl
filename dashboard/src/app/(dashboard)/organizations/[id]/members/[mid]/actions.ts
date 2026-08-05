'use server'

import { revalidatePath } from 'next/cache'
import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { getAdminProfile } from '@/lib/auth'

const BUNNY_CDN_HOSTNAME = process.env.BUNNY_CDN_HOSTNAME  || 'vz-c97d7e4d-363.b-cdn.net'
const BUNNY_TOKEN_AUTH   = process.env.BUNNY_TOKEN_AUTH_KEY || ''

const BUNNY_MP4_RESOLUTIONS = ['720p', '480p', '360p', '240p', '1080p']

function bunnySignPath(path: string, ttlSeconds = 1800): string {
  const url = `https://${BUNNY_CDN_HOSTNAME}${path}`
  if (!BUNNY_TOKEN_AUTH) return url
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds
  const raw = BUNNY_TOKEN_AUTH + path + String(expires)
  const md5 = createHash('md5').update(raw).digest()
  const token = md5.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${url}?token=${token}&expires=${expires}`
}

// Try each resolution (HEAD) and return the first that exists; Bunny only
// generates renditions that fit the source, so a hardcoded 480p can 404.
async function bunnyPlayableUrl(guid: string, ttlSeconds = 1800): Promise<string> {
  for (const r of BUNNY_MP4_RESOLUTIONS) {
    const url = bunnySignPath(`/${guid}/play_${r}.mp4`, ttlSeconds)
    try {
      const head = await fetch(url, { method: 'HEAD' })
      if (head.ok) return url
    } catch { /* try next resolution */ }
  }
  return bunnySignPath(`/${guid}/play_480p.mp4`, ttlSeconds)
}

const ALLOWED_ROLES = ['super_admin', 'sub_super_admin', 'org_admin', 'sub_admin']
const ORG_SCOPED_ROLES = ['org_admin', 'sub_admin']

export async function getProofSignedUrl(path: string): Promise<string | null> {
  const profile = await getAdminProfile()
  if (!profile) return null

  // Bunny Stream videos — signed CDN URL (tries resolutions so a missing 480p
  // rendition never 404s).
  if (path.startsWith('bunny://')) {
    const guid = path.replace('bunny://', '')
    return await bunnyPlayableUrl(guid)
  }

  const client = await createAdminClient()
  // No transform — Supabase Pro's "Storage Image Transformations" quota is
  // only 100 unique source images per month, far too restrictive. Mobile
  // uploads already cap proofs at 1280×1280 / quality 82 (~150-300 KB) so
  // the egress hit of serving originals is negligible (<1% of 250 GB Pro
  // egress budget).
  const { data } = await client.storage
    .from('task-proofs')
    .createSignedUrl(path, 300)
  return data?.signedUrl ?? null
}

export async function approveMemberSubmission(
  submissionId: string,
  orgId: string,
  memberId: string,
  pointsOverride: number | null,
): Promise<{ success?: true; error?: string }> {
  const profile = await getAdminProfile()
  if (!profile) return { error: 'Unauthorized.' }
  if (!ALLOWED_ROLES.includes(profile.role)) return { error: 'Unauthorized.' }
  if (ORG_SCOPED_ROLES.includes(profile.role) && profile.org_id !== orgId) return { error: 'Unauthorized.' }

  const client = await createAdminClient()

  let finalPoints = pointsOverride
  if (finalPoints === null) {
    const { data: sub } = await client
      .from('task_submissions')
      .select('tasks(points)')
      .eq('id', submissionId)
      .single()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    finalPoints = (sub as any)?.tasks?.points ?? 0
  }

  const { error } = await client
    .from('task_submissions')
    .update({
      status: 'approved',
      points_awarded: finalPoints,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .eq('org_id', orgId)

  if (error) return { error: error.message }
  revalidatePath(`/organizations/${orgId}/members/${memberId}`)
  revalidatePath(`/organizations/${orgId}/approvals`)
  return { success: true }
}

export async function updateMemberAvatarColor(
  memberId: string,
  orgId: string,
  color: string,
): Promise<{ success?: true; error?: string }> {
  const profile = await getAdminProfile()
  if (!profile) return { error: 'Unauthorized.' }
  if (!ALLOWED_ROLES.includes(profile.role)) return { error: 'Unauthorized.' }
  if (ORG_SCOPED_ROLES.includes(profile.role) && profile.org_id !== orgId) return { error: 'Unauthorized.' }

  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return { error: 'Invalid color.' }

  const client = await createAdminClient()
  const { error } = await client
    .from('profiles')
    .update({ avatar_color: color })
    .eq('id', memberId)

  if (error) return { error: error.message }
  revalidatePath(`/organizations/${orgId}/members/${memberId}`)
  return { success: true }
}

export async function rejectMemberSubmission(
  submissionId: string,
  orgId: string,
  memberId: string,
  reason: string,
): Promise<{ success?: true; error?: string }> {
  const profile = await getAdminProfile()
  if (!profile) return { error: 'Unauthorized.' }
  if (!ALLOWED_ROLES.includes(profile.role)) return { error: 'Unauthorized.' }
  if (ORG_SCOPED_ROLES.includes(profile.role) && profile.org_id !== orgId) return { error: 'Unauthorized.' }

  const client = await createAdminClient()
  const { error } = await client
    .from('task_submissions')
    .update({
      status: 'rejected',
      rejection_reason: reason || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .eq('org_id', orgId)

  if (error) return { error: error.message }
  revalidatePath(`/organizations/${orgId}/members/${memberId}`)
  revalidatePath(`/organizations/${orgId}/approvals`)
  return { success: true }
}
