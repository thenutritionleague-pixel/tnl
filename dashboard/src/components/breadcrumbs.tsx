'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

const routeLabels: Record<string, string> = {
  dashboard:     'Dashboard',
  organizations: 'Organizations',
  challenges:    'Challenges',
  approvals:     'Approvals',
  teams:         'Teams',
  members:       'Members',
  admins:        'Admins',
  users:         'Users',
  invite:        'Invite',
  points:        'Points',
  events:        'Events',
  feed:          'Feed',
  policies:      'Policies',
  settings:      'Settings',
  new:           'New',
  edit:          'Edit',
}

// Mock org name map — replace with real lookup when Supabase is connected
const orgNames: Record<string, string> = {
  '1': 'Yi Mumbai',
  '2': 'Yi Delhi',
  '3': 'Yi Bangalore',
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function Breadcrumbs() {
  const pathname = usePathname()
  const allSegments = pathname.split('/').filter(Boolean)
  const segments = allSegments.filter(s => !uuidPattern.test(s))

  // Detect org context: /organizations/[id]/...
  const orgContextIdx = allSegments.indexOf('organizations')
  const orgId = orgContextIdx !== -1 ? allSegments[orgContextIdx + 1] : null

  const segmentHrefs = segments.map((seg) => {
    const idx = allSegments.indexOf(seg)
    return '/' + allSegments.slice(0, idx + 1).join('/')
  })

  function getLabel(segment: string): string {
    if (orgId && segment === orgId) {
      return orgNames[segment] ?? `Org ${segment}`
    }
    return routeLabels[segment] || segment
  }

  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground">
      {segments.map((segment, i) => {
        const href = segmentHrefs[i]
        const isLast = i === segments.length - 1
        const label = getLabel(segment)

        return (
          <span key={href} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3.5 h-3.5" />}
            {isLast ? (
              <span className="text-foreground font-medium capitalize">{label}</span>
            ) : (
              <Link href={href} className="hover:text-foreground transition-colors capitalize">
                {label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
