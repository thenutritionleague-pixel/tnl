'use client'

import { use, useState, useMemo, useEffect } from 'react'
import { Plus, Pin, MoreHorizontal, Trash2, PinOff, ChevronDown, Search, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

import {
  getFeedPosts, createFeedPost, updateFeedPost, deleteFeedPost, togglePinPost,
  getOrgChallenges, type FeedPost,
} from '@/lib/supabase/queries'

// ── Types ──────────────────────────────────────────────────────────────────────

type PostType = FeedPost['type']
type Reactions = FeedPost['reactions']

// ── Post type config ───────────────────────────────────────────────────────────

const postTypeConfig: Record<PostType, { label: string; emoji: string; iconBg: string }> = {
  announcement:        { label: 'Announcement',       emoji: '📢', iconBg: 'bg-amber-100'   },
  achievement:         { label: 'Achievement',         emoji: '🏆', iconBg: 'bg-amber-100'   },
  leaderboard_change:  { label: 'Leaderboard Change',  emoji: '📊', iconBg: 'bg-blue-100'    },
  quiz_result:         { label: 'Quiz Result',         emoji: '🧠', iconBg: 'bg-pink-100'    },
  milestone:           { label: 'Milestone',           emoji: '🎯', iconBg: 'bg-red-100'     },
  submission_approved: { label: 'Submission Approved', emoji: '✅', iconBg: 'bg-emerald-100' },
  general:             { label: 'General',             emoji: '💬', iconBg: 'bg-muted'       },
}

const POST_TYPES = Object.entries(postTypeConfig) as [PostType, typeof postTypeConfig[PostType]][]

// ── Page ───────────────────────────────────────────────────────────────────────

export default function OrgFeedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = use(params)

  const [isLoading, setIsLoading]   = useState(true)
  const [posts, setPosts]           = useState<FeedPost[]>([])
  const [challengeOptions, setChallengeOptions] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    Promise.all([
      getFeedPosts(orgId),
      getOrgChallenges(orgId),
    ]).then(([feedPosts, challenges]) => {
      setPosts(feedPosts)
      setChallengeOptions(challenges.map(c => ({ id: c.id, name: c.name })))
    }).finally(() => setIsLoading(false))
  }, [orgId])

  const [showModal, setShowModal]         = useState(false)
  const [postType, setPostType]           = useState<PostType>('announcement')
  const [typeOpen, setTypeOpen]           = useState(false)
  const [postChallengeId, setPostChallengeId] = useState('')
  const [postTitle, setPostTitle]         = useState('')
  const [postContent, setPostContent]     = useState('')
  const [postPinned, setPostPinned]       = useState(false)
  const [postError, setPostError]         = useState('')
  // Filters
  const [filterType, setFilterType]             = useState<PostType | ''>('')
  const [filterChallenge, setFilterChallenge]   = useState('')
  const [search, setSearch]                     = useState('')

  // Edit modal
  const [editTarget, setEditTarget]       = useState<FeedPost | null>(null)
  const [editType, setEditType]           = useState<PostType>('announcement')
  const [editTypeOpen, setEditTypeOpen]   = useState(false)
  const [editChallengeId, setEditChallengeId] = useState('')
  const [editTitle, setEditTitle]         = useState('')
  const [editContent, setEditContent]     = useState('')
  const [editPinned, setEditPinned]       = useState(false)
  const [editError, setEditError]         = useState('')

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<FeedPost | null>(null)

  function openModal() {
    setPostType('announcement')
    setPostChallengeId('')
    setPostTitle('')
    setPostContent('')
    setPostPinned(false)
    setPostError('')
    setShowModal(true)
  }

  async function handlePublish() {
    if (!postTitle.trim())   { setPostError('Title is required.'); return }
    if (!postContent.trim()) { setPostError('Content is required.'); return }
    const { data: newPost } = await createFeedPost(orgId, null, {
      type: postType,
      title: postTitle.trim(),
      content: postContent.trim(),
      challengeId: postChallengeId || undefined,
      pinned: postPinned,
    })
    if (newPost) {
      // Reload to get author/challenge name resolved
      getFeedPosts(orgId).then(setPosts)
    }
    setShowModal(false)
  }

  function openEdit(post: FeedPost) {
    setEditTarget(post)
    setEditType(post.type)
    const matchedCh = challengeOptions.find(c => c.name === post.challenge)
    setEditChallengeId(matchedCh?.id ?? '')
    setEditTitle(post.title)
    setEditContent(post.content)
    setEditPinned(post.pinned)
    setEditError('')
  }

  async function handleSaveEdit() {
    if (!editTitle.trim())   { setEditError('Title is required.'); return }
    if (!editContent.trim()) { setEditError('Content is required.'); return }
    await updateFeedPost(editTarget!.id, {
      type: editType,
      title: editTitle.trim(),
      content: editContent.trim(),
      challengeId: editChallengeId || undefined,
      pinned: editPinned,
    })
    getFeedPosts(orgId).then(setPosts)
    setEditTarget(null)
  }

  async function togglePin(id: string) {
    const post = posts.find(p => p.id === id)
    if (!post) return
    await togglePinPost(id, !post.pinned)
    setPosts(prev => prev.map(p => p.id === id ? { ...p, pinned: !p.pinned } : p))
  }

  async function deletePost(id: string) {
    await deleteFeedPost(id)
    setPosts(prev => prev.filter(p => p.id !== id))
    setDeleteTarget(null)
  }

  const filtered = useMemo(() => {
    let result = [...posts]
    result.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
    if (filterType)      result = result.filter(p => p.type === filterType)
    if (filterChallenge) result = result.filter(p => p.challenge === filterChallenge)
    if (search)          result = result.filter(p =>
      p.title.toLowerCase().includes(search.toLowerCase())   ||
      p.content.toLowerCase().includes(search.toLowerCase()) ||
      p.author.toLowerCase().includes(search.toLowerCase())
    )
    return result
  }, [posts, filterType, filterChallenge, search])

  const cfg = postTypeConfig[postType]

  if (isLoading) return <FeedSkeleton />

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl text-foreground">Feed</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Activity and announcements for this organization</p>
        </div>
        <Button onClick={openModal} className="gap-1.5" size="sm">
          <Plus className="w-3.5 h-3.5" /> Create Post
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Posts',  value: posts.length },
          { label: 'Pinned',       value: posts.filter(p => p.pinned).length },
          { label: 'By System',    value: posts.filter(p => p.authorRole === 'system').length },
          { label: 'By Admins',    value: posts.filter(p => p.authorRole === 'admin').length },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl px-4 py-3">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-xl font-bold text-foreground mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-44 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            placeholder="Search posts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 h-9 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          />
        </div>

        <div className="relative">
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value as PostType | '')}
            className={cn(
              'appearance-none h-9 pl-3 pr-8 rounded-lg border border-input bg-background text-sm',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 cursor-pointer',
              !filterType ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            <option value="">All Types</option>
            {POST_TYPES.map(([type, c]) => (
              <option key={type} value={type}>{c.emoji} {c.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        </div>

        <div className="relative">
          <select
            value={filterChallenge}
            onChange={e => setFilterChallenge(e.target.value)}
            className={cn(
              'appearance-none h-9 pl-3 pr-8 rounded-lg border border-input bg-background text-sm',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 cursor-pointer',
              !filterChallenge ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            <option value="">All Challenges</option>
            {challengeOptions.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        </div>
      </div>

      {/* Feed */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl py-14 text-center text-sm text-muted-foreground">
            No posts match your filters.
          </div>
        ) : filtered.map(post => (
          <PostCard key={post.id} post={post} onTogglePin={togglePin} onDelete={setDeleteTarget} onEdit={openEdit} />
        ))}
      </div>

      {/* ── Create Post Modal ───────────────────────────────────────────── */}
      <Dialog open={showModal} onOpenChange={v => { if (!v) setShowModal(false) }}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Create Feed Post</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Post Type + Challenge */}
            <div className="grid grid-cols-2 gap-3">
              {/* Post Type */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Post Type</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setTypeOpen(v => !v)}
                    className="w-full flex items-center gap-2 h-9 pl-3 pr-8 rounded-lg border border-input bg-background text-sm text-foreground text-left focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                  >
                    <span>{cfg.emoji}</span>
                    <span className="truncate">{cfg.label}</span>
                  </button>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />

                  {typeOpen && (
                    <div className="absolute z-50 top-full mt-1 left-0 w-56 bg-popover border border-border rounded-xl shadow-lg overflow-hidden py-1">
                      {POST_TYPES.map(([type, c]) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => { setPostType(type); setTypeOpen(false) }}
                          className={cn(
                            'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors',
                            type === postType
                              ? 'bg-primary text-primary-foreground'
                              : 'text-foreground hover:bg-muted/60',
                          )}
                        >
                          <span className="w-3 shrink-0 text-xs">{type === postType ? '✓' : ''}</span>
                          <span>{c.emoji}</span>
                          <span>{c.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Challenge */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Challenge (optional)</label>
                <div className="relative">
                  <select
                    value={postChallengeId}
                    onChange={e => setPostChallengeId(e.target.value)}
                    className={cn(
                      'w-full appearance-none h-9 pl-3 pr-8 rounded-lg border border-input bg-background text-sm',
                      'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 cursor-pointer',
                      !postChallengeId ? 'text-muted-foreground' : 'text-foreground',
                    )}
                  >
                    <option value="">All challenges</option>
                    {challengeOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                </div>
              </div>
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Title</label>
              <input
                type="text"
                placeholder="e.g. Week 4 Starts Now! 🏆"
                value={postTitle}
                onChange={e => { setPostTitle(e.target.value); setPostError('') }}
                className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              />
            </div>

            {/* Content */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Content</label>
              <textarea
                rows={4}
                placeholder="Write your post..."
                value={postContent}
                onChange={e => { setPostContent(e.target.value); setPostError('') }}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 resize-none"
              />
              {postError && <p className="text-xs text-destructive">{postError}</p>}
            </div>

            {/* Pin checkbox */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                checked={postPinned}
                onChange={e => setPostPinned(e.target.checked)}
                className="w-4 h-4 rounded border border-input accent-primary cursor-pointer"
              />
              <span className="text-sm text-foreground">Pin this post to the top of the feed</span>
            </label>
          </div>

          {/* Separator + footer */}
          <div className="border-t border-border mt-2" />
          <DialogFooter showCloseButton={false} className="flex-row gap-2 pt-4">
            <button
              onClick={() => setShowModal(false)}
              className={cn(buttonVariants({ variant: 'outline' }), 'flex-1')}
            >
              Cancel
            </button>
            <Button onClick={handlePublish} className="flex-1">
              Publish Post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Post Modal ─────────────────────────────────────────────── */}
      {editTarget && (
        <Dialog open onOpenChange={v => { if (!v) setEditTarget(null) }}>
          <DialogContent className="sm:max-w-md" showCloseButton>
            <DialogHeader>
              <DialogTitle>Edit Post</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Post Type + Challenge */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Post Type</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setEditTypeOpen(v => !v)}
                      className="w-full flex items-center gap-2 h-9 pl-3 pr-8 rounded-lg border border-input bg-background text-sm text-foreground text-left focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                    >
                      <span>{postTypeConfig[editType].emoji}</span>
                      <span className="truncate">{postTypeConfig[editType].label}</span>
                    </button>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    {editTypeOpen && (
                      <div className="absolute z-50 top-full mt-1 left-0 w-56 bg-popover border border-border rounded-xl shadow-lg overflow-hidden py-1">
                        {POST_TYPES.map(([type, c]) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => { setEditType(type); setEditTypeOpen(false) }}
                            className={cn(
                              'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors',
                              type === editType
                                ? 'bg-primary text-primary-foreground'
                                : 'text-foreground hover:bg-muted/60',
                            )}
                          >
                            <span className="w-3 shrink-0 text-xs">{type === editType ? '✓' : ''}</span>
                            <span>{c.emoji}</span>
                            <span>{c.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Challenge (optional)</label>
                  <div className="relative">
                    <select
                      value={editChallengeId}
                      onChange={e => setEditChallengeId(e.target.value)}
                      className={cn(
                        'w-full appearance-none h-9 pl-3 pr-8 rounded-lg border border-input bg-background text-sm',
                        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 cursor-pointer',
                        !editChallengeId ? 'text-muted-foreground' : 'text-foreground',
                      )}
                    >
                      <option value="">All challenges</option>
                      {challengeOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => { setEditTitle(e.target.value); setEditError('') }}
                  className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Content</label>
                <textarea
                  rows={4}
                  value={editContent}
                  onChange={e => { setEditContent(e.target.value); setEditError('') }}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 resize-none"
                />
                {editError && <p className="text-xs text-destructive">{editError}</p>}
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={editPinned}
                  onChange={e => setEditPinned(e.target.checked)}
                  className="w-4 h-4 rounded border border-input accent-primary cursor-pointer"
                />
                <span className="text-sm text-foreground">Pin this post to the top of the feed</span>
              </label>
            </div>

            <div className="border-t border-border mt-2" />
            <DialogFooter showCloseButton={false} className="flex-row gap-2 pt-4">
              <button
                onClick={() => setEditTarget(null)}
                className={cn(buttonVariants({ variant: 'outline' }), 'flex-1')}
              >
                Cancel
              </button>
              <Button onClick={handleSaveEdit} className="flex-1">
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete this post?</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              This will permanently remove the post from the feed.
            </p>
          </DialogHeader>
          <DialogFooter showCloseButton={false} className="flex-row justify-end gap-2">
            <button onClick={() => setDeleteTarget(null)} className={cn(buttonVariants({ variant: 'outline' }))}>
              Cancel
            </button>
            <Button onClick={() => deleteTarget && deletePost(deleteTarget.id)} className="bg-destructive text-white hover:bg-destructive/90">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Post Card ──────────────────────────────────────────────────────────────────

function PostCard({
  post,
  onTogglePin,
  onDelete,
  onEdit,
}: {
  post: FeedPost
  onTogglePin: (id: string) => void
  onDelete: (p: FeedPost) => void
  onEdit: (p: FeedPost) => void
}) {
  const cfg = postTypeConfig[post.type]

  return (
    <div className={cn(
      'bg-card border rounded-2xl p-4 sm:p-5 transition-colors',
      post.pinned ? 'border-amber-200 bg-amber-50/30' : 'border-border',
    )}>
      {/* Top: icon + pinned label + actions */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0',
            cfg.iconBg,
          )}>
            {cfg.emoji}
          </div>
          {post.pinned && (
            <span className="flex items-center gap-1 text-xs font-semibold text-amber-600">
              <Pin className="w-3 h-3" /> Pinned
            </span>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0">
            <MoreHorizontal className="w-4 h-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[148px]">
            {post.authorRole === 'admin' && (
              <DropdownMenuItem onClick={() => onEdit(post)} className="gap-2 whitespace-nowrap">
                <Pencil className="w-3.5 h-3.5 shrink-0" /> Edit Post
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onTogglePin(post.id)} className="gap-2 whitespace-nowrap">
              {post.pinned
                ? <><PinOff className="w-3.5 h-3.5 shrink-0" /> Unpin Post</>
                : <><Pin    className="w-3.5 h-3.5 shrink-0" /> Pin Post</>
              }
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(post)}
              variant="destructive"
              className="gap-2 whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" /> Delete Post
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Title */}
      <p className="font-bold text-foreground text-base leading-snug">{post.title}</p>

      {/* Body */}
      <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{post.content}</p>

      {/* Challenge tag */}
      {post.challenge && (
        <div className="mt-3">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full">
            🥦 {post.challenge}
          </span>
        </div>
      )}

      {/* Bottom row: author + reactions */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/60">
        {/* Author */}
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
            style={{ backgroundColor: post.avatarColor }}
          >
            {post.authorInitials}
          </div>
          <span className="text-xs text-muted-foreground">
            {post.author} · {post.date}
          </span>
        </div>

        {/* Reactions */}
        <div className="flex items-center gap-3">
          {(
            [
              { emoji: '🥦', count: post.reactions.broccoli },
              { emoji: '🔥', count: post.reactions.fire     },
              { emoji: '⭐', count: post.reactions.star     },
              { emoji: '❤️', count: post.reactions.heart    },
            ] as { emoji: string; count: number }[]
          ).map(r => (
            <span key={r.emoji} className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <span>{r.emoji}</span>
              {r.count > 0 && <span className="font-medium text-foreground">{r.count}</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Feed Skeleton ──────────────────────────────────────────────────────────────

function FeedSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-8 w-14 bg-muted rounded-md" />
          <div className="h-4 w-72 bg-muted rounded" />
        </div>
        <div className="h-8 w-28 bg-muted rounded-lg" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl px-4 py-3 space-y-1.5">
            <div className="h-3 w-20 bg-muted rounded" />
            <div className="h-7 w-8 bg-muted rounded" />
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="h-9 flex-1 min-w-44 max-w-xs bg-muted rounded-lg" />
        <div className="h-9 w-28 bg-muted rounded-lg" />
        <div className="h-9 w-36 bg-muted rounded-lg" />
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {[
          { lines: [1, 0.9, 0.75], hasTag: true  },
          { lines: [1, 0.95, 0.8], hasTag: true  },
          { lines: [1, 0.85],      hasTag: false  },
          { lines: [1, 0.9, 0.7],  hasTag: false  },
          { lines: [1, 0.8],       hasTag: true   },
        ].map((card, i) => (
          <div key={i} className="bg-card border border-border rounded-2xl p-4 sm:p-5">
            {/* Top */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="w-10 h-10 bg-muted rounded-full shrink-0" />
              <div className="w-7 h-7 bg-muted rounded-lg shrink-0" />
            </div>
            {/* Title */}
            <div className="h-5 bg-muted rounded w-3/5 mb-2" />
            {/* Body */}
            <div className="space-y-2">
              {card.lines.map((w, j) => (
                <div key={j} className="h-3.5 bg-muted rounded" style={{ width: `${w * 100}%` }} />
              ))}
            </div>
            {/* Tag */}
            {card.hasTag && <div className="mt-3 h-6 w-32 bg-muted rounded-full" />}
            {/* Bottom */}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/60">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-muted rounded-full shrink-0" />
                <div className="h-3.5 w-40 bg-muted rounded" />
              </div>
              <div className="flex items-center gap-3">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="h-4 w-5 bg-muted rounded" />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
