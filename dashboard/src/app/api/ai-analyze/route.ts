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

  let body: { record?: { id?: string } }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const submissionId = body.record?.id

  if (!submissionId) {
    return NextResponse.json({ error: 'Missing record.id' }, { status: 400 })
  }

  // org_id is fetched from DB inside runAiAnalysis — never trusted from caller
  // Respond immediately — analysis runs in background
  runAiAnalysis(submissionId).catch(err =>
    console.error('[ai-analyze webhook] error:', err)
  )

  return NextResponse.json({ ok: true })
}
