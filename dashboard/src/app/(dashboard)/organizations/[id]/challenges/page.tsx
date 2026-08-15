'use client'

import { use, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import {
  Plus, Trash2, Calendar, AlertTriangle, MoreHorizontal,
  Pencil, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  ExternalLink, CheckCircle2, RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

import {
  getOrgChallenges, createChallenge, updateChallenge, setChallengeStatus, deleteChallenge as dbDeleteChallenge,
  deleteTask as dbDeleteTask, getOrgTeamList, getOrgTimezone,
  type ChallengeUI, type TaskUI, type PeriodLabel,
} from '@/lib/supabase/queries'
import { todayInTimezone } from '@/lib/date-utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type Challenge = ChallengeUI
type Task = TaskUI

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

type ChallengeFormData = Pick<Challenge, 'name' | 'description' | 'startDate' | 'endDate' | 'teams' | 'teamIds' | 'periodLabel'>

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Word used for a task group. The unlock mechanism is identical either way —
/// a task goes live on its start date and runs daily to the end — only the
/// cadence differs: weekly for city events, daily for National.
function periodWord(p: PeriodLabel, capital = false) {
  const w = p === 'day' ? 'day' : 'week'
  return capital ? w.charAt(0).toUpperCase() + w.slice(1) : w
}

function getWeekGaps(existingWeeks: number[], targetWeek: number): number[] {
  const gaps: number[] = []
  for (let w = 1; w < targetWeek; w++) {
    if (!existingWeeks.includes(w)) gaps.push(w)
  }
  return gaps
}

function toggle<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item]
}

function groupByWeek(tasks: Task[]) {
  const map: Record<number, Task[]> = {}
  for (const t of tasks) {
    if (!map[t.weekNumber]) map[t.weekNumber] = []
    map[t.weekNumber].push(t)
  }
  return Object.entries(map)
    .map(([w, items]) => ({ week: Number(w), items }))
    .sort((a, b) => a.week - b.week)
}

// ── TeamSelect dropdown (portal-based — never clipped by overflow) ────────────

