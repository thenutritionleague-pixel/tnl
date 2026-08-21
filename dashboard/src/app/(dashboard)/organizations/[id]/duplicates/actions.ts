'use server'

import { getAdminProfile } from '@/lib/auth'
import { signProofUrls } from '@/lib/supabase/admin-queries'

/** Signed URLs for one group's proofs. Loaded on click so the page stays light. */
export async function getGroupProofUrls(paths: string[]): Promise<Record<string, string>> {
  const profile = await getAdminProfile()
  if (!profile) return {}
  return signProofUrls(paths)
}
