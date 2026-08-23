/**
 * Pure-TS rule engine for closing-challenge reports. No AI, no caching.
 * Takes the structured stats blob from `get_challenge_report_stats` and
 * derives narrative-style callouts deterministically.
 *
 * Recomputed on every page load — cheap (the input is already cached at the
 * DB level and we're just iterating arrays).
 */

import type { ReportStats } from '@/app/(dashboard)/organizations/[id]/reports/[cid]/actions'

/**
 * Dense rank over a points-descending team list: teams level on points share a
 * place and the next different score takes the next number — 2000/2000/1900
 * are 1st, 1st, 2nd.
 *
 * The report used to rank by array index, so two teams on identical points were
 * handed different positions decided by nothing but sort order, and one of them
 * would have taken GOLD while the other took SILVER on the same score. The
 * member app has always used dense rank, so the app and the published report
 * disagreed for every tied team — 14 of 116 at the time this was written.
 *
 * @param teams sorted DESC by points
 * @returns rank per team, parallel to the input array
 */
export function denseRanks(teams: Array<{ teamPoints: number }>): number[] {
  const out: number[] = []
  let rank = 0
  let prev: number | null = null
  for (const t of teams) {
    if (prev === null || t.teamPoints !== prev) {
      rank += 1
      prev = t.teamPoints
    }
    out.push(rank)
  }
  return out
}

export type OverallInsights = {
  /** One entry per PLACE, not per team: tied teams share a place and are all named. */
  topThree: Array<{ rank: number; teamNames: string[]; points: number; consistencyPct: number }>
  mostImproved: { teamName: string; growthPct: number; fromWeek: number; toWeek: number } | null
  biggestDrop:  { teamName: string; dropPct: number; fromWeek: number; toWeek: number } | null
  peakWeek:     { week: number; points: number }
  quietestWeek: { week: number; points: number }
  engagementPct: number
  leagueConsistencyAvg: number
  acceptanceRate: number
}

export type TeamInsights = {
  rank: number
  bestWeek:  { week: number; points: number }
  worstWeek: { week: number; points: number }
  captainEffect: {
    captainName: string
    captainActiveDays: number
    teamAvgActiveDays: number
    aboveAverage: boolean
  } | null
  perfectAttendance: Array<{ firstName: string; fullName: string; activeDays: number }>
  backbone: Array<{ firstName: string; fullName: string; activeDays: number; points: number }>
  taperedOff: Array<{ firstName: string; fullName: string; lastActiveOn: string | null; missedRecentWeeks: number }>
  lowConsistency: Array<{ firstName: string; fullName: string; activeDays: number }>
  acceptanceRate: number
  summary: string
}

export type Insights = {
  overall: OverallInsights
  perTeam: Record<string, TeamInsights>
}

// ── Overall ──────────────────────────────────────────────────────────────────

function computeOverall(stats: ReportStats): OverallInsights {
  const teams = stats.teams // already sorted DESC by points
  const totalWeeks = stats.challenge.totalWeeks

  // The top three PLACES, not the top three rows. Teams level on points share a
  // place and are all named on it, so the podium can never award GOLD and
  // SILVER to two identical scores.
  const ranks = denseRanks(teams)
  const topThree = [1, 2, 3].flatMap(place => {
    const tied = teams.filter((_, i) => ranks[i] === place)
    if (tied.length === 0) return []
    return [{
      rank: place,
      teamNames: tied.map(t => t.teamName),
      points: tied[0].teamPoints,
      // Tied teams rarely share a consistency figure; averaging is the only
      // honest single number for the place.
      consistencyPct: Math.round(
        (tied.reduce((s, t) => s + t.consistencyPct, 0) / tied.length) * 10) / 10,
    }]
  })

  // Most-improved / biggest-drop — look at week-over-week deltas across all teams
  let bestGrowth: OverallInsights['mostImproved'] = null
  let worstDrop: OverallInsights['biggestDrop'] = null

  for (const team of teams) {
    const wb = team.weeklyBreakdown
    for (let i = 1; i < wb.length; i++) {
      const prev = wb[i - 1].points
      const curr = wb[i].points
      if (prev === 0) continue // can't divide; skip
      const pct = ((curr - prev) / prev) * 100
      if (pct > 0 && (!bestGrowth || pct > bestGrowth.growthPct)) {
        bestGrowth = {
          teamName: team.teamName,
          growthPct: Math.round(pct),
          fromWeek: wb[i - 1].week,
          toWeek: wb[i].week,
        }
      }
      if (pct < 0 && (!worstDrop || pct < worstDrop.dropPct)) {
        worstDrop = {
          teamName: team.teamName,
          dropPct: Math.round(pct), // negative
          fromWeek: wb[i - 1].week,
          toWeek: wb[i].week,
        }
      }
    }
  }

  // Peak / quietest week (sum across all teams per week)
  const leaguePerWeek = new Array(totalWeeks + 1).fill(0)
  for (const team of teams) {
    for (const w of team.weeklyBreakdown) {
      leaguePerWeek[w.week] = (leaguePerWeek[w.week] ?? 0) + w.points
    }
  }
  let peakWeek = { week: 1, points: 0 }
  let quietestWeek = { week: 1, points: Number.POSITIVE_INFINITY }
  for (let w = 1; w <= totalWeeks; w++) {
    const pts = leaguePerWeek[w] ?? 0
    if (pts > peakWeek.points) peakWeek = { week: w, points: pts }
    if (pts < quietestWeek.points && pts > 0) quietestWeek = { week: w, points: pts }
  }
  if (quietestWeek.points === Number.POSITIVE_INFINITY) quietestWeek = peakWeek // edge: 1 week total

  const engagementPct = stats.overall.totalMembers > 0
    ? Math.round((stats.overall.activeMembers / stats.overall.totalMembers) * 100)
    : 0

  const leagueConsistencyAvg = teams.length > 0
    ? Math.round(teams.reduce((s, t) => s + t.consistencyPct, 0) / teams.length)
    : 0

  const totalReviewed = stats.overall.approvedTotal + stats.overall.rejectedTotal
  const acceptanceRate = totalReviewed > 0
    ? Math.round((stats.overall.approvedTotal / totalReviewed) * 100)
    : 100

  return {
    topThree,
    mostImproved: bestGrowth,
    biggestDrop: worstDrop,
    peakWeek,
    quietestWeek,
    engagementPct,
    leagueConsistencyAvg,
    acceptanceRate,
  }
}

