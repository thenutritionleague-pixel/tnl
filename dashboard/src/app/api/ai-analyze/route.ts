import { NextRequest, NextResponse } from 'next/server'
import { runAiAnalysis } from '@/app/(dashboard)/organizations/[id]/approvals/ai-actions'

const WEBHOOK_SECRET = process.env.AI_WEBHOOK_SECRET

export async function POST(req: NextRequest) {
  if (!WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { record?: { id?: string; org_id?: string } }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const submissionId = body.record?.id
  const orgId = body.record?.org_id

  if (!submissionId || !orgId) {
    return NextResponse.json({ error: 'Missing record.id or record.org_id' }, { status: 400 })
  }

  // Respond immediately — analysis runs in background
  runAiAnalysis(submissionId, orgId).catch(err =>
    console.error('[ai-analyze webhook] error:', err)
  )

  return NextResponse.json({ ok: true })
}
