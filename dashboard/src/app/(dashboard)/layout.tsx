import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUser, getAdminProfile } from '@/lib/auth'
import { AppSidebar } from '@/components/app-sidebar'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { UserNav } from '@/components/user-nav'
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
    created_by: null,
    created_at: new Date().toISOString(),
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar profile={activeProfile} />
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
