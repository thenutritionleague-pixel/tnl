/**
 * Server-side admin queries — uses the service-role client (bypasses RLS).
 * Import only in Server Components or Server Actions.
 */

import { createAdminClient } from './server'
import { fetchAllRows } from './fetch-all'

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalOrgs: number
  totalMembers: number
  activeChallenges: number
  pendingApprovals: number
}

export interface DashboardOrg {
  id: string
  name: string
  logo: string
  slug: string
  isActive: boolean
  memberCount: number
  teamCount: number
  pendingApprovals: number
}

export interface ActivityItem {
  id: string
  memberName: string
  orgName: string
  taskTitle: string
  submittedAt: string
  status: 'pending' | 'approved' | 'rejected'
}

export interface PlatformAdmin {
  id: string
  userId: string | null
  name: string
  email: string
  role: string
  status: string
  createdAt: string
}

export interface OrgSummaryAdmin {
  id: string
  name: string
  slug: string
  logo: string
  isActive: boolean
  createdAt: string
  memberCount: number
  teamCount: number
  activeChallenges: string[]
  orgAdmin: string
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

export async function getDashboardStats(): Promise<DashboardStats> {
  const client = await createAdminClient()
  const [orgsRes, membersRes, challengesRes, pendingRes] = await Promise.all([
    client.from('organizations').select('id', { count: 'exact', head: true }),
    client.from('profiles').select('id', { count: 'exact', head: true }).eq('is_test', false),
    client.from('challenges').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    client.from('task_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])
  return {
    totalOrgs: orgsRes.count ?? 0,
    totalMembers: membersRes.count ?? 0,
    activeChallenges: challengesRes.count ?? 0,
    pendingApprovals: pendingRes.count ?? 0,
  }
}

export async function getDashboardOrgs(): Promise<DashboardOrg[]> {
  const client = await createAdminClient()
  const { data: orgs } = await client
    .from('organizations')
    .select('id, name, logo, slug, is_active')
    .order('created_at')
  if (!orgs || orgs.length === 0) return []

  const orgIds = orgs.map(o => o.id)

  // org_members is tallied per-org in JS. Across all orgs this is now >1000
  // rows (National alone is 1100+), so an unbounded select truncated and the
  // organizations list under-reported member counts.
  const [challengesRes, members, teamsRes] = await Promise.all([
    client.from('challenges').select('id, org_id').in('org_id', orgIds),
    fetchAllRows<{ org_id: string }>(
      (from, to) => client.from('org_members').select('org_id').in('org_id', orgIds).range(from, to),
    ),
    client.from('teams').select('org_id').in('org_id', orgIds),
  ])

  const challengesByOrg: Record<string, string[]> = {}
  for (const c of (challengesRes.data ?? []) as { id: string; org_id: string }[]) {
    if (!challengesByOrg[c.org_id]) challengesByOrg[c.org_id] = []
    challengesByOrg[c.org_id].push(c.id)
  }

  const memberCounts: Record<string, number> = {}
  const teamCounts: Record<string, number> = {}
  for (const m of members) {
    memberCounts[m.org_id] = (memberCounts[m.org_id] ?? 0) + 1
  }
  for (const t of (teamsRes.data ?? []) as { org_id: string }[]) {
    teamCounts[t.org_id] = (teamCounts[t.org_id] ?? 0) + 1
  }

  const allChallengeIds = Object.values(challengesByOrg).flat()
  const pendingByOrg: Record<string, number> = {}
  if (allChallengeIds.length > 0) {
    // Paginated: this tallies pending rows in JS, so an unbounded select capped
    // at 1000 and under-reported every org's pending badge once the backlog grew.
    const pending = await fetchAllRows<{ challenge_id: string }>(
      (from, to) => client
        .from('task_submissions')
        .select('challenge_id')
        .in('challenge_id', allChallengeIds)
        .eq('status', 'pending')
        .range(from, to),
    )

    const challengeToOrg: Record<string, string> = {}
    for (const [orgId, cIds] of Object.entries(challengesByOrg)) {
      for (const cId of cIds) challengeToOrg[cId] = orgId
    }
    for (const sub of (pending ?? []) as { challenge_id: string }[]) {
      const orgId = challengeToOrg[sub.challenge_id]
      if (orgId) pendingByOrg[orgId] = (pendingByOrg[orgId] ?? 0) + 1
    }
  }

  return orgs.map(org => ({
    id: org.id,
    name: org.name,
    logo: org.logo,
    slug: org.slug,
    isActive: org.is_active,
    memberCount: memberCounts[org.id] ?? 0,
    teamCount: teamCounts[org.id] ?? 0,
    pendingApprovals: pendingByOrg[org.id] ?? 0,
  }))
}

export async function getRecentActivity(): Promise<ActivityItem[]> {
  const client = await createAdminClient()
  const { data: subs } = await client
    .from('task_submissions')
    .select('id, status, user_id, submitted_at, tasks!task_id(title), challenges(organizations(name))')
    .order('submitted_at', { ascending: false })
    .limit(8)

  if (!subs) return []

  const userIds = Array.from(new Set((subs as any[]).map(s => s.user_id)))
  const { data: profiles } = await client
    .from('profiles')
    .select('id, name')
    .in('id', userIds)

  const profileMap: Record<string, string> = {}
  for (const p of (profiles ?? []) as any[]) {
    profileMap[p.id] = p.name
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (subs as any[]).map(s => ({
    id: s.id,
    memberName: profileMap[s.user_id] ?? 'Unknown',
    orgName: s.challenges?.organizations?.name ?? '—',
    taskTitle: s.tasks?.title ?? '—',
    submittedAt: timeAgo(s.submitted_at),
    status: s.status as ActivityItem['status'],
  }))
}

// ── Platform Admins ────────────────────────────────────────────────────────────

export async function getPlatformAdmins(): Promise<PlatformAdmin[]> {
  const client = await createAdminClient()
  const { data } = await client
    .from('admin_users')
    .select('id, user_id, name, email, role, status, created_at')
    .in('role', ['super_admin', 'sub_super_admin'])
    .order('created_at')
  if (!data) return []
  return data.map(a => ({
    id: a.id,
    userId: a.user_id,
    name: a.name,
    email: a.email,
    role: a.role,
    status: a.status,
    createdAt: fmtDate(a.created_at),
  }))
}

// ── Org Admins ─────────────────────────────────────────────────────────────────

export interface OrgAdminUser {
  id: string
  name: string
  email: string
  role: 'org_admin' | 'sub_admin'
  status: string
  createdAt: string
}

export async function getOrgAdmins(orgId: string): Promise<OrgAdminUser[]> {
  const client = await createAdminClient()
  const { data } = await client
    .from('admin_users')
    .select('id, name, email, role, status, created_at')
    .eq('org_id', orgId)
    .in('role', ['org_admin', 'sub_admin'])
    .order('role') // org_admin first
  if (!data) return []
  return data.map(a => ({
    id: a.id,
    name: a.name,
    email: a.email,
    role: a.role as OrgAdminUser['role'],
    status: a.status,
    createdAt: fmtDate(a.created_at),
  }))
}

// ── Org Points Breakdown ───────────────────────────────────────────────────────

export interface TaskBreakdown {
  icon: string
  title: string
  daysCompleted: number
  missedDays: number
  pointsPerDay: number
  subtotal: number
}

export interface SubmissionEntry {
  taskTitle: string
  taskIcon: string
  date: string
  status: 'approved' | 'rejected' | 'missed'
  points: number
}

export interface WeekPoints {
  week: number
  points: number
  tasks: TaskBreakdown[]
  entries: SubmissionEntry[]
}

export interface ManualAdjustment {
  id: string
  amount: number
  reason: string
  createdAt: string
  eventDate: string
  eventDateRaw: string
}

export interface MemberStatAdmin {
  id: string
  name: string
  teamId: string
  teamName: string
  teamColor: string
  teamEmoji: string
  avatarColor: string
  weekPoints: WeekPoints[]
  total: number
  manualTotal: number
  manualAdjustments: ManualAdjustment[]
}

export interface TeamLegacyEntry {
  id: string
  amount: number
  reason: string
  sourceName: string | null
  kind: 'legacy_transfer' | 'admin_bonus' | string
  createdAt: string
  eventDate: string
}

export interface TeamStatAdmin {
  id: string
  name: string
  color: string
  emoji: string
  members: MemberStatAdmin[]
  total: number
  legacyEntries: TeamLegacyEntry[]
}

export async function getOrgPointsBreakdown(orgId: string): Promise<{ members: MemberStatAdmin[]; teams: TeamStatAdmin[]; currentWeek: number }> {
  const client = await createAdminClient()

  // Wrap the four growth-prone selects (task_submissions × 2, points_transactions × 2,
  // team_transactions × 1) in fetchAllRows so they paginate past Supabase's
  // 1000-row default cap. Without this, the breakdown silently dropped most
  // rows for any org with more than 1000 approved submissions / missed tasks.
  const [
    challengeRes, teamMembersRes, orgMembersRes,
    subsData, missedData, manualData, rejectedData,
    orgRes, teamTransfersData,
  ] = await Promise.all([
    // Include completed challenges too so the points breakdown stays visible
    // after a challenge ends. mostRecentStartDate (line ~364) still picks the
    // newest by created_at, which is what the week math needs.
    client.from('challenges').select('id, start_date').eq('org_id', orgId).in('status', ['active', 'completed']).order('created_at', { ascending: false }),
    // Member rosters also cross the 1000-row cap at National scale.
    fetchAllRows<any>(
      (from, to) => client.from('team_members').select('user_id, profiles(id, name, avatar_color), teams(id, name, emoji, color)').eq('org_id', orgId).range(from, to),
    ),
    fetchAllRows<any>(
      (from, to) => client.from('org_members').select('user_id, profiles(id, name, avatar_color)').eq('org_id', orgId).range(from, to),
    ),
    fetchAllRows<{ user_id: string; challenge_id: string | null; submitted_date: string | null; points_awarded: number | null; tasks: { title: string; icon: string; points: number; start_week: number } | null }>(
      (from, to) => client.from('task_submissions')
        .select('user_id, challenge_id, submitted_date, points_awarded, tasks(title, icon, points, start_week)')
        .eq('org_id', orgId).eq('status', 'approved').range(from, to),
    ),
    fetchAllRows<{ user_id: string; org_id: string; reason: string; created_at: string }>(
      (from, to) => client.from('points_transactions')
        .select('user_id, org_id, reason, created_at')
        .eq('org_id', orgId).eq('amount', 0).like('reason', 'Task missed:%').range(from, to),
    ),
    fetchAllRows<{ id: string; user_id: string; amount: number; reason: string; created_at: string; transaction_date: string | null }>(
      (from, to) => client.from('points_transactions')
        .select('id, user_id, amount, reason, created_at, transaction_date')
        .eq('org_id', orgId).eq('is_manual', true)
        .order('created_at', { ascending: false }).range(from, to),
    ),
    fetchAllRows<{ user_id: string; challenge_id: string | null; submitted_date: string | null; tasks: { title: string; icon: string; start_week: number } | null }>(
      (from, to) => client.from('task_submissions')
        .select('user_id, challenge_id, submitted_date, tasks(title, icon, start_week)')
        .eq('org_id', orgId).eq('status', 'rejected').range(from, to),
    ),
    client.from('organizations').select('timezone').eq('id', orgId).single(),
    fetchAllRows<{ id: string; team_id: string; amount: number; reason: string; source_user_name: string | null; kind: string; created_at: string; transaction_date: string | null }>(
      (from, to) => client.from('team_transactions')
        .select('id, team_id, amount, reason, source_user_name, kind, created_at, transaction_date')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false }).range(from, to),
    ),
  ])

  // Wrap paginated results in the { data } shape the rest of this function expects
  const subsRes        = { data: subsData }
  const missedRes      = { data: missedData }
  const manualRes      = { data: manualData }
  const rejectedRes    = { data: rejectedData }
  const teamTransfersRes = { data: teamTransfersData }

  type ChallengeRow = { id: string; start_date: string }
  const challengeStartMap: Record<string, Date> = {}
  let mostRecentStartDate: Date | null = null
  for (const ch of (challengeRes.data ?? []) as ChallengeRow[]) {
    challengeStartMap[ch.id] = new Date(ch.start_date)
    if (!mostRecentStartDate) mostRecentStartDate = challengeStartMap[ch.id] // ordered desc → first is newest
  }

  // Build team lookup
  type TmRaw = { user_id: string; profiles: { id: string; name: string; avatar_color: string } | null; teams: { id: string; name: string; emoji: string; color: string } | null }
  const teamMap: Record<string, { id: string; name: string; emoji: string; color: string }> = {}
  for (const tm of (teamMembersRes as unknown as TmRaw[])) {
    if (tm.profiles?.id && tm.teams) teamMap[tm.profiles.id] = tm.teams
  }

  // Build member map from org_members
  type OmRaw = { user_id: string; profiles: { id: string; name: string; avatar_color: string } | null }
  const memberMap: Record<string, MemberStatAdmin> = {}
  for (const om of (orgMembersRes as unknown as OmRaw[])) {
    const p = om.profiles
    if (!p) continue
    const t = teamMap[p.id]
    memberMap[p.id] = {
      id: p.id, name: p.name, avatarColor: p.avatar_color ?? '#059669',
      teamId: t?.id ?? '', teamName: t?.name ?? 'Unassigned',
      teamColor: t?.color ?? '#94a3b8', teamEmoji: t?.emoji ?? '—',
      weekPoints: [], total: 0,
      manualTotal: 0, manualAdjustments: [],
    }
  }

  // Build week breakdown data structure
  type TaskEntry = { daysCompleted: number; missedDays: number; pointsPerDay: number; icon: string }
  type WeekData  = { points: number; tasks: Record<string, TaskEntry>; entries: SubmissionEntry[] }
  const weekDataMap: Record<string, Record<number, WeekData>> = {}

  function ensureWeek(userId: string, week: number) {
    if (!weekDataMap[userId]) weekDataMap[userId] = {}
    if (!weekDataMap[userId][week]) weekDataMap[userId][week] = { points: 0, tasks: {}, entries: [] }
  }

  // ── Approved submissions → completed days ───────────────────────────────────
  type SubRaw = { user_id: string; challenge_id: string | null; submitted_date: string | null; points_awarded: number | null; tasks: { title: string; icon: string; points: number; start_week: number } | null }

  function calcWeek(dateStr: string | null, challengeId?: string | null, pts?: number): number {
    const sd = (challengeId && challengeStartMap[challengeId]) ? challengeStartMap[challengeId] : mostRecentStartDate
    if (sd && dateStr) {
      const diff = Math.floor((new Date(dateStr + 'T12:00:00').getTime() - sd.getTime()) / 86400000)
      return Math.max(1, Math.floor(diff / 7) + 1)
    }
    return pts ?? 1
  }

  for (const sub of (subsRes.data ?? []) as unknown as SubRaw[]) {
    const { user_id, challenge_id, submitted_date, points_awarded, tasks } = sub
    if (!tasks || !memberMap[user_id]) continue
    const week = calcWeek(submitted_date, challenge_id, tasks.start_week ?? 1)
    const pts = points_awarded ?? tasks.points
    ensureWeek(user_id, week)
    weekDataMap[user_id][week].points += pts
    memberMap[user_id].total += pts
    const key = tasks.title
    if (!weekDataMap[user_id][week].tasks[key])
      weekDataMap[user_id][week].tasks[key] = { daysCompleted: 0, missedDays: 0, pointsPerDay: tasks.points, icon: tasks.icon }
    weekDataMap[user_id][week].tasks[key].daysCompleted++
    weekDataMap[user_id][week].entries.push({
      taskTitle: tasks.title, taskIcon: tasks.icon,
      date: submitted_date ? fmtDate(submitted_date) : '—',
      status: 'approved', points: pts,
    })
  }

  // ── Rejected submissions → entries ──────────────────────────────────────────
  type RejRaw = { user_id: string; challenge_id: string | null; submitted_date: string | null; tasks: { title: string; icon: string; start_week: number } | null }
  for (const sub of (rejectedRes.data ?? []) as unknown as RejRaw[]) {
    const { user_id, challenge_id, submitted_date, tasks } = sub
    if (!tasks || !memberMap[user_id]) continue
    const week = calcWeek(submitted_date, challenge_id, tasks.start_week ?? 1)
    ensureWeek(user_id, week)
    weekDataMap[user_id][week].entries.push({
      taskTitle: tasks.title, taskIcon: tasks.icon,
      date: submitted_date ? fmtDate(submitted_date) : '—',
      status: 'rejected', points: 0,
    })
  }

  // ── Missed transactions → missed days + entries ─────────────────────────────
  type MissedRaw = { user_id: string; org_id: string; reason: string; created_at: string }
  const missedTaskPattern = /^Task missed: (.+) \((\d{4}-\d{2}-\d{2})\)$/

  for (const row of (missedRes.data ?? []) as unknown as MissedRaw[]) {
    const { user_id, reason, created_at } = row
    if (!memberMap[user_id]) continue
    const match = reason.match(missedTaskPattern)
    if (!match) continue
    const taskTitle = match[1]
    const dateStr = match[2] ?? null
    const week = calcWeek(dateStr ?? created_at.slice(0, 10), null)
    ensureWeek(user_id, week)
    if (!weekDataMap[user_id][week].tasks[taskTitle])
      weekDataMap[user_id][week].tasks[taskTitle] = { daysCompleted: 0, missedDays: 0, pointsPerDay: 0, icon: '❌' }
    weekDataMap[user_id][week].tasks[taskTitle].missedDays++
    weekDataMap[user_id][week].entries.push({
      taskTitle, taskIcon: '❌',
      date: dateStr ? fmtDate(dateStr) : '—',
      status: 'missed', points: 0,
    })
  }

  // ── Manual adjustments ──────────────────────────────────────────────────────
  type ManualRaw = { id: string; user_id: string; amount: number; reason: string; created_at: string; transaction_date: string | null }
  for (const row of (manualRes.data ?? []) as unknown as ManualRaw[]) {
    const { id, user_id, amount, reason, created_at, transaction_date } = row
    if (!memberMap[user_id]) continue
    // Use the explicit event date if set; fall back to created_at date
    const eventDateStr = transaction_date ?? created_at.slice(0, 10)
    const week = calcWeek(eventDateStr, null)
    ensureWeek(user_id, week)
    // Add to weekDataMap so the weekly column total includes manual pts
    weekDataMap[user_id][week].points += amount
    memberMap[user_id].manualAdjustments.push({ id, amount, reason, createdAt: fmtDate(created_at), eventDate: fmtDate(eventDateStr), eventDateRaw: eventDateStr })
    memberMap[user_id].manualTotal += amount
    memberMap[user_id].total += amount
  }

  // ── Assemble weekPoints on each member ──────────────────────────────────────
  for (const userId in weekDataMap) {
    if (!memberMap[userId]) continue
    memberMap[userId].weekPoints = Object.entries(weekDataMap[userId])
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([week, data]) => ({
        week: Number(week),
        points: data.points,
        entries: data.entries.sort((a, b) => a.date.localeCompare(b.date)),
        tasks: Object.entries(data.tasks).map(([title, t]) => ({
          title, icon: t.icon,
          daysCompleted: t.daysCompleted,
          missedDays: t.missedDays,
          pointsPerDay: t.pointsPerDay,
          subtotal: t.daysCompleted * t.pointsPerDay,
        })),
      }))
  }

  const members = Object.values(memberMap).sort((a, b) => b.total - a.total)

  // Build team stats
  const teamStatMap: Record<string, TeamStatAdmin> = {}
  for (const m of members) {
    if (!m.teamId) continue
    if (!teamStatMap[m.teamId]) {
      teamStatMap[m.teamId] = { id: m.teamId, name: m.teamName, color: m.teamColor, emoji: m.teamEmoji, members: [], total: 0, legacyEntries: [] }
    }
    teamStatMap[m.teamId].members.push(m)
    teamStatMap[m.teamId].total += m.total
  }

  // Attach team_transactions (legacy transfers + manual bonuses) to their teams
  type TtRaw = { id: string; team_id: string; amount: number; reason: string; source_user_name: string | null; kind: string; created_at: string; transaction_date: string | null }
  for (const tt of (teamTransfersRes.data ?? []) as unknown as TtRaw[]) {
    const team = teamStatMap[tt.team_id]
    if (!team) continue // team might exist but have no members yet; skip silently
    team.legacyEntries.push({
      id: tt.id,
      amount: tt.amount,
      reason: tt.reason,
      sourceName: tt.source_user_name,
      kind: tt.kind,
      createdAt: tt.created_at,
      eventDate: tt.transaction_date ?? tt.created_at.slice(0, 10),
    })
    team.total += tt.amount
  }

  const teams = Object.values(teamStatMap).sort((a, b) => b.total - a.total)

  const orgTz: string = (orgRes as any).data?.timezone ?? 'UTC'
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: orgTz }).format(new Date())
  const currentWeek = mostRecentStartDate ? calcWeek(todayStr, null) : 1

