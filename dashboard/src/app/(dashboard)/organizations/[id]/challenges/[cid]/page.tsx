'use client'

import { use, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import {
  ArrowLeft, Calendar, CheckCircle2, Clock, XCircle,
  ToggleLeft, ToggleRight, Plus, AlertTriangle, Pencil, Trash2, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  getChallengeById, getChallengeSubCounts, getChallengeSubs, getOrgTeamList,
  addTask, updateTask as dbUpdateTask, deleteTask as dbDeleteTask,
  setChallengeStatus, setTaskActive,
  type ChallengeUI, type TaskUI, type ChallengeSub,
} from '@/lib/supabase/queries'

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { label: 'Hydration',   icon: '💧' },
  { label: 'Sleep',       icon: '😴' },
  { label: 'Exercise',    icon: '💪' },
  { label: 'Nutrition',   icon: '🥗' },
  { label: 'Mindfulness', icon: '🧘' },
  { label: 'Steps',       icon: '👟' },
  { label: 'Social',      icon: '🤝' },
  { label: 'Learning',    icon: '📚' },
  { label: 'Other',       icon: '✅' },
]

const statusStyle: Record<string, string> = {
  active:    'bg-emerald-100 text-emerald-700',
  completed: 'bg-muted text-muted-foreground',
  upcoming:  'bg-blue-100 text-blue-700',
}

const submissionStatusStyle: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  expired:  'bg-muted text-muted-foreground',
}

