import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getUser, getAdminProfile } from '@/lib/auth'
import { AppSidebar } from '@/components/app-sidebar'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { UserNav } from '@/components/user-nav'
import type { AdminUser } from '@/types/database.types'
import { isPlatformRole } from '@/types/database.types'

// Extract org ID from pathname
const ORG_PATH_RE = /^\/organizations\/(?!new$)([^/]+)(\/.*)?$/

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Skip auth when Supabase is not yet configured (local UI dev)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const supabaseReady = supabaseUrl.startsWith('http') && !supabaseUrl.includes('placeholder')

  let profile: AdminUser | null = null

  if (supabaseReady) {
    const user = await getUser()
    if (!user) redirect('/login')
    profile = await getAdminProfile() as AdminUser | null
    if (!profile || profile.status !== 'active') {
      const supabase = await createClient()
      await supabase.auth.signOut()
      redirect('/login?error=unauthorized')
    }
  }

  // Placeholder profile for local UI development (no Supabase)
  const activeProfile: AdminUser = profile ?? {
    id: 'dev',
    user_id: 'dev',
    org_id: null,
    name: 'Dev Admin',
    email: 'dev@local.com',
    role: 'super_admin',
    status: 'active',
    created_by: null,
    created_at: new Date().toISOString(),
  }

  // ── Route guard for org-level admins ──────────────────────────────────
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') ?? headersList.get('x-next-url') ?? ''
  const orgMatch = pathname.match(ORG_PATH_RE)
  const urlOrgId = orgMatch?.[1] ?? null
  const isPlatform = isPlatformRole(activeProfile.role)

  if (!isPlatform && activeProfile.org_id) {
    const ownOrgPath = `/organizations/${activeProfile.org_id}`

    // If org admin is on a global page (no org in URL), redirect to their org
    if (!urlOrgId) {
      // Allow /settings as a personal page
      const isAllowedGlobal = pathname === '/settings'
      if (!isAllowedGlobal) {
        redirect(ownOrgPath)
      }
    }
    // If org admin tries to access a different org, redirect to their own
    else if (urlOrgId !== activeProfile.org_id) {
      redirect(ownOrgPath)
    }
  }

  // ── Fetch org name/emoji for sidebar ──────────────────────────────────
  let orgName: string | undefined
  let orgEmoji: string | undefined

  // Determine which org to fetch: from URL or from admin's own org_id
  const sidebarOrgId = urlOrgId ?? activeProfile.org_id
  if (sidebarOrgId && supabaseReady) {
    try {
      const adminClient = await createAdminClient()
      const { data: org } = await adminClient
        .from('organizations')
        .select('name, logo')
        .eq('id', sidebarOrgId)
        .maybeSingle()
      if (org) {
        orgName = org.name
        orgEmoji = org.logo
      }
    } catch {
      // Fallback silently — sidebar will show defaults
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar profile={activeProfile} orgName={orgName} orgEmoji={orgEmoji} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-6 bg-background z-10">
          <Breadcrumbs />
          <div className="ml-auto">
            <UserNav profile={activeProfile} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
