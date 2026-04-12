'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { getAdminProfile } from '@/lib/auth'

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function createOrganization(data: {
  name: string
  logo: string
  country: string
  timezone: string
  adminName: string
  adminEmail: string
}) {
  const profile = await getAdminProfile()
  if (!profile || (profile.role !== 'super_admin' && profile.role !== 'sub_super_admin')) {
    return { error: 'Only platform admins can create organizations.' }
  }

  const client = await createAdminClient()
  const slug = toSlug(data.name)

  // Check slug uniqueness
  const { data: existing } = await client
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (existing) return { error: `An organization with the slug "${slug}" already exists.` }

  // Check org admin email uniqueness
  const { data: existingAdmin } = await client
    .from('admin_users')
    .select('id')
    .eq('email', data.adminEmail)
    .maybeSingle()
  if (existingAdmin) return { error: 'An admin with this email already exists.' }

  // Insert organization
  const { data: org, error: orgError } = await client
    .from('organizations')
    .insert({
      name: data.name,
      slug,
      logo: data.logo,
      country: data.country,
      timezone: data.timezone,
      is_active: true,
    })
    .select('id')
    .single()
  if (orgError) return { error: orgError.message }

  // Insert org admin into admin_users
  const { error: adminError } = await client.from('admin_users').insert({
    name: data.adminName || data.adminEmail.split('@')[0],
    email: data.adminEmail,
    role: 'org_admin',
    status: 'active',
    org_id: org.id,
    created_by: profile.id,
  })
  if (adminError) {
    // Roll back org if admin insert fails
    await client.from('organizations').delete().eq('id', org.id)
    return { error: adminError.message }
  }

  return { orgId: org.id }
}
