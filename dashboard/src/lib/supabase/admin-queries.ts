/**
 * Server-side admin queries — uses the service-role client (bypasses RLS).
 * Import only in Server Components or Server Actions.
 */

import { createAdminClient } from './server'

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
  if (!orgs) return []

  const results: DashboardOrg[] = []
  for (const org of orgs) {
    const { data: challenges } = await client
      .from('challenges')
      .select('id')
      .eq('org_id', org.id)
    const challengeIds = (challenges ?? []).map((c: { id: string }) => c.id)

    const [membersRes, teamsRes, pendingRes] = await Promise.all([
      client.from('org_members').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
      client.from('teams').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
      challengeIds.length > 0
        ? client.from('task_submissions').select('id', { count: 'exact', head: true }).in('challenge_id', challengeIds).eq('status', 'pending')
        : { count: 0 },
    ])
    results.push({
      id: org.id,
      name: org.name,
      logo: org.logo,
      slug: org.slug,
      isActive: org.is_active,
      memberCount: membersRes.count ?? 0,
      teamCount: teamsRes.count ?? 0,
      pendingApprovals: pendingRes.count ?? 0,
    })
  }
  return results
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
  amount: number
  reason: string
  createdAt: string
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

export interface TeamStatAdmin {
  id: string
  name: string
  color: string
  emoji: string
  members: MemberStatAdmin[]
  total: number
}

