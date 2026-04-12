import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Middleware: forwards the current pathname as an x-pathname header
 * so that server components (layout.tsx) can read it for route guards.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next()
  response.headers.set('x-pathname', request.nextUrl.pathname)
  return response
}

export const config = {
  // Run on all dashboard routes, skip static assets / API / _next
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
