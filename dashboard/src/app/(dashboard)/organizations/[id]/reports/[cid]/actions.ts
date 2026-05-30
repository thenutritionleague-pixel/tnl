'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { getAdminProfile } from '@/lib/auth'

const ALLOWED_ROLES = ['super_admin', 'sub_super_admin', 'org_admin', 'sub_admin']

export type ReportStats = {
  challenge: {
    id: string
    name: string
    startDate: string
    endDate: string | null
    status: string
    timezone: string
    totalWeeks: number
    totalDays: number
  }
  overall: {
    totalSubmissions: number
    approvedTotal: number
    rejectedTotal: number
    pendingTotal: number
    totalPointsAwarded: number
    totalMembers: number
    activeMembers: number
    teamCount: number
  }
  teams: Array<{
    teamId: string
    teamName: string
    memberCount: number
    teamPoints: number
    avgPointsPerMember: number
    approvedTotal: number
    rejectedTotal: number
    consistencyPct: number
    members: Array<{
      userId: string
      firstName: string
      fullName: string
      role: 'captain' | 'vice_captain' | 'member'
      points: number
      approved: number
      rejected: number
      activeDays: number
      firstSubmission: string | null
      lastSubmission: string | null
    }>
    weeklyBreakdown: Array<{
      week: number
      points: number
      approved: number
      activeMembers: number
    }>
  }>
}

export async function loadChallengeReportData(challengeId: string): Promise<{ stats: ReportStats | null }> {
  const profile = await getAdminProfile()
  if (!profile || !ALLOWED_ROLES.includes(profile.role)) return { stats: null }
  const client = await createAdminClient()
  const { data } = await client.rpc('get_challenge_report_stats', { challenge_id_param: challengeId })
  return { stats: (data ?? null) as ReportStats | null }
}

// ── Deprecated — kept for optional AI mode ───────────────────────────────────
// The reports are now generated from deterministic rule-based logic in
// `lib/challenge-report-insights.ts`. The edge function and `challenge_reports`
// table are left in place but no longer invoked. Restore the call below if AI
// narratives are ever re-enabled.

export async function generateChallengeReport(challengeId: string, force = false): Promise<{ ok: boolean; error?: string }> {
  const profile = await getAdminProfile()
  if (!profile || !ALLOWED_ROLES.includes(profile.role)) return { ok: false, error: 'Unauthorized' }
  const client = await createAdminClient()
  const { data, error } = await client.functions.invoke('generate-challenge-report', {
    body: { challengeId, force },
  })
  if (error) return { ok: false, error: error.message }
  if (data && typeof data === 'object' && 'error' in data) return { ok: false, error: String(data.error) }
  return { ok: true }
}
