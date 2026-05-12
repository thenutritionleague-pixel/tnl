'use server'
/**
 * The Nutrition League — Supabase query functions
 * All pages import from here; server-side admin client (bypasses RLS) is used throughout.
 */

import { createAdminClient } from './server'
import { getAdminProfile } from '../auth'
import { todayInTimezone } from '../date-utils'

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

export type EntryStatus = 'approved' | 'missed' | 'adjustment'

export interface WeekEntryUI {
  status: EntryStatus
  icon: string
  title: string
  subtitle?: string
  date: string
  points: number
}

export interface WeekGroupUI {
  week: number
  totalPoints: number
  entries: WeekEntryUI[]
}

export interface TeamMemberRowUI {
  id: string
  name: string
  avatarColor: string
  role: 'captain' | 'vice_captain' | 'member'
  total: number
  weekGroups: WeekGroupUI[]
}

export interface TeamLegacyEntryUI {
  id: string
  amount: number
  reason: string
  sourceName: string | null
  kind: 'legacy_transfer' | 'admin_bonus' | string
  createdAt: string
  eventDate: string
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
  legacyEntries: TeamLegacyEntryUI[]
}

export interface TaskTier {
  label: string
  description: string
  points: number
}

export interface TaskUI {
  id: string
  title: string
  description: string
  points: number
  pointsTiers?: TaskTier[]
  weekNumber: number
  category: string
  icon: string
  teams: string[]
  isActive: boolean
  startDate?: string
  endDate?: string
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
  logoUrl: string | null
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
    .select('points_awarded')
    .eq('org_id', id)
    .eq('status', 'approved')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalPoints = (ptsData ?? []).reduce((sum: number, s: any) => sum + (s.points_awarded ?? 0), 0)

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
  const { data } = await (await db()).from('organizations').select('id, name, country, timezone, is_active, logo_url').eq('id', id).single()
  if (!data) return null
  return { id: data.id, name: data.name, country: data.country, timezone: data.timezone, isActive: data.is_active, logoUrl: data.logo_url ?? null }
}

export async function updateOrgSettings(id: string, patch: Partial<{ name: string; country: string; timezone: string; logo_url: string | null }>) {
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

  // 1. Fetch all profiles linked to this Org (Primary Source of Truth)
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, name, email, avatar_color, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })

  if (pErr || !profiles) return []

  // 2. Fetch Org roles separately
  const { data: orgRoles } = await supabase
    .from('org_members')
    .select('user_id, role, joined_at')
    .eq('org_id', orgId)

  // 3. Fetch Team assignments separately
  const { data: teamAssignments } = await supabase
    .from('team_members')
    .select('user_id, role, team_id, teams(id, name)')
    .eq('org_id', orgId)

  // 4. Fetch approved points
  const { data: submissions } = await supabase
    .from('task_submissions')
    .select('user_id, points_awarded, tasks(points)')
    .eq('org_id', orgId)
    .eq('status', 'approved')

  const roleMap: Record<string, { role: string; joinedAt: string }> = {}
  for (const or of (orgRoles ?? []) as any[]) {
    roleMap[or.user_id] = { role: or.role, joinedAt: or.joined_at }
  }

  const teamLookup: Record<string, { role: string; teamId: string | null; teamName: string }> = {}
  for (const ta of (teamAssignments ?? []) as any[]) {
    teamLookup[ta.user_id] = {
      role: ta.role,
      teamId: ta.teams?.id ?? null,
      teamName: ta.teams?.name ?? 'Unassigned',
    }
  }

  const pointsMap: Record<string, number> = {}
  for (const s of (submissions ?? []) as any[]) {
    if (!pointsMap[s.user_id]) pointsMap[s.user_id] = 0
    pointsMap[s.user_id] += s.points_awarded ?? s.tasks?.points ?? 0
  }

  return profiles.map(p => {
    const tm = teamLookup[p.id]
    const om = roleMap[p.id]
    return {
      id: p.id,
      name: p.name,
      email: p.email ?? '—',
      team: tm?.teamName ?? 'Unassigned',
      teamId: tm?.teamId ?? null,
      role: (om?.role as OrgMember['role']) ?? 'member', // Default to member if not specifically in org_members
      teamRole: (tm?.role as OrgMember['teamRole']) ?? null,
      points: pointsMap[p.id] ?? 0,
      joinedAt: fmtDate(om?.joinedAt ?? p.created_at),
      avatarColor: p.avatar_color ?? '#059669',
    }
  })
}