// ── Per team ─────────────────────────────────────────────────────────────────

function computeTeam(
  team: ReportStats['teams'][number],
  rank: number,
  stats: ReportStats,
): TeamInsights {
  const totalDays = stats.challenge.totalDays
  const endDate = stats.challenge.endDate ? new Date(stats.challenge.endDate + 'T00:00:00') : new Date()

  // Best / worst week
  let bestWeek = team.weeklyBreakdown[0] ?? { week: 1, points: 0 }
  let worstWeek = team.weeklyBreakdown[0] ?? { week: 1, points: 0 }
  for (const w of team.weeklyBreakdown) {
    if (w.points > bestWeek.points) bestWeek = w
    if (w.points < worstWeek.points) worstWeek = w
  }

  // Captain effect
  const captain = team.members.find(m => m.role === 'captain')
  const avgActiveDays = team.members.length > 0
    ? Math.round(team.members.reduce((s, m) => s + m.activeDays, 0) / team.members.length)
    : 0
  const captainEffect: TeamInsights['captainEffect'] = captain ? {
    captainName: captain.firstName,
    captainActiveDays: captain.activeDays,
    teamAvgActiveDays: avgActiveDays,
    aboveAverage: captain.activeDays >= avgActiveDays,
  } : null

  // Perfect attendance — active every single day of the challenge
  const perfectAttendance = team.members
    .filter(m => m.activeDays === totalDays && totalDays > 0)
    .map(m => ({ firstName: m.firstName, fullName: m.fullName, activeDays: m.activeDays }))

  // Backbone — top 3 contributors by points (members are already sorted DESC)
  const backbone = team.members
    .slice(0, 3)
    .filter(m => m.points > 0)
    .map(m => ({ firstName: m.firstName, fullName: m.fullName, activeDays: m.activeDays, points: m.points }))

  // Tapered off — last submission > 14 days before challenge end AND made at least one earlier submission
  const taperedOff: TeamInsights['taperedOff'] = []
  for (const m of team.members) {
    if (!m.lastSubmission || !m.firstSubmission) continue
    const last = new Date(m.lastSubmission)
    const daysSinceLast = Math.floor((endDate.getTime() - last.getTime()) / 86_400_000)
    if (daysSinceLast >= 14 && m.approved > 0) {
      taperedOff.push({
        firstName: m.firstName,
        fullName: m.fullName,
        lastActiveOn: last.toISOString().slice(0, 10),
        missedRecentWeeks: Math.floor(daysSinceLast / 7),
      })
    }
  }

  // Low consistency — under 50% active
  const lowConsistency = team.members
    .filter(m => m.activeDays > 0 && m.activeDays < totalDays * 0.5)
    .map(m => ({ firstName: m.firstName, fullName: m.fullName, activeDays: m.activeDays }))

  const totalReviewed = team.approvedTotal + team.rejectedTotal
  const acceptanceRate = totalReviewed > 0
    ? Math.round((team.approvedTotal / totalReviewed) * 100)
    : 100

  // Templated summary — one paragraph using the team's own facts
  const parts: string[] = []
  parts.push(`${team.teamName} finished #${rank} of ${stats.teams.length} with ${team.teamPoints.toLocaleString()} points (${team.avgPointsPerMember.toLocaleString()} per member on average).`)
  parts.push(`Their strongest week was Week ${bestWeek.week} with ${bestWeek.points.toLocaleString()} points.`)
  if (bestWeek.week !== worstWeek.week && worstWeek.points > 0) {
    parts.push(`Their quietest was Week ${worstWeek.week} (${worstWeek.points.toLocaleString()} pts).`)
  }
  if (captainEffect) {
    const cmp = captainEffect.aboveAverage ? 'above' : 'below'
    parts.push(`Captain ${captainEffect.captainName} was active ${captainEffect.captainActiveDays}/${totalDays} days — ${cmp} the team's average of ${avgActiveDays}.`)
  }
  parts.push(`Overall consistency: ${team.consistencyPct}%. Acceptance rate: ${acceptanceRate}%.`)
  const summary = parts.join(' ')

  return {
    rank,
    bestWeek,
    worstWeek,
    captainEffect,
    perfectAttendance,
    backbone,
    taperedOff,
    lowConsistency,
    acceptanceRate,
    summary,
  }
}

// ── Public ───────────────────────────────────────────────────────────────────

export function computeInsights(stats: ReportStats): Insights {
  const perTeam: Record<string, TeamInsights> = {}
  // Dense rank, so "finished #5" in a team's own summary matches both the
  // standings list and what the member saw in the app.
  const ranks = denseRanks(stats.teams)
  stats.teams.forEach((team, i) => {
    perTeam[team.teamId] = computeTeam(team, ranks[i], stats)
  })
  return {
    overall: computeOverall(stats),
    perTeam,
  }
}
