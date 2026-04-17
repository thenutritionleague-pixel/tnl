'use server'

import { createAdminClient } from '@/lib/supabase/server'

/**
 * Upload an org logo using the service-role client (bypasses storage RLS).
 * Called from the org settings page client component.
 */
export async function uploadOrgLogo(orgId: string, formData: FormData) {
  const file = formData.get('file') as File | null
  if (!file) return { error: 'No file provided' }
  if (file.size > 2 * 1024 * 1024) return { error: 'Max file size is 2 MB' }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `${orgId}/${Date.now()}.${ext}`

  const bytes = await file.arrayBuffer()
  const client = await createAdminClient()

  const { error } = await client.storage
    .from('org-logos')
    .upload(path, bytes, { contentType: file.type, upsert: true })

  if (error) return { error: error.message }

  const { data: { publicUrl } } = client.storage.from('org-logos').getPublicUrl(path)

  await client.from('organizations').update({ logo_url: publicUrl }).eq('id', orgId)

  return { publicUrl }
}

/**
 * Remove the org logo — clears logo_url in DB.
 * We don't delete the storage file to keep history.
 */
export async function removeOrgLogo(orgId: string) {
  const client = await createAdminClient()
  await client.from('organizations').update({ logo_url: null }).eq('id', orgId)
  return { ok: true }
}
