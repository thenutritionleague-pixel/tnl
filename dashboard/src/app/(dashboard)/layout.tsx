import { redirect } from 'next/navigation'
import { Eye } from 'lucide-react'
import { headers } from 'next/headers'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getUser, getAdminProfile } from '@/lib/auth'
import { AppSidebar } from '@/components/app-sidebar'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { UserNav } from '@/components/user-nav'
import { getAllOrgShortNames } from '@/lib/supabase/admin-queries'
import type { AdminUser } from '@/types/database.types'

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
    read_only: false,
    created_by: null,
    created_at: new Date().toISOString(),
  }

  // ── Fetch org name/emoji for sidebar AND orgMap for breadcrumbs
  let orgName: string | undefined
  let orgEmoji: string | undefined
  let orgLogoUrl: string | undefined
  let orgMap: Record<string, string> = {}

  if (supabaseReady) {
    try {
      // This layout re-renders on EVERY navigation, so each await here is paid
      // on every page. The org-name map and the sidebar org row are independent
      // of one another — run them together rather than back to back.
      const headersList = await headers()
      const pathname = headersList.get('x-pathname') ?? ''
      const urlOrgMatch = pathname.match(/^\/organizations\/([^/]+)/)
      // For org_admin/sub_admin use their profile org_id.
      // For super admins viewing an org page, extract org ID from the URL pathname.
      const sidebarOrgId = activeProfile.org_id
        ?? (urlOrgMatch && urlOrgMatch[1] !== 'new' ? urlOrgMatch[1] : undefined)

      const [orgMapRes, orgRes] = await Promise.all([
        getAllOrgShortNames(),
        sidebarOrgId
          ? createAdminClient().then(c =>
              c.from('organizations')
                .select('name, logo, logo_url')
                .eq('id', sidebarOrgId)
                .maybeSingle())
          : Promise.resolve({ data: null }),
      ])

      orgMap = orgMapRes
      {
        const org = orgRes.data as { name: string; logo: string; logo_url: string | null } | null
        if (org) {
          orgName = org.name
          orgEmoji = org.logo
          orgLogoUrl = org.logo_url ?? undefined
        }
      }
    } catch {
      // Fallback silently — sidebar/breadcrumbs will show defaults
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar profile={activeProfile} orgName={orgName} orgEmoji={orgEmoji} orgLogoUrl={orgLogoUrl} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-6 bg-background z-10">
          <Breadcrumbs orgMap={orgMap} />
          <div className="ml-auto">
            <UserNav profile={activeProfile} />
          </div>
        </header>
        {activeProfile.read_only && (
          <div className="shrink-0 flex items-center gap-2 px-6 py-2 bg-amber-50 border-b border-amber-200 text-amber-900 text-sm">
            <Eye className="w-4 h-4 shrink-0" />
            <span>
              <strong className="font-semibold">View-only access.</strong>{' '}
              You can see everything here, but changes won&apos;t save. Ask your org admin if you need to approve or edit.
            </span>
          </div>
        )}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