  return { members, teams, currentWeek }
}

// ── Org Events ─────────────────────────────────────────────────────────────────

export interface OrgEvent {
  id: string
  title: string
  description: string
  type: 'quiz' | 'offline'
  points: number
  location: string | null
  startTime: string
  endTime: string | null
  status: 'upcoming' | 'completed'
  isActive: boolean
  attendeesCount: number
  displayDate: string
  displayTime: string
}

export async function getOrgEvents(orgId: string): Promise<OrgEvent[]> {
  const client = await createAdminClient()
  const { data: events } = await client
    .from('events')
    .select('id, title, description, type, points, location, start_time, end_time, status, is_active')
    .eq('org_id', orgId)
    .order('start_time', { ascending: false })
  if (!events) return []

  const results: OrgEvent[] = []
  for (const ev of events) {
    const { count } = await client
      .from('event_participations')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', ev.id)
    const startDate = new Date(ev.start_time)
    results.push({
      id: ev.id, title: ev.title, description: ev.description ?? '',
      type: ev.type as OrgEvent['type'], points: ev.points ?? 0,
      location: ev.location ?? null, startTime: ev.start_time, endTime: ev.end_time ?? null,
      status: ev.status as OrgEvent['status'], isActive: ev.is_active,
      attendeesCount: count ?? 0,
      displayDate: startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      displayTime: startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
    })
  }
  return results
}

