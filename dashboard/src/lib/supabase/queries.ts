'use server'
/**
 * Yi Nutrition League — Supabase query functions
 * All pages import from here; server-side admin client (bypasses RLS) is used throughout.
 */

import { createAdminClient } from './server'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function db() {
  return createAdminClient()
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ── Types returned to UI ───────────────────────────────────────────────────────

export interface OrgSummary {
  id: string
  name: string
  slug: string
  logo: string
  country: string
  timezone: string
  isActive: boolean
  createdAt: string
  memberCount: number
  teamCount: number
  activeChallenges: string[]
  orgAdmin: string
}

export interface OrgDetail extends OrgSummary {
  stats: {
    members: number
    teams: number
    totalPoints: number
    pendingApprovals: number
    activeChallenges: Array<{ name: string; dates: string }>
  }
  orgAdminEmail: string
  teams: Array<{ id: string; name: string; captain: string; members: number; points: number }>
}

export interface OrgMember {
  id: string
  name: string
  email: string
  team: string
  teamId: string | null
  role: 'org_admin' | 'sub_admin' | 'member'
  teamRole: 'captain' | 'vice_captain' | 'member' | null
  points: number
  joinedAt: string
  avatarColor: string
}

export interface TeamMemberUI {
  id: string
  name: string
  role: 'captain' | 'vice_captain' | 'member'
  avatarColor: string
}

export interface TeamUI {
  id: string
  name: string
  emoji: string
  color: string
  points: number
  members: TeamMemberUI[]
}

export interface AvailableMember {
  id: string
  name: string
  avatarColor: string
}

export interface TaskBreakdownUI {
  taskTitle: string
  icon: string
  daysCompleted: number
  pointsPerDay: number
  subtotal: number
}

export interface WeekPointsUI {
  week: number
  points: number
  tasks: TaskBreakdownUI[]
}

export interface TeamMemberRowUI {
  id: string
  name: string
  avatarColor: string
  role: 'captain' | 'vice_captain' | 'member'
  weekPoints: WeekPointsUI[]
  total: number
}

export interface TeamDetailUI {
  id: string
  name: string
  emoji: string
  color: string
  totalPoints: number
  rank: number
  captain: string
  viceCaptain: string
  members: TeamMemberRowUI[]
}

export interface TaskUI {
  id: string
  title: string
  description: string
  points: number
  weekNumber: number
  category: string
  icon: string
  teams: string[]
  isActive: boolean
}

export interface ChallengeUI {
  id: string
  name: string
  description: string
  status: 'active' | 'completed' | 'upcoming'
  startDate: string
  endDate: string
  teams: string[]     // team names
  teamIds: string[]   // team UUIDs
  tasks: TaskUI[]
  manuallyClosed: boolean
  submissions: number
}

export interface FeedPost {
  id: string
  type: 'announcement' | 'achievement' | 'leaderboard_change' | 'quiz_result' | 'milestone' | 'submission_approved' | 'general'
  title: string
  content: string
  author: string
  authorInitials: string
  authorRole: 'admin' | 'system'
  avatarColor: string
  challenge: string | null
  date: string
  pinned: boolean
  reactions: { broccoli: number; fire: number; star: number; heart: number }
}

export interface PolicyUI {
  id: string
  name: string
  content: string
  updatedAt: string
  colorIndex: number
}

export interface OrgSettings {
  id: string
  name: string
  country: string
  timezone: string
  isActive: boolean
}

// ── ORGANIZATIONS ─────────────────────────────────────────────────────────────

export async function getOrganizations(): Promise<OrgSummary[]> {
  const supabase = await db()

  const { data: orgs, error } = await supabase
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: true })

  if (error || !orgs) return []

  const results: OrgSummary[] = []

  for (const org of orgs) {
    const [membersRes, teamsRes, challengesRes, adminRes] = await Promise.all([
      supabase.from('org_members').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
      supabase.from('teams').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
      supabase.from('challenges').select('name').eq('org_id', org.id).eq('status', 'active'),
      supabase
        .from('admin_users')
        .select('name')
        .eq('org_id', org.id)
        .eq('role', 'org_admin')
        .limit(1)
        .maybeSingle(),
    ])

    results.push({
      id: org.id,
      name: org.name,
      slug: org.slug,
      logo: org.logo,
      country: org.country,
      timezone: org.timezone,
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

export async function getOrganization(id: string): Promise<OrgDetail | null> {
  const supabase = await db()

  const { data: org } = await supabase.from('organizations').select('*').eq('id', id).single()
  if (!org) return null

  const [membersRes, teamsRes, pendingRes, challengesRes, adminRes, teamsListRes] = await Promise.all([
    supabase.from('org_members').select('id', { count: 'exact', head: true }).eq('org_id', id),
    supabase.from('teams').select('id', { count: 'exact', head: true }).eq('org_id', id),
    supabase.from('task_submissions').select('id', { count: 'exact', head: true }).eq('org_id', id).eq('status', 'pending'),
    supabase.from('challenges').select('name, start_date, end_date, status').eq('org_id', id),
    supabase
      .from('admin_users')
      .select('name, email')
      .eq('org_id', id)
      .eq('role', 'org_admin')
      .limit(1)
      .maybeSingle(),
    supabase
      .from('teams')
      .select(`id, name, emoji, color,
        team_members(user_id, role, profiles(name))`)
      .eq('org_id', id)
      .order('created_at', { ascending: true }),
  ])

  // Total org points (all approved submissions)
  const { data: ptsData } = await supabase
    .from('task_submissions')
    .select('tasks(points)')
    .eq('org_id', id)
    .eq('status', 'approved')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalPoints = (ptsData ?? []).reduce((sum: number, s: any) => sum + (s.tasks?.points ?? 0), 0)

  const activeChallenges = (challengesRes.data ?? [])
    .filter((c: { status: string }) => c.status === 'active')
    .map((c: { name: string; start_date: string; end_date: string }) => ({
      name: c.name,
      dates: `${fmtDate(c.start_date)} – ${fmtDate(c.end_date)}`,
    }))

  type TmRaw = { user_id: string; role: string; profiles: { name: string } | null }
  type TeamRaw = { id: string; name: string; emoji: string; color: string; team_members: TmRaw[] }

  const teams = ((teamsListRes.data ?? []) as unknown as TeamRaw[]).map(t => {
    const captain = t.team_members.find(m => m.role === 'captain')?.profiles?.name ?? '—'
    return {
      id: t.id,
      name: t.name,
      members: t.team_members.length,
      captain,
      points: 0, // computed separately if needed
    }
  })

  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    logo: org.logo,
    country: org.country,
    timezone: org.timezone,
    isActive: org.is_active,
    createdAt: fmtDate(org.created_at),
    memberCount: membersRes.count ?? 0,
    teamCount: teamsRes.count ?? 0,
    activeChallenges: activeChallenges.map((c: { name: string }) => c.name),
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

// ── ORG SETTINGS ─────────────────────────────────────────────────────────────

export async function getOrgSettings(id: string): Promise<OrgSettings | null> {
  const { data } = await (await db()).from('organizations').select('id, name, country, timezone, is_active').eq('id', id).single()
  if (!data) return null
  return { id: data.id, name: data.name, country: data.country, timezone: data.timezone, isActive: data.is_active }
}

export async function updateOrgSettings(id: string, patch: Partial<{ name: string; country: string; timezone: string }>) {
  return (await db()).from('organizations').update(patch).eq('id', id)
}

export async function setOrgActive(id: string, isActive: boolean) {
  return (await db()).from('organizations').update({ is_active: isActive }).eq('id', id)
}

export async function deleteOrg(id: string) {
  return (await db()).from('organizations').delete().eq('id', id)
}

// ── MEMBERS ───────────────────────────────────────────────────────────────────

export async function getOrgMembers(orgId: string): Promise<OrgMember[]> {
  const supabase = await db()

  const { data: members } = await supabase
    .from('org_members')
    .select(`
      id, role, joined_at,
      profiles(id, name, email, avatar_color),
      team_members!team_members_user_id_fkey(
        role,
        teams(id, name)
      )
    `)
    .eq('org_id', orgId)
    .order('joined_at', { ascending: true })

  if (!members) return []

  type MemberRaw = {
    id: string
    role: string
    joined_at: string
    profiles: { id: string; name: string; email: string; avatar_color: string } | null
    team_members: Array<{ role: string; teams: { id: string; name: string } | null }>
  }

  // Get approved points per user
  const { data: submissions } = await supabase
    .from('task_submissions')
    .select('user_id, tasks(points)')
    .eq('org_id', orgId)
    .eq('status', 'approved')

  const pointsMap: Record<string, number> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of (submissions ?? []) as any[]) {
    if (!pointsMap[s.user_id]) pointsMap[s.user_id] = 0
    pointsMap[s.user_id] += s.tasks?.points ?? 0
  }

  return (members as unknown as MemberRaw[]).map(m => {
    const profile = m.profiles!
    const tm = m.team_members?.[0]
    return {
      id: profile.id,
      name: profile.name,
      email: profile.email ?? '—',
      team: tm?.teams?.name ?? 'Unassigned',
      teamId: tm?.teams?.id ?? null,
      role: m.role as OrgMember['role'],
      teamRole: (tm?.role as OrgMember['teamRole']) ?? null,
      points: pointsMap[profile.id] ?? 0,
      joinedAt: fmtDate(m.joined_at),
      avatarColor: profile.avatar_color,
    }
  })
}

export async function removeMember(orgId: string, userId: string) {
  const supabase = await db()
  await supabase.from('team_members').delete().eq('org_id', orgId).eq('user_id', userId)
  return supabase.from('org_members').delete().eq('org_id', orgId).eq('user_id', userId)
}

export async function updateMemberOrgRole(orgId: string, userId: string, role: string) {
  return (await db()).from('org_members').update({ role }).eq('org_id', orgId).eq('user_id', userId)
}

// ── TEAMS ─────────────────────────────────────────────────────────────────────

export async function getOrgTeams(orgId: string): Promise<TeamUI[]> {
  const supabase = await db()

  const { data: teams } = await supabase
    .from('teams')
    .select(`
      id, name, emoji, color,
      team_members(
        user_id, role,
        profiles(id, name, avatar_color)
      )
    `)
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })

  if (!teams) return []

  // Get points per team (latest active challenge)
  const { data: challenges } = await supabase
    .from('challenges')
    .select('id')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .limit(1)
    .single()

  let pointsMap: Record<string, number> = {}

  if (challenges) {
    const [subsRes, tmRes] = await Promise.all([
      supabase.from('task_submissions').select('user_id, points_awarded, tasks(points)').eq('challenge_id', challenges.id).eq('status', 'approved'),
      supabase.from('team_members').select('user_id, team_id').eq('org_id', orgId),
    ])
    const userToTeam: Record<string, string> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const tm of (tmRes.data ?? []) as any[]) userToTeam[tm.user_id] = tm.team_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of (subsRes.data ?? []) as any[]) {
      const tid = userToTeam[s.user_id]
      if (tid) pointsMap[tid] = (pointsMap[tid] ?? 0) + (s.points_awarded ?? s.tasks?.points ?? 0)
    }
  }

  type TmRaw = { user_id: string; role: string; profiles: { id: string; name: string; avatar_color: string } | null }
  type TeamRaw = { id: string; name: string; emoji: string; color: string; team_members: TmRaw[] }

  return (teams as unknown as TeamRaw[]).map(t => ({
    id: t.id,
    name: t.name,
    emoji: t.emoji,
    color: t.color,
    points: pointsMap[t.id] ?? 0,
    members: t.team_members.map(m => ({
      id: m.profiles?.id ?? m.user_id,
      name: m.profiles?.name ?? '—',
      role: m.role as TeamMemberUI['role'],
      avatarColor: m.profiles?.avatar_color ?? '#059669',
    })),
  }))
}

