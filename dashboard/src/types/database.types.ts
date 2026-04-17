// ─── Platform Roles ──────────────────────────────────────────────────────────
export type AdminRole = 'super_admin' | 'sub_super_admin' | 'org_admin' | 'sub_admin'
export type PlatformRole = 'super_admin' | 'sub_super_admin'
export type OrgRole = 'org_admin' | 'sub_admin'
export type MemberRole = 'team_captain' | 'vice_captain' | 'member'
export type AdminStatus = 'active' | 'pending' | 'inactive'

/** Platform-level roles (org_id = null in DB) */
export function isPlatformRole(role: AdminRole): role is PlatformRole {
  return role === 'super_admin' || role === 'sub_super_admin'
}

/** Only super_admin can add/remove platform-level admins */
export function canManagePlatformAdmins(role: AdminRole): boolean {
  return role === 'super_admin'
}
export type SubmissionStatus = 'pending' | 'approved' | 'rejected'
export type EventType = 'quiz' | 'offline'
export type MediaType = 'image' | 'video'
export type FeedItemType = 'task_approved' | 'rank_change' | 'announcement' | 'event'

// ─── Organization ─────────────────────────────────────────────────────────────
export interface Organization {
  id: string
  name: string
  slug: string
  logo_url: string | null
  primary_color: string | null
  is_active: boolean
  country: string   // ISO 3166-1 alpha-2, e.g. "IN"
  timezone: string  // IANA timezone, e.g. "Asia/Kolkata"
  created_by: string | null
  created_at: string
}

// ─── Admin Users (dashboard logins) ──────────────────────────────────────────
export interface AdminUser {
  id: string
  user_id: string
  org_id: string | null
  name: string
  email: string
  role: AdminRole
  status: AdminStatus
  created_by: string | null
  created_at: string
  organization?: Organization
}

// ─── Teams ────────────────────────────────────────────────────────────────────
export interface Team {
  id: string
  org_id: string
  name: string
  description: string | null
  color: string | null
  total_points: number
  captain_id: string | null
  vice_captain_id: string | null
  created_at: string
  captain?: Profile
  vice_captain?: Profile
  members?: Profile[]
}

// ─── Profiles (mobile app users) ─────────────────────────────────────────────
export interface Profile {
  id: string
  user_id: string
  org_id: string
  full_name: string
  avatar_url: string | null
  team_id: string | null
  role: MemberRole
  total_points: number
  created_at: string
  team?: Team
  organization?: Organization
}

// ─── Invite Whitelist ─────────────────────────────────────────────────────────
export interface InviteWhitelist {
  id: string
  org_id: string
  email: string
  team_id: string | null
  role: MemberRole
  invited_by: string | null
  used_at: string | null
  created_at: string
  team?: Team
}

// ─── Challenges ───────────────────────────────────────────────────────────────
export interface Challenge {
  id: string
  org_id: string
  title: string
  description: string | null
  start_date: string
  end_date: string
  is_active: boolean
  manually_closed: boolean
  manually_closed_by: string | null
  created_at: string
  tasks?: Task[]
  tasks_count?: number
}

// ─── Tasks ────────────────────────────────────────────────────────────────────
export interface Task {
  id: string
  challenge_id: string
  title: string
  description: string | null
  points: number
  week_number: number
  is_active: boolean
  created_at: string
  challenge?: Challenge
}

// ─── Task Submissions ─────────────────────────────────────────────────────────
export interface TaskSubmission {
  id: string
  task_id: string
  user_id: string
  org_id: string
  submitted_date: string
  proof_url: string
  proof_type: MediaType
  status: SubmissionStatus
  rejection_reason: string | null
  points_awarded: number | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  task?: Task
  profile?: Profile
}

// ─── Points Transactions ──────────────────────────────────────────────────────
export interface PointsTransaction {
  id: string
  user_id: string
  org_id: string
  amount: number
  reason: string
  submission_id: string | null
  awarded_by: string | null
  is_manual: boolean
  created_at: string
  profile?: Profile
}

// ─── Feed ─────────────────────────────────────────────────────────────────────
export interface FeedItem {
  id: string
  org_id: string
  type: FeedItemType
  title: string | null
  content: string
  user_id: string | null
  metadata: Record<string, unknown> | null
  is_auto_generated: boolean
  created_at: string
  profile?: Profile
  reactions?: FeedReaction[]
  reactions_count?: number
}

export interface FeedReaction {
  id: string
  feed_item_id: string
  user_id: string
  reaction_type: string
  created_at: string
}

// ─── Messages ─────────────────────────────────────────────────────────────────
export interface Message {
  id: string
  team_id: string
  user_id: string
  content: string
  media_url: string | null
  media_type: MediaType | null
  created_at: string
  profile?: Profile
}

// ─── Events ───────────────────────────────────────────────────────────────────
export interface AppEvent {
  id: string
  org_id: string
  title: string
  description: string | null
  type: EventType
  points: number
  start_time: string
  end_time: string | null
  is_active: boolean
  created_at: string
  participations?: EventParticipation[]
  participations_count?: number
}

export interface EventParticipation {
  id: string
  event_id: string
  user_id: string
  points_awarded: number | null
  created_at: string
  profile?: Profile
  event?: AppEvent
}

// ─── Policies ─────────────────────────────────────────────────────────────────
export interface Policy {
  id: string
  org_id: string
  title: string
  content: string
  order_index: number
  is_active: boolean
  created_at: string
}
