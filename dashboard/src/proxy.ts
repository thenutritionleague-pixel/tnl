import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', request.nextUrl.pathname)
  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

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

  const path = request.nextUrl.pathname
  const isAuthPage = path.startsWith('/login')
  // Webhooks authenticate with their own bearer secret and carry no session.
  const isMachineRoute = path.startsWith('/api/')
  const isDashboard = !isAuthPage && !isMachineRoute

  if (!user && isDashboard) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (user && isDashboard) {
    // Being signed in is NOT the same as being an admin. Members hold accounts
    // in the same Supabase project for the member app, so a member can mint a
    // valid JWT from the auth API and present it here as a cookie — never
    // touching the login page, which does gate on admin_users. Without this
    // check such a session reaches every server action in the app.
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('role, org_id, status')
      .eq('user_id', user.id)
      .single()

    if (!adminUser || adminUser.status !== 'active') {
      return NextResponse.redirect(new URL('/login?error=unauthorized', request.url))
    }

    // Org guard: org_admin/sub_admin can only reach their own org.
    // super_admin / sub_super_admin have org_id = null and may access any org.
    const orgRouteMatch = path.match(/^\/organizations\/([^/]+)/)
    if (orgRouteMatch && orgRouteMatch[1] !== 'new') {
      const { role, org_id } = adminUser
      if ((role === 'org_admin' || role === 'sub_admin') && org_id !== orgRouteMatch[1]) {
        return NextResponse.redirect(new URL(`/organizations/${org_id}`, request.url))
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