export async function getAvailableMembers(orgId: string): Promise<AvailableMember[]> {
  const supabase = await db()

  // Members in org but not in any team for this org
  const { data: allMembers } = await supabase
    .from('org_members')
    .select('profiles(id, name, avatar_color)')
    .eq('org_id', orgId)

  const { data: teamMemberIds } = await supabase
    .from('team_members')
    .select('user_id')
    .eq('org_id', orgId)

  const assignedIds = new Set((teamMemberIds ?? []).map((r: { user_id: string }) => r.user_id))

  type MRaw = { profiles: { id: string; name: string; avatar_color: string } | null }

  return ((allMembers ?? []) as unknown as MRaw[])
    .filter(m => m.profiles && !assignedIds.has(m.profiles.id))
    .map(m => ({
      id: m.profiles!.id,
      name: m.profiles!.name,
      avatarColor: m.profiles!.avatar_color,
    }))
}

export async function createTeam(orgId: string, data: { name: string; emoji: string; color: string }) {
  return (await db()).from('teams').insert({ org_id: orgId, ...data }).select().single()
}

export async function updateTeam(teamId: string, data: { name: string; emoji: string; color: string }) {
  return (await db()).from('teams').update(data).eq('id', teamId)
}

export async function deleteTeam(teamId: string) {
  return (await db()).from('teams').delete().eq('id', teamId)
}

