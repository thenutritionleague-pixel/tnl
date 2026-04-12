'use client'

import { useState } from 'react'
import { Plus, CalendarDays, Trash2, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { createEvent, updateEvent, deleteEvent, type EventInput } from '../actions'
import type { OrgEvent } from '@/lib/supabase/admin-queries'

const inputCls = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40'

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  // Convert ISO to datetime-local input format (YYYY-MM-DDTHH:mm)
  return iso.slice(0, 16)
}

function toIso(localDt: string): string {
  if (!localDt) return ''
  return new Date(localDt).toISOString()
}

interface ModalState {
  mode: 'create' | 'edit'
  event?: OrgEvent
}

interface Props {
  orgId: string
  initialEvents: OrgEvent[]
}

export function EventsClient({ orgId, initialEvents }: Props) {
  const [events, setEvents] = useState<OrgEvent[]>(initialEvents)
  const [modal, setModal]   = useState<ModalState | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<OrgEvent | null>(null)
  const [deleting, setDeleting]         = useState(false)

  // Form state
  const [form, setForm] = useState<Omit<EventInput, 'points'> & { points: string }>({
    title: '', description: '', type: 'offline', points: '0',
    location: '', startTime: '', endTime: '', status: 'upcoming',
  })

  function openCreate() {
    setForm({ title: '', description: '', type: 'offline', points: '0', location: '', startTime: '', endTime: '', status: 'upcoming' })
    setModal({ mode: 'create' })
  }

  function openEdit(ev: OrgEvent) {
    setForm({
      title: ev.title, description: ev.description, type: ev.type,
      points: String(ev.points), location: ev.location ?? '',
      startTime: toLocalInput(ev.startTime), endTime: toLocalInput(ev.endTime),
      status: ev.status,
    })
    setModal({ mode: 'edit', event: ev })
  }

  function closeModal() { setModal(null) }

  function setField<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  async function handleSave() {
    if (!form.title.trim()) { toast.error('Title is required.'); return }
    if (!form.startTime) { toast.error('Start date/time is required.'); return }
    setSaving(true)

    const data: EventInput = {
      title: form.title.trim(),
      description: form.description.trim(),
      type: form.type,
      points: parseInt(form.points) || 0,
      location: form.location.trim(),
      startTime: toIso(form.startTime),
      endTime: form.endTime ? toIso(form.endTime) : '',
      status: form.status,
    }

    let result: { error?: string; success?: boolean }
    if (modal?.mode === 'create') {
      result = await createEvent(orgId, data)
    } else {
      result = await updateEvent(orgId, modal!.event!.id, data)
    }

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(modal?.mode === 'create' ? 'Event created.' : 'Event updated.')
      // Optimistic update
      const startDate = new Date(data.startTime)
      const newEv: OrgEvent = {
        id: modal?.event?.id ?? Math.random().toString(36).slice(2),
        title: data.title, description: data.description, type: data.type,
        points: data.points, location: data.location || null,
        startTime: data.startTime, endTime: data.endTime || null,
        status: data.status, isActive: data.status === 'upcoming',
        attendeesCount: modal?.event?.attendeesCount ?? 0,
        displayDate: startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        displayTime: startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      }
      if (modal?.mode === 'create') {
        setEvents(prev => [newEv, ...prev])
      } else {
        setEvents(prev => prev.map(e => e.id === newEv.id ? newEv : e))
      }
      closeModal()
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const result = await deleteEvent(orgId, deleteTarget.id)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Event deleted.')
      setEvents(prev => prev.filter(e => e.id !== deleteTarget.id))
      setDeleteTarget(null)
    }
    setDeleting(false)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl text-foreground">Events</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{events.length} event{events.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openCreate} className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5')}>
          <Plus className="size-3.5" /> New Event
        </button>
      </div>

      {/* Event cards */}
      {events.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <CalendarDays className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">No events yet</p>
          <p className="text-xs text-muted-foreground mt-1">Create your first event to get started.</p>
          <button onClick={openCreate} className={cn(buttonVariants({ size: 'sm' }), 'mt-4 gap-1.5')}>
            <Plus className="size-3.5" /> New Event
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {events.map(ev => (
            <div key={ev.id} className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
              <div className="h-2" style={{ backgroundColor: ev.type === 'quiz' ? '#8b5cf6' : '#059669' }} />
              <div className="p-5 flex-1 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <CalendarDays className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{ev.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{ev.displayDate} · {ev.displayTime}</p>
                  </div>
                </div>
                {ev.description && <p className="text-xs text-muted-foreground line-clamp-2">{ev.description}</p>}
                {ev.location && <p className="text-xs text-muted-foreground">📍 {ev.location}</p>}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{ev.attendeesCount} attending</span>
                  <span>·</span>
                  <span>🥦 {ev.points} pts</span>
                  <span>·</span>
                  <span className="capitalize">{ev.type}</span>
                </div>
              </div>
              <div className="px-5 py-3 border-t border-border flex justify-between items-center">
                <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full capitalize', ev.status === 'upcoming' && 'bg-blue-100 text-blue-700', ev.status === 'completed' && 'bg-muted text-muted-foreground')}>
                  {ev.status}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(ev)} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-xs h-7')}>Edit</button>
                  <button onClick={() => setDeleteTarget(ev)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={!!modal} onOpenChange={v => { if (!v) closeModal() }}>
        <DialogContent className="sm:max-w-lg" showCloseButton={false}>
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>{modal?.mode === 'create' ? 'New Event' : 'Edit Event'}</DialogTitle>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground transition-colors"><X className="w-4 h-4" /></button>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input value={form.title} onChange={e => setField('title', e.target.value)} placeholder="Nutrition Workshop" />
            </div>

            <div className="space-y-1.5">
              <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <textarea value={form.description} onChange={e => setField('description', e.target.value)} rows={2} placeholder="Event details..." className={inputCls + ' resize-none'} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <select value={form.type} onChange={e => setField('type', e.target.value as 'quiz' | 'offline')} className={inputCls}>
                  <option value="offline">Offline</option>
                  <option value="quiz">Quiz</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Points</Label>
                <Input type="number" min={0} value={form.points} onChange={e => setField('points', e.target.value)} placeholder="0" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Location <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input value={form.location} onChange={e => setField('location', e.target.value)} placeholder="Online / Bandra Bandstand" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Date & Time <span className="text-destructive">*</span></Label>
                <input type="datetime-local" value={form.startTime} onChange={e => setField('startTime', e.target.value)} className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <Label>End Date & Time <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <input type="datetime-local" value={form.endTime} onChange={e => setField('endTime', e.target.value)} className={inputCls} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <select value={form.status} onChange={e => setField('status', e.target.value as 'upcoming' | 'completed')} className={inputCls}>
                <option value="upcoming">Upcoming</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          <DialogFooter showCloseButton={false} className="flex-row justify-end gap-2">
            <button onClick={closeModal} className={cn(buttonVariants({ variant: 'outline' }))}>Cancel</button>
            <Button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : modal?.mode === 'create' ? 'Create Event' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete event?</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              <span className="font-medium text-foreground">{deleteTarget?.title}</span> will be permanently deleted.
            </p>
          </DialogHeader>
          <DialogFooter showCloseButton={false} className="flex-row justify-end gap-2">
            <button onClick={() => setDeleteTarget(null)} className={cn(buttonVariants({ variant: 'outline' }))}>Cancel</button>
            <Button onClick={handleDelete} disabled={deleting} className="bg-destructive text-white hover:bg-destructive/90">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
