# Product Requirements Document
# Yi Nutrition League 2.0

**Version:** 1.0
**Date:** April 2026
**Status:** In Development

---

## 1. Executive Summary

Yi Nutrition League 2.0 is a **multi-tenant SaaS platform** that helps organizations run internal wellness competitions. It gamifies healthy habit-building through daily challenges, team competition, leaderboards, and social engagement — creating a system where participants show up consistently because it's competitive, social, and rewarding.

The platform consists of two products:
- **Admin Dashboard** (web) — for organization administrators to manage the platform
- **Mobile App** (iOS & Android) — for participants to complete challenges and compete

---

## 2. Problem Statement

Wellness and habit-building programs in organizations suffer from:
- Low engagement after the first week
- No accountability mechanism
- No social motivation or visibility
- Manual, error-prone tracking by administrators

Yi Nutrition League solves this by making wellness **competitive, social, and verifiable** — combining the engagement mechanics of gaming with the accountability of team-based competition.

---

## 3. Target Users

### Primary Users
| User | Description |
|---|---|
| **Organization Admin** | Manages the wellness program for their organization. Needs control, visibility, and minimal manual work. |
| **Sub Admin** | Assists the org admin with day-to-day management. Same access, added by org admin. |
| **Team Captain** | Leads a team within an org. Motivates members, manages team chat. |
| **Vice Captain** | Same powers as captain, acts when captain is unavailable. |
| **Member** | Participant. Completes daily tasks, earns points, competes. |

### Platform-Level User
| User | Description |
|---|---|
| **Super Admin** | Us. Manages all organizations on the platform. |

---

## 4. Product Architecture

### SaaS Multi-Tenant Model
```
Platform (Super Admin)
└── Organization (Org Admin + Sub Admins)
    ├── Branding (logo, name, color)
    ├── Members (org-level, assigned to teams)
    ├── Teams (captain + vice captain)
    ├── Challenges & Tasks
    ├── Leaderboard (org-scoped)
    ├── Feed (org-scoped)
    ├── Events
    ├── Chat (team-scoped)
    └── Policies
```

**Data isolation:** Each organization's data is completely isolated. A member of Org A cannot see Org B's data. Enforced at the database level (Row Level Security).

---

## 5. Core Features

### 5.1 Challenges & Tasks
**Goal:** Drive daily habit completion.

- Admin creates **Challenges** with a start and end date
- Each challenge contains **Tasks** organized by week
- Tasks stack cumulatively — Week 2 includes Week 1 tasks
- Each task has a name, description, and point value
- Users complete tasks daily; each task resets every day

**Automation:**
- Challenges auto-activate on their start date
- Challenges auto-deactivate on their end date
- Admin can manually close or reopen a challenge at any time

---

### 5.2 Task Submission & Approval
**Goal:** Ensure task authenticity through proof verification.

**Submission flow:**
1. User opens a task and taps "Submit"
2. User uploads proof (photo/video)
3. Submission enters "Pending" state
4. Admin reviews proof and approves or rejects

**Rules:**
- One submission per task per day
- Submission window closes at **midnight IST** — enforced both client-side and server-side
- Submissions after midnight are blocked immediately
- Pending submissions at midnight are auto-expired

**Submission states:** `pending → approved / rejected / expired`

---

### 5.3 Points System (Broccoli 🥦 Points)
**Goal:** Reward verified behavior.

- Points are awarded **only after admin approval** — no self-reporting
- Points belong to the user; team score = sum of all member points
- When a member switches teams, their points travel with them
- Full points history is available to both user and admin

**Admin override:** Admin can manually add or deduct points at any time with a reason.

**Auto-trigger:** Points are awarded automatically when a submission is approved (DB trigger — no manual step).

---

### 5.4 Teams
**Goal:** Create accountability and healthy competition.

- Each organization has multiple teams
- Every team has one **Captain** and optionally one **Vice Captain**
- Members belong to the organization's pool and are assigned to teams
- Admin can move members between teams
- Vice Captain has all Captain powers — acts when Captain is unavailable

---

### 5.5 Leaderboards
**Goal:** Drive competition and visibility.

- **Individual leaderboard:** ranked by total Broccoli Points
- **Team leaderboard:** ranked by sum of member points
- Updates in real-time via Supabase Realtime
- Users can share their achievement card
- Confetti animation for top-ranked users

---

### 5.6 Feed
**Goal:** Increase engagement and social visibility.

**Auto-generated feed events:**
- Task approved → "User X completed Task Y and earned N 🥦 points"
- Rank change → "User X moved from #5 to #3 on the leaderboard"
- Event created → announcement auto-posted

**Manual posts:** Org Admin and Sub Admin can post custom announcements at any time.

**Interactions:** Users can react to feed items (like/emoji reactions).

---

### 5.7 Team Chat
**Goal:** Team bonding and coordination.

- Real-time team chat (Supabase Realtime)
- Only team members can see and participate in their team's chat
- Supports text, images, and links
- Captain and Vice Captain can invite members

---

### 5.8 Events & Quizzes
**Goal:** Add variety and bonus engagement opportunities.

- Admin creates events (quiz or offline activity)
- Members participate and earn bonus points
- Points can be awarded based on performance or participation
- Events appear in feed automatically

---

### 5.9 Invite System
**Goal:** Control access — only invited users can join.

- Admin adds emails to an **invite whitelist** with pre-assigned team and role
- New users can only sign up if their email is in the whitelist
- On signup: profile is auto-created with org, team, and role from whitelist
- Admin can revoke invites at any time

---

### 5.10 Per-Organization Branding
**Goal:** Each organization feels like the app is their own.

