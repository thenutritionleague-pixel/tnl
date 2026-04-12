import { getAdminProfile } from '@/lib/auth'
import { SettingsForm } from './_components/settings-form'

export default async function SettingsPage() {
  const profile = await getAdminProfile()
  if (!profile) return null
  return <SettingsForm profile={profile} />
}
