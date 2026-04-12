'use client'

import { use, useState, useEffect, useRef, useCallback } from 'react'
import {
  AlertCircle, ChevronDown, ChevronUp,
  Plus, Trash2,
  Bold, Italic, Underline, List, ListOrdered, Heading2, Heading3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  getOrgPolicies, createPolicy, updatePolicy, deletePolicy as dbDeletePolicy,
  type PolicyUI,
} from '@/lib/supabase/queries'

// ── Types ─────────────────────────────────────────────────────────────────────

type Policy = PolicyUI

// ── Constants ─────────────────────────────────────────────────────────────────

const COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-purple-100 text-purple-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
]


// ── Rich Text Editor Modal ────────────────────────────────────────────────────

function EditPolicyModal({
  policy,
  onSave,
  onClose,
}: {
  policy: Policy
  onSave: (html: string) => void
  onClose: () => void
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  // Freeze initial HTML so React never overwrites the contentEditable on re-renders
  const initialHTML = useRef(policy.content)

  const exec = useCallback((cmd: string, value?: string) => {
    document.execCommand(cmd, false, value)
    editorRef.current?.focus()
  }, [])

  function handleSave() {
    onSave(editorRef.current?.innerHTML ?? '')
  }

  const toolbarButtons = [
    { icon: <Bold className="w-4 h-4" />,         title: 'Bold',           action: () => exec('bold') },
    { icon: <Italic className="w-4 h-4" />,       title: 'Italic',         action: () => exec('italic') },
    { icon: <Underline className="w-4 h-4" />,    title: 'Underline',      action: () => exec('underline') },
  ]

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Edit — {policy.name}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            This content will be visible to participants in the app under "{policy.name}".
          </p>
        </DialogHeader>

        {/* Editor */}
        <div className="flex-1 flex flex-col min-h-0 border border-border rounded-xl overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-0.5 px-2 py-2 border-b border-border bg-muted/30 flex-wrap shrink-0">
            {toolbarButtons.map((b, i) => (
              <button
                key={i}
                type="button"
                title={b.title}
                onMouseDown={e => { e.preventDefault(); b.action() }}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                {b.icon}
              </button>
            ))}
            <div className="w-px h-4 bg-border mx-1" />
            {[
              { label: 'H2', title: 'Heading 2', action: () => exec('formatBlock', 'h2') },
              { label: 'H3', title: 'Heading 3', action: () => exec('formatBlock', 'h3') },
              { label: 'P',  title: 'Paragraph', action: () => exec('formatBlock', 'p')  },
            ].map(b => (
              <button
                key={b.label}
                type="button"
                title={b.title}
                onMouseDown={e => { e.preventDefault(); b.action() }}
                className="px-2 py-1 rounded text-xs font-semibold hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                {b.label}
              </button>
            ))}
            <div className="w-px h-4 bg-border mx-1" />
            <button
              type="button"
              title="Bullet List"
              onMouseDown={e => { e.preventDefault(); exec('insertUnorderedList') }}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              title="Numbered List"
              onMouseDown={e => { e.preventDefault(); exec('insertOrderedList') }}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <ListOrdered className="w-4 h-4" />
            </button>
          </div>

          {/* Editable area — dangerouslySetInnerHTML sets initial content;
              React won't touch it again because initialHTML.current never changes */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            dangerouslySetInnerHTML={{ __html: initialHTML.current }}
            className={cn(
              'flex-1 overflow-y-auto px-5 py-4 text-sm text-foreground outline-none min-h-[240px]',
              '[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1',
              '[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-0.5',
              '[&_p]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-1.5',
              '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-1.5 [&_li]:mb-0.5',
            )}
          />
        </div>

        <DialogFooter showCloseButton={false} className="flex-row gap-2 pt-1 shrink-0">
          <button onClick={onClose} className={cn(buttonVariants({ variant: 'outline' }), 'flex-1')}>
            Cancel
          </button>
          <Button onClick={handleSave} className="flex-1">Save Policy</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OrgPoliciesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = use(params)

  const [isLoading, setIsLoading] = useState(true)
  const [policies, setPolicies]   = useState<Policy[]>([])

  useEffect(() => {
    getOrgPolicies(orgId).then(setPolicies).finally(() => setIsLoading(false))
  }, [orgId])
  const [expandedId, setExpandedId]   = useState<string | null>(null)
  const [editTarget, setEditTarget]   = useState<Policy | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Policy | null>(null)

  // New policy dialog
  const [showNew, setShowNew]   = useState(false)
  const [newName, setNewName]   = useState('')
  const [nameError, setNameError] = useState('')

  function toggle(id: string) {
    setExpandedId(prev => prev === id ? null : id)
  }

  async function handleSaveContent(id: string, html: string) {
    await updatePolicy(id, { content: html })
    getOrgPolicies(orgId).then(setPolicies)
    setEditTarget(null)
  }

  async function handleCreate() {
    const trimmed = newName.trim()
    if (!trimmed) { setNameError('Policy name is required'); return }
    const { data } = await createPolicy(orgId, trimmed)
    setShowNew(false)
    setNewName('')
    setNameError('')
    const refreshed = await getOrgPolicies(orgId)
    setPolicies(refreshed)
    if (data) setEditTarget(refreshed.find(p => p.id === data.id) ?? null)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    await dbDeletePolicy(deleteTarget.id)
    if (expandedId === deleteTarget.id) setExpandedId(null)
    setDeleteTarget(null)
    getOrgPolicies(orgId).then(setPolicies)
  }

  if (isLoading) return <PoliciesSkeleton />

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-2xl text-foreground">Policies</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage legal policies visible to all participants</p>
        </div>
        <button
          onClick={() => { setNewName(''); setNameError(''); setShowNew(true) }}
          className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5 shrink-0')}
        >
          <Plus className="size-3.5" /> Add Policy
        </button>
      </div>

      {/* Legal notice */}
      <div className="flex gap-3 px-4 py-3.5 rounded-xl bg-amber-50 border border-amber-200">
        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-700">Legal Notice</p>
          <p className="text-sm text-amber-700/80 mt-0.5 leading-relaxed">
            These policies protect both participants and administrators. Health and personal data is collected — keeping these policies current is important for legal compliance. Review them with your legal team before launch.
          </p>
        </div>
      </div>

      {/* Policy list */}
      <div className="space-y-3">
        {policies.map(policy => {
          const isExpanded = expandedId === policy.id

          return (
            <div key={policy.id} className="bg-card border border-border rounded-2xl overflow-hidden">

              {/* Header row */}
              <div className="flex items-center gap-3 px-5 py-4">
                <span className={cn('px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 whitespace-nowrap', COLORS[policy.colorIndex % COLORS.length])}>
                  {policy.name}
                </span>
                <p className="flex-1 font-medium text-foreground text-[15px] truncate">{policy.name}</p>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground hidden sm:inline">Updated {policy.updatedAt}</span>
                  <button
                    onClick={() => setDeleteTarget(policy)}
                    className="p-1 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => toggle(policy.id)}
                    className="p-1 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Expanded preview */}
              {isExpanded && (
                <div className="px-5 pb-5 border-t border-border pt-4 space-y-3">
                  {policy.content ? (
                    <div
                      className={cn(
                        'text-sm text-foreground leading-relaxed',
                        '[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1',
                        '[&_h3]:text-sm [&_h3]:font-semibold',
                        '[&_p]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-1.5',
                        '[&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-0.5',
                      )}
                      dangerouslySetInnerHTML={{ __html: policy.content }}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No content yet. Click Edit Content to add.</p>
                  )}
                  <button
                    onClick={() => setEditTarget(policy)}
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                  >
                    Edit Content
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {policies.length === 0 && (
          <div className="bg-card border border-dashed border-border rounded-2xl px-5 py-10 text-center">
            <p className="text-sm text-muted-foreground">No policies yet.</p>
            <button
              onClick={() => { setNewName(''); setNameError(''); setShowNew(true) }}
              className={cn(buttonVariants({ size: 'sm' }), 'mt-3 gap-1.5')}
            >
              <Plus className="size-3.5" /> Add First Policy
            </button>
          </div>
        )}
      </div>

      {/* Rich text edit modal */}
      {editTarget && (
        <EditPolicyModal
          policy={editTarget}
          onSave={html => handleSaveContent(editTarget.id, html)}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* New policy dialog */}
      <Dialog open={showNew} onOpenChange={v => { if (!v) setShowNew(false) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Add New Policy</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              This name is shown to participants in the app exactly as entered.
            </p>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="policy-name">Policy Name <span className="text-destructive">*</span></Label>
            <Input
              id="policy-name"
              placeholder="e.g. Privacy Policy, Terms of Use"
              value={newName}
              onChange={e => { setNewName(e.target.value); setNameError('') }}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </div>
          <DialogFooter showCloseButton={false} className="flex-row gap-2 pt-1">
            <button onClick={() => setShowNew(false)} className={cn(buttonVariants({ variant: 'outline' }), 'flex-1')}>
              Cancel
            </button>
            <Button onClick={handleCreate} className="flex-1">Create & Edit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete "{deleteTarget?.name}"?</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              This policy will be removed and no longer visible to participants.
            </p>
          </DialogHeader>
          <DialogFooter showCloseButton={false} className="flex-row justify-end gap-2">
            <button onClick={() => setDeleteTarget(null)} className={cn(buttonVariants({ variant: 'outline' }))}>
              Cancel
            </button>
            <Button onClick={confirmDelete} className="bg-destructive text-white hover:bg-destructive/90">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function PoliciesSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-8 w-24 bg-muted rounded-md" />
          <div className="h-4 w-64 bg-muted rounded" />
        </div>
        <div className="h-8 w-28 bg-muted rounded-lg" />
      </div>
      <div className="h-20 bg-muted/50 rounded-xl" />
      <div className="space-y-3">
        {[160, 140, 180].map((w, i) => (
          <div key={i} className="bg-card border border-border rounded-2xl px-5 py-4 flex items-center gap-3">
            <div className="h-6 w-24 bg-muted rounded-full shrink-0" />
            <div className="flex-1 h-4 bg-muted rounded" style={{ maxWidth: w }} />
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <div className="h-3.5 w-28 bg-muted rounded hidden sm:block" />
              <div className="h-4 w-4 bg-muted rounded" />
              <div className="h-4 w-4 bg-muted rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