export async function addTeamMember(teamId: string, userId: string, orgId: string) {
  return (await db()).from('team_members').insert({ team_id: teamId, user_id: userId, org_id: orgId, role: 'member' })
}

export async function removeTeamMember(teamId: string, userId: string) {
  return (await db()).from('team_members').delete().eq('team_id', teamId).eq('user_id', userId)
}

export async function updateTeamMemberRole(teamId: string, userId: string, role: 'captain' | 'vice_captain' | 'member') {
  const supabase = await db()
  // Demote any existing holder of that role first
  if (role !== 'member') {
    await supabase
      .from('team_members')
      .update({ role: 'member' })
      .eq('team_id', teamId)
      .eq('role', role)
  }
  return supabase.from('team_members').update({ role }).eq('team_id', teamId).eq('user_id', userId)
}

// ── TEAM DETAIL ───────────────────────────────────────────────────────────────

export async function getTeamDetail(teamId: string, orgId: string): Promise<TeamDetailUI | null> {
  const supabase = await db()

  const { data: team } = await supabase
    .from('teams')
    .select(`id, name, emoji, color,
      team_members(user_id, role, profiles(id, name, avatar_color))`)
    .eq('id', teamId)
    .single()

  if (!team) return null

  // Active challenge for this org
  const { data: challenge } = await supabase
    .from('challenges')
    .select('id, start_date')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .limit(1)
    .single()

  type TmRaw = { user_id: string; role: string; profiles: { id: string; name: string; avatar_color: string } | null }
  const teamRaw = team as unknown as { id: string; name: string; emoji: string; color: string; team_members: TmRaw[] }

  const captain = teamRaw.team_members.find(m => m.role === 'captain')?.profiles?.name ?? '—'
  const viceCaptain = teamRaw.team_members.find(m => m.role === 'vice_captain')?.profiles?.name ?? '—'

  // Build member rows with week points
  const memberRows: TeamMemberRowUI[] = []

  for (const tm of teamRaw.team_members) {
    const profile = tm.profiles
    if (!profile) continue

    let weekPoints: WeekPointsUI[] = []
    let total = 0

    if (challenge) {
      const { data: subs } = await supabase
        .from('task_submissions')
        .select('submitted_at, status, tasks(id, title, icon, points, category)')
        .eq('user_id', profile.id)
        .eq('challenge_id', challenge.id)
        .eq('status', 'approved')

      type SubRaw = {
        submitted_at: string
        status: string
        tasks: { id: string; title: string; icon: string; points: number; category: string } | null
      }

      const startDate = new Date(challenge.start_date)

      // Group by week
      const weekMap: Record<number, Record<string, { daysCompleted: number; pointsPerDay: number; icon: string }>> = {}

      for (const s of (subs ?? []) as unknown as SubRaw[]) {
        if (!s.tasks) continue
        const subDate = new Date(s.submitted_at)
        const diffDays = Math.floor((subDate.getTime() - startDate.getTime()) / 86400000)
        const week = Math.floor(diffDays / 7) + 1
        if (!weekMap[week]) weekMap[week] = {}
        const key = s.tasks.title
        if (!weekMap[week][key]) {
          weekMap[week][key] = { daysCompleted: 0, pointsPerDay: s.tasks.points, icon: s.tasks.icon }
        }
        weekMap[week][key].daysCompleted++
        total += s.tasks.points
      }

      weekPoints = Object.entries(weekMap)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([week, tasks]) => ({
          week: Number(week),
          points: Object.values(tasks).reduce((s, t) => s + t.daysCompleted * t.pointsPerDay, 0),
          tasks: Object.entries(tasks).map(([title, t]) => ({
            taskTitle: title,
            icon: t.icon,
            daysCompleted: t.daysCompleted,
            pointsPerDay: t.pointsPerDay,
            subtotal: t.daysCompleted * t.pointsPerDay,
          })),
        }))
    }

    memberRows.push({
      id: profile.id,
      name: profile.name,
      avatarColor: profile.avatar_color,
      role: tm.role as TeamMemberRowUI['role'],
      weekPoints,
      total,
    })
  }

  // Team rank: compare total_points across teams in the same challenge
  let rank = 1
  if (challenge) {
    const [subsRes, tmRes] = await Promise.all([
      supabase.from('task_submissions').select('user_id, points_awarded, tasks(points)').eq('challenge_id', challenge.id).eq('status', 'approved'),
      supabase.from('team_members').select('user_id, team_id'),
    ])
    const userToTeam: Record<string, string> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const tm of (tmRes.data ?? []) as any[]) userToTeam[tm.user_id] = tm.team_id
    const teamPts: Record<string, number> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of (subsRes.data ?? []) as any[]) {
      const tid = userToTeam[s.user_id]
      if (tid) teamPts[tid] = (teamPts[tid] ?? 0) + (s.points_awarded ?? s.tasks?.points ?? 0)
    }
    const sorted = Object.entries(teamPts).sort((a, b) => b[1] - a[1])
    rank = sorted.findIndex(([tid]) => tid === teamId) + 1 || 1
  }

  return {
    id: teamRaw.id,
    name: teamRaw.name,
    emoji: teamRaw.emoji,
    color: teamRaw.color,
    totalPoints: memberRows.reduce((s, m) => s + m.total, 0),
    rank,
    captain,
    viceCaptain,
    members: memberRows,
  }
}

