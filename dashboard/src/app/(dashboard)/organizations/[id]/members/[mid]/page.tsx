'use client'

import { use } from 'react'
import Link from 'next/link'
import { ArrowLeft, Crown, Shield, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type MemberRole = 'team_captain' | 'vice_captain' | 'member'
type SubmissionStatus = 'approved' | 'rejected' | 'pending'

interface TaskSubmission {
  id: string
  taskTitle: string
  challenge: string
  week: number
  submittedDate: string
  status: SubmissionStatus
  pointsAwarded: number
}

interface MemberDetail {
  id: string
  name: string
  email: string
  team: string
  role: MemberRole
  totalPoints: number
  rank: number
  joinedAt: string
  avatarColor: string
  tasksCompleted: number
  tasksRejected: number
  tasksPending: number
  submissions: TaskSubmission[]
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockMembers: Record<string, MemberDetail> = {
  m1: {
    id: 'm1', name: 'Arjun Shah', email: 'arjun@email.com',
    team: 'Team Alpha', role: 'team_captain',
    totalPoints: 620, rank: 1, joinedAt: 'Jan 20, 2026',
    avatarColor: '#ef4444',
    tasksCompleted: 22, tasksRejected: 2, tasksPending: 1,
    submissions: [
      { id: 's1',  taskTitle: 'Morning Walk',   challenge: 'Wellness April', week: 1, submittedDate: 'Apr 1',  status: 'approved', pointsAwarded: 20 },
      { id: 's2',  taskTitle: 'Hydration Log',  challenge: 'Wellness April', week: 1, submittedDate: 'Apr 1',  status: 'approved', pointsAwarded: 10 },
      { id: 's3',  taskTitle: 'Morning Walk',   challenge: 'Wellness April', week: 1, submittedDate: 'Apr 2',  status: 'approved', pointsAwarded: 20 },
      { id: 's4',  taskTitle: 'Hydration Log',  challenge: 'Wellness April', week: 1, submittedDate: 'Apr 2',  status: 'approved', pointsAwarded: 10 },
      { id: 's5',  taskTitle: 'Morning Walk',   challenge: 'Wellness April', week: 1, submittedDate: 'Apr 3',  status: 'approved', pointsAwarded: 20 },
      { id: 's6',  taskTitle: 'Hydration Log',  challenge: 'Wellness April', week: 1, submittedDate: 'Apr 3',  status: 'rejected', pointsAwarded: 0  },
      { id: 's7',  taskTitle: 'Morning Walk',   challenge: 'Wellness April', week: 1, submittedDate: 'Apr 4',  status: 'approved', pointsAwarded: 20 },
      { id: 's8',  taskTitle: 'Mindful Eating', challenge: 'Wellness April', week: 2, submittedDate: 'Apr 8',  status: 'approved', pointsAwarded: 10 },
      { id: 's9',  taskTitle: 'Morning Walk',   challenge: 'Wellness April', week: 2, submittedDate: 'Apr 8',  status: 'approved', pointsAwarded: 20 },
      { id: 's10', taskTitle: 'Mindful Eating', challenge: 'Wellness April', week: 2, submittedDate: 'Apr 9',  status: 'approved', pointsAwarded: 10 },
      { id: 's11', taskTitle: 'Morning Walk',   challenge: 'Wellness April', week: 2, submittedDate: 'Apr 9',  status: 'approved', pointsAwarded: 20 },
      { id: 's12', taskTitle: 'Mindful Eating', challenge: 'Wellness April', week: 2, submittedDate: 'Apr 10', status: 'pending',  pointsAwarded: 0  },
    ],
  },
  m2: {
    id: 'm2', name: 'Riya Kapoor', email: 'riya@email.com',
    team: 'Team Alpha', role: 'vice_captain',
    totalPoints: 580, rank: 2, joinedAt: 'Jan 20, 2026',
    avatarColor: '#3b82f6',
    tasksCompleted: 19, tasksRejected: 1, tasksPending: 0,
    submissions: [
      { id: 's1', taskTitle: 'Morning Walk',   challenge: 'Wellness April', week: 1, submittedDate: 'Apr 1',  status: 'approved', pointsAwarded: 20 },
      { id: 's2', taskTitle: 'Hydration Log',  challenge: 'Wellness April', week: 1, submittedDate: 'Apr 1',  status: 'approved', pointsAwarded: 10 },
      { id: 's3', taskTitle: 'Mindful Eating', challenge: 'Wellness April', week: 2, submittedDate: 'Apr 8',  status: 'rejected', pointsAwarded: 0  },
      { id: 's4', taskTitle: 'Morning Walk',   challenge: 'Wellness April', week: 2, submittedDate: 'Apr 9',  status: 'approved', pointsAwarded: 20 },
    ],
  },
}

function getFallbackMember(mid: string): MemberDetail {
  return {
    id: mid, name: 'Member', email: '—', team: '—', role: 'member',
    totalPoints: 0, rank: 0, joinedAt: '—', avatarColor: '#94a3b8',
    tasksCompleted: 0, tasksRejected: 0, tasksPending: 0, submissions: [],
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

const roleLabel: Record<MemberRole, string> = {
  team_captain: 'Captain',
  vice_captain: 'Vice Captain',
  member: 'Member',
}

const statusConfig: Record<SubmissionStatus, { icon: React.ReactNode; label: string; className: string }> = {
  approved: {
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    label: 'Approved',
    className: 'text-emerald-600 bg-emerald-50',
  },
  rejected: {
    icon: <XCircle className="w-3.5 h-3.5" />,
    label: 'Rejected',
    className: 'text-red-600 bg-red-50',
  },
  pending: {
    icon: <Clock className="w-3.5 h-3.5" />,
    label: 'Pending',
    className: 'text-amber-600 bg-amber-50',
  },
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MemberDetailPage({ params }: { params: Promise<{ id: string; mid: string }> }) {
  const { id: orgId, mid } = use(params)
  const member = mockMembers[mid] ?? getFallbackMember(mid)

  const totalTasks = member.tasksCompleted + member.tasksRejected + member.tasksPending
  const approvalRate = totalTasks > 0 ? Math.round((member.tasksCompleted / totalTasks) * 100) : 0

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <Link
          href={`/organizations/${orgId}/members`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Members
        </Link>

        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold text-white shrink-0"
            style={{ backgroundColor: member.avatarColor }}
          >
            {initials(member.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-heading text-2xl text-foreground">{member.name}</h1>
              <span className={cn(
                'flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full',
                member.role === 'team_captain' && 'bg-amber-100 text-amber-700',
                member.role === 'vice_captain' && 'bg-blue-100 text-blue-700',
                member.role === 'member'       && 'bg-muted text-muted-foreground',
              )}>
                {member.role === 'team_captain' && <Crown className="w-3 h-3" />}
                {member.role === 'vice_captain' && <Shield className="w-3 h-3" />}
                {roleLabel[member.role]}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{member.email}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{member.team} · Joined {member.joinedAt}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-1 text-lg font-bold text-foreground">
              🥦 {member.totalPoints.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">Rank #{member.rank}</p>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Tasks Completed', value: member.tasksCompleted, color: 'text-emerald-600' },
          { label: 'Tasks Rejected',  value: member.tasksRejected,  color: 'text-red-500' },
          { label: 'Pending Review',  value: member.tasksPending,   color: 'text-amber-500' },
          { label: 'Approval Rate',   value: `${approvalRate}%`,    color: 'text-primary' },
        ].map(card => (
          <div key={card.label} className="bg-card border border-border rounded-xl px-4 py-3">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className={cn('text-xl font-bold mt-0.5', card.color)}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Task submissions */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border">
          <h2 className="font-heading text-base text-foreground">Task Submissions</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{member.submissions.length} submissions total</p>
        </div>

        {member.submissions.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            No submissions yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">Task</th>
                <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">Challenge</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">Week</th>
                <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Submitted</th>
                <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {member.submissions.map(sub => {
                const cfg = statusConfig[sub.status]
                return (
                  <tr key={sub.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3 font-medium text-foreground">{sub.taskTitle}</td>
                    <td className="px-5 py-3 text-muted-foreground text-xs hidden sm:table-cell">{sub.challenge}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-muted-foreground">WK{sub.week}</span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground text-xs hidden md:table-cell">{sub.submittedDate}</td>
                    <td className="px-5 py-3">
                      <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full', cfg.className)}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {sub.pointsAwarded > 0
                        ? <span className="font-semibold text-foreground">🥦 {sub.pointsAwarded}</span>
                        : <span className="text-muted-foreground/40 text-xs">—</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
