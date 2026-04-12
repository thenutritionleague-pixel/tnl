# Yi Nutrition League 2.0 — Development Roadmap

## What is this App?
A **gamified wellness SaaS platform** where organizations run internal habit-building competitions. Members complete daily tasks, earn Broccoli Points, compete in teams, and stay engaged through social and competitive features.

---

## Tech Stack
- **Mobile:** Flutter + supabase_flutter
- **Dashboard:** Next.js 16.2.2 (App Router) + shadcn/ui + Tailwind — uses `src/proxy.ts` (not middleware.ts)
- **Backend:** Supabase (PostgreSQL + Auth + Storage + Realtime)
- **Automation:** Supabase pg_cron + DB triggers
- **Auth:** Passwordless OTP via email (no passwords anywhere — dashboard + mobile app)
- **Email (OTP + Invites):** Brevo SMTP (smtp-relay.brevo.com:587)

---

## Auth Architecture — Two Separate User Tables

Both apps share Supabase `auth.users` for authentication, but data lives in **separate tables**:

| Table | Used by | Identified by |
|---|---|---|
| `admin_users` | Dashboard (Super Admin, Org Admin, Sub Admin) | `user_id` → `auth.users.id` |
| `profiles` | Mobile app (Members, Captains) | `auth_id` → `auth.users.id` |

**Key rule:** A user in `admin_users` cannot sign into the mobile app as a member, and vice versa.

**Dashboard OTP flow:**
1. Admin enters email → check `admin_users` table by email (server-side, service role)
   - Not found → "You are not authorized. Contact your administrator." (no OTP sent)
   - Found but `inactive` → "Your account has been deactivated." (no OTP sent)
2. Found (active or pending) → `signInWithOtp({ shouldCreateUser: true })` → Brevo sends 6-digit code
3. Admin enters code → `verifyOtp()` → auth.users created on first login
4. Re-check `admin_users` — if `status !== 'active'` → sign out + "pending approval"
5. Redirect: `super_admin`/`sub_super_admin` → `/dashboard`, `org_admin`/`sub_admin` → `/organizations/[org_id]`

**Mobile OTP flow:**
1. Member enters email → check `profiles` table first; if not found check `invite_whitelist` WHERE `used_at IS NULL` (server-side)
   - Not found in either → "You are not invited. Contact your organization admin." (no OTP sent)
2. Found → `signInWithOtp({ shouldCreateUser: true })` → Brevo sends 6-digit code
3. Member enters code → `verifyOtp()` → auth.users created on first login
4. Check `profiles` — if not found AND in `invite_whitelist` → proceed to signup screen (create profile)
5. Load org branding from `profiles.org_id`

---

## Theme
- Background: `#C8E6C9`
- Primary / Button: `#2D6A4F`
- Card: `#FFFFFF`
- Text Primary: `#1A1A2E`
- Input Background: `#F0F0FF`
- Font: Inter

## Design System
- **Fonts:** Instrument Serif (headings, `font-heading`) + Instrument Sans (body)
- **Primary:** `#059669` (emerald green)
- **Secondary:** `#1e293b` (slate dark)
- **Body text:** `#475569`
- **Points icon:** 🥦 broccoli emoji
- **Dashboard:** Next.js 16.2.2, proxy.ts (not middleware.ts), loading.tsx for instant nav

---

## Role Hierarchy

```
Super Admin (platform — us)
├── Sub Super Admin (platform — limited: can't manage super-level admins)
│   ↓  (both can create orgs and assign org admins)
└── Org Admin (per org — set when org is created, email entered in org creation form)
    ├── Sub Admin (added by Org Admin or Super Admin inside the org)
    └── Team Captain (mobile app)
        ├── Vice Captain (same powers as captain when captain unavailable)
        └── Member (mobile app only)
```

