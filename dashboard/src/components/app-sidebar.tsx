'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Users, Trophy, Star, Building2,
  Rss, CalendarDays, FileText, Settings, Mail, LogOut, ArrowLeft,
  ClipboardCheck, ListChecks, UserCheck, UserCog,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { AdminUser } from '@/types/database.types'
import { isPlatformRole } from '@/types/database.types'
import { cn } from '@/lib/utils'

// ── Global nav — Super Admin only (4 items) ──────────────────────────────────
const globalNavSections = [
  {
    label: 'Platform',
    items: [
      { href: '/organizations', label: 'Organizations', icon: Building2 },
    ],
  },
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/admins',   label: 'Admins',   icon: UserCog  },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

// ── Org-scoped nav — shown when inside /organizations/[id]/* ─────────────────
function orgNavSections(orgId: string) {
  const base = `/organizations/${orgId}`
  return [
    {
      label: 'Overview',
      items: [
        { href: base, label: 'Dashboard', icon: LayoutDashboard, exact: true },
      ],
    },
    {
      label: 'Management',
      items: [
        { href: `${base}/challenges`, label: 'Challenges', icon: ListChecks    },
        { href: `${base}/approvals`,  label: 'Approvals',  icon: ClipboardCheck },
        { href: `${base}/teams`,      label: 'Teams',      icon: Users         },
        { href: `${base}/members`,    label: 'Members',    icon: UserCheck     },
        { href: `${base}/admins`,     label: 'Admins',     icon: UserCog       },
        { href: `${base}/invite`,     label: 'Invite',     icon: Mail          },
      ],
    },
    {
      label: 'Engagement',
      items: [
        { href: `${base}/points`,   label: 'Points',   icon: Star     },
        { href: `${base}/feed`,     label: 'Feed',     icon: Rss      },
        { href: `${base}/policies`, label: 'Policies', icon: FileText },
      ],
    },
    {
      label: 'Account',
      items: [
        { href: `${base}/settings`, label: 'Settings', icon: Settings },
      ],
    },
  ]
}

// ── Detect org context from pathname ─────────────────────────────────────────
const ORG_PATH_RE = /^\/organizations\/(?!new$)([^/]+)(\/.*)?$/

// ─────────────────────────────────────────────────────────────────────────────
export function AppSidebar({ profile, orgName, orgEmoji }: { profile: AdminUser; orgName?: string; orgEmoji?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const orgMatch = pathname.match(ORG_PATH_RE)
  const inOrgContext = !!orgMatch
  const orgId = orgMatch?.[1] ?? null

  // Only platform-level admins (super_admin, sub_super_admin) can see global nav
  const isPlatform = isPlatformRole(profile.role)

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="flex flex-col w-64 shrink-0 border-r border-border bg-background h-full">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="border-b border-border px-5 h-14 flex items-center">
        {inOrgContext && orgId ? (
          <div className="flex items-center gap-3 w-full min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-base select-none shrink-0">
              {orgEmoji ?? '🏢'}
            </div>
            <div className="leading-tight min-w-0">
              <p className="text-sm font-bold text-foreground truncate">
                {orgName ?? 'Organization'}
              </p>
              <p className="text-xs text-muted-foreground">Org Dashboard</p>
            </div>
          </div>
        ) : (
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-base select-none">
              🥦
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold text-foreground">Yi Nutrition League</p>
              <p className="text-xs text-muted-foreground">Admin</p>
            </div>
          </Link>
        )}
      </div>

      {/* ── Navigation ─────────────────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-4">
        {inOrgContext && orgId ? (
          <>
            {/* Back link — only for platform admins */}
            {isPlatform && (
              <>
                <Link
                  href="/organizations"
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/60"
                >
                  <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                  All Organizations
                </Link>
                <div className="h-px bg-border" />
              </>
            )}

            {/* Org-scoped sections */}
            {orgNavSections(orgId).map((section, sIdx) => (
              <div key={section.label}>
                {sIdx > 0 && <div className="h-px bg-border mb-3" />}
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 select-none">
                  {section.label}
                </p>
                <div className="space-y-0.5">
                  {section.items.map(item => {
                    const Icon = item.icon
                    const isActive = (item as { exact?: boolean }).exact
                      ? pathname === item.href
                      : pathname === item.href || pathname.startsWith(item.href + '/')
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={true}
                        className={cn(
                          'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                          isActive
                            ? 'bg-primary/10 text-primary border-l-2 border-primary font-medium'
                            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground border-l-2 border-transparent'
                        )}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </>
        ) : (
          /* Global nav (slim — 4 items only) */
          globalNavSections.map((section, sIdx) => (
            <div key={section.label}>
              {sIdx > 0 && <div className="h-px bg-border mb-3" />}
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 select-none">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map(item => {
                  const Icon = item.icon
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={true}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                        isActive
                          ? 'bg-primary/10 text-primary border-l-2 border-primary font-medium'
                          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground border-l-2 border-transparent'
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </nav>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="border-t border-border px-3 py-4 space-y-1">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-primary">
              {profile.name?.charAt(0)?.toUpperCase() || 'A'}
            </span>
          </div>
          <div className="overflow-hidden flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">{profile.name || 'Admin'}</p>
            <p className="text-xs text-muted-foreground truncate capitalize">
              {profile.role.replace(/_/g, ' ')}
            </p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors w-full border-l-2 border-transparent"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  )
}