// ── Invite Whitelist ───────────────────────────────────────────────────────────

export interface InviteEntry {
  id: string
  email: string
  teamId: string | null
  teamName: string
  role: 'captain' | 'vice_captain' | 'member'
  addedAt: string
  status: 'pending' | 'accepted'
}

export async function getInviteWhitelist(orgId: string): Promise<{ invites: InviteEntry[]; teams: Array<{ id: string; name: string }> }> {
  const client = await createAdminClient()
  type InviteRow = { id: string; email: string; team_id: string | null; role: string; used_at: string | null; created_at: string; teams: { name: string } | null }

  // National runs >1000 whitelisted members, so this must paginate — an
  // unbounded select silently stopped at PostgREST's 1000-row cap and the
  // page reported "1000 awaiting signup" while the table held more.
  const [invitesRows, teamsRes] = await Promise.all([
    fetchAllRows<InviteRow>(
      (from, to) => client.from('invite_whitelist')
        .select('id, email, team_id, role, used_at, created_at, teams(name)')
        .eq('org_id', orgId).order('created_at', { ascending: false }).range(from, to),
    ),
    client.from('teams').select('id, name').eq('org_id', orgId).order('name'),
  ])

  const invites: InviteEntry[] = invitesRows.map(i => ({
    id: i.id,
    email: i.email,
    teamId: i.team_id ?? null,
    teamName: i.teams?.name ?? 'Unassigned',
    role: i.role as InviteEntry['role'],
    addedAt: fmtDate(i.created_at),
    status: i.used_at ? 'accepted' : 'pending',
  }))

  const teams = (teamsRes.data ?? []).map((t: { id: string; name: string }) => ({ id: t.id, name: t.name }))
  return { invites, teams }
}