| Role | Scope | Access |
|---|---|---|
| `super_admin` | Platform | Full control — create orgs, manage all admins, enter any org |
| `sub_super_admin` | Platform | Same as super_admin EXCEPT cannot add/remove super_admin or sub_super_admin |
| `org_admin` | Their org only | Full org management — challenges, approvals, teams, members, sub admins, settings |
| `sub_admin` | Their org only | Same as org_admin, cannot manage other admins |
| `team_captain` | Mobile app | Manage team, approve tasks if delegated, team chat |
| `vice_captain` | Mobile app | Same as team_captain when captain unavailable |
| `member` | Mobile app | Submit tasks, view leaderboard, chat, feed |

### How Admins Are Created
- **Super Admin / Sub Super Admin** → seeded or invited from `/admins` by a `super_admin`
- **Org Admin** → email entered at org creation (`/organizations/new`). Invite sent automatically.
- **Sub Admin** → added from `/organizations/[id]/admins` by Org Admin or Super Admin

### What `/admins` (global) shows
Platform-level admins only: `super_admin` + `sub_super_admin`
- `super_admin` can invite new `sub_super_admin` accounts
- `sub_super_admin` can view but cannot invite platform-level admins

### What `/organizations/[id]/admins` (org) shows
Org-level admins: `org_admin` (read-only) + `sub_admin` (can be added/removed)

---

## SaaS Architecture

```
Platform (Super Admin)
└── Organization (Org Admin + Sub Admins)
    ├── Identity (name, slug, emoji/logo, country, timezone)
    ├── Members (org-level pool → assigned to teams)
    ├── Teams (captain + vice captain per team, emoji + color)
    ├── Challenges & Tasks (week-grouped, points per task)
    ├── Approvals (proof review: image or text, points override)
    ├── Leaderboard (individual weekly breakdown + team view)
    ├── Invite Whitelist (single + bulk, team + role pre-assignment)
    ├── Feed (org-scoped, auto-generated + manual, reactions)
    ├── Events (quiz or offline, points, location, attendees)
    ├── Policies (rich text, color-coded, collapsible)
    └── Settings (name, country, timezone, activate/deactivate, delete)
```

---

## Automation Rules

