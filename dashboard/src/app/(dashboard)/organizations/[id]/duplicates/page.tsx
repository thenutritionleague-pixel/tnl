import { getDuplicateGroups } from '@/lib/supabase/admin-queries'
import DuplicatesClient from './_components/duplicates-client'

// Server-rendered like the other org pages so the list ships with the HTML.
export const revalidate = 0

export default async function OrgDuplicatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params
  const groups = await getDuplicateGroups(orgId)
  return <DuplicatesClient orgId={orgId} groups={groups} />
}