// ── Org Approvals ──────────────────────────────────────────────────────────────

type TierShape = { label: string; description: string; points: number }
type TaskSnapshotShape = {
  title?: string
  description?: string
  points?: number
  icon?: string
  category?: string
  week_number?: number
  points_tiers?: TierShape[]
  selected_tier?: TierShape | null
}

type SubmissionRow = {
  id: string
  task_id: string
  status: string
  submitted_at: string
  submitted_date: string | null
  proof_url: string | null
  rejection_reason: string | null
  points_awarded: number | null
  selected_tier_index: number | null
  task_snapshot: TaskSnapshotShape | null
  note: string | null
  ai_status: string | null
  ai_feedback: string | null
  ai_confidence: number | null
  user_id: string
  tasks: { title: string; description: string; points: number; points_tiers: TierShape[] | null } | null
}

export interface PreviousSubmission {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  submittedAt: string
  submittedDate: string
  proofUrl: string | null
  rejectionReason: string | null
  pointsAwarded: number | null
}

export interface OrgApproval {
  id: string
  member: string
  userId: string
  taskId: string
  teamName: string
  // Below fields prefer task_snapshot if present, else fall back to live task
  taskTitle: string
  taskDescription: string
  taskPoints: number
  taskPointsTiers: TierShape[] | null
  selectedTierIndex: number | null
  selectedTier: TierShape | null  // resolved from snapshot.selected_tier or live tier index
  submittedAt: string       // "20m ago" — relative
  submittedTime: string     // "9:54 PM" — absolute, in org tz
  submittedDate: string
  status: 'pending' | 'approved' | 'rejected'
  rejectionReason: string | null
  pointsAwarded: number | null
  proofUrl: string | null
  note: string | null
  aiStatus: string | null
  aiFeedback: string | null
  aiConfidence: number | null
  previousSubmissions: PreviousSubmission[]  // always present — set to [] if none
}

const APPROVALS_PAGE_SIZE = 50