const submissionStatusIcon: Record<string, React.ReactNode> = {
  pending:  <Clock className="w-3 h-3" />,
  approved: <CheckCircle2 className="w-3 h-3" />,
  rejected: <XCircle className="w-3 h-3" />,
  expired:  <XCircle className="w-3 h-3" />,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupByWeek(tasks: TaskUI[]) {
  const map: Record<number, TaskUI[]> = {}
  for (const t of tasks) {
    if (!map[t.weekNumber]) map[t.weekNumber] = []
    map[t.weekNumber].push(t)
  }
  return Object.entries(map)
    .map(([week, items]) => ({ week: Number(week), items }))
    .sort((a, b) => a.week - b.week)
}

function getWeekGaps(existingWeeks: number[], targetWeek: number): number[] {
  const gaps: number[] = []
  for (let w = 1; w < targetWeek; w++) {
    if (!existingWeeks.includes(w)) gaps.push(w)
  }
  return gaps
}

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

// ── TeamSelect ────────────────────────────────────────────────────────────────

function TeamSelect({ value, onChange, options }: { value: string[]; onChange: (v: string[]) => void; options: string[] }) {
  const [open, setOpen] = useState(false)
  const [dropRect, setDropRect] = useState<DOMRect | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const portalRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      const target = e.target as Node
      if (buttonRef.current?.contains(target) || portalRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const label = value.length === 0 ? 'All teams (default)' : value.join(', ')
  const openUp = dropRect ? window.innerHeight - dropRect.bottom < 220 : false
  const dropStyle: React.CSSProperties = dropRect
    ? openUp
      ? { position: 'fixed', bottom: window.innerHeight - dropRect.top + 4, left: dropRect.left, width: dropRect.width, zIndex: 9999 }
      : { position: 'fixed', top: dropRect.bottom + 4, left: dropRect.left, width: dropRect.width, zIndex: 9999 }
    : {}

  return (
    <div>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => { if (!open && buttonRef.current) setDropRect(buttonRef.current.getBoundingClientRect()); setOpen(v => !v) }}
        className="w-full flex items-center justify-between gap-2 h-9 px-3 rounded-lg border border-input bg-background text-sm text-left hover:border-primary/40 transition-colors"
      >
        <span className={value.length === 0 ? 'text-muted-foreground' : 'text-foreground truncate'}>{label}</span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && dropRect && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div ref={portalRef} className="bg-popover border border-border rounded-lg shadow-lg overflow-y-auto max-h-52" style={dropStyle}>
            {options.map(team => (
              <label key={team} className="flex items-center gap-2.5 px-3 py-2 hover:bg-accent cursor-pointer text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={value.includes(team)}
                  onChange={() => onChange(value.includes(team) ? value.filter(x => x !== team) : [...value, team])}
                  className="rounded border-input accent-primary"
                />
                {team}
              </label>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}

// ── Task modal ────────────────────────────────────────────────────────────────

interface TaskModalProps {
  open: boolean
  onClose: () => void
  editTarget: TaskUI | null
  existingWeeks: number[]
  teamOptions: string[]
  onSave: (data: Omit<TaskUI, 'id' | 'isActive'>) => Promise<void>
}

function TaskModal({ open, onClose, editTarget, existingWeeks, teamOptions, onSave }: TaskModalProps) {
  const [title, setTitle]       = useState('')
  const [desc, setDesc]         = useState('')
  const [points, setPoints]     = useState(10)
  const [week, setWeek]         = useState(1)
  const [category, setCategory] = useState(CATEGORIES[0].label)
  const [teams, setTeams]       = useState<string[]>([])
  const [saving, setSaving]     = useState(false)

  const icon = CATEGORIES.find(c => c.label === category)?.icon ?? '✅'

  useEffect(() => {
    if (!open) return
    if (editTarget) {
      setTitle(editTarget.title); setDesc(editTarget.description)
      setPoints(editTarget.points); setWeek(editTarget.weekNumber)
      setCategory(editTarget.category); setTeams(editTarget.teams)
    } else {
      setTitle(''); setDesc(''); setPoints(10)
      setWeek(existingWeeks.length > 0 ? Math.max(...existingWeeks) + 1 : 1)
      setCategory(CATEGORIES[0].label); setTeams([])
    }
  }, [open, editTarget])

  const otherWeeks = editTarget ? existingWeeks.filter(w => w !== editTarget.weekNumber) : existingWeeks
  const gaps = getWeekGaps(otherWeeks, week)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await onSave({ title, description: desc, points, weekNumber: week, category, icon, teams })
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{editTarget ? 'Edit Task' : 'Add Task'}</DialogTitle>
        </DialogHeader>

        <form id="task-form" onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <div className="flex gap-2 items-center">
              <div className="w-10 h-10 rounded-xl border border-border bg-muted flex items-center justify-center text-xl shrink-0">{icon}</div>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="flex-1 h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                {CATEGORIES.map(c => <option key={c.label} value={c.label}>{c.icon}  {c.label}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="t-week">Week number <span className="text-destructive">*</span></Label>
            <Input id="t-week" type="number" min={1} value={week} onChange={e => setWeek(Math.max(1, Number(e.target.value)))} />
            <p className="text-xs text-muted-foreground">Existing weeks: {existingWeeks.length > 0 ? existingWeeks.map(w => `Week ${w}`).join(', ') : 'None yet'}</p>
            {gaps.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  {gaps.length === 1 ? `Week ${gaps[0]} has no tasks yet.` : `Weeks ${gaps.join(', ')} have no tasks yet.`}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="t-title">Task title <span className="text-destructive">*</span></Label>
            <Input id="t-title" placeholder="e.g. Morning Run 5km" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="t-points">Points 🥦</Label>
            <Input id="t-points" type="number" min={1} value={points} onChange={e => setPoints(Math.max(1, Number(e.target.value)))} />
          </div>

          <div className="space-y-1.5">
            <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <textarea rows={2} placeholder="e.g. Upload a screenshot of your step tracker."
              value={desc} onChange={e => setDesc(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
          </div>

          {teamOptions.length > 0 && (
            <div className="space-y-1.5">
              <Label>Show to teams <span className="text-muted-foreground text-xs font-normal">(optional — empty means all)</span></Label>
              <TeamSelect value={teams} onChange={setTeams} options={teamOptions} />
            </div>
          )}
        </form>

        <DialogFooter showCloseButton={false} className="flex-row justify-end gap-2">
          <button type="button" onClick={onClose} className={cn(buttonVariants({ variant: 'outline' }))}>Cancel</button>
          <Button type="submit" form="task-form" disabled={!title.trim() || saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Add Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ChallengeDetailPage({ params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id: orgId, cid } = use(params)
  const base = `/organizations/${orgId}`

  const [isLoading, setIsLoading]   = useState(true)
  const [challenge, setChallenge]   = useState<ChallengeUI | null>(null)
  const [subCounts, setSubCounts]   = useState({ total: 0, pending: 0, approved: 0, rejected: 0 })
  const [recentSubs, setRecentSubs] = useState<ChallengeSub[]>([])
  const [teamList, setTeamList]     = useState<string[]>([])

  const [taskModal, setTaskModal]   = useState<{ open: boolean; editTarget: TaskUI | null }>({ open: false, editTarget: null })
  const [deleteTarget, setDeleteTarget] = useState<TaskUI | null>(null)
  const [confirmClose, setConfirmClose] = useState<'close' | 'reopen' | null>(null)
  const [toggling, setToggling]     = useState(false)

  useEffect(() => {
    Promise.all([
      getChallengeById(cid),
      getChallengeSubCounts(cid),
      getChallengeSubs(cid),
      getOrgTeamList(orgId),
    ]).then(([ch, counts, subs, teams]) => {
      setChallenge(ch)
      setSubCounts(counts)
      setRecentSubs(subs)
      setTeamList(teams.map(t => t.name))
    }).finally(() => setIsLoading(false))
  }, [cid, orgId])

  async function handleSaveTask(data: Omit<TaskUI, 'id' | 'isActive'>) {
    if (!challenge) return
    if (taskModal.editTarget) {
      await dbUpdateTask(taskModal.editTarget.id, data)
      setChallenge(prev => prev ? {
        ...prev,
        tasks: prev.tasks.map(t => t.id === taskModal.editTarget!.id ? { ...t, ...data } : t),
      } : prev)
    } else {
      const { data: newTask } = await addTask(cid, data)
      if (newTask) {
        setChallenge(prev => prev ? {
          ...prev,
          tasks: [...prev.tasks, { id: newTask.id, ...data, isActive: true }],
        } : prev)
      }
    }
    setTaskModal({ open: false, editTarget: null })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    await dbDeleteTask(deleteTarget.id)
    setChallenge(prev => prev ? { ...prev, tasks: prev.tasks.filter(t => t.id !== deleteTarget.id) } : prev)
    setDeleteTarget(null)
  }

  async function handleToggle() {
    if (!challenge || !confirmClose) return
    setToggling(true)
    const closing = confirmClose === 'close'
    await setChallengeStatus(cid, closing ? 'completed' : 'active', closing)
    setChallenge(prev => {
      if (!prev) return prev
      if (closing) return { ...prev, status: 'completed', manuallyClosed: true }
      const now = new Date()
      const start = new Date(prev.startDate + 'T00:00:00')
      const newStatus: ChallengeUI['status'] = now < start ? 'upcoming' : 'active'
      return { ...prev, status: newStatus, manuallyClosed: false }
    })
    setConfirmClose(null)
    setToggling(false)
  }

  async function toggleTaskActive(taskId: string, current: boolean) {
    await setTaskActive(taskId, !current)
    setChallenge(prev => prev ? {
      ...prev,
      tasks: prev.tasks.map(t => t.id === taskId ? { ...t, isActive: !current } : t),
    } : prev)
  }

  if (isLoading) return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded" />
      <div className="h-24 bg-muted rounded-xl" />
      <div className="grid grid-cols-4 gap-4">{[1,2,3,4].map(i => <div key={i} className="h-20 bg-muted rounded-xl" />)}</div>
    </div>
  )

  if (!challenge) return <p className="text-sm text-muted-foreground">Challenge not found.</p>

  const existingWeeks = [...new Set(challenge.tasks.map(t => t.weekNumber))].sort((a, b) => a - b)
  const weeks = groupByWeek(challenge.tasks)
  const totalPoints = challenge.tasks.filter(t => t.isActive).reduce((sum, t) => sum + t.points, 0)

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <Link href={`${base}/challenges`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1.5 text-muted-foreground -ml-2')}>
            <ArrowLeft className="w-3.5 h-3.5" /> All Challenges
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-heading text-2xl text-foreground">{challenge.name}</h1>
              <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full capitalize', statusStyle[challenge.status])}>
                {challenge.manuallyClosed ? 'closed' : challenge.status}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              <span>
                {challenge.startDate}
                {challenge.endDate ? ` → ${challenge.endDate}` : ' (no end date)'}
              </span>
            </div>
            {challenge.description && (
              <p className="text-sm text-muted-foreground mt-2 max-w-xl">{challenge.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link href={`${base}/approvals`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}>
            <Clock className="w-3.5 h-3.5" /> {subCounts.pending} Pending
          </Link>
          <button
            onClick={() => setConfirmClose(challenge.manuallyClosed ? 'reopen' : 'close')}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5',
              challenge.manuallyClosed ? 'text-emerald-600 border-emerald-200' : 'text-muted-foreground',
            )}
          >
            {challenge.manuallyClosed
              ? <><ToggleRight className="w-4 h-4" /> Reopen</>
              : <><ToggleLeft className="w-4 h-4" /> Close</>
            }
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Submissions', value: subCounts.total,    color: 'text-foreground' },
          { label: 'Pending Review',    value: subCounts.pending,  color: 'text-amber-600' },
          { label: 'Approved',          value: subCounts.approved, color: 'text-emerald-600' },
          { label: 'Rejected',          value: subCounts.rejected, color: 'text-red-500' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Tasks */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Tasks</h2>
            <div className="flex items-center gap-3">
              <p className="text-xs text-muted-foreground">{totalPoints} 🥦 pts total per member</p>
              <button onClick={() => setTaskModal({ open: true, editTarget: null })} className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5')}>
                <Plus className="size-3.5" /> Add Task
              </button>
            </div>
          </div>

          {weeks.length === 0 && (
            <div className="bg-card border border-border rounded-xl px-5 py-10 text-center">
              <p className="text-sm text-muted-foreground">No tasks yet.</p>
              <button onClick={() => setTaskModal({ open: true, editTarget: null })} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-3')}>
                Add the first task →
              </button>
            </div>
          )}

          {weeks.map(({ week, items }) => (
            <div key={week} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/40 border-b border-border">
                <p className="text-xs font-bold text-primary uppercase tracking-wider">
                  Week {week} <span className="text-muted-foreground font-normal normal-case tracking-normal">— repeats every week from here</span>
                </p>
              </div>
              <div className="divide-y divide-border">
                {items.map(task => (
                  <div key={task.id} className="px-4 py-3 flex items-center gap-3 group hover:bg-muted/20 transition-colors">
                    <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-lg shrink-0">{task.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={cn('text-sm font-semibold', !task.isActive && 'line-through text-muted-foreground')}>{task.title}</p>
                        <span className="text-[11px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">{task.category}</span>
                        {!task.isActive && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">inactive</span>}
                      </div>
                      {task.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{task.description}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="flex items-center gap-1 text-xs font-semibold bg-primary/10 text-primary px-2 py-1 rounded-lg">🥦 {task.points}</span>
                      <button
                        onClick={() => toggleTaskActive(task.id, task.isActive)}
                        className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded opacity-0 group-hover:opacity-100"
                        title={task.isActive ? 'Deactivate' : 'Activate'}
                      >
                        {task.isActive ? <ToggleRight className="w-3.5 h-3.5 text-emerald-600" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => setTaskModal({ open: true, editTarget: task })}
                        className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded opacity-0 group-hover:opacity-100"
                        title="Edit task"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(task)}
                        className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded opacity-0 group-hover:opacity-100"
                        title="Delete task"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Recent submissions */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden h-fit">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Recent Submissions</h2>
            <Link href={`${base}/approvals`} className="text-xs text-primary hover:underline">Review all →</Link>
          </div>
          {recentSubs.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground text-center">No submissions yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {recentSubs.map(s => (
                <div key={s.id} className="px-5 py-3 flex items-start gap-3">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white mt-0.5"
                    style={{ backgroundColor: s.avatarColor }}
                  >
                    {initials(s.member)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">{s.member}</p>
                    <p className="text-xs text-muted-foreground truncate">"{s.taskTitle}"</p>
                    <p className="text-xs text-muted-foreground">{s.submittedAt}</p>
                  </div>
                  <span className={cn(
                    'flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 mt-1 capitalize',
                    submissionStatusStyle[s.status],
                  )}>
                    {submissionStatusIcon[s.status]}
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Task modal */}
      <TaskModal
        open={taskModal.open}
        onClose={() => setTaskModal({ open: false, editTarget: null })}
        editTarget={taskModal.editTarget}
        existingWeeks={existingWeeks}
        teamOptions={teamList}
        onSave={handleSaveTask}
      />

      {/* Delete task confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete "{deleteTarget?.title}"?</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">Members will no longer see or submit this task. This cannot be undone.</p>
          </DialogHeader>
          <DialogFooter showCloseButton={false} className="flex-row justify-end gap-2">
            <button onClick={() => setDeleteTarget(null)} className={cn(buttonVariants({ variant: 'outline' }))}>Cancel</button>
            <Button onClick={confirmDelete} className="bg-destructive text-white hover:bg-destructive/90">Delete Task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close / Reopen confirm */}
      <Dialog open={!!confirmClose} onOpenChange={v => { if (!v) setConfirmClose(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{confirmClose === 'close' ? `Close "${challenge.name}"?` : `Reopen "${challenge.name}"?`}</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {confirmClose === 'close'
                ? 'The challenge will be marked as completed. Members can no longer submit tasks.'
                : 'The challenge will be reopened and members can submit tasks again.'}
            </p>
          </DialogHeader>
          <DialogFooter showCloseButton={false} className="flex-row justify-end gap-2">
            <button onClick={() => setConfirmClose(null)} className={cn(buttonVariants({ variant: 'outline' }))}>Cancel</button>
            <Button
              onClick={handleToggle}
              disabled={toggling}
              className={confirmClose === 'close' ? 'bg-destructive text-white hover:bg-destructive/90' : 'bg-emerald-600 text-white hover:bg-emerald-700'}
            >
              {toggling ? '...' : confirmClose === 'close' ? 'Close Challenge' : 'Reopen Challenge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