function TeamSelect({
  value,
  onChange,
  options,
}: {
  value: string[]
  onChange: (v: string[]) => void
  options: string[]
}) {
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

  function handleToggle() {
    if (!open && buttonRef.current) setDropRect(buttonRef.current.getBoundingClientRect())
    setOpen(v => !v)
  }

  const label = value.length === 0
    ? 'All teams (default)'
    : value.map(t => t.replace('Team ', '')).join(', ')

  // Flip upward if less than 220px below the button
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
        onClick={handleToggle}
        className="w-full flex items-center justify-between gap-2 h-9 px-3 rounded-lg border border-input bg-background text-sm text-left hover:border-primary/40 transition-colors"
      >
        <span className={value.length === 0 ? 'text-muted-foreground' : 'text-foreground truncate'}>{label}</span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && dropRect && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div
            ref={portalRef}
            className="bg-popover border border-border rounded-lg shadow-lg overflow-y-auto max-h-52"
            style={dropStyle}
          >
            {options.map(team => (
              <label
                key={team}
                className="flex items-center gap-2.5 px-3 py-2 hover:bg-accent cursor-pointer text-sm text-foreground"
              >
                <input
                  type="checkbox"
                  checked={value.includes(team)}
                  onChange={() => onChange(toggle(value, team))}
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

// ── DatePicker (custom portal-based calendar) ─────────────────────────────────

function DatePicker({
  value,
  onChange,
  min,
  placeholder = 'Pick a date',
}: {
  value: string
  onChange: (v: string) => void
  min?: string
  placeholder?: string
}) {
  const today = new Date()
  const selected = value ? new Date(value + 'T12:00:00') : null
  const minDate = min ? new Date(min + 'T12:00:00') : null

  const [open, setOpen] = useState(false)
  const [dropRect, setDropRect] = useState<DOMRect | null>(null)
  const [viewYear, setViewYear] = useState(selected?.getFullYear() ?? today.getFullYear())
  const [viewMonth, setViewMonth] = useState(selected?.getMonth() ?? today.getMonth())
  const buttonRef = useRef<HTMLButtonElement>(null)
  const portalRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T12:00:00')
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
  }, [value])

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

  function handleOpen() {
    if (!open && buttonRef.current) setDropRect(buttonRef.current.getBoundingClientRect())
    setOpen(v => !v)
  }

  function selectDay(year: number, month: number, day: number) {
    const d = new Date(year, month, day)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    onChange(iso)
    setOpen(false)
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDow = new Date(viewYear, viewMonth, 1).getDay()
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']

  const openUp = dropRect ? window.innerHeight - dropRect.bottom < 300 : false
  const dropStyle: React.CSSProperties = dropRect
    ? openUp
      ? { position: 'fixed', bottom: window.innerHeight - dropRect.top + 4, left: dropRect.left, zIndex: 9999 }
      : { position: 'fixed', top: dropRect.bottom + 4, left: dropRect.left, zIndex: 9999 }
    : {}

  const displayValue = selected
    ? selected.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''

  return (
    <div>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleOpen}
        className="w-full flex items-center gap-2 h-9 px-3 rounded-lg border border-input bg-background text-sm text-left hover:border-primary/40 transition-colors"
      >
        <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className={cn('flex-1', displayValue ? 'text-foreground' : 'text-muted-foreground')}>
          {displayValue || placeholder}
        </span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && dropRect && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div
            ref={portalRef}
            className="bg-popover border border-border rounded-xl shadow-xl p-3 w-64"
            style={dropStyle}
          >
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={prevMonth}
                className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-semibold text-foreground">
                {monthNames[viewMonth]} {viewYear}
              </span>
              <button
                type="button"
                onClick={nextMonth}
                className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-y-0.5">
              {Array.from({ length: firstDow }).map((_, i) => (
                <div key={`e-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const thisDate = new Date(viewYear, viewMonth, day)
                const isToday = thisDate.toDateString() === today.toDateString()
                const isSelected = selected ? thisDate.toDateString() === selected.toDateString() : false
                const isDisabled = minDate ? thisDate < minDate : false
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => selectDay(viewYear, viewMonth, day)}
                    className={cn(
                      'h-7 w-7 mx-auto rounded-lg text-xs font-medium transition-colors',
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : isToday
                          ? 'border border-primary text-primary hover:bg-primary/10'
                          : isDisabled
                            ? 'text-muted-foreground/40 cursor-not-allowed'
                            : 'hover:bg-accent text-foreground'
                    )}
                  >
                    {day}
                  </button>
                )
              })}
            </div>

            {/* Clear */}
            {value && (
              <div className="mt-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => { onChange(''); setOpen(false) }}
                  className="text-xs text-muted-foreground hover:text-foreground w-full text-center transition-colors"
                >
                  Clear date
                </button>
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}

// ── Task modal (add / edit) ───────────────────────────────────────────────────

interface TaskModalProps {
  open: boolean
  onClose: () => void
  editTarget: Task | null
  existingWeeks: number[]
  teamOptions: string[]
  periodLabel: PeriodLabel
  onSave: (task: Omit<Task, 'id' | 'isActive'>) => void
}

function TaskModal({ open, onClose, editTarget, existingWeeks, teamOptions, periodLabel, onSave }: TaskModalProps) {
  const [title, setTitle]       = useState('')
  const [desc, setDesc]         = useState('')
  const [points, setPoints]     = useState(10)
  const [week, setWeek]         = useState(1)
  const [category, setCategory] = useState(CATEGORIES[0].label)
  const [teams, setTeams]       = useState<string[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate]     = useState('')

  const icon = CATEGORIES.find(c => c.label === category)?.icon ?? '✅'

  useEffect(() => {
    if (!open) return
    if (editTarget) {
      setTitle(editTarget.title)
      setDesc(editTarget.description)
      setPoints(editTarget.points)
      setWeek(editTarget.weekNumber)
      setCategory(editTarget.category)
      setTeams(editTarget.teams)
      setStartDate(editTarget.startDate || '')
      setEndDate(editTarget.endDate || '')
    } else {
      setTitle('')
      setDesc('')
      setPoints(10)
      setWeek(existingWeeks.length > 0 ? Math.max(...existingWeeks) + 1 : 1)
      setCategory(CATEGORIES[0].label)
      setTeams([])
      setStartDate('')
      setEndDate('')
    }
  }, [open, editTarget])

  const otherWeeks = editTarget
    ? existingWeeks.filter(w => w !== editTarget.weekNumber)
    : existingWeeks
  const isDuplicate = false
  const gaps = getWeekGaps(otherWeeks, week)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave({ title, description: desc, points, weekNumber: week, category, icon, teams, startDate, endDate })
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{editTarget ? 'Edit Task' : 'Add Task'}</DialogTitle>
        </DialogHeader>

        <form id="task-form" onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Category + icon preview */}
          <div className="space-y-1.5">
            <Label>Category</Label>
            <div className="flex gap-2 items-center">
              <div className="w-10 h-10 rounded-xl border border-border bg-muted flex items-center justify-center text-xl shrink-0">
                {icon}
              </div>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="flex-1 h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {CATEGORIES.map(c => (
                  <option key={c.label} value={c.label}>{c.icon}  {c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Week */}
          <div className="space-y-1.5">
            <Label htmlFor="t-week">{periodWord(periodLabel, true)} number <span className="text-destructive">*</span></Label>
            <Input
              id="t-week"
              type="number"
              min={1}
              value={week}
              onChange={e => setWeek(Math.max(1, Number(e.target.value)))}
            />
            <p className="text-xs text-muted-foreground">
              Existing {periodWord(periodLabel)}s:{' '}
              {existingWeeks.length > 0 ? existingWeeks.map(w => `${periodWord(periodLabel, true)} ${w}`).join(', ') : 'None yet'}
            </p>
            {isDuplicate && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive">
                  {periodWord(periodLabel, true)} {week} already has a task. Choose a different {periodWord(periodLabel)} number.
                </p>
              </div>
            )}
            {!isDuplicate && gaps.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  {gaps.length === 1
                    ? `Week ${gaps[0]} has no tasks yet.`
                    : `Weeks ${gaps.join(', ')} have no tasks yet.`
                  }{' '}
                  Members will see all active weeks — this is just a heads up.
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start date <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <DatePicker value={startDate} onChange={setStartDate} placeholder="Pick start date" />
            </div>
            <div className="space-y-1.5">
              <Label>End date <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <DatePicker value={endDate} onChange={setEndDate} min={startDate || undefined} placeholder="Pick end date" />
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="t-title">Task title <span className="text-destructive">*</span></Label>
            <Input
              id="t-title"
              placeholder="e.g. Morning Run 5km"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          {/* Points */}
          <div className="space-y-1.5">
            <Label htmlFor="t-points">Points 🥦</Label>
            <Input
              id="t-points"
              type="number"
              min={1}
              value={points}
              onChange={e => setPoints(Math.max(1, Number(e.target.value)))}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <textarea
              rows={12}
              placeholder="e.g. Take a screenshot of your step tracker showing 10,000+ steps."
              value={desc}
              onChange={e => setDesc(e.target.value)}
              className="w-full min-h-[220px] rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-y"
            />
          </div>

          {/* Team visibility */}
          <div className="space-y-1.5">
            <Label>
              Show to teams{' '}
              <span className="text-muted-foreground text-xs font-normal">(optional — empty means all)</span>
            </Label>
            <TeamSelect value={teams} onChange={setTeams} options={teamOptions} />
          </div>
        </form>

        <DialogFooter showCloseButton={false} className="flex-row justify-end gap-2">
          <button type="button" onClick={onClose} className={cn(buttonVariants({ variant: 'outline' }))}>
            Cancel
          </button>
          <Button
            type="submit"
            form="task-form"
            disabled={!title.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {editTarget ? 'Save Changes' : 'Add Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Challenge modal (create / edit) ──────────────────────────────────────────

interface ChallengeModalProps {
  open: boolean
  onClose: () => void
  editTarget: Challenge | null
  orgTimezone?: string
  teamList: { id: string; name: string }[]
  onSave: (data: ChallengeFormData) => void
}

function ChallengeModal({ open, onClose, editTarget, orgTimezone = 'Asia/Kolkata', teamList, onSave }: ChallengeModalProps) {
  const allTeamNames = teamList.map(t => t.name)
  const tzAbbr = Intl.DateTimeFormat('en', { timeZoneName: 'short', timeZone: orgTimezone })
    .formatToParts(new Date())
    .find(p => p.type === 'timeZoneName')?.value ?? orgTimezone
  const isEdit = !!editTarget

  const [name, setName]               = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate]     = useState('')
  const [endDate, setEndDate]         = useState('')
  const [selectedTeams, setSelectedTeams] = useState<string[]>([])
  const [periodLabel, setPeriodLabel] = useState<PeriodLabel>('week')

  useEffect(() => {
    if (!open) return
    if (editTarget) {
      setName(editTarget.name)
      setDescription(editTarget.description)
      setStartDate(editTarget.startDate)
      setEndDate(editTarget.endDate)
      setSelectedTeams(editTarget.teams)
      setPeriodLabel(editTarget.periodLabel ?? 'week')
    } else {
      setName('')
      setDescription('')
      setStartDate('')
      setEndDate('')
      setSelectedTeams([])
      setPeriodLabel('week')
    }
  }, [open, editTarget])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const teamIds = selectedTeams.map(n => teamList.find(t => t.name === n)?.id ?? '').filter(Boolean)
    onSave({ name, description, startDate, endDate, teams: selectedTeams, teamIds, periodLabel })
  }

  const isValid = name.trim() && startDate

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0" showCloseButton={false}>
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg">{isEdit ? 'Edit Challenge' : 'New Challenge'}</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isEdit ? 'Update challenge details and team visibility' : 'Create a challenge and add tasks for your members'}
              </p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-2xl leading-none">×</button>
          </div>
        </DialogHeader>

        <form id="challenge-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          <div className="space-y-1.5">
            <Label htmlFor="c-title">Title <span className="text-destructive">*</span></Label>
            <Input id="c-title" placeholder="e.g. April Wellness Challenge" value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="c-desc">Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <textarea
              id="c-desc" rows={4}
              placeholder="What should members achieve in this challenge?"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-y"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Start date <span className="text-destructive">*</span></Label>
              <DatePicker value={startDate} onChange={setStartDate} placeholder="Pick start date" />
            </div>
            <div className="space-y-1.5">
              <Label>End date <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
              <DatePicker value={endDate} onChange={setEndDate} min={startDate || undefined} placeholder="Pick end date" />
            </div>
            <p className="col-span-2 text-xs text-muted-foreground -mt-1">
              Challenges start/end at 12:00 AM <strong>{tzAbbr}</strong> — your org&apos;s timezone
            </p>
          </div>

          {/* How often a new task is added. Purely how groups are LABELLED —
              a task still unlocks on its start date and runs daily to the end. */}
          <div className="space-y-1.5">
            <Label>New task added every</Label>
            <div className="inline-flex rounded-lg border border-input overflow-hidden text-sm">
              {(['week', 'day'] as PeriodLabel[]).map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setPeriodLabel(opt)}
                  className={cn(
                    'px-4 py-2 transition-colors capitalize',
                    periodLabel === opt
                      ? 'bg-primary text-white font-semibold'
                      : 'bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Tasks are grouped and labelled as{' '}
              <strong>{periodWord(periodLabel, true)} 1, {periodWord(periodLabel, true)} 2 …</strong>{' '}
              for admins and members. Choose <strong>day</strong> when a new task
              is released each day.
            </p>
          </div>

          {/* Challenge team visibility */}
          <div className="space-y-1.5">
            <Label>
              Visible to teams{' '}
              <span className="text-muted-foreground text-xs font-normal">(optional — empty means all teams)</span>
            </Label>
            <TeamSelect
              value={selectedTeams}
              onChange={v => setSelectedTeams(v)}
              options={allTeamNames}
            />
          </div>

          <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2.5">
            Tasks can be added after creating the challenge.
          </p>
        </form>

        <DialogFooter className="px-6 pt-4 pb-6 border-t border-border shrink-0 flex-row justify-end gap-2 bg-background rounded-b-xl">
          <button type="button" onClick={onClose} className={cn(buttonVariants({ variant: 'outline' }))}>Cancel</button>
          <Button
            type="submit"
            form="challenge-form"
            disabled={!isValid}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isEdit ? 'Save Changes' : 'Create Challenge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OrgChallengesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const base = `/organizations/${id}`

  const [isLoading, setIsLoading] = useState(true)
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [teamList, setTeamList]     = useState<{ id: string; name: string }[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [orgTimezone, setOrgTimezone] = useState('UTC')

  useEffect(() => {
    Promise.all([
      getOrgChallenges(id),
      getOrgTeamList(id),
      getOrgTimezone(id),
    ]).then(([chs, teams, tz]) => {
      setChallenges(chs)
      setTeamList(teams)
      setOrgTimezone(tz)
      if (chs.length > 0) setExpandedId(chs[0].id)
    }).finally(() => setIsLoading(false))
  }, [id])

  // Challenge modal
  const [challengeModalOpen, setChallengeModalOpen] = useState(false)
  const [editChallenge, setEditChallenge] = useState<Challenge | null>(null)

  // Toggle confirm target
  const [confirmToggleTarget, setConfirmToggleTarget] = useState<Challenge | null>(null)

  // Delete targets
  const [deleteChallengeTarget, setDeleteChallengeTarget] = useState<Challenge | null>(null)
  const [deleteTaskTarget, setDeleteTaskTarget]           = useState<{ challengeId: string; task: Task } | null>(null)

  function openNewChallenge() {
    setEditChallenge(null)
    setChallengeModalOpen(true)
  }

  function openEditChallenge(c: Challenge) {
    setEditChallenge(c)
    setChallengeModalOpen(true)
  }

  async function handleSaveChallenge(data: ChallengeFormData) {
    if (editChallenge) {
      await updateChallenge(editChallenge.id, {
        name: data.name, description: data.description,
        startDate: data.startDate, endDate: data.endDate, teamIds: data.teamIds,
        periodLabel: data.periodLabel,
      })
      setChallenges(prev => prev.map(c => c.id === editChallenge.id ? { ...c, ...data } : c))
    } else {
      const { data: newCh } = await createChallenge(id, {
        name: data.name, description: data.description,
        startDate: data.startDate, endDate: data.endDate, teamIds: data.teamIds,
        periodLabel: data.periodLabel,
      })
      if (newCh) {
        setChallenges(prev => [...prev, {
          id: newCh.id, ...data,
          status: 'upcoming', tasks: [], manuallyClosed: false, submissions: 0,
        }])
      }
    }
    setChallengeModalOpen(false)
  }

  async function handleToggleClosed(cid: string) {
    const c = challenges.find(ch => ch.id === cid)
    if (!c) return
    const newClosed = !c.manuallyClosed
    await setChallengeStatus(cid, newClosed ? 'completed' : 'active', newClosed)
    setChallenges(prev => prev.map(ch => {
      if (ch.id !== cid) return ch
      if (newClosed) return { ...ch, status: 'completed' as const, manuallyClosed: true }
      // Reopen: compute effective status using org timezone
      const today = todayInTimezone(orgTimezone)
      const newStatus: Challenge['status'] = today < ch.startDate ? 'upcoming' : (ch.endDate && today > ch.endDate) ? 'completed' : 'active'
      return { ...ch, status: newStatus, manuallyClosed: false }
    }))
  }

  async function confirmDeleteChallenge() {
    if (!deleteChallengeTarget) return
    await dbDeleteChallenge(deleteChallengeTarget.id)
    setChallenges(prev => prev.filter(c => c.id !== deleteChallengeTarget.id))
    setDeleteChallengeTarget(null)
  }

  async function confirmDeleteTask() {
    if (!deleteTaskTarget) return
    const { challengeId, task } = deleteTaskTarget
    await dbDeleteTask(task.id)
    setChallenges(prev => prev.map(c =>
      c.id === challengeId ? { ...c, tasks: c.tasks.filter(t => t.id !== task.id) } : c
    ))
    setDeleteTaskTarget(null)
  }

  if (isLoading) return <ChallengesSkeleton />

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl text-foreground">Challenges</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage challenge campaigns and weekly tasks</p>
        </div>
        <button onClick={openNewChallenge} className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5')}>
          <Plus className="size-3.5" /> New Challenge
        </button>
      </div>

      {/* Challenge list */}
      <div className="space-y-3">
        {challenges.map(c => {
          const isExpanded = expandedId === c.id
          const weeks = groupByWeek(c.tasks)
          const weekCount = [...new Set(c.tasks.map(t => t.weekNumber))].length
          const allTeamNames = teamList.map(t => t.name)
          const teamOptions = c.teams.length > 0 ? c.teams : allTeamNames
          const existingWeeks = [...new Set(c.tasks.map(t => t.weekNumber))]

          return (
            <div key={c.id} className="bg-card border border-border rounded-xl overflow-hidden">
              {/* Challenge header */}
              <div className="px-5 py-4 flex items-center gap-3">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}
                  className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  {isExpanded
                    ? <ChevronUp className="w-4 h-4" />
                    : <ChevronDown className="w-4 h-4" />
                  }
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-foreground">{c.name}</h3>
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full capitalize', statusStyle[c.status])}>
                      {c.manuallyClosed ? 'closed' : c.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {c.startDate}{c.endDate ? ` → ${c.endDate}` : ''}
                    </span>
                    {weekCount > 0 && <span>{weekCount} week{weekCount !== 1 ? 's' : ''}</span>}
                    <span>{c.tasks.length} task{c.tasks.length !== 1 ? 's' : ''}</span>
                    {c.teams.length > 0 && (
                      <span>{c.teams.length} team{c.teams.length !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                </div>

                {/* Manage */}
                <Link
                  href={`${base}/challenges/${c.id}`}
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5 shrink-0')}
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Manage
                </Link>

                {/* ··· menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-muted shrink-0">
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" side="bottom">
                    <DropdownMenuItem onClick={() => openEditChallenge(c)} className="gap-2">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setConfirmToggleTarget(c)} className="gap-2">
                      {c.manuallyClosed
                        ? <><RotateCcw className="w-3.5 h-3.5" /> Reopen</>
                        : <><CheckCircle2 className="w-3.5 h-3.5" /> Complete</>
                      }
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setDeleteChallengeTarget(c)}
                      variant="destructive"
                      className="gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-border">
                  {/* Description */}
                  {c.description && (
                    <p className="px-5 py-3 text-sm text-muted-foreground border-b border-border">
                      {c.description}
                    </p>
                  )}

                  {/* Weekly tasks section */}
                  <div className="px-5 py-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">Weekly Challenges</p>
                    </div>

                    {c.tasks.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border py-8 text-center">
                        <p className="text-sm text-muted-foreground">No tasks yet.</p>
                        <Link
                          href={`${base}/challenges/${c.id}`}
                          className="mt-2 text-xs text-primary hover:underline inline-block"
                        >
                          Add the first task →
                        </Link>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {weeks.map(({ week, items }) => (
                          <div key={week}>
                            <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">
                              {periodWord(c.periodLabel, true)} {week} — New Habit{' '}
                              <span className="text-muted-foreground font-normal normal-case tracking-normal">
                                (repeats every {periodWord(c.periodLabel)} from here)
                              </span>
                            </p>
                            <div className="space-y-1.5">
                              {items.map(task => (
                                <div key={task.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border hover:bg-muted/20 transition-colors group">
                                  {/* Icon */}
                                  <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-lg shrink-0">
                                    {task.icon}
                                  </div>

                                  {/* Info */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm font-semibold text-foreground">{task.title}</span>
                                      <span className="text-[11px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">
                                        {task.category}
                                      </span>
                                    </div>
                                    {task.description && (
                                      <p className="text-xs text-muted-foreground truncate mt-0.5">{task.description}</p>
                                    )}
                                    {task.teams.length > 0 && (
                                      <p className="text-[11px] text-muted-foreground mt-0.5">
                                        {task.teams.map(t => t.replace('Team ', '')).join(', ')}
                                      </p>
                                    )}
                                  </div>

                                  {/* Points + actions */}
                                  <div className="flex items-center gap-1 shrink-0">
                                    <span className="flex items-center gap-1 text-xs font-semibold bg-primary/10 text-primary px-2 py-1 rounded-lg">
                                      🥦 {task.pointsTiers && task.pointsTiers.length > 0 ? `${task.pointsTiers[0].points}–${task.pointsTiers[task.pointsTiers.length - 1].points}` : task.points}
                                    </span>
                                    <button
                                      onClick={() => setDeleteTaskTarget({ challengeId: c.id, task })}
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
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Challenge modal */}
      <ChallengeModal
        open={challengeModalOpen}
        onClose={() => setChallengeModalOpen(false)}
        editTarget={editChallenge}
        orgTimezone="Asia/Kolkata"
        teamList={teamList}
        onSave={handleSaveChallenge}
      />

      {/* Confirm toggle (Complete / Reopen) dialog */}
      <Dialog open={!!confirmToggleTarget} onOpenChange={v => { if (!v) setConfirmToggleTarget(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              {confirmToggleTarget?.manuallyClosed
                ? `Reopen "${confirmToggleTarget?.name}"?`
                : `Complete "${confirmToggleTarget?.name}"?`}
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {confirmToggleTarget?.manuallyClosed
                ? 'The challenge will become active again and members can submit tasks.'
                : 'The challenge will be marked as completed. Members will no longer be able to submit tasks.'}
            </p>
          </DialogHeader>
          <DialogFooter showCloseButton={false} className="flex-row justify-end gap-2">
            <button onClick={() => setConfirmToggleTarget(null)} className={cn(buttonVariants({ variant: 'outline' }))}>Cancel</button>
            <Button
              onClick={async () => {
                const target = confirmToggleTarget
                setConfirmToggleTarget(null)
                if (target) await handleToggleClosed(target.id)
              }}
              className={confirmToggleTarget?.manuallyClosed
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : undefined}
            >
              {confirmToggleTarget?.manuallyClosed ? 'Reopen Challenge' : 'Complete Challenge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete challenge dialog */}
      <Dialog open={!!deleteChallengeTarget} onOpenChange={v => { if (!v) setDeleteChallengeTarget(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete "{deleteChallengeTarget?.name}"?</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              This will remove the challenge and all its tasks. Submissions will be lost. This cannot be undone.
            </p>
          </DialogHeader>
          <DialogFooter showCloseButton={false} className="flex-row justify-end gap-2">
            <button onClick={() => setDeleteChallengeTarget(null)} className={cn(buttonVariants({ variant: 'outline' }))}>Cancel</button>
            <Button onClick={confirmDeleteChallenge} className="bg-destructive text-white hover:bg-destructive/90">
              Delete Challenge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete task dialog */}
      <Dialog open={!!deleteTaskTarget} onOpenChange={v => { if (!v) setDeleteTaskTarget(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete "{deleteTaskTarget?.task.title}"?</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Members will no longer see or submit this task. This cannot be undone.
            </p>
          </DialogHeader>
          <DialogFooter showCloseButton={false} className="flex-row justify-end gap-2">
            <button onClick={() => setDeleteTaskTarget(null)} className={cn(buttonVariants({ variant: 'outline' }))}>Cancel</button>
            <Button onClick={confirmDeleteTask} className="bg-destructive text-white hover:bg-destructive/90">
              Delete Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ChallengesSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-8 w-32 bg-muted rounded-md" />
          <div className="h-4 w-64 bg-muted rounded" />
        </div>
        <div className="h-8 w-36 bg-muted rounded-lg" />
      </div>
      <div className="space-y-3">
        {[72, 56, 80, 64].map((w, i) => (
          <div key={i} className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-muted rounded-lg shrink-0" />
                <div className="space-y-1.5">
                  <div className="h-4 bg-muted rounded" style={{ width: `${w * 2}px` }} />
                  <div className="h-3 w-32 bg-muted rounded" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-6 w-16 bg-muted rounded-full" />
                <div className="h-6 w-6 bg-muted rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