export async function getOrgApprovals(orgId: string, page = 0, status?: 'pending' | 'approved' | 'rejected', date?: string, taskId?: string, search?: string, aiDisagreed = false): Promise<{ approvals: OrgApproval[]; hasMore: boolean }> {
  const client = await createAdminClient()
  const from = page * APPROVALS_PAGE_SIZE
  const to   = from + APPROVALS_PAGE_SIZE - 1

  // Server-side name search: resolve matching profile IDs first, then filter
  // submissions to those user_ids. Works across all pages, not just the 50
  // currently loaded in the client.
  let searchUserIds: string[] | null = null
  if (search && search.trim().length >= 2) {
    const { data: matched } = await client
      .from('profiles')
      .select('id')
      .eq('org_id', orgId)
      .ilike('name', `%${search.trim()}%`)
      .limit(500)
    searchUserIds = (matched ?? []).map(p => p.id)
    if (searchUserIds.length === 0) {
      return { approvals: [], hasMore: false }
    }
  }

  let subsQuery = client
    .from('task_submissions')
    .select('id, task_id, status, submitted_at, submitted_date, reviewed_at, proof_url, rejection_reason, points_awarded, selected_tier_index, task_snapshot, note, ai_status, ai_feedback, ai_confidence, user_id, tasks!task_id(title, description, points, points_tiers)')
    .eq('org_id', orgId)
  if (status) subsQuery = subsQuery.eq('status', status)
  if (date) subsQuery = subsQuery.eq('submitted_date', date)
  if (taskId) subsQuery = subsQuery.eq('task_id', taskId)
  if (searchUserIds) subsQuery = subsQuery.in('user_id', searchUserIds)
  // "AI disagreed" — admin overrode the AI verdict. Two shapes:
  //   1. Admin approved but AI said reject (most common — admin was too lenient)
  //   2. Admin rejected but AI said approve (rare — admin caught what AI missed)
  // Both are interesting for QA, so we OR them.
  if (aiDisagreed) {
    subsQuery = subsQuery.or('and(status.eq.approved,ai_status.eq.rejected),and(status.eq.rejected,ai_status.eq.approved)')
  }
  // For approved/rejected, sort by reviewed_at so recently-actioned items surface first.
  // For pending/all, sort by submitted_at so oldest-waiting comes first? No — newest first is fine.
  const sortCol = (status === 'approved' || status === 'rejected') ? 'reviewed_at' : 'submitted_at'
  subsQuery = subsQuery
    .order(sortCol, { ascending: false })
    .order('id', { ascending: false })
    .range(from, to + 1)

  // These two are name/team lookup maps for the submissions on this page.
  // They must cover EVERY member, not the first 1000 — at National (1100+
  // members) an unbounded select truncated the map and the approvals screen
  // rendered "Unknown" / "Unassigned" for whoever fell past the cap.
  const [subsRes, teamMems, profiles, orgRes] = await Promise.all([
    subsQuery,
    fetchAllRows<{ user_id: string; teams: { name: string } | null }>(
      (from, to) => client
        .from('team_members')
        .select('user_id, teams!team_id(name)')
        .eq('org_id', orgId).range(from, to),
    ),
    fetchAllRows<{ id: string; name: string }>(
      (from, to) => client
        .from('profiles')
        .select('id, name')
        .eq('org_id', orgId).range(from, to),
    ),
    client.from('organizations').select('timezone').eq('id', orgId).single(),
  ])

  if (subsRes.error)   console.error('getOrgApprovals subs error:', subsRes.error)

  const orgTz: string = (orgRes.data as { timezone: string | null } | null)?.timezone || 'UTC'
  // Format an ISO timestamp as "9:54 PM" in the org's timezone.
  const fmtTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('en-US', {
        timeZone: orgTz,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    } catch {
      return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    }
  }

  const teamMap: Record<string, string>    = {}
  const profileMap: Record<string, string> = {}

  for (const tm of teamMems) {
    teamMap[tm.user_id] = tm.teams?.name ?? 'Unassigned'
  }
  for (const p of profiles) {
    profileMap[p.id] = p.name
  }

  const rawRows = (subsRes.data ?? []) as unknown as SubmissionRow[]
  const hasMore = rawRows.length > APPROVALS_PAGE_SIZE
  let rows = hasMore ? rawRows.slice(0, APPROVALS_PAGE_SIZE) : rawRows

  // Note: previous "superseded" hack lived here. Removed — the new Rejection
  // History tab (driven by rejection_reason IS NOT NULL) is the right place to
  // see "this was rejected, then approved later". Each rejected row on the
  // Rejected tab is now a real, currently-rejected event.

  // Group by (user_id, task_id) — rows are already sorted newest-first.
  // First row in each group is the active submission; the rest are history.
  const groupMap = new Map<string, SubmissionRow[]>()
  for (const s of rows) {
    const key = `${s.user_id}::${s.task_id}`
    const grp = groupMap.get(key)
    if (grp) grp.push(s)
    else groupMap.set(key, [s])
  }

  const approvals: OrgApproval[] = []
  for (const group of groupMap.values()) {
    const s = group[0]
    const previous: PreviousSubmission[] = group.slice(1).map(p => ({
      id: p.id,
      status: p.status as PreviousSubmission['status'],
      submittedAt: timeAgo(p.submitted_at),
      submittedDate: p.submitted_date ?? (p.submitted_at as string)?.slice(0, 10) ?? '',
      proofUrl: p.proof_url ?? null,
      rejectionReason: p.rejection_reason ?? null,
      pointsAwarded: p.points_awarded ?? null,
    }))

    // Prefer snapshot (frozen at submission time); fall back to live task data
    const snap = s.task_snapshot ?? null
    const taskTitle       = snap?.title       ?? s.tasks?.title       ?? '—'
    const taskDescription = snap?.description ?? s.tasks?.description ?? ''
    const taskPoints      = snap?.points      ?? s.tasks?.points      ?? 0
    const taskPointsTiers = snap?.points_tiers ?? s.tasks?.points_tiers ?? null

    // Resolve claimed tier: prefer snapshot.selected_tier; fallback to live tiers[index]
    let selectedTier: TierShape | null = null
    if (snap?.selected_tier) {
      selectedTier = snap.selected_tier
    } else if (s.tasks?.points_tiers && s.selected_tier_index != null) {
      selectedTier = s.tasks.points_tiers[s.selected_tier_index] ?? null
    }

    approvals.push({
      id: s.id,
      member: profileMap[s.user_id] ?? 'Unknown',
      userId: s.user_id,
      taskId: s.task_id,
      teamName: teamMap[s.user_id] ?? 'Unassigned',
      taskTitle,
      taskDescription,
      taskPoints,
      taskPointsTiers,
      selectedTierIndex: s.selected_tier_index ?? null,
      selectedTier,
      submittedAt: timeAgo(s.submitted_at),
      submittedTime: fmtTime(s.submitted_at),
      submittedDate: s.submitted_date ?? (s.submitted_at as string)?.slice(0, 10) ?? '',
      status: s.status as OrgApproval['status'],
      rejectionReason: s.rejection_reason ?? null,
      pointsAwarded: s.points_awarded ?? null,
      proofUrl: s.proof_url ?? null,
      note: s.note ?? null,
      aiStatus: s.ai_status ?? null,
      aiFeedback: s.ai_feedback ?? null,
      aiConfidence: s.ai_confidence ?? null,
      previousSubmissions: previous,
    })
  }
  return { approvals, hasMore }
}