export async function updateMember(orgId: string, userId: string, data: {
  name: string
  email: string
  teamId: string | null
  teamRole: 'captain' | 'vice_captain' | 'member'
  orgRole: 'org_admin' | 'sub_admin' | 'member'
  oldEmail?: string
  avatarColor?: string
}) {
  const supabase = await db()

  // 1. Update Profile
  const profileUpdate: Record<string, string> = { name: data.name, email: data.email }
  if (data.avatarColor) profileUpdate.avatar_color = data.avatarColor
  const { error: pErr } = await supabase
    .from('profiles')
    .update(profileUpdate)
    .eq('id', userId)
  if (pErr) throw pErr

  // 2. Update Whitelist (consistency for future lookups/audit)
  if (data.oldEmail) {
    await supabase.from('invite_whitelist')
      .update({ email: data.email })
      .eq('org_id', orgId)
      .eq('email', data.oldEmail)
  }

  // 3. Update Team Assignment (Swap logic)
  if (data.teamId && (data.teamRole === 'captain' || data.teamRole === 'vice_captain')) {
    // Check if role is taken in this team (considering both active members and pending invites)
    const { data: activeRole } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('team_id', data.teamId)
      .eq('role', data.teamRole)
      .neq('user_id', userId)
      .maybeSingle()

    if (activeRole) {
      throw new Error(`This team already has a ${data.teamRole === 'captain' ? 'Captain' : 'Vice Captain'}.`)
    }

    const { data: pendingRole } = await supabase
      .from('invite_whitelist')
      .select('id')
      .eq('org_id', orgId)
      .eq('team_id', data.teamId)
      .eq('role', data.teamRole)
      .is('used_at', null)
      .maybeSingle()

    if (pendingRole) {
      throw new Error(`This team has a pending invite for a ${data.teamRole === 'captain' ? 'Captain' : 'Vice Captain'}.`)
    }
  }

  // Always remove existing memberships in this org first to ensure clean state
  await supabase.from('team_members').delete().eq('user_id', userId).eq('org_id', orgId)

  if (data.teamId) {
    const { error: tmErr } = await supabase.from('team_members')
      .insert({
        user_id: userId,
        team_id: data.teamId,
        org_id: orgId,
        role: data.teamRole,
      })
    if (tmErr) throw tmErr
  }

  // 4. Update Org Role (Admin vs Member)
  const { error: omErr } = await supabase.from('org_members')
    .update({ role: data.orgRole })
    .eq('org_id', orgId)
    .eq('user_id', userId)
  if (omErr) throw omErr

  return { success: true }
}

