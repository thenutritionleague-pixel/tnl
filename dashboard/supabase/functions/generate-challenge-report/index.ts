import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)
const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') })

const PROMPT_VERSION = 'v1'
const MODEL = 'gpt-4o'

type Member = {
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
}

type WeeklyPoint = {
  week: number
  points: number
  approved: number
  activeMembers: number
}

type Team = {
  teamId: string
  teamName: string
  memberCount: number
  teamPoints: number
  avgPointsPerMember: number
  approvedTotal: number
  rejectedTotal: number
  consistencyPct: number
  members: Member[]
  weeklyBreakdown: WeeklyPoint[]
}

type Stats = {
  challenge: { id: string; name: string; startDate: string; endDate: string; totalWeeks: number; totalDays: number }
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
  teams: Team[]
}

type TeamReport = {
  narrative: string
  turningPoints: string[]
  topMembers: { firstName: string; reason: string }[]
  fellOff: { firstName: string; reason: string }[]
}

type FullReport = {
  overall: string
  perTeam: Record<string, TeamReport>
}

// ── Prompts ────────────────────────────────────────────────────────────────

function buildOverallPrompt(stats: Stats): string {
  const teamRanks = stats.teams.slice(0, 5).map((t, i) =>
    `  ${i + 1}. ${t.teamName} — ${t.teamPoints.toLocaleString()} pts (${t.consistencyPct}% consistency, ${t.memberCount} members)`
  ).join('\n')

  return `You are writing a friendly, narrative report for the closing of a wellness challenge called "${stats.challenge.name}".
The challenge ran from ${stats.challenge.startDate} to ${stats.challenge.endDate} (${stats.challenge.totalWeeks} weeks, ${stats.challenge.totalDays} days).

OVERALL NUMBERS:
- ${stats.overall.totalMembers} members across ${stats.overall.teamCount} teams (${stats.overall.activeMembers} were active)
- ${stats.overall.totalSubmissions.toLocaleString()} submissions made → ${stats.overall.approvedTotal.toLocaleString()} approved, ${stats.overall.rejectedTotal} rejected
- ${stats.overall.totalPointsAwarded.toLocaleString()} broccoli points awarded in total

TOP 5 TEAMS:
${teamRanks}

Write a 3-4 paragraph closing report for the entire league. Tone: warm, celebratory, observational. NOT corporate-jargony.

Cover:
1. The overall energy and effort across the league.
2. The standout team(s) and why they stood out (mention by name).
3. Patterns across the league — was Week 3 a peak? Did effort dip then rebound?
4. One uplifting closing thought.

Respond as JSON only — no markdown:
{ "narrative": "<3-4 paragraphs separated by \\n\\n>" }`
}

function buildTeamPrompt(team: Team, totalDays: number, totalWeeks: number): string {
  const sortedMembers = [...team.members].sort((a, b) => b.points - a.points)
  const memberLines = sortedMembers.map(m =>
    `  - ${m.firstName} (${m.role}): ${m.points} pts, ${m.activeDays}/${totalDays} active days, ${m.approved} approved${m.rejected > 0 ? `, ${m.rejected} rejected` : ''}`
  ).join('\n')

  const weeklyLines = team.weeklyBreakdown.map(w =>
    `  Week ${w.week}: ${w.points.toLocaleString()} pts (${w.approved} submissions from ${w.activeMembers} members)`
  ).join('\n')

  return `You are writing a closing report for ONE team in a wellness challenge.

TEAM: ${team.teamName}
- ${team.memberCount} members
- Total points: ${team.teamPoints.toLocaleString()}
- Avg per member: ${team.avgPointsPerMember.toLocaleString()}
- Consistency: ${team.consistencyPct}% (avg active days / total days)
- ${team.approvedTotal} approved submissions, ${team.rejectedTotal} rejected

MEMBERS (sorted by points):
${memberLines}

WEEK-BY-WEEK:
${weeklyLines}

Write a warm, story-style report for this team. Use first names. Tone: like a coach giving end-of-season feedback to the team — honest, kind, specific.

Respond as JSON only:
{
  "narrative": "<2 paragraphs separated by \\n\\n. Describe their journey, highlight standouts, mention captain/vice-captain effect if visible>",
  "turningPoints": [
    "<1 sentence about an inflection week — e.g. 'Week 3 was a turning point: points doubled as the whole team locked in.'>",
    "<another inflection if applicable, e.g. a dip>"
  ],
  "topMembers": [
    { "firstName": "<name>", "reason": "<1-line specific reason — e.g. 'submitted all 26 days, the most consistent in the team'>" },
    ...up to 3
  ],
  "fellOff": [
    { "firstName": "<name>", "reason": "<1-line — e.g. 'submitted strong in week 1 then stopped after week 2'>" },
    ...up to 2, omit array entirely if everyone was consistent
  ]
}`
}

// ── OpenAI call ────────────────────────────────────────────────────────────

async function chat<T>(prompt: string): Promise<T> {
  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 1200,
  })
  return JSON.parse(res.choices[0].message.content ?? '{}') as T
}

// ── Main handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  try {
    const body = await req.json()
    const challengeId: string = body.challengeId
    const force: boolean = !!body.force

    if (!challengeId) {
      return new Response(JSON.stringify({ error: 'Missing challengeId' }), { status: 400 })
    }

    // Skip if already cached and force=false
    if (!force) {
      const { data: existing } = await supabase
        .from('challenge_reports')
        .select('challenge_id, prompt_version')
        .eq('challenge_id', challengeId)
        .maybeSingle()
      if (existing && existing.prompt_version === PROMPT_VERSION) {
        return new Response(JSON.stringify({ cached: true }), { status: 200 })
      }
    }

    // Fetch stats
    const { data: statsRaw, error: statsErr } = await supabase.rpc(
      'get_challenge_report_stats',
      { challenge_id_param: challengeId },
    )
    if (statsErr) throw statsErr
    const stats = statsRaw as Stats

    // Generate overall narrative
    const overallPromise = chat<{ narrative: string }>(buildOverallPrompt(stats))

    // Generate per-team narratives (parallel, but cap concurrency)
    const teamPromises = stats.teams.map(team =>
      chat<TeamReport>(buildTeamPrompt(team, stats.challenge.totalDays, stats.challenge.totalWeeks))
        .then(report => ({ teamId: team.teamId, report }))
        .catch(err => {
          console.error(`[generate-challenge-report] team ${team.teamId} failed:`, err)
          return { teamId: team.teamId, report: { narrative: 'Report generation failed for this team.', turningPoints: [], topMembers: [], fellOff: [] } }
        })
    )

    const [overall, teamResults] = await Promise.all([overallPromise, Promise.all(teamPromises)])

    const fullReport: FullReport = {
      overall: overall.narrative,
      perTeam: Object.fromEntries(teamResults.map(r => [r.teamId, r.report])),
    }

    // Upsert into challenge_reports
    const orgId = (await supabase.from('challenges').select('org_id').eq('id', challengeId).single()).data?.org_id
    await supabase
      .from('challenge_reports')
      .upsert({
        challenge_id: challengeId,
        org_id: orgId,
        report: fullReport,
        prompt_version: PROMPT_VERSION,
        generated_at: new Date().toISOString(),
      })

    return new Response(JSON.stringify({ ok: true, teams: teamResults.length }), { status: 200 })
  } catch (err) {
    console.error('[generate-challenge-report]', err)
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
})
