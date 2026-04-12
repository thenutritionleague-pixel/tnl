import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // Skip auth in local dev (placeholder URL or missing config)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  const isConfigured = supabaseUrl.startsWith('http') && !supabaseUrl.includes('placeholder')
  if (!isConfigured) return supabaseResponse

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isAuthPage = request.nextUrl.pathname.startsWith('/login')
  const isDashboard = request.nextUrl.pathname.startsWith('/') && !isAuthPage

  if (!user && isDashboard && request.nextUrl.pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Org guard: org_admin/sub_admin can only access their own org
  const orgRouteMatch = request.nextUrl.pathname.match(/^\/organizations\/([^/]+)/)
  if (orgRouteMatch && orgRouteMatch[1] !== 'new' && user) {
    const urlOrgId = orgRouteMatch[1]
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('role, org_id')
      .eq('user_id', user.id)
      .single()

    if (adminUser) {
      const { role, org_id } = adminUser
      if ((role === 'org_admin' || role === 'sub_admin') && org_id !== urlOrgId) {
        return NextResponse.redirect(new URL(`/organizations/${org_id}`, request.url))
      }
      // super_admin / sub_super_admin have org_id = null — bypass, access any org
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