export async function removeMember(orgId: string, userId: string) {
  const supabase = await db()

  // 1. Capture profile (name, email, auth_id, total_points) BEFORE deletion
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, auth_id, name, total_points')
    .eq('id', userId)
    .single()
  if (!profile) return { success: false, error: 'Profile not found' as const }

  // 2. Look up their team — needed to credit transferred points
  const { data: tm } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle()

  // 3. Capture proof_urls BEFORE auth-delete cascades them
  const { data: subs } = await supabase
    .from('task_submissions')
    .select('proof_url')
    .eq('user_id', userId)
  const proofPaths = ((subs ?? []) as { proof_url: string | null }[])
    .map(s => s.proof_url)
    .filter((p): p is string => !!p)

  // 4. Insert team_transactions row IF the user had a team AND non-zero points.
  //    Zero-point removals skip this entry to keep the breakdown clean.
  let insertedTransferId: string | null = null
  if (tm?.team_id && (profile.total_points ?? 0) > 0) {
    const { data: ttRow, error: ttErr } = await supabase
      .from('team_transactions')
      .insert({
        team_id: tm.team_id,
        org_id: orgId,
        amount: profile.total_points,
        reason: `Points inherited from ${profile.name} (left team)`,
        source_user_name: profile.name,
        source_user_email: profile.email,
        kind: 'legacy_transfer',
      })
      .select('id')
      .single()
    if (ttErr) return { success: false, error: `Could not record transfer: ${ttErr.message}` as const }
    insertedTransferId = ttRow?.id ?? null
  }

  // 5. Delete proof photos from storage (best-effort; log on failure)
  if (proofPaths.length > 0) {
    const { error: storageErr } = await supabase.storage.from('task-proofs').remove(proofPaths)
    if (storageErr) console.error('[removeMember] proof storage cleanup failed:', storageErr)
  }

  // 6. Existing flow: clear invite whitelist + delete auth user (cascades the rest)
  if (profile.email) {
    await supabase.from('invite_whitelist').delete().eq('org_id', orgId).eq('email', profile.email)
  }

  if (profile.auth_id) {
    const { error: authErr } = await supabase.auth.admin.deleteUser(profile.auth_id)
    if (authErr) {
      // Roll back the team transfer so we don't leave phantom points
      if (insertedTransferId) {
        await supabase.from('team_transactions').delete().eq('id', insertedTransferId)
      }
      throw authErr
    }
  } else {
    // No auth_id — delete profile directly
    const { error: pErr } = await supabase.from('profiles').delete().eq('id', userId)
    if (pErr) {
      if (insertedTransferId) {
        await supabase.from('team_transactions').delete().eq('id', insertedTransferId)
      }
      throw pErr
    }
  }

  return { success: true, transferredPoints: insertedTransferId ? (profile.total_points ?? 0) : 0 }
}

/**
 * Manually add or deduct team-level points (e.g. a team bonus, correction, or penalty).
 * Logs the entry in `team_transactions` with kind = 'admin_bonus'.
 * Positive amount = bonus, negative amount = deduction.
 */
export async function addTeamTransaction(
  teamId: string,
  orgId: string,
  amount: number,
  reason: string,
  transactionDate?: string,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  // Permission check — only org/super admins for this org can adjust
  const profile = await getAdminProfile()
  if (!profile) return { success: false, error: 'Unauthorized.' }
  const ALLOWED = ['super_admin', 'sub_super_admin', 'org_admin', 'sub_admin']
  const ORG_SCOPED = ['org_admin', 'sub_admin']
  if (!ALLOWED.includes(profile.role)) return { success: false, error: 'Unauthorized.' }
  if (ORG_SCOPED.includes(profile.role) && profile.org_id !== orgId) {
    return { success: false, error: 'Unauthorized.' }
  }

  // Validation
  if (!Number.isInteger(amount) || amount === 0) {
    return { success: false, error: 'Amount must be a non-zero integer.' }
  }
  if (!reason.trim()) {
    return { success: false, error: 'Reason is required.' }
  }

  const supabase = await db()

  // Verify team belongs to this org (defensive — admin client bypasses RLS)
  const { data: team } = await supabase
    .from('teams')
    .select('id, org_id, name')
    .eq('id', teamId)
    .single()
  if (!team || team.org_id !== orgId) {
    return { success: false, error: 'Team not found in this org.' }
  }

  const { data: inserted, error } = await supabase
    .from('team_transactions')
    .insert({
      team_id: teamId,
      org_id: orgId,
      amount,
      reason: `${reason.trim()} [by ${profile.name}]`,
      source_user_name: null,
      kind: 'admin_bonus',
      created_by: null,
      transaction_date: transactionDate ?? new Date().toISOString().slice(0, 10),
    })
    .select('id')
    .single()

  if (error || !inserted) {
    return { success: false, error: error?.message ?? 'Insert failed.' }
  }

  return { success: true, id: inserted.id }
}

/**
 * Revoke a team transaction (delete the row). For correcting mistakes.
 */
