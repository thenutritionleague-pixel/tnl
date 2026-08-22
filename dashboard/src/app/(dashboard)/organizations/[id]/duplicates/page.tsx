import {
  getDuplicateGroups, getVideoDuplicateGroups, getReusedImageGroups,
} from '@/lib/supabase/admin-queries'
import DuplicatesClient from './_components/duplicates-client'
import VideoDuplicates from './_components/video-duplicates'
import ExactImageDuplicates from './_components/exact-image-duplicates'

// Server-rendered like the other org pages so the lists ship with the HTML.
export const revalidate = 0

export default async function OrgDuplicatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params
  const [groups, exactImages, videoGroups] = await Promise.all([
    getDuplicateGroups(orgId),
    getReusedImageGroups(orgId),
    getVideoDuplicateGroups(orgId),
  ])
  return (
    <div className="space-y-10">
      {/* Exact matches first: they are proof, and they cover the flat-screenshot
          blind spot the look-alike list below cannot see. */}
      <ExactImageDuplicates orgId={orgId} groups={exactImages} />
      <VideoDuplicates orgId={orgId} groups={videoGroups} />
      <DuplicatesClient orgId={orgId} groups={groups} />
    </div>
  )
}