// ── CHALLENGES ────────────────────────────────────────────────────────────────

const NO_END_DATE = '2100-01-01' // sentinel for "no end date" (DB requires NOT NULL)

function effectiveStatus(
  dbStatus: string,
  startDate: string,
  endDate: string,
  manuallyClosed: boolean,
): ChallengeUI['status'] {
  if (manuallyClosed || dbStatus === 'completed') return 'completed'
  const now = new Date()
  const start = new Date(startDate + 'T00:00:00')
  if (now < start) return 'upcoming'
  if (endDate && endDate < NO_END_DATE) {
    const end = new Date(endDate + 'T23:59:59')
    if (now > end) return 'completed'
  }
  return 'active'
}

export async function getOrgChallenges(orgId: string): Promise<ChallengeUI[]> {
  const supabase = await db()

  const { data: challenges } = await supabase
    .from('challenges')
    .select(`
      id, name, description, status, start_date, end_date, manually_closed,
      challenge_teams(team_id, teams(name)),
      tasks(id, title, description, points, start_week, category, icon, is_active)
    `)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (!challenges) return []

  type CtRaw = { team_id: string; teams: { name: string } | null }
  type TaskRaw = { id: string; title: string; description: string; points: number; start_week: number; category: string; icon: string; is_active: boolean }
  type ChRaw = { id: string; name: string; description: string; status: string; start_date: string; end_date: string; manually_closed: boolean; challenge_teams: CtRaw[]; tasks: TaskRaw[] }

  const results: ChallengeUI[] = []

  for (const ch of challenges as unknown as ChRaw[]) {
    const { count } = await supabase
      .from('task_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('challenge_id', ch.id)

    const computed = effectiveStatus(ch.status, ch.start_date, ch.end_date, ch.manually_closed)
    // Sync stale DB status silently (e.g. future challenge marked active, or expired not yet closed)
    if (computed !== ch.status && ch.status !== 'completed') {
      supabase.from('challenges').update({ status: computed }).eq('id', ch.id).then(() => {})
    }

    results.push({
      id: ch.id,
      name: ch.name,
      description: ch.description,
      status: effectiveStatus(ch.status, ch.start_date, ch.end_date, ch.manually_closed),
      startDate: ch.start_date,
      endDate: ch.end_date >= NO_END_DATE ? '' : ch.end_date,
      manuallyClosed: ch.manually_closed,
      teamIds: ch.challenge_teams.map(ct => ct.team_id),
      teams: ch.challenge_teams.map(ct => ct.teams?.name ?? '').filter(Boolean),
      tasks: ch.tasks.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        points: t.points,
        weekNumber: t.start_week,
        category: t.category,
        icon: t.icon,
        teams: [],
        isActive: t.is_active,
      })),
      submissions: count ?? 0,
    })
  }

  return results
}