export async function deleteTeamTransaction(
  transactionId: string,
  orgId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const profile = await getAdminProfile()
  if (!profile) return { success: false, error: 'Unauthorized.' }
  const ALLOWED = ['super_admin', 'sub_super_admin', 'org_admin', 'sub_admin']
  const ORG_SCOPED = ['org_admin', 'sub_admin']
  if (!ALLOWED.includes(profile.role)) return { success: false, error: 'Unauthorized.' }
  if (ORG_SCOPED.includes(profile.role) && profile.org_id !== orgId) {
    return { success: false, error: 'Unauthorized.' }
  }

  const supabase = await db()
  const { error } = await supabase
    .from('team_transactions')
    .delete()
    .eq('id', transactionId)
    .eq('org_id', orgId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function updateTeamTransaction(
  transactionId: string,
  orgId: string,
  amount: number,
  reason: string,
  transactionDate: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const profile = await getAdminProfile()
  if (!profile) return { success: false, error: 'Unauthorized.' }
  const ALLOWED = ['super_admin', 'sub_super_admin', 'org_admin', 'sub_admin']
  const ORG_SCOPED = ['org_admin', 'sub_admin']
  if (!ALLOWED.includes(profile.role)) return { success: false, error: 'Unauthorized.' }
  if (ORG_SCOPED.includes(profile.role) && profile.org_id !== orgId) {
    return { success: false, error: 'Unauthorized.' }
  }
  if (!Number.isInteger(amount) || amount === 0) return { success: false, error: 'Amount must be a non-zero integer.' }
  if (!reason.trim()) return { success: false, error: 'Reason is required.' }

  const supabase = await db()
  const { error } = await supabase
    .from('team_transactions')
    .update({ amount, reason: reason.trim(), transaction_date: transactionDate })
    .eq('id', transactionId)
    .eq('org_id', orgId)
  if (error) return { success: false, error: error.message }
  return { success: true }
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
    .maybeSingle()

  let pointsMap: Record<string, number> = {}

  if (challenges) {
    const { data: viewRows } = await supabase
      .from('team_points_view')
      .select('team_id, total_points')
      .eq('challenge_id', challenges.id)
    for (const row of (viewRows ?? []) as { team_id: string; total_points: number }[]) {
      pointsMap[row.team_id] = row.total_points
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
  const client = await db()
  // invite_whitelist.team_id has no ON DELETE CASCADE — null it out first
  await client.from('invite_whitelist').update({ team_id: null }).eq('team_id', teamId)
  return client.from('teams').delete().eq('id', teamId)
}

export async function addTeamMember(teamId: string, userId: string, orgId: string) {
  return (await db()).from('team_members').insert({ team_id: teamId, user_id: userId, org_id: orgId, role: 'member' })
}

export async function removeTeamMember(teamId: string, userId: string) {
  return (await db()).from('team_members').delete().eq('team_id', teamId).eq('user_id', userId)
}

export async function updateTeamMemberRole(teamId: string, userId: string, role: 'captain' | 'vice_captain' | 'member') {
  const supabase = await db()
  // The enforce_team_role_uniqueness trigger atomically demotes any existing
  // holder of the same role before this row is updated — no separate query needed.
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
    .select('id, start_date, end_date')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  type TmRaw = { user_id: string; role: string; profiles: { id: string; name: string; avatar_color: string } | null }
  const teamRaw = team as unknown as { id: string; name: string; emoji: string; color: string; team_members: TmRaw[] }

  const captain = teamRaw.team_members.find(m => m.role === 'captain')?.profiles?.name ?? '—'
  const viceCaptain = teamRaw.team_members.find(m => m.role === 'vice_captain')?.profiles?.name ?? '—'

  // Helpers
  const SD_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  function shortDate(iso: string): string {
    const d = new Date(iso)
    return `${SD_MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
  }

  // Batch-fetch all points_transactions for all team members in one query
  type TxnRaw = {
    user_id: string
    amount: number
    reason: string
    is_manual: boolean
    created_at: string
    transaction_date: string | null
    task_submissions: { submitted_date: string | null; tasks: { title: string; icon: string; points: number } | null } | null
  }

  const memberIds = teamRaw.team_members
    .map(tm => tm.profiles?.id)
    .filter(Boolean) as string[]

  let txnsByUser: Record<string, TxnRaw[]> = {}
  if (challenge && memberIds.length > 0) {
    const { data: txnData } = await supabase
      .from('points_transactions')
      .select('user_id, amount, reason, is_manual, created_at, transaction_date, task_submissions(submitted_date, tasks(title, icon, points))')
      .in('user_id', memberIds)
      .gte('created_at', challenge.start_date)
      .order('created_at', { ascending: true })
    for (const t of (txnData ?? []) as unknown as TxnRaw[]) {
      if (!txnsByUser[t.user_id]) txnsByUser[t.user_id] = []
      txnsByUser[t.user_id].push(t)
    }
  }

  const challengeStartDate = challenge ? new Date(challenge.start_date) : null

  function weekFor(dateStr: string): number {
    if (!challengeStartDate || !dateStr) return 1
    const d = new Date(dateStr)
    const diff = Math.floor((d.getTime() - challengeStartDate.getTime()) / 86400000)
    return Math.max(1, Math.floor(diff / 7) + 1)
  }

  // Build member rows
  const memberRows: TeamMemberRowUI[] = []

  for (const tm of teamRaw.team_members) {
    const profile = tm.profiles
    if (!profile) continue

    const txns = txnsByUser[profile.id] ?? []
    const weekGroupMap: Record<number, { totalPoints: number; entries: WeekEntryUI[] }> = {}

    for (const t of txns) {
      const amount = (t.amount as number) ?? 0
      const isManual = (t.is_manual as boolean) ?? false
      const createdAt = t.created_at ?? ''
      const rawReason = t.reason ?? ''
      const sub = t.task_submissions
      const task = sub?.tasks

      let entry: WeekEntryUI
      let week: number

      if (isManual) {
        const byMatch = /\[by ([^\]]+)\]$/.exec(rawReason)
        const adminName = byMatch?.[1] ?? ''
        const title = rawReason.replace(/\s*\[by [^\]]+\]\s*$/, '').trim()
        const txDate = t.transaction_date ?? ''
        const eventDate = txDate || createdAt
        week = weekFor(eventDate)
        entry = {
          status: 'adjustment',
          icon: '✏️',
          title: title || (amount >= 0 ? 'Bonus Points' : 'Point Deduction'),
          subtitle: adminName ? `Added by ${adminName}` : 'Added by Admin',
          date: shortDate(eventDate),
          points: amount,
        }
      } else if (amount === 0) {
        // Missed task — date from reason string (cron runs next day, so created_at is off)
        const dateMatch = /\((\d{4}-\d{2}-\d{2})\)\s*$/.exec(rawReason)
        const missedDate = dateMatch?.[1] ?? ''
        const subDate = sub?.submitted_date ?? ''
        const displayDate = subDate || missedDate || createdAt
        const title = task?.title ?? rawReason
          .replace(/^Task missed:\s*/i, '')
          .replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, '')
          .trim()
        week = weekFor(missedDate || subDate || createdAt)
        entry = {
          status: 'missed',
          icon: task?.icon ?? '📋',
          title,
          date: shortDate(displayDate),
          points: task?.points ?? 0,
        }
      } else {
        // Approved task
        const subDate = sub?.submitted_date ?? ''
        week = weekFor(subDate || createdAt)
        entry = {
          status: 'approved',
          icon: task?.icon ?? '📋',
          title: task?.title ?? rawReason,
          date: shortDate(subDate || createdAt),
          points: amount,
        }
      }

      if (!weekGroupMap[week]) weekGroupMap[week] = { totalPoints: 0, entries: [] }
      if (entry.status !== 'missed') weekGroupMap[week].totalPoints += amount
      weekGroupMap[week].entries.push(entry)
    }

    const weekGroups: WeekGroupUI[] = Object.entries(weekGroupMap)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([wk, data]) => ({ week: Number(wk), totalPoints: data.totalPoints, entries: data.entries }))

    const total = weekGroups.reduce((s, wg) => s + wg.totalPoints, 0)

    memberRows.push({
      id: profile.id,
      name: profile.name,
      avatarColor: profile.avatar_color,
      role: tm.role as TeamMemberRowUI['role'],
      total,
      weekGroups,
    })
  }

  // Fetch team_transactions (legacy transfers + manual bonuses) for this team
  const { data: ttData } = await supabase
    .from('team_transactions')
    .select('id, amount, reason, source_user_name, kind, created_at, transaction_date')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })

  const legacyEntries: TeamLegacyEntryUI[] = ((ttData ?? []) as {
    id: string; amount: number; reason: string; source_user_name: string | null; kind: string; created_at: string; transaction_date: string | null
  }[]).map(t => ({
    id: t.id,
    amount: t.amount,
    reason: t.reason,
    sourceName: t.source_user_name,
    kind: t.kind,
    createdAt: t.created_at,
    eventDate: t.transaction_date ?? t.created_at.slice(0, 10),
  }))
  const legacyTotal = legacyEntries.reduce((s, e) => s + e.amount, 0)

  // Team rank: use team_points_view so it matches mobile leaderboard + includes legacy transfers
  let rank = 1
  if (challenge) {
    const { data: viewRows } = await supabase
      .from('team_points_view')
      .select('team_id, total_points')
      .eq('challenge_id', challenge.id)
    const allTeams = (viewRows ?? []) as { team_id: string; total_points: number }[]
    const sorted = [...allTeams].sort((a, b) => b.total_points - a.total_points)
    const me = allTeams.find(t => t.team_id === teamId)
    const myPts = me?.total_points ?? 0
    rank = sorted.findIndex(t => t.total_points <= myPts) + 1 || 1
  }

  return {
    id: teamRaw.id,
    name: teamRaw.name,
    emoji: teamRaw.emoji,
    color: teamRaw.color,
    totalPoints: memberRows.reduce((s, m) => s + m.total, 0) + legacyTotal,
    rank,
    captain,
    viceCaptain,
    members: memberRows,
    legacyEntries,
  }
}

// ── CHALLENGES ────────────────────────────────────────────────────────────────

const NO_END_DATE = '2100-01-01' // sentinel for "no end date" (DB requires NOT NULL)

function effectiveStatus(
  dbStatus: string,
  startDate: string,
  endDate: string,
  manuallyClosed: boolean,
  orgTimezone = 'UTC',
): ChallengeUI['status'] {
  if (manuallyClosed || dbStatus === 'completed') return 'completed'
  const today = todayInTimezone(orgTimezone)
  if (today < startDate) return 'upcoming'
  if (endDate && endDate < NO_END_DATE && today > endDate) return 'completed'
  return 'active'
}

export async function getOrgTimezone(orgId: string): Promise<string> {
  const supabase = await db()
  const { data } = await supabase.from('organizations').select('timezone').eq('id', orgId).single()
  return data?.timezone ?? 'UTC'
}

export async function getOrgChallenges(orgId: string): Promise<ChallengeUI[]> {
  const supabase = await db()

  const [{ data: challenges }, orgData] = await Promise.all([
    supabase
      .from('challenges')
      .select(`
        id, name, description, status, start_date, end_date, manually_closed,
        challenge_teams(team_id, teams(name)),
        tasks(id, title, description, points, points_tiers, start_week, start_date, end_date, category, icon, is_active, task_teams(teams(name)))
      `)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),
    supabase.from('organizations').select('timezone').eq('id', orgId).single(),
  ])
  const orgTz: string = (orgData.data as { timezone?: string } | null)?.timezone ?? 'UTC'

  if (!challenges) return []

  type CtRaw = { team_id: string; teams: { name: string } | null }
  type TaskRaw = { id: string; title: string; description: string; points: number; points_tiers?: TaskTier[] | null; start_week: number; category: string; icon: string; is_active: boolean; task_teams?: { teams: { name: string } | null }[]; start_date?: string; end_date?: string }
  type ChRaw = { id: string; name: string; description: string; status: string; start_date: string; end_date: string; manually_closed: boolean; challenge_teams: CtRaw[]; tasks: TaskRaw[] }

  const results: ChallengeUI[] = []

  // Get submission counts for all challenges in one go
  const { data: counts } = await supabase
    .from('task_submissions')
    .select('challenge_id')
    .eq('org_id', orgId)

  const countMap: Record<string, number> = {}
  counts?.forEach((s: any) => {
    countMap[s.challenge_id] = (countMap[s.challenge_id] || 0) + 1
  })

  for (const ch of challenges as unknown as ChRaw[]) {
    const computed = effectiveStatus(ch.status, ch.start_date, ch.end_date, ch.manually_closed, orgTz)
    
    // Sync stale DB status silently 
    if (computed !== ch.status && ch.status !== 'completed') {
      supabase.from('challenges').update({ status: computed }).eq('id', ch.id).then(() => {})
    }

    results.push({
      id: ch.id,
      name: ch.name,
      description: ch.description,
      status: computed,
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
        pointsTiers: t.points_tiers ?? undefined,
        weekNumber: t.start_week,
        category: t.category,
        icon: t.icon,
        teams: t.task_teams?.map(tt => tt.teams?.name).filter(Boolean) as string[] || [],
        isActive: t.is_active,
        startDate: t.start_date,
        endDate: t.end_date,
      })),
      submissions: countMap[ch.id] ?? 0,
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
  title: string; description: string; points: number; pointsTiers?: TaskTier[]; weekNumber: number; category: string; icon: string; teams: string[]; startDate?: string; endDate?: string
}) {
  const supabase = await db()
  const { data: newTask, error } = await supabase.from('tasks').insert({
    challenge_id: challengeId,
    title: data.title,
    description: data.description,
    points: data.points,
    points_tiers: data.pointsTiers && data.pointsTiers.length > 0 ? data.pointsTiers : null,
    start_week: data.weekNumber,
    week_number: data.weekNumber,
    category: data.category,
    icon: data.icon,
    start_date: data.startDate || null,
    end_date: data.endDate || null,
  }).select().single()

  if (newTask && data.teams.length > 0) {
    const { data: ctData } = await supabase.from('challenge_teams').select('team_id, teams!inner(name)').eq('challenge_id', challengeId)
    // @ts-ignore
    const teamNameMap = Object.fromEntries((ctData ?? []).map(x => [x.teams.name, x.team_id]))
    const validIds = data.teams.map(name => teamNameMap[name]).filter(Boolean)
    if (validIds.length > 0) {
      await supabase.from('task_teams').insert(validIds.map(tid => ({ task_id: newTask.id, team_id: tid })))
    }
  }
  return { data: newTask, error }
}

export async function updateTask(id: string, data: {
  title: string; description: string; points: number; pointsTiers?: TaskTier[]; weekNumber: number; category: string; icon: string; teams: string[]; startDate?: string; endDate?: string
}) {
  const supabase = await db()
  await supabase.from('tasks').update({
    title: data.title,
    description: data.description,
    points: data.points,
    points_tiers: data.pointsTiers && data.pointsTiers.length > 0 ? data.pointsTiers : null,
    start_week: data.weekNumber,
    week_number: data.weekNumber,
    category: data.category,
    icon: data.icon,
    start_date: data.startDate || null,
    end_date: data.endDate || null,
  }).eq('id', id)

  const { data: taskData } = await supabase.from('tasks').select('challenge_id').eq('id', id).single()
  const challengeId = taskData?.challenge_id
  if (challengeId) {
    await supabase.from('task_teams').delete().eq('task_id', id)
    if (data.teams.length > 0) {
      const { data: ctData } = await supabase.from('challenge_teams').select('team_id, teams!inner(name)').eq('challenge_id', challengeId)
      // @ts-ignore
      const teamNameMap = Object.fromEntries((ctData ?? []).map(x => [x.teams.name, x.team_id]))
      const validIds = data.teams.map(name => teamNameMap[name]).filter(Boolean)
      if (validIds.length > 0) {
        await supabase.from('task_teams').insert(validIds.map(tid => ({ task_id: id, team_id: tid })))
      }
    }
  }
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
  status: 'pending' | 'approved' | 'rejected'
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
      tasks(id, title, description, points, points_tiers, start_week, start_date, end_date, category, icon, is_active, task_teams(teams(name)))
    `)
    .eq('id', challengeId)
    .single()
  if (!ch) return null

  type CtRaw = { team_id: string; teams: { name: string } | null }
  type TaskRaw = { id: string; title: string; description: string; points: number; points_tiers?: TaskTier[] | null; start_week: number; start_date?: string; end_date?: string; category: string; icon: string; is_active: boolean; task_teams?: { teams: { name: string } | null }[] }
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
      points: t.points, pointsTiers: t.points_tiers ?? undefined,
      weekNumber: t.start_week, category: t.category,
      icon: t.icon,
      teams: t.task_teams?.map(tt => tt.teams?.name).filter(Boolean) as string[] || [],
      isActive: t.is_active,
      startDate: t.start_date,
      endDate: t.end_date,
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
