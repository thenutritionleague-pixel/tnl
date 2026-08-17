#!/usr/bin/env node
/**
 * YiNL video audit — finds submissions the AI is not built to catch.
 *
 * Written after Task 0 (16 Aug 2026), where two classes of bad submission were
 * auto-approved and only found by hand:
 *
 *   1. A DOWNLOADED clip. A produced fitness video with black letterbox bars, a
 *      burned-in "JUMPING JACKS" title card and a Christmas tree in the
 *      background, in August. Approved at 0.9 confidence.
 *   2. Clips FAR TOO SHORT to hold the reps — a 1.0s and a 1.37s video for a
 *      20-jumping-jack task. Both complete, valid 1080p30 files. Invisible to
 *      the AI by design: the video policy is anti-cheat only and rep counting
 *      is explicitly advisory.
 *
 * Both checks are cheap and need no AI:
 *   - DURATION is read from the MP4 moov/mvhd atom via a RANGED request, so a
 *     full event scans in ~2 minutes without downloading a single whole video.
 *   - PADDING BARS are measured from the Bunny thumbnail, decoded to a small
 *     grayscale grid with ffmpeg.
 *
 * Known false positive on the bar check: videos shot outdoors at night read as
 * letterboxed because the sky is genuinely black. Always eyeball a hit before
 * acting on it — this script triages, it does not judge.
 *
 * Usage (from dashboard/):
 *   node scripts/video-audit.mjs                # audit the active org
 *   node scripts/video-audit.mjs --org <uuid>
 *   node scripts/video-audit.mjs --min-seconds 15   # flag clips under 15s
 *   node scripts/video-audit.mjs --json         # machine-readable
 *
 * Requires in dashboard/.env.local:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   BUNNY_CDN_HOSTNAME, BUNNY_TOKEN_AUTH_KEY
 * Bar detection additionally needs ffmpeg on PATH (skipped with a note if absent).
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'

const envPath = path.join(process.cwd(), '.env.local')
if (!fs.existsSync(envPath)) {
  console.error('Run this from the dashboard/ directory (.env.local not found).')
  process.exit(1)
}
const env = fs.readFileSync(envPath, 'utf8')
const cfg = k => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim()

const URL_ = cfg('NEXT_PUBLIC_SUPABASE_URL')
const SVC  = cfg('SUPABASE_SERVICE_ROLE_KEY')
const HOST = cfg('BUNNY_CDN_HOSTNAME')
const TOKEN = cfg('BUNNY_TOKEN_AUTH_KEY')

const args = process.argv.slice(2)
const argVal = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const JSON_OUT = args.includes('--json')
const MIN_SECONDS = Number(argVal('--min-seconds') ?? 0) || null

function sign(p, ttl = 3600) {
  if (!TOKEN) return `https://${HOST}${p}`
  const exp = Math.floor(Date.now() / 1000) + ttl
  const md5 = crypto.createHash('md5').update(TOKEN + p + String(exp)).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `https://${HOST}${p}?token=${md5}&expires=${exp}`
}

// ---------- duration, without downloading the file ----------
function findMvhd(buf) {
  for (let i = 0; i < buf.length - 32; i++) {
    if (buf[i] === 0x6d && buf[i + 1] === 0x76 && buf[i + 2] === 0x68 && buf[i + 3] === 0x64) {
      const ver = buf[i + 4]
      if (ver === 0) {
        const ts = buf.readUInt32BE(i + 16), du = buf.readUInt32BE(i + 20)
        if (ts > 0) return du / ts
      } else if (ver === 1) {
        const ts = buf.readUInt32BE(i + 24), du = Number(buf.readBigUInt64BE(i + 28))
        if (ts > 0) return du / ts
      }
    }
  }
  return null
}
async function duration(guid) {
  // Smallest rendition first: its moov atom is nearest the head of the file.
  for (const r of ['240p', '360p', '480p', '720p']) {
    try {
      const res = await fetch(sign(`/${guid}/play_${r}.mp4`), { headers: { Range: 'bytes=0-131071' } })
      if (!res.ok && res.status !== 206) continue
      const d = findMvhd(Buffer.from(await res.arrayBuffer()))
      if (d) return Math.round(d * 10) / 10
    } catch { /* try next */ }
  }
  return null
}