// Task list for the approvals filter dropdown.
//
// This used to read every task_submission row for the org and reduce it to the
// distinct task_ids — moving tens of thousands of rows to produce a handful of
// values, and capping at 1000 so a task whose submissions all landed past the
// cap vanished from the filter. The tasks themselves live in `tasks`, so read
// them there: a few rows instead of the whole submission history.
export async function getOrgTaskList(orgId: string): Promise<Array<{ id: string; title: string }>> {
  const client = await createAdminClient()
  const { data: challenges } = await client
    .from('challenges')
    .select('id')
    .eq('org_id', orgId)
  const challengeIds = (challenges ?? []).map((c: { id: string }) => c.id)
  if (challengeIds.length === 0) return []

  const { data } = await client
    .from('tasks')
    .select('id, title')
    .in('challenge_id', challengeIds)

  return ((data ?? []) as Array<{ id: string; title: string }>)
    .map(t => ({ id: t.id, title: t.title ?? 'Unknown' }))
    .sort((a, b) => a.title.localeCompare(b.title))
}

export interface OrgTaskBreakdown {
  taskId: string
  title: string
  approved: number
  rejected: number       // current status = rejected
  rejectedEver: number   // rejection_reason IS NOT NULL — ever rejected (incl. those later approved)
  pending: number
  total: number
}

// Per-task submission counts. Used on the Approvals page to show admins how
// many submissions each running task has received, broken down by status.
export async function getOrgTaskBreakdown(orgId: string): Promise<OrgTaskBreakdown[]> {
  const client = await createAdminClient()
  const { data } = await client.rpc('get_org_task_breakdown', { org_id_param: orgId })
  return ((data ?? []) as Array<{ task_id: string; title: string; approved: number; rejected: number; rejected_ever: number; pending: number; total: number }>)
    .map(r => ({
      taskId: r.task_id,
      title: r.title,
      approved: Number(r.approved),
      rejected: Number(r.rejected),
      rejectedEver: Number(r.rejected_ever),
      pending: Number(r.pending),
      total: Number(r.total),
    }))
}

export interface OrgRejectionEvent {
  id: string
  userId: string
  taskId: string
  taskTitle: string
  memberName: string
  rejectionReason: string
  rejectedAt: string          // reviewed_at (best-effort: last status transition)
  rejectedDate: string        // submitted_date
  submittedTime: string       // "9:54 PM" in org tz
  proofUrl: string | null
  aiStatus: string | null
  aiFeedback: string | null
  aiConfidence: number | null
  pointsAwarded: number | null
  currentStatus: 'pending' | 'approved' | 'rejected'
}

const REJECTION_HISTORY_PAGE_SIZE = 50