export async function createChallenge(orgId: string, data: {
  name: string; description: string; startDate: string; endDate: string; teamIds: string[]
}) {
  const supabase = await db()
  const { data: ch, error } = await supabase
    .from('challenges')
    .insert({ org_id: orgId, name: data.name, description: data.description || '', start_date: data.startDate, end_date: data.endDate || NO_END_DATE, status: 'upcoming' })
    .select()
    .single()
  if (error || !ch) return { data: null, error }
  if (data.teamIds.length > 0) {
    await supabase.from('challenge_teams').insert(data.teamIds.map(tid => ({ challenge_id: ch.id, team_id: tid })))
  }
  return { data: ch, error: null }
}

export async function updateChallenge(id: string, data: {
  name: string; description: string; startDate: string; endDate: string; teamIds: string[]
}) {
  const supabase = await db()
  await supabase.from('challenges').update({ name: data.name, description: data.description || '', start_date: data.startDate, end_date: data.endDate || NO_END_DATE }).eq('id', id)
  await supabase.from('challenge_teams').delete().eq('challenge_id', id)
  if (data.teamIds.length > 0) {
    await supabase.from('challenge_teams').insert(data.teamIds.map(tid => ({ challenge_id: id, team_id: tid })))
  }
}

export async function setChallengeStatus(id: string, status: string, manuallyClosed = false) {
  return (await db()).from('challenges').update({ status, manually_closed: manuallyClosed }).eq('id', id)
}