// ---------- padding bars, from the thumbnail ----------
let FFMPEG = null
try { FFMPEG = (await import('ffmpeg-static')).default } catch { /* optional */ }
const W = 32, H = 64
function bars(file) {
  const b = execFileSync(FFMPEG, ['-v', 'error', '-i', file, '-vf', `scale=${W}:${H}`,
    '-pix_fmt', 'gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 })
  const row = y => { let s = 0; for (let x = 0; x < W; x++) s += b[y * W + x]; return s / W }
  const col = x => { let s = 0; for (let y = 0; y < H; y++) s += b[y * W + x]; return s / H }
  let top = 0, bot = 0, left = 0, right = 0
  while (top < H && row(top) < 18) top++
  while (bot < H && row(H - 1 - bot) < 18) bot++
  while (left < W && col(left) < 18) left++
  while (right < W && col(W - 1 - right) < 18) right++
  const pc = (n, d) => +(100 * n / d).toFixed(1)
  return { top: pc(top, H), bottom: pc(bot, H), left: pc(left, W), right: pc(right, W) }
}
const padded = b => (b.top >= 6 && b.bottom >= 6) || (b.left >= 6 && b.right >= 6)

// ---------- main ----------
const H_ = { apikey: SVC, Authorization: `Bearer ${SVC}` }
const q = p => fetch(`${URL_}/rest/v1/${p}`, { headers: H_ }).then(r => r.json())

let orgId = argVal('--org')
if (!orgId) {
  const chs = await q('challenges?select=org_id&status=eq.active&limit=1')
  orgId = chs[0]?.org_id
  if (!orgId) { console.error('No active challenge; pass --org <uuid>.'); process.exit(1) }
}

const rows = await q(`task_submissions?select=id,proof_url,status,ai_status,ai_confidence,ai_video_model,submitted_date,profiles:user_id(name,email),tasks:task_id(title,min_video_seconds)&org_id=eq.${orgId}&status=eq.approved&proof_url=like.bunny://*&limit=5000`)
if (!JSON_OUT) console.log(`\nAuditing ${rows.length} approved videos\n${'='.repeat(72)}`)

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yinl-audit-'))
const findings = []
let done = 0, unreadable = 0
const queue = [...rows]

async function worker() {
  while (queue.length) {
    const r = queue.shift()
    const guid = r.proof_url.replace('bunny://', '')
    const reasons = []

    const secs = await duration(guid)
    // Per-task minimum wins; --min-seconds is the fallback for a spot check.
    const floor = r.tasks?.min_video_seconds ?? MIN_SECONDS
    if (secs == null) unreadable++
    else if (floor && secs < floor) reasons.push(`only ${secs}s (task minimum ${floor}s)`)

    if (FFMPEG) {
      const f = path.join(tmp, `${guid}.jpg`)
      try {
        const res = await fetch(sign(`/${guid}/thumbnail.jpg`))
        if (res.ok) {
          fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()))
          const b = bars(f)
          if (padded(b)) reasons.push(`padding bars T${b.top} B${b.bottom} L${b.left} R${b.right} — possible downloaded clip`)
          fs.unlinkSync(f)
        }
      } catch { /* thumbnail unavailable */ }
    }

    if (reasons.length) {
      findings.push({
        name: r.profiles?.name ?? '?', email: r.profiles?.email ?? '',
        task: r.tasks?.title ?? '', date: r.submitted_date,
        seconds: secs, confidence: r.ai_confidence, model: r.ai_video_model,
        guid, submissionId: r.id, reasons,
      })
    }
    if (!JSON_OUT && ++done % 100 === 0) console.log(`  ...${done}/${rows.length}`)
  }
}
await Promise.all(Array.from({ length: 8 }, worker))
fs.rmSync(tmp, { recursive: true, force: true })

if (JSON_OUT) {
  console.log(JSON.stringify({ orgId, scanned: rows.length, unreadable, findings }, null, 2))
} else {
  console.log(`${'='.repeat(72)}`)
  if (!FFMPEG) console.log('NOTE: ffmpeg-static not installed — bar detection skipped (npm i -D ffmpeg-static).')
  console.log(`scanned ${rows.length}, duration unreadable ${unreadable}, findings ${findings.length}\n`)
  for (const f of findings) {
    console.log(`${f.name} <${f.email}>`)
    console.log(`   ${f.task} on ${f.date} — ${f.seconds ?? '?'}s, ${f.model ?? 'n/a'} @ ${f.confidence ?? 'n/a'}`)
    for (const r of f.reasons) console.log(`   • ${r}`)
    console.log(`   review: ${f.submissionId}\n`)
  }
  if (findings.length) {
    console.log('Eyeball every hit before acting. Night-time outdoor videos read as')
    console.log('letterboxed because the sky is black — that is a known false positive.')
  }
}
process.exit(findings.length ? 1 : 0)
