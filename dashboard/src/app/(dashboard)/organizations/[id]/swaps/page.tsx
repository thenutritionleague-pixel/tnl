import { getTeamSwaps } from '@/lib/supabase/queries'
import SwapsClient from './_components/swaps-client'

// Server-rendered like the other org pages so the table ships with the HTML.
export default async function OrgSwapsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params
  const rows = await getTeamSwaps(orgId)
  return <SwapsClient rows={rows} />
}