export async function deleteChallenge(id: string) {
  return (await db()).from('challenges').delete().eq('id', id)
}

export async function addTask(challengeId: string, data: {
  title: string; description: string; points: number; weekNumber: number; category: string; icon: string
}) {
  return (await db()).from('tasks').insert({
    challenge_id: challengeId,
    title: data.title,
    description: data.description,
    points: data.points,
    start_week: data.weekNumber,
    category: data.category,
    icon: data.icon,
  }).select().single()
}

export async function updateTask(id: string, data: {
  title: string; description: string; points: number; weekNumber: number; category: string; icon: string
}) {
  return (await db()).from('tasks').update({
    title: data.title,
    description: data.description,
    points: data.points,
    start_week: data.weekNumber,
    category: data.category,
    icon: data.icon,
  }).eq('id', id)
}

export async function setTaskActive(id: string, isActive: boolean) {
  return (await db()).from('tasks').update({ is_active: isActive }).eq('id', id)
}

export async function deleteTask(id: string) {
  return (await db()).from('tasks').delete().eq('id', id)
}

// ── FEED ──────────────────────────────────────────────────────────────────────

export async function getFeedPosts(orgId: string): Promise<FeedPost[]> {
  const supabase = await db()

  const { data: posts } = await supabase
    .from('feed_items')
    .select(`
      id, type, title, content, pinned, created_at,
      profiles(name, avatar_color),
      challenges(name),
      feed_reactions(reaction)
    `)
    .eq('org_id', orgId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })

  if (!posts) return []

  type PostRaw = {
    id: string; type: string; title: string; content: string; pinned: boolean; created_at: string
    profiles: { name: string; avatar_color: string } | null
    challenges: { name: string } | null
    feed_reactions: Array<{ reaction: string }>
  }

  return (posts as unknown as PostRaw[]).map(p => {
    const reactions = { broccoli: 0, fire: 0, star: 0, heart: 0 }
    for (const r of p.feed_reactions) {
      if (r.reaction in reactions) reactions[r.reaction as keyof typeof reactions]++
    }
    const name = p.profiles?.name ?? 'System'
    const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

    return {
      id: p.id,
      type: p.type as FeedPost['type'],
      title: p.title,
      content: p.content,
      author: name,
      authorInitials: initials,
      authorRole: 'admin' as const,
      avatarColor: p.profiles?.avatar_color ?? '#059669',
      challenge: p.challenges?.name ?? null,
      date: fmtDate(p.created_at),
      pinned: p.pinned,
      reactions,
    }
  })
}