### Automatic (no manual trigger)
| Trigger | Action | Method |
|---|---|---|
| `start_date` reached | Challenge auto-activates (midnight in org's timezone) | pg_cron daily |
| `end_date` passed | Challenge auto-deactivates (midnight in org's timezone) | pg_cron daily |
| Midnight in org's timezone | Lock all open submissions (mark expired) | pg_cron daily per org timezone |
| Submit attempt after midnight | Rejected with "Submissions closed" | Client + server validation |
| Submission approved | Auto-award points + update `profiles.total_points` | DB trigger |
| Submission approved | Auto-generate `submission_approved` feed item | DB trigger |

### Manual Override (Super Admin + Org Admin + Sub Admin)
- Manually close/reopen a challenge (independent of dates)
- Manually add/deduct points for any member (with reason)
- Manually post announcements to feed (pin/unpin)
- Move members between teams, change roles (captain/vice captain/member)
- Approve/reject any submission (with optional notes + points override)

---

## Timezone Architecture

Organizations can be in any country/timezone. Challenge dates are entered as `YYYY-MM-DD` — interpreted as **midnight in the org's timezone**.

- **Frontend:** Dates stay as `YYYY-MM-DD` strings — no UTC conversion on client. Challenge modal shows hint: *"Challenges start/end at 12:00 AM {tzAbbr} — your org's timezone"*
- **Backend:** Interprets `"2026-04-01"` + org IANA timezone as `2026-04-01T00:00:00[Asia/Kolkata]`
- **Default timezone:** `Asia/Kolkata`
- **Country field:** Selecting a country auto-fills timezone. Admin can override.
- **Curated list:** 19+ IANA timezones (Asia/Pacific, Middle East, Europe, Americas, UTC)

---

## Database Schema (Actual — matches schema.sql)

```sql
-- organizations
organizations: id, name, slug, logo(emoji text), country(char 2), timezone, is_active, created_at

-- admin_users (dashboard logins — separate from profiles)
admin_users: id, user_id(→auth.users), org_id(null=platform-level),
             role(super_admin|sub_super_admin|org_admin|sub_admin),
             name, email, status(active|pending|inactive),
             avatar_color, created_by, created_at

-- profiles (mobile app users)
profiles: id, auth_id(→auth.users, unique), org_id(→organizations),
          name, email, avatar_color, total_points(int default 0), created_at

-- org_members (role at org level)
org_members: id, org_id, user_id(→profiles), role(org_admin|sub_admin|member), joined_at

-- teams
teams: id, org_id, name, emoji, color, created_at

-- team_members (role at team level)
team_members: id, team_id, user_id(→profiles), org_id, role(captain|vice_captain|member), joined_at

-- invite_whitelist
invite_whitelist: id, org_id, email, team_id, role(team_captain|vice_captain|member),
                  invited_by, used_at(null=pending, set=accepted), created_at
                  UNIQUE(org_id, email)

-- challenges
challenges: id, org_id, name, description, status(active|completed|upcoming),
            start_date(date), end_date(date), manually_closed, created_at

-- challenge_teams (which teams are in which challenge)
challenge_teams: id, challenge_id, team_id
                 UNIQUE(challenge_id, team_id)

-- tasks
tasks: id, challenge_id, title, description, points,
       start_week(int ≥1), week_number(int ≥1, same value as start_week — UI display),
       category, icon(emoji), is_active, created_at

-- task_submissions
task_submissions: id, task_id, challenge_id, user_id(→profiles), org_id,
                  submitted_at(timestamptz), submitted_date(date),
                  status(pending|approved|rejected|expired),
                  proof_url, proof_type(image|text),
                  notes, rejection_reason, points_awarded,
                  reviewed_by(→profiles), reviewed_at

-- points_transactions (ledger)
points_transactions: id, user_id, org_id, amount(+award/-deduct),
                     reason, submission_id, awarded_by(→profiles), is_manual, created_at

-- feed_items
feed_items: id, org_id, type(announcement|achievement|leaderboard_change|quiz_result|
            milestone|submission_approved|general),
            title, content, author_id(→profiles), challenge_id,
            pinned, is_auto_generated, created_at

-- feed_reactions (one row per user × reaction × post)
feed_reactions: id, post_id(→feed_items), user_id(→profiles),
                reaction(broccoli|fire|star|heart), created_at
                UNIQUE(post_id, user_id, reaction)

-- messages (team chat — mobile)
messages: id, team_id, user_id(→profiles), content, media_url, media_type, created_at

-- events
events: id, org_id, title, description, type(quiz|offline),
        points, location, start_time, end_time, is_active,
        status(upcoming|completed), created_at
        -- attendees_count computed via COUNT(event_participations)

-- event_participations
event_participations: id, event_id, user_id(→profiles), points_awarded, created_at
                      UNIQUE(event_id, user_id)

-- policies
policies: id, org_id, name, content(rich HTML text), color_index(int 0-5),
          updated_at, created_at

-- VIEWS
team_points_view: team_id, challenge_id, total_points (sum of approved task submissions)
member_week_points_view: user_id, challenge_id, team_id, week_number, points

-- DB TRIGGER (fires on task_submissions AFTER UPDATE to 'approved')
handle_submission_approved():
  → INSERT points_transactions
  → UPDATE profiles.total_points
  → INSERT feed_items (type: submission_approved, is_auto_generated: true)
```

**RLS:** Org-scoped tables filter by `org_id`. `super_admin`/`sub_super_admin` use service role (bypasses RLS). `sub_admin` has same read/write scope as `org_admin`.

---

## Dashboard Screens (All Built ✅)

### Super Admin + Sub Super Admin (global sidebar)
| Route | What's Built in UI |
|---|---|
| `/login` | 2-step OTP: email → 6-digit code → role-based redirect |
| `/dashboard` | Platform stats (orgs, members, challenges, pending approvals), org table, recent activity sidebar |
| `/organizations` | Org cards grid (logo, name, slug, status badge, members/teams/admin/challenges stats, created date) |
| `/organizations/new` | Emoji picker (12 options), name, country (28 options), timezone (auto-fill + override), org admin name + email, live preview sidebar |
| `/admins` | Platform admin table (role badges, status), invite sub_super_admin form (super_admin only), stat cards |
| `/settings` | Platform settings page |

### Org Admin + Sub Admin (org-scoped sidebar)
| Route | What's Built in UI |
|---|---|
| `/organizations/[id]` | Org identity bar, stat cards (members/teams/points/pending), team leaderboard (medal ranks), org admin card, active challenges, pending approvals CTA |
| `/organizations/[id]/challenges` | Challenge list, task categories with icons, week grouping, status indicators |
| `/organizations/[id]/challenges/new` | Create challenge form + task builder (week groups, points, add/remove tasks per week) |
| `/organizations/[id]/challenges/[cid]` | Challenge detail: tasks by week, open/close toggle |
| `/organizations/[id]/approvals` | Pending + reviewed sections, search/team filter/date picker, review modal (proof image/text, notes, points override, approve/reject) |
| `/organizations/[id]/points` | Individual/team toggle, weekly breakdown table (Week 1-4 cols), expandable task breakdown, search + team filter |
| `/organizations/[id]/invite` | Single + bulk add, team + role pre-assignment, pending/accepted tables, remove option |
| `/organizations/[id]/events` | Event cards (type, date/time, location, attendee count, status), create/edit modal |
| `/organizations/[id]/feed` | Post cards (type, reactions 🥦🔥⭐❤️, pinned indicator), create/edit modal, type + challenge filters, stat cards |
| `/organizations/[id]/members` | Table (name, email, team, role badge, points, joined), search + team filter, change role modal, remove confirmation |
| `/organizations/[id]/teams` | Team cards (emoji, color, members, roles, points), inline role toggle (captain/vice captain), add member modal (searchable), create/edit/delete team |
| `/organizations/[id]/admins` | Org admin card (read-only), sub admin list (active + pending), add sub admin form, remove confirmation |
| `/organizations/[id]/policies` | Color-coded collapsible cards, rich text editor (bold/italic/H2/H3/lists), add/edit/delete, legal notice banner |
| `/organizations/[id]/settings` | Name/country/timezone edit, activate/deactivate toggle, danger zone (delete with "DELETE" type-to-confirm) |

---

## Post-Login Redirect
| Role | Redirects to |
|---|---|
| `super_admin` | `/dashboard` |
| `sub_super_admin` | `/dashboard` |
| `org_admin` | `/organizations/[their_org_id]` |
| `sub_admin` | `/organizations/[their_org_id]` |

---

## Email Change with OTP

All three user types — dashboard admins, org admins, and mobile app members — should be able to change their email via OTP verification.

### Flow (same for all user types)
1. User enters new email address
2. A 6-digit OTP is sent to the **new email** via Brevo
3. User enters the OTP code
4. System verifies OTP, updates email in both `auth.users` and the relevant table (`admin_users` or `profiles`)
5. User is signed out and must log in with the new email

### Implementation Status
| User Type | UI | Backend |
|---|---|---|
| Dashboard admins (super_admin, sub_super_admin, org_admin, sub_admin) | ✅ Settings page (OTP flow built) | ✅ `finalizeEmailChange` server action |
| Mobile app members (profiles) | ⏳ Phase 4 | ⏳ Phase 4 |

### Notes
- After OTP verification via `signInWithOtp({ shouldCreateUser: true })`, a temporary auth user is created for the new email. The server action (`finalizeEmailChange`) updates the original user's email and deletes the temp user.
- On mobile: implement same logic in Flutter — send OTP to new email, verify, update `profiles.email` + `auth.users` email via Supabase admin.

---

## Test User System

### What it is
Profiles with `is_test = true` are test accounts (seeded dummy users or QA accounts). On the **mobile app**, test users bypass the real Brevo OTP flow and can log in with the fixed code **`123456`**.

### How it works
| Step | Normal user | Test user |
|---|---|---|
| Enter email | → Brevo sends real OTP | → No email sent |
| Enter OTP | Real 6-digit code | `123456` always works |
| Login | Normal | Bypasses Supabase OTP verify |

### Implementation notes (Phase 4 — Mobile App)
- On the OTP submit screen, before calling `verifyOtp()`:
  1. Query `profiles` where `email = enteredEmail AND is_test = true`
  2. If found AND entered code = `123456` → skip `verifyOtp()`, call `signInWithPassword` with a seeded test password OR use a service-role session
  3. If not a test user → normal `verifyOtp()` flow
- The dashboard **Members** page shows a `🧪 Test` badge on `is_test = true` profiles
- Org admin can toggle `is_test` on/off per member from the Members page
- **Never enable `is_test` on real production users** — it removes OTP security for that account

### DB
```sql
-- profiles table
is_test boolean not null default false  -- added via migration_001_is_test.sql
```

---

## Mobile App Screens

| Screen | Tab | Purpose |
|---|---|---|
| Splash | — | Brand intro + auth check |
| Login | — | Whitelist-only OTP access |
| Signup | — | Via invite whitelist only |
| Home | Bottom nav | Points, team rank, today's tasks, leaderboard snapshot |
| Tasks | Bottom nav | Daily tasks, submit proof (image or text), view states |
| Leaderboard | Bottom nav | Team + individual ranking (realtime) |
| Feed | Bottom nav | Activity feed (auto + admin posts), reactions (🥦🔥⭐❤️) |
| More | Bottom nav | Links to Profile, Events, Chat, Policies, About |
| Profile | More | Points, rank, stats, points history |
| Events | More | View + participate in events |
| Chat | More | Team chat (realtime) |
| Policies | More | Read-only org policies |
| About | More | App info |

---

## Development Phases

### Phase 0 — Architecture ✅ COMPLETE
- [x] Define SaaS architecture + roles
- [x] Define DB schema + automation rules
- [x] Define timezone approach
- [x] Update roadmap.md

---

### Phase 1 — Dashboard UI ✅ COMPLETE
- [x] Next.js project setup (shadcn, Tailwind, proxy.ts)
- [x] Fonts: Instrument Serif + Instrument Sans
- [x] Global sidebar (Organizations, Dashboard, Admins, Settings)
- [x] Org-scoped sidebar (full nav when inside `/organizations/[id]/*`)
- [x] loading.tsx skeletons for all routes
- [x] `/login` — 2-step passwordless OTP (email → code → role-based redirect)
- [x] `/dashboard` — platform overview with real stat layout
- [x] `/organizations` — org cards grid
- [x] `/organizations/new` — create org form (emoji picker, country, timezone, live preview)
- [x] `/organizations/[id]` — org overview (leaderboard, pending approvals CTA)
- [x] `/organizations/[id]/challenges` — challenge list + task categories
- [x] `/organizations/[id]/challenges/new` — challenge + task builder (week grouping)
- [x] `/organizations/[id]/challenges/[cid]` — challenge detail (tasks by week, open/close)
- [x] `/organizations/[id]/approvals` — review modal (proof, notes, points override, approve/reject)
- [x] `/organizations/[id]/points` — individual/team toggle, weekly table, expandable task breakdown
- [x] `/organizations/[id]/invite` — single + bulk add, pending/accepted tables
- [x] `/organizations/[id]/events` — event cards with location, attendees, status
- [x] `/organizations/[id]/feed` — post feed with reactions, filters, create/edit modal
- [x] `/organizations/[id]/members` — table with search, filter, change role modal
- [x] `/organizations/[id]/teams` — team cards with inline role toggles, add member modal
- [x] `/organizations/[id]/admins` — org admin (read-only) + sub admin management
- [x] `/organizations/[id]/policies` — rich text editor, color-coded cards, legal notice banner
- [x] `/organizations/[id]/settings` — name/country/timezone/status/delete with type-to-confirm
- [x] `/admins` — platform admin management, invite sub_super_admin
- [x] `/settings` — platform settings

**Exit criteria:** All dashboard pages built with mock data. ✅ COMPLETE

---

### Phase 2 — Supabase Setup ✅ COMPLETE

- [x] Supabase project created, env vars set
- [x] schema.sql run — all tables, views, triggers created
- [x] seed.sql run — test data seeded
- [x] Storage buckets created: `task-proofs` (private), `avatars` (public), `org-logos` (public)
- [x] pg_cron jobs configured
- [x] RLS policies applied
- [x] Super admin user linked in auth.users

---

### Phase 3 — Dashboard Supabase Integration ✅ COMPLETE (verification pending)

**Rule: work page by page — never touch pages not currently being worked on.**

#### Step 3.1 — Update queries.ts ✅ COMPLETE
- [x] `from('submissions')` → `from('task_submissions')` (5 locations)
- [x] `from('feed_posts')` → `from('feed_items')` (5 locations)
- [x] `addTask`/`updateTask`: set both `start_week` AND `week_number`
- [x] Add `getPlatformStats()` → orgs count, members count, active challenges, pending approvals
- [x] Add `getPlatformAdmins()` → admin_users WHERE org_id IS NULL
- [x] Add `invitePlatformAdmin(name, email, role)` → INSERT admin_users
- [x] Add `getOrgAdmins(orgId)` → org_admin + sub_admins for org
- [x] Add `createSubAdmin(orgId, name, email)` → INSERT admin_users role=sub_admin
- [x] Add `removeSubAdmin(id)` → DELETE admin_users
- [x] Add `getOrgApprovals(orgId)` → task_submissions + profiles + tasks + teams JOIN
- [x] Add `approveSubmission(id, points, reviewerId)` → UPDATE task_submissions
- [x] Add `rejectSubmission(id, reason, reviewerId)` → UPDATE task_submissions
- [x] Add `getOrgPointsBreakdown(orgId)` → approved submissions + week calculation
- [x] Add `addManualPoints(orgId, userId, amount, reason, awardedBy)` → INSERT points_transactions + UPDATE profiles
- [x] Add `getInviteWhitelist(orgId)` → invite_whitelist + teams JOIN, status derived from used_at
- [x] Add `addToWhitelist(orgId, email, teamId, role, invitedBy)` → INSERT invite_whitelist
- [x] Add `bulkAddToWhitelist(orgId, emails[], teamId, role, invitedBy)` → batch INSERT
- [x] Add `removeFromWhitelist(id)` → DELETE invite_whitelist
- [x] Add `getOrgEvents(orgId)` → events + COUNT(event_participations) as attendees_count
- [x] Add `createEvent(orgId, data)` → INSERT events
- [x] Add `updateEvent(id, data)` → UPDATE events
- [x] Add `deleteEvent(id)` → DELETE events
- [x] Add `createOrganization(data)` → INSERT organizations + INSERT admin_users(org_admin) + trigger Brevo invite

#### Step 3.2 — Wire Platform Pages ✅ COMPLETE
- [x] `/dashboard` — real stat cards + org table + recent activity (getDashboardStats, getDashboardOrgs, getRecentActivity)
- [x] `/admins` — real admin table + invite sub_super_admin + remove (getPlatformAdmins, inviteSubSuperAdmin, removeSubSuperAdmin)
- [x] `/settings` — real profile (name, email, role, status, member since) + OTP email change flow
- [x] `/organizations` (list) — real org cards with member/team/challenge counts (getOrgsAdmin)

#### Step 3.3 — Wire Org Pages ✅ COMPLETE
- [x] `/organizations/new` — createOrganization (real submit)
- [x] `/organizations/[id]/admins` — getOrgAdmins + createSubAdmin + removeSubAdmin
- [x] `/organizations/[id]/approvals` — getOrgApprovals + approveSubmission + rejectSubmission + getProofSignedUrl
- [x] `/organizations/[id]/points` — getOrgPointsBreakdown + addManualPoints
- [x] `/organizations/[id]/invite` — getInviteWhitelist + addToWhitelist + bulkAddToWhitelist + removeFromWhitelist
- [x] `/organizations/[id]/events` — getOrgEvents + createEvent + updateEvent + deleteEvent

Pages already wired (do NOT touch unless specifically asked):
- `/login` ✅
- `/dashboard` ✅
- `/admins` ✅
- `/settings` ✅
- `/organizations` (list) ✅
- `/organizations/[id]` (overview) ✅
- `/organizations/[id]/challenges` + `/new` + `/[cid]` ✅
- `/organizations/[id]/feed` ✅
- `/organizations/[id]/policies` ✅
- `/organizations/[id]/settings` ✅
- `/organizations/[id]/members` ✅
- `/organizations/[id]/teams` + team detail ✅
- `/organizations/new` ✅
- `/organizations/[id]/admins` ✅
- `/organizations/[id]/approvals` ✅
- `/organizations/[id]/points` ✅
- `/organizations/[id]/invite` ✅
- `/organizations/[id]/events` ✅

#### Step 3.4 — Update proxy.ts (Org Guard) ✅ COMPLETE
- [x] For routes matching `/organizations/[id]/*`, fetch logged-in user's `admin_users.org_id`
- [x] If role is `org_admin`/`sub_admin` and URL `[id]` ≠ their `org_id` → redirect to their org
- [x] `super_admin`/`sub_super_admin` (org_id = null) → bypass check, access any org

#### Step 3.5 — TypeScript Check ✅ COMPLETE
- [x] `npx tsc --noEmit` — fix all type errors after wiring

#### Step 3.6 — Verification Checklist ⏳ IN PROGRESS (testing with real data)
- [ ] Login `super@yi.com` OTP → redirects to `/dashboard`
- [ ] Platform dashboard shows real org/member/challenge/approval counts
- [ ] Create org → org admin record created, invite email sent via Brevo
- [ ] Login as org admin → redirected to `/organizations/[their_org_id]`
- [ ] Approve a submission → `profiles.total_points` increases, feed item appears
- [ ] Reject a submission → rejection_reason stored, shown in reviewed section
- [ ] Add email to invite whitelist → appears with status "Pending"
- [ ] Points page → week breakdown matches approved submissions grouped by challenge weeks

**Exit criteria:** Full dashboard works with real Supabase data.

---

### Phase 4 — Mobile App (Flutter) ⏳ NOT STARTED

- [ ] Project setup (theme, colors, fonts, routing)
- [ ] Splash screen
- [ ] Login (whitelist-only OTP)
- [ ] Signup (invite whitelist check)
- [ ] On login: detect org from `profiles.org_id` → load branding
- [ ] Home screen (points, team rank, today's tasks, leaderboard snapshot)
- [ ] Tasks screen (daily tasks, midnight IST validation, proof submission)
- [ ] Task submission flow (image upload to `task-proofs` bucket or text log)
- [ ] Leaderboard screen (team + individual, realtime via Supabase Realtime)
- [ ] Feed screen (auto + admin posts, reactions 🥦🔥⭐❤️, realtime)
- [ ] More screen (links: Profile, Events, Chat, Policies, About)
- [ ] Profile screen (points, rank, stats, points history)
- [ ] Events screen (view + participate, points awarded)
- [ ] Chat screen (team chat, realtime messages, image/media support)
- [ ] Policies screen (read-only org policies)
- [ ] About screen

**Exit criteria:** Full member journey works on mobile, org-scoped, realtime.

---

## Current Status

| Phase | Status |
|---|---|
| Phase 0 — Architecture | ✅ Complete |
| Phase 1 — Dashboard UI | ✅ Complete (all pages built with mock data) |
| Phase 2 — Supabase Setup | ✅ Complete |
| Phase 3 — Dashboard Integration | ✅ Complete (Step 3.6 verification with real data in progress) |
| Phase 4 — Mobile App | 🔄 In Progress (foundation + all screens built, manual testing pending) |

**Next immediate steps:**
1. ⏳ Run Step 3.6 verification checklist with real Supabase data (dashboard)
2. 📱 Test mobile app with `flutter run` on device/simulator
3. ✅ Mark Phase 4 complete once manual testing passes
