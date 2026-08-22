import { getDuplicateGroups, getVideoDuplicateGroups } from '@/lib/supabase/admin-queries'
import DuplicatesClient from './_components/duplicates-client'
import VideoDuplicates from './_components/video-duplicates'

// Server-rendered like the other org pages so the list ships with the HTML.
export const revalidate = 0

export default async function OrgDuplicatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params
  const [groups, videoGroups] = await Promise.all([
    getDuplicateGroups(orgId),
    getVideoDuplicateGroups(orgId),
  ])
  return (
    <div className="space-y-10">
      <DuplicatesClient orgId={orgId} groups={groups} />
      <VideoDuplicates orgId={orgId} groups={videoGroups} />
    </div>
  )
}