export async function getOrgPointsBreakdown(orgId: string): Promise<{ members: MemberStatAdmin[]; teams: TeamStatAdmin[]; currentWeek: number }> {
  const client = await createAdminClient()

  const [challengeRes, teamMembersRes, orgMembersRes, subsRes, missedRes, manualRes, rejectedRes] = await Promise.all([
    client.from('challenges').select('id, start_date').eq('org_id', orgId).eq('status', 'active').limit(1).maybeSingle(),
    client.from('team_members').select('user_id, profiles(id, name, avatar_color), teams(id, name, emoji, color)').eq('org_id', orgId),
    client.from('org_members').select('user_id, profiles(id, name, avatar_color)').eq('org_id', orgId),
    client.from('task_submissions').select('user_id, submitted_date, points_awarded, tasks(title, icon, points, start_week)').eq('org_id', orgId).eq('status', 'approved'),
    // Fetch 0-pt missed-task transactions written by the daily cron
    client.from('points_transactions')
      .select('user_id, org_id, reason, created_at')
      .eq('org_id', orgId)
      .eq('amount', 0)
      .like('reason', 'Task missed:%'),
    // Fetch manual point adjustments
    client.from('points_transactions')
      .select('user_id, amount, reason, created_at')
      .eq('org_id', orgId)
      .eq('is_manual', true)
      .order('created_at', { ascending: false }),
    // Fetch rejected submissions
    client.from('task_submissions')
      .select('user_id, submitted_date, tasks(title, icon, start_week)')
      .eq('org_id', orgId)
      .eq('status', 'rejected'),
  ])

  const startDate = challengeRes.data ? new Date(challengeRes.data.start_date) : null

  // Build team lookup
  type TmRaw = { user_id: string; profiles: { id: string; name: string; avatar_color: string } | null; teams: { id: string; name: string; emoji: string; color: string } | null }
  const teamMap: Record<string, { id: string; name: string; emoji: string; color: string }> = {}
  for (const tm of (teamMembersRes.data ?? []) as unknown as TmRaw[]) {
    if (tm.profiles?.id && tm.teams) teamMap[tm.profiles.id] = tm.teams
  }

  // Build member map from org_members
  type OmRaw = { user_id: string; profiles: { id: string; name: string; avatar_color: string } | null }
  const memberMap: Record<string, MemberStatAdmin> = {}
  for (const om of (orgMembersRes.data ?? []) as unknown as OmRaw[]) {
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
  type SubRaw = { user_id: string; submitted_date: string | null; points_awarded: number | null; tasks: { title: string; icon: string; points: number; start_week: number } | null }

  function calcWeek(dateStr: string | null, pts?: number): number {
    if (startDate && dateStr) {
      const diff = Math.floor((new Date(dateStr + 'T12:00:00').getTime() - startDate.getTime()) / 86400000)
      return Math.max(1, Math.floor(diff / 7) + 1)
    }
    return pts ?? 1
  }

  for (const sub of (subsRes.data ?? []) as unknown as SubRaw[]) {
    const { user_id, submitted_date, points_awarded, tasks } = sub
    if (!tasks || !memberMap[user_id]) continue
    const week = calcWeek(submitted_date, tasks.start_week ?? 1)
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
  type RejRaw = { user_id: string; submitted_date: string | null; tasks: { title: string; icon: string; start_week: number } | null }
  for (const sub of (rejectedRes.data ?? []) as unknown as RejRaw[]) {
    const { user_id, submitted_date, tasks } = sub
    if (!tasks || !memberMap[user_id]) continue
    const week = calcWeek(submitted_date, tasks.start_week ?? 1)
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
    const week = calcWeek(dateStr ?? created_at.slice(0, 10))
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
  type ManualRaw = { user_id: string; amount: number; reason: string; created_at: string }
  for (const row of (manualRes.data ?? []) as unknown as ManualRaw[]) {
    const { user_id, amount, reason, created_at } = row
    if (!memberMap[user_id]) continue
    memberMap[user_id].manualAdjustments.push({ amount, reason, createdAt: fmtDate(created_at) })
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
      teamStatMap[m.teamId] = { id: m.teamId, name: m.teamName, color: m.teamColor, emoji: m.teamEmoji, members: [], total: 0 }
    }
    teamStatMap[m.teamId].members.push(m)
    teamStatMap[m.teamId].total += m.total
  }
  const teams = Object.values(teamStatMap).sort((a, b) => b.total - a.total)

  const todayStr = new Date().toISOString().slice(0, 10)
  const currentWeek = startDate ? calcWeek(todayStr) : 1

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
  const [invitesRes, teamsRes] = await Promise.all([
    client.from('invite_whitelist').select('id, email, team_id, role, used_at, created_at, teams(name)').eq('org_id', orgId).order('created_at', { ascending: false }),
    client.from('teams').select('id, name').eq('org_id', orgId).order('name'),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invites: InviteEntry[] = ((invitesRes.data ?? []) as any[]).map(i => ({
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

export interface OrgApproval {
  id: string
  member: string
  userId: string
  teamName: string
  taskTitle: string
  taskDescription: string
  taskPoints: number
  submittedAt: string
  submittedDate: string
  status: 'pending' | 'approved' | 'rejected'
  rejectionReason: string | null
  pointsAwarded: number | null
  proofUrl: string | null
}

export async function getOrgApprovals(orgId: string): Promise<OrgApproval[]> {
  const client = await createAdminClient()

  const [subsRes, teamMemsRes, profilesRes] = await Promise.all([
    client
      .from('task_submissions')
      .select('id, status, submitted_at, submitted_date, proof_url, rejection_reason, points_awarded, user_id, tasks!task_id(title, description, points)')
      .eq('org_id', orgId)
      .order('submitted_at', { ascending: false })
      .limit(200),
    client
      .from('team_members')
      .select('user_id, teams!team_id(name)')
      .eq('org_id', orgId),
    client
      .from('profiles')
      .select('id, name')
      .eq('org_id', orgId),
  ])

  if (subsRes.error)   console.error('getOrgApprovals subs error:', subsRes.error)
  if (teamMemsRes.error) console.error('getOrgApprovals teams error:', teamMemsRes.error)
  if (profilesRes.error) console.error('getOrgApprovals profiles error:', profilesRes.error)

  const teamMap: Record<string, string>    = {}
  const profileMap: Record<string, string> = {}

  for (const tm of (teamMemsRes.data ?? []) as any[]) {
    teamMap[tm.user_id] = tm.teams?.name ?? 'Unassigned'
  }
  for (const p of (profilesRes.data ?? []) as any[]) {
    profileMap[p.id] = p.name
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((subsRes.data ?? []) as any[]).map(s => ({
    id: s.id,
    member: profileMap[s.user_id] ?? 'Unknown',
    userId: s.user_id,
    teamName: teamMap[s.user_id] ?? 'Unassigned',
    taskTitle: s.tasks?.title ?? '—',
    taskDescription: s.tasks?.description ?? '',
    taskPoints: s.tasks?.points ?? 0,
    submittedAt: timeAgo(s.submitted_at),
    submittedDate: s.submitted_date ?? (s.submitted_at as string)?.slice(0, 10) ?? '',
    status: s.status as OrgApproval['status'],
    rejectionReason: s.rejection_reason ?? null,
    pointsAwarded: s.points_awarded ?? null,
    proofUrl: s.proof_url ?? null,
  }))
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

  const { data: ptsData } = await client
    .from('task_submissions')
    .select('points_awarded')
    .eq('org_id', orgId)
    .eq('status', 'approved')
  const totalPoints = (ptsData ?? []).reduce((sum: number, s: { points_awarded: number | null }) => sum + (s.points_awarded ?? 0), 0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeChallenges = ((challengesRes.data ?? []) as any[])
    .filter((c: { status: string }) => c.status === 'active')
    .map((c: { name: string; start_date: string; end_date: string }) => ({
      name: c.name,
      dates: `${fmtDate(c.start_date)} – ${fmtDate(c.end_date)}`,
    }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teams = ((teamsListRes.data ?? []) as any[]).map((t: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const captain = t.team_members.find((m: any) => m.role === 'captain')?.profiles?.name ?? '—'
    return { id: t.id, name: t.name, captain, members: t.team_members.length, points: 0 }
  })

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
  const [membersRes, teamMemsRes] = await Promise.all([
    client.from('org_members').select('user_id, profiles(id, name)').eq('org_id', orgId),
    client.from('team_members').select('user_id, teams(name)').eq('org_id', orgId),
  ])

  const teamMap: Record<string, string> = {}
  for (const tm of (teamMemsRes.data ?? []) as any[]) {
    teamMap[tm.user_id] = tm.teams?.name ?? 'Unassigned'
  }

  return ((membersRes.data ?? []) as any[])
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

  // To find rank, sort everyone in the org. In a real highly-scaled app, we'd cache this.
  const { data: allPoints } = await client
    .from('task_submissions')
    .select('user_id, points_awarded')
    .eq('org_id', orgId)
    .eq('status', 'approved')

  const userPts: Record<string, number> = {}
  for (const p of allPoints ?? []) {
    userPts[p.user_id] = (userPts[p.user_id] ?? 0) + (p.points_awarded ?? 0)
  }
  const orderedUserIds = Object.keys(userPts).sort((a, b) => userPts[b] - userPts[a])
  let rank = orderedUserIds.indexOf(memberId) + 1
  if (rank === 0) rank = orderedUserIds.length + 1 // if no points, they are at the bottom

  const { data: submissions } = await client
    .from('task_submissions')
    .select('id, task_id, challenge_id, status, submitted_date, points_awarded, proof_url, rejection_reason, tasks(title, start_week), challenges(name)')
    .eq('user_id', memberId)
    .order('submitted_date', { ascending: false })

  let pending = 0, completed = 0, rejected = 0
  const mappedSubmissions = (submissions ?? []).map((s: any) => {
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
    totalPoints: userPts[memberId] ?? 0,
    rank,
    joinedAt: fmtDate(profile.created_at),
    avatarColor: profile.avatar_color ?? '#94a3b8',
    tasksCompleted: completed,
    tasksRejected: rejected,
    tasksPending: pending,
    submissions: mappedSubmissions,
  }
}
