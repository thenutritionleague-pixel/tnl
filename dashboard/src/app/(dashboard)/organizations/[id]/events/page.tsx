import { getOrgEvents } from '@/lib/supabase/admin-queries'
import { EventsClient } from './_components/events-client'

export default async function OrgEventsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params
  const events = await getOrgEvents(orgId)
  return <EventsClient orgId={orgId} initialEvents={events} />
}
