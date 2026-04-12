'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getAdminProfile } from '@/lib/auth'

async function checkAccess(orgId: string) {
  const profile = await getAdminProfile()
  if (!profile) return null
  if (profile.role === 'org_admin' && profile.org_id !== orgId) return null
  if (profile.role === 'sub_admin' && profile.org_id !== orgId) return null
  return profile
}

export interface EventInput {
  title: string
  description: string
  type: 'quiz' | 'offline'
  points: number
  location: string
  startTime: string   // ISO datetime string
  endTime: string     // ISO datetime string or empty
  status: 'upcoming' | 'completed'
}

export async function createEvent(orgId: string, data: EventInput) {
  const profile = await checkAccess(orgId)
  if (!profile) return { error: 'Unauthorized.' }

  const client = await createAdminClient()
  const { error } = await client.from('events').insert({
    org_id: orgId,
    title: data.title,
    description: data.description || null,
    type: data.type,
    points: data.points,
    location: data.location || null,
    start_time: data.startTime,
    end_time: data.endTime || null,
    status: data.status,
    is_active: data.status === 'upcoming',
  })
  if (error) return { error: error.message }
  revalidatePath(`/organizations/${orgId}/events`)
  return { success: true }
}

export async function updateEvent(orgId: string, eventId: string, data: EventInput) {
  const profile = await checkAccess(orgId)
  if (!profile) return { error: 'Unauthorized.' }

  const client = await createAdminClient()
  const { error } = await client
    .from('events')
    .update({
      title: data.title,
      description: data.description || null,
      type: data.type,
      points: data.points,
      location: data.location || null,
      start_time: data.startTime,
      end_time: data.endTime || null,
      status: data.status,
      is_active: data.status === 'upcoming',
    })
    .eq('id', eventId)
    .eq('org_id', orgId)
  if (error) return { error: error.message }
  revalidatePath(`/organizations/${orgId}/events`)
  return { success: true }
}

export async function deleteEvent(orgId: string, eventId: string) {
  const profile = await checkAccess(orgId)
  if (!profile) return { error: 'Unauthorized.' }

  const client = await createAdminClient()
  const { error } = await client.from('events').delete().eq('id', eventId).eq('org_id', orgId)
  if (error) return { error: error.message }
  revalidatePath(`/organizations/${orgId}/events`)
  return { success: true }
}