export async function getOrgRejectionHistory(
  orgId: string,
  page = 0,
  taskId?: string,
): Promise<{ rows: OrgRejectionEvent[]; hasMore: boolean }> {
  const client = await createAdminClient()
  const offset = page * REJECTION_HISTORY_PAGE_SIZE
  const [rpcRes, orgRes] = await Promise.all([
    client.rpc('get_org_rejection_history', {
      org_id_param: orgId,
      limit_param: REJECTION_HISTORY_PAGE_SIZE + 1,
      offset_param: offset,
      task_filter: taskId ?? null,
    }),
    client.from('organizations').select('timezone').eq('id', orgId).single(),
  ])

  const orgTz = (orgRes.data as { timezone: string | null } | null)?.timezone || 'UTC'
  const fmtTime = (iso: string | null) => {
    if (!iso) return ''
    try {
      return new Date(iso).toLocaleTimeString('en-US', {
        timeZone: orgTz,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    } catch {
      return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    }
  }

  const raw = (rpcRes.data ?? []) as Array<{
    id: string
    user_id: string
    task_id: string
    submitted_at: string
    submitted_date: string
    reviewed_at: string | null
    proof_url: string | null
    rejection_reason: string
    ai_status: string | null
    ai_feedback: string | null
    ai_confidence: number | null
    points_awarded: number | null
    current_status: string
    task_title: string
    member_name: string
  }>

  const hasMore = raw.length > REJECTION_HISTORY_PAGE_SIZE
  const slice = hasMore ? raw.slice(0, REJECTION_HISTORY_PAGE_SIZE) : raw

  const rows: OrgRejectionEvent[] = slice.map(r => ({
    id: r.id,
    userId: r.user_id,
    taskId: r.task_id,
    taskTitle: r.task_title,
    memberName: r.member_name,
    rejectionReason: r.rejection_reason,
    rejectedAt: r.reviewed_at ?? r.submitted_at,
    rejectedDate: r.submitted_date ?? r.submitted_at.slice(0, 10),
    submittedTime: fmtTime(r.reviewed_at ?? r.submitted_at),
    proofUrl: r.proof_url,
    aiStatus: r.ai_status,
    aiFeedback: r.ai_feedback,
    aiConfidence: r.ai_confidence,
    pointsAwarded: r.points_awarded,
    currentStatus: r.current_status as OrgRejectionEvent['currentStatus'],
  }))

  return { rows, hasMore }
}

export async function getOrgApprovalCounts(orgId: string): Promise<{ pending: number; approved: number; rejected: number; rejectedEver: number }> {
  const client = await createAdminClient()
  const { data } = await client.rpc('get_approval_counts', { org_id_param: orgId })
  const counts = { pending: 0, approved: 0, rejected: 0, rejectedEver: 0 }
  for (const row of (data ?? []) as { status: string; cnt: number }[]) {
    if (row.status === 'pending') counts.pending = row.cnt
    else if (row.status === 'approved') counts.approved = row.cnt
    else if (row.status === 'rejected') counts.rejected = row.cnt
    else if (row.status === 'rejected_ever') counts.rejectedEver = row.cnt
  }
  return counts
}

// ── Org Overview ───────────────────────────────────────────────────────────────

export interface OrgOverview {
  id: string
  name: string
  slug: string
  logo: string
  country: string
  timezone: string
  isActive: boolean
  createdAt: string
  orgAdmin: string
  orgAdminEmail: string
  stats: {
    members: number
    teams: number
    totalPoints: number
    pendingApprovals: number
    activeChallenges: Array<{ name: string; dates: string }>
  }
  teams: Array<{ id: string; name: string; captain: string; members: number; points: number }>
}

export async function getOrgOverview(orgId: string): Promise<OrgOverview | null> {
  const client = await createAdminClient()

  const { data: org } = await client.from('organizations').select('*').eq('id', orgId).single()
  if (!org) return null

  const [membersRes, teamsRes, pendingRes, challengesRes, adminRes, teamsListRes] = await Promise.all([
    client.from('profiles').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    client.from('teams').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    client.from('task_submissions').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'pending'),
    client.from('challenges').select('name, start_date, end_date, status').eq('org_id', orgId),
    client.from('admin_users').select('name, email').eq('org_id', orgId).eq('role', 'org_admin').maybeSingle(),
    client.from('teams').select('id, name, team_members(user_id, role, profiles(name))').eq('org_id', orgId).order('created_at', { ascending: true }),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeChallenges = ((challengesRes.data ?? []) as any[])
    .filter((c: { status: string }) => c.status === 'active')
    .map((c: { name: string; start_date: string; end_date: string }) => ({
      name: c.name,
      dates: `${fmtDate(c.start_date)} – ${fmtDate(c.end_date)}`,
    }))

  // Fetch points per team via team_points_view, SUMMED across every active
  // OR completed challenge in the org. Including completed challenges keeps
  // the overview populated after a challenge ends (points are permanent
  // records, not transient state). Matches mobile leaderboard behavior.
  const { data: relevantChallengeRows } = await client
    .from('challenges')
    .select('id')
    .eq('org_id', orgId)
    .in('status', ['active', 'completed'])
  const activeChallengeIds = (relevantChallengeRows ?? []).map((c: { id: string }) => c.id)
  const teamPtsMap: Record<string, number> = {}
  let totalPoints = 0
  if (activeChallengeIds.length > 0) {
    const { data: viewRows } = await client
      .from('team_points_view')
      .select('team_id, total_points')
      .in('challenge_id', activeChallengeIds)
    for (const row of (viewRows ?? []) as { team_id: string; total_points: number }[]) {
      teamPtsMap[row.team_id] = (teamPtsMap[row.team_id] ?? 0) + row.total_points
      totalPoints += row.total_points
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teams = ((teamsListRes.data ?? []) as any[]).map((t: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const captain = t.team_members.find((m: any) => m.role === 'captain')?.profiles?.name ?? '—'
    return { id: t.id, name: t.name, captain, members: t.team_members.length, points: teamPtsMap[t.id] ?? 0 }
  }).sort((a, b) => b.points - a.points)

  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    logo: org.logo ?? '🏢',
    country: org.country ?? '',
    timezone: org.timezone ?? '',
    isActive: org.is_active,
    createdAt: fmtDate(org.created_at),
    orgAdmin: adminRes.data?.name ?? '—',
    orgAdminEmail: adminRes.data?.email ?? '—',
    stats: {
      members: membersRes.count ?? 0,
      teams: teamsRes.count ?? 0,
      totalPoints,
      pendingApprovals: pendingRes.count ?? 0,
      activeChallenges,
    },
    teams,
  }
}

// ── Organizations ──────────────────────────────────────────────────────────────

export async function getOrgsAdmin(): Promise<OrgSummaryAdmin[]> {
  const client = await createAdminClient()
  const { data: orgs } = await client
    .from('organizations')
    .select('id, name, slug, logo, is_active, created_at')
    .order('created_at')
  if (!orgs) return []

  const results: OrgSummaryAdmin[] = []
  for (const org of orgs) {
    const [membersRes, teamsRes, challengesRes, adminRes] = await Promise.all([
      client.from('org_members').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
      client.from('teams').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
      client.from('challenges').select('name').eq('org_id', org.id).eq('status', 'active'),
      client.from('admin_users').select('name').eq('org_id', org.id).eq('role', 'org_admin').limit(1).maybeSingle(),
    ])
    results.push({
      id: org.id,
      name: org.name,
      slug: org.slug,
      logo: org.logo,
      isActive: org.is_active,
      createdAt: fmtDate(org.created_at),
      memberCount: membersRes.count ?? 0,
      teamCount: teamsRes.count ?? 0,
      activeChallenges: (challengesRes.data ?? []).map((c: { name: string }) => c.name),
      orgAdmin: adminRes.data?.name ?? '—',
    })
  }
  return results
}

// ── Manual Points Adjustment ───────────────────────────────────────────────────

export interface OrgMemberForAdjust {
  id: string
  name: string
  teamName: string
}

export async function getOrgMembersForAdjust(orgId: string): Promise<OrgMemberForAdjust[]> {
  const client = await createAdminClient()
  // Both cross 1000 rows at National scale — paginate or the adjust-points
  // picker silently omits members past the cap.
  const [members, teamMems] = await Promise.all([
    fetchAllRows<any>(
      (from, to) => client.from('org_members').select('user_id, profiles(id, name)').eq('org_id', orgId).range(from, to),
    ),
    fetchAllRows<any>(
      (from, to) => client.from('team_members').select('user_id, teams(name)').eq('org_id', orgId).range(from, to),
    ),
  ])

  const teamMap: Record<string, string> = {}
  for (const tm of teamMems) {
    teamMap[tm.user_id] = tm.teams?.name ?? 'Unassigned'
  }

  return members
    .filter((m: any) => m.profiles)
    .map((m: any) => ({
      id: m.profiles.id,
      name: m.profiles.name,
      teamName: teamMap[m.user_id] ?? 'Unassigned',
    }))
    .sort((a: OrgMemberForAdjust, b: OrgMemberForAdjust) => a.name.localeCompare(b.name))
}

// ── Breadcrumbs ────────────────────────────────────────────────────────────────

export async function getAllOrgShortNames(): Promise<Record<string, string>> {
  const client = await createAdminClient()
  const { data } = await client.from('organizations').select('id, name')
  if (!data) return {}

  const map: Record<string, string> = {}
  for (const org of data) {
    map[org.id] = org.name
  }
  return map
}

// ── Challenge Detail ──────────────────────────────────────────────────────────

export interface ChallengeDetailAdmin {
  id: string
  title: string
  description: string
  startDate: string
  endDate: string
  status: 'active' | 'inactive' | 'completed'
}

export interface ChallengeTaskAdmin {
  id: string
  week: number
  title: string
  points: number
  status: 'active' | 'inactive'
}

export async function getChallengeDetailAdmin(challengeId: string): Promise<{ challenge: ChallengeDetailAdmin; tasks: ChallengeTaskAdmin[] } | null> {
  const client = await createAdminClient()

  const { data: challenge } = await client.from('challenges').select('*').eq('id', challengeId).single()
  if (!challenge) return null

  const { data: tasks } = await client
    .from('tasks')
    .select('id, week_number, title, points, status')
    .eq('challenge_id', challengeId)
    .order('week_number')
    .order('created_at')

  const parsedTasks: ChallengeTaskAdmin[] = (tasks ?? []).map((t: any) => ({
    id: t.id,
    week: t.week_number ?? 1,
    title: t.title,
    points: t.points,
    status: t.status as 'active' | 'inactive',
  }))

  return {
    challenge: {
      id: challenge.id,
      title: challenge.name,
      description: challenge.description ?? '',
      startDate: fmtDate(challenge.start_date),
      endDate: fmtDate(challenge.end_date),
      status: challenge.status as ChallengeDetailAdmin['status'],
    },
    tasks: parsedTasks,
  }
}

// ── Member Detail ──────────────────────────────────────────────────────────────

export interface MemberDetailAdmin {
  id: string
  name: string
  email: string
  team: string
  role: 'team_captain' | 'vice_captain' | 'member'
  totalPoints: number
  rank: number
  joinedAt: string
  avatarColor: string
  tasksCompleted: number
  tasksRejected: number
  tasksPending: number
  submissions: Array<{
    id: string
    taskId: string
    challengeId: string
    taskTitle: string
    challenge: string
    week: number
    submittedDate: string
    status: 'pending' | 'approved' | 'rejected'
    pointsAwarded: number
    proofUrl: string | null
    rejectionReason: string | null
    previousAttempts: Array<{
      id: string
      status: 'pending' | 'approved' | 'rejected'
      submittedAt: string
      proofUrl: string | null
      rejectionReason: string | null
      pointsAwarded: number
    }>
  }>
  pointsHistory: Array<{
    id: string
    amount: number
    reason: string
    isManual: boolean
    createdAt: string
    eventDateRaw: string
    taskTitle: string | null
    challengeName: string | null
  }>
}

export async function getMemberDetail(orgId: string, memberId: string): Promise<MemberDetailAdmin | null> {
  const client = await createAdminClient()

  // Find user details via profile mapping
  const { data: profile } = await client.from('profiles').select('*').eq('id', memberId).single()
  if (!profile) return null

  const { data: teamMember } = await client
    .from('team_members')
    .select('role, teams(name)')
    .eq('user_id', memberId)
    .maybeSingle()

  // Rank by total_points (includes manual adjustments, not just task submissions).
  //
  // This previously pulled every profile in the org and sorted in JS, which at
  // National scale (1100+ members) stopped at PostgREST's 1000-row cap — so
  // anyone outside the first 1000 rows was ranked against a partial field and
  // got a wrong number. Ask Postgres instead: rank = how many members have
  // strictly more points, + 1. head:true means no rows are transferred at all.
  const myPoints = (profile as { total_points?: number } | null)?.total_points ?? 0
  const { count: ahead } = await client
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .gt('total_points', myPoints)
  const rank = (ahead ?? 0) + 1

  const { data: submissions } = await client
    .from('task_submissions')
    .select('id, task_id, challenge_id, status, submitted_at, submitted_date, points_awarded, proof_url, rejection_reason, tasks(title, start_week), challenges(name)')
    .eq('user_id', memberId)
    .order('submitted_at', { ascending: false })

  // Group by (task_id, challenge_id, submitted_date) — newest-first within each group.
  // This collapses same-day resubmissions into one row with the rest as history.
  const groupMap = new Map<string, any[]>()
  for (const s of submissions ?? []) {
    const key = `${s.task_id}::${s.challenge_id}::${s.submitted_date}`
    const grp = groupMap.get(key)
    if (grp) grp.push(s)
    else groupMap.set(key, [s])
  }

  const { data: pointsTxns } = await client
    .from('points_transactions')
    .select('id, amount, reason, is_manual, created_at, transaction_date, task_submissions!submission_id(task_id, tasks(title), challenges(name))')
    .eq('user_id', memberId)
    .order('created_at', { ascending: false })
    .limit(100)

  let pending = 0, completed = 0, rejected = 0
  const mappedSubmissions = Array.from(groupMap.values()).map(group => {
    const s = group[0] // latest submission in this group
    if (s.status === 'pending') pending++
    if (s.status === 'approved') completed++
    if (s.status === 'rejected') rejected++

    return {
      id: s.id,
      taskId: s.task_id ?? '',
      challengeId: s.challenge_id ?? '',
      taskTitle: s.tasks?.title ?? '—',
      challenge: s.challenges?.name ?? '—',
      week: s.tasks?.start_week ?? 1,
      submittedDate: s.submitted_date ?? '—',
      status: s.status,
      pointsAwarded: s.points_awarded ?? 0,
      proofUrl: s.proof_url ?? null,
      rejectionReason: s.rejection_reason ?? null,
      previousAttempts: group.slice(1).map((p: any) => ({
        id: p.id,
        status: p.status as 'pending' | 'approved' | 'rejected',
        submittedAt: new Date(p.submitted_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        proofUrl: p.proof_url ?? null,
        rejectionReason: p.rejection_reason ?? null,
        pointsAwarded: p.points_awarded ?? 0,
      })),
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teamInfo = teamMember?.teams as any
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email ?? '—',
    team: teamInfo?.name ?? 'Unassigned',
    role: teamMember?.role as MemberDetailAdmin['role'] ?? 'member',
    totalPoints: profile.total_points ?? 0,
    rank,
    joinedAt: fmtDate(profile.created_at),
    avatarColor: profile.avatar_color ?? '#94a3b8',
    tasksCompleted: completed,
    tasksRejected: rejected,
    tasksPending: pending,
    submissions: mappedSubmissions,
    pointsHistory: (pointsTxns ?? []).map((t: any) => ({
      id: t.id,
      amount: t.amount,
      reason: t.reason ?? '',
      isManual: t.is_manual ?? false,
      createdAt: t.created_at,
      eventDateRaw: (t.transaction_date ?? t.created_at.slice(0, 10)) as string,
      taskTitle: (t.task_submissions as any)?.tasks?.title ?? null,
      challengeName: (t.task_submissions as any)?.challenges?.name ?? null,
    })),
  }
}
