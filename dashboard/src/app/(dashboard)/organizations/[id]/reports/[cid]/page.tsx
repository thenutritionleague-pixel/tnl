import { loadChallengeReportData } from './actions'
import { ReportClient } from './_components/report-client'
import { redirect } from 'next/navigation'

export const revalidate = 0

export default async function ChallengeReportPage({ params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id: orgId, cid: challengeId } = await params
  const { stats } = await loadChallengeReportData(challengeId)
  if (!stats) redirect(`/organizations/${orgId}/challenges/${challengeId}`)

  return <ReportClient orgId={orgId} challengeId={challengeId} stats={stats} />
}