- Org admin uploads their logo and sets their organization name
- Mobile app header shows org logo and name when members log in
- Custom primary color option (optional in v2)

---

## 6. Authentication

### Method: Email OTP
- No passwords — users receive a 6-digit OTP via email
- OTP expires after 10 minutes
- Resend available after 60-second cooldown
- Email delivered via **Brevo SMTP** (smtp-relay.brevo.com)

### Login Flow
```
User enters email
├── Existing user → OTP sent → verify → enter app
└── New user → check invite whitelist
    ├── Not invited → "You haven't been invited yet. Contact your admin."
    └── Invited → OTP sent → verify → profile auto-created → enter app
```

### Dashboard Auth
- Admin dashboard uses email/password (separate auth for admins)
- Role-based access: super_admin sees all orgs; org_admin sees only their org

---

## 7. Admin Dashboard

### Super Admin Screens
| Screen | Purpose |
|---|---|
| Dashboard | Platform metrics (orgs, users, submissions, activity) |
| Organizations | Create and manage all organizations |
| Org Detail | Drill into any org to view its data |

### Org Admin / Sub Admin Screens
| Screen | Purpose |
|---|---|
| Dashboard | Org overview: pending approvals, active challenge, member count |
| Challenges | Create and manage challenges and weekly tasks |
| Approvals | Review proof submissions, approve or reject |
| Teams | Create teams, assign captain/vice-captain, move members |
| Members | Manage org member pool, invite whitelist, sub-admins |
| Points | Full points history, manual add/deduct |
| Events | Create events, assign points to participants |
| Feed | View feed, post manual announcements |
| Policies | Manage org rules and guidelines |
| Settings | Org branding (name, logo) |

---

## 8. Mobile App

### Bottom Navigation
`Home · Tasks · Leaderboard · Feed · More`

**More screen links to:** Profile · Events · Chat · Policies · About

### Screens
| Screen | Key Content |
|---|---|
| Splash | App logo, loading |
| Login | Email OTP flow (2 steps: email → OTP) |
| Home | Greeting, total 🥦 points, team rank, today's tasks preview, leaderboard snapshot |
| Tasks | All active tasks, submit proof, task states (pending/approved/rejected/expired) |
| Leaderboard | Team tab + Individual tab, real-time, confetti for #1, share card |
| Feed | Activity feed (auto + admin posts), react with emoji |
| More | Links to all secondary screens |
| Profile | Name, team, role, points, rank, stats, full points history |
| Events | Events list, participate |
| Chat | Team chat (real-time, text + images) |
| Policies | Read-only org policies |
| About | App info |

---

## 9. Technical Stack

| Layer | Technology |
|---|---|
| Mobile App | Flutter + supabase_flutter |
| Admin Dashboard | Next.js 14 (App Router) + shadcn/ui + Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (OTP for mobile, email/password for dashboard) |
| Storage | Supabase Storage (proof images, avatars, org logos) |
| Realtime | Supabase Realtime WebSockets |
| Email | Brevo SMTP (smtp-relay.brevo.com) |
| Automation | Supabase pg_cron + PostgreSQL triggers |

---

## 10. Design System

### Colors
| Role | Value |
|---|---|
| Primary | `#059669` (Emerald) |
| Secondary | `#1e293b` (Slate) |
| Body Text | `#475569` |
| Background | `#F8FAFC` |
| Card | `#FFFFFF` |
| Border | `#E2E8F0` |

### Typography
- **Headings / Screen Titles / Points:** Instrument Serif
- **Body / UI / Labels:** Instrument Sans

### Mobile UI Principles
- Playful: rounded corners (16–24px), soft shadows, emoji accents
- Simple: max 1 primary action per screen
- Generous spacing: 20–24px horizontal padding
- Broccoli 🥦 icon next to all point values
- Confetti animation on leaderboard for top ranks

---

## 11. Automation Summary

| What | How | Override |
|---|---|---|
| Challenge auto-activates | pg_cron checks `start_date` daily | Admin can manually reopen |
| Challenge auto-closes | pg_cron checks `end_date` daily | Admin can manually close early |
| Midnight submission lock | pg_cron at 00:00 IST + client check | Admin can approve expired if needed |
| Points awarded on approval | PostgreSQL DB trigger | Admin can manually add/deduct |
| Feed item on approval | PostgreSQL DB trigger | Admin can also post manually |
| Feed item on rank change | PostgreSQL DB trigger | N/A |

---

## 12. Data & Privacy

- Each organization's data is isolated at the database level via Row Level Security (RLS)
- Proof images stored in private Supabase Storage (not public URLs)
- Admin access to member data is limited to their own organization
- Super admin can access all data for platform management only

---

## 13. Development Phases

| Phase | Scope | Status |
|---|---|---|
| Phase 0 | Architecture + SaaS design | ✅ Complete |
| Phase 1 | Supabase setup (schema, RLS, triggers, pg_cron) | 🔲 Next |
| Phase 2 | Super Admin Dashboard (orgs management) | 🔲 |
| Phase 3 | Org Admin Dashboard (all 10 screens) | 🔲 |
| Phase 4 | Mobile App (all 13 screens) | 🔲 |

---

## 14. Success Metrics

| Metric | Target |
|---|---|
| Daily task completion rate | > 60% |
| Submission approval time | < 24 hours |
| User retention (Week 4) | > 70% |
| Feed interactions per day | > 3 per user |
| Dashboard page load time | < 500ms (with skeleton) |

---

*Yi Nutrition League 2.0 — Built to make wellness competitive and consistent.*