export async function createFeedPost(orgId: string, authorId: string | null, data: {
  type: string; title: string; content: string; challengeId?: string; pinned?: boolean
}) {
  return (await db()).from('feed_items').insert({
    org_id: orgId,
    author_id: authorId,
    type: data.type,
    title: data.title,
    content: data.content,
    challenge_id: data.challengeId ?? null,
    pinned: data.pinned ?? false,
  }).select().single()
}

export async function updateFeedPost(id: string, data: { title: string; content: string; pinned: boolean; type: string; challengeId?: string }) {
  return (await db()).from('feed_items').update({
    title: data.title,
    content: data.content,
    pinned: data.pinned,
    type: data.type,
    challenge_id: data.challengeId ?? null,
  }).eq('id', id)
}

export async function deleteFeedPost(id: string) {
  return (await db()).from('feed_items').delete().eq('id', id)
}

export async function togglePinPost(id: string, pinned: boolean) {
  return (await db()).from('feed_items').update({ pinned }).eq('id', id)
}

// ── POLICIES ──────────────────────────────────────────────────────────────────

export async function getOrgPolicies(orgId: string): Promise<PolicyUI[]> {
  const { data } = await (await db()).from('policies')
    .select('id, name, content, color_index, updated_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })

  return (data ?? []).map((p: { id: string; name: string; content: string; color_index: number; updated_at: string }) => ({
    id: p.id,
    name: p.name,
    content: p.content,
    colorIndex: p.color_index,
    updatedAt: fmtDate(p.updated_at),
  }))
}

export async function createPolicy(orgId: string, name: string) {
  return (await db()).from('policies').insert({ org_id: orgId, name, content: '', color_index: 0 }).select().single()
}

export async function updatePolicy(id: string, data: { name?: string; content?: string; colorIndex?: number }) {
  return (await db()).from('policies').update({
    ...(data.name !== undefined && { name: data.name }),
    ...(data.content !== undefined && { content: data.content }),
    ...(data.colorIndex !== undefined && { color_index: data.colorIndex }),
    updated_at: new Date().toISOString(),
  }).eq('id', id)
}

export async function deletePolicy(id: string) {
  return (await db()).from('policies').delete().eq('id', id)
}

// ── ORG TEAMS (for challenge form) ───────────────────────────────────────────

export async function getOrgTeamList(orgId: string): Promise<Array<{ id: string; name: string }>> {
  const { data } = await (await db()).from('teams')
    .select('id, name')
    .eq('org_id', orgId)
    .order('name')
  return data ?? []
}

// ── CHALLENGE DETAIL ──────────────────────────────────────────────────────────

export interface ChallengeSub {
  id: string
  member: string
  avatarColor: string
  taskTitle: string
  submittedAt: string
  status: 'pending' | 'approved' | 'rejected' | 'expired'
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export async function getChallengeById(challengeId: string): Promise<ChallengeUI | null> {
  const supabase = await db()
  const { data: ch } = await supabase
    .from('challenges')
    .select(`
      id, name, description, status, start_date, end_date, manually_closed,
      challenge_teams(team_id, teams(name)),
      tasks(id, title, description, points, start_week, category, icon, is_active)
    `)
    .eq('id', challengeId)
    .single()
  if (!ch) return null

  type CtRaw = { team_id: string; teams: { name: string } | null }
  type TaskRaw = { id: string; title: string; description: string; points: number; start_week: number; category: string; icon: string; is_active: boolean }
  type ChRaw = { id: string; name: string; description: string; status: string; start_date: string; end_date: string; manually_closed: boolean; challenge_teams: CtRaw[]; tasks: TaskRaw[] }

  const raw = ch as unknown as ChRaw
  const { count } = await supabase.from('task_submissions').select('id', { count: 'exact', head: true }).eq('challenge_id', challengeId)

  return {
    id: raw.id, name: raw.name, description: raw.description,
    status: effectiveStatus(raw.status, raw.start_date, raw.end_date, raw.manually_closed),
    startDate: raw.start_date,
    endDate: raw.end_date >= NO_END_DATE ? '' : raw.end_date,
    manuallyClosed: raw.manually_closed,
    teamIds: raw.challenge_teams.map(ct => ct.team_id),
    teams: raw.challenge_teams.map(ct => ct.teams?.name ?? '').filter(Boolean),
    tasks: raw.tasks.map(t => ({
      id: t.id, title: t.title, description: t.description,
      points: t.points, weekNumber: t.start_week, category: t.category,
      icon: t.icon, teams: [], isActive: t.is_active,
    })),
    submissions: count ?? 0,
  }
}

export async function getChallengeSubCounts(challengeId: string): Promise<{ total: number; pending: number; approved: number; rejected: number }> {
  const supabase = await db()
  const [totalRes, pendingRes, approvedRes, rejectedRes] = await Promise.all([
    supabase.from('task_submissions').select('id', { count: 'exact', head: true }).eq('challenge_id', challengeId),
    supabase.from('task_submissions').select('id', { count: 'exact', head: true }).eq('challenge_id', challengeId).eq('status', 'pending'),
    supabase.from('task_submissions').select('id', { count: 'exact', head: true }).eq('challenge_id', challengeId).eq('status', 'approved'),
    supabase.from('task_submissions').select('id', { count: 'exact', head: true }).eq('challenge_id', challengeId).eq('status', 'rejected'),
  ])
  return {
    total: totalRes.count ?? 0,
    pending: pendingRes.count ?? 0,
    approved: approvedRes.count ?? 0,
    rejected: rejectedRes.count ?? 0,
  }
}

export async function getChallengeSubs(challengeId: string): Promise<ChallengeSub[]> {
  const supabase = await db()
  const { data } = await supabase
    .from('task_submissions')
    .select('id, status, submitted_at, profiles(name, avatar_color), tasks(title)')
    .eq('challenge_id', challengeId)
    .order('submitted_at', { ascending: false })
    .limit(8)
  if (!data) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map(s => ({
    id: s.id,
    member: s.profiles?.name ?? 'Unknown',
    avatarColor: s.profiles?.avatar_color ?? '#059669',
    taskTitle: s.tasks?.title ?? '—',
    submittedAt: timeAgo(s.submitted_at),
    status: s.status as ChallengeSub['status'],
  }))
}
