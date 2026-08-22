#!/usr/bin/env node
/**
 * Find reused videos.
 *
 * Images have had duplicate detection since migration 049 (dHash + Hamming).
 * Videos have had NONE -- proof_hash is null for every one of them -- so a
 * member could upload the same clip every day and each submission was judged
 * as if it were new. Found 22 Aug 2026: one member submitted a byte-identical
 * 50.1s burpee video on 20, 21 and 22 Aug. All three were approved, 600 points.
 *
 * Bunny generates a thumbnail from a fixed frame position, so the SHA-256 of
 * that JPEG is an exact-match fingerprint: same source file => same thumbnail
 * bytes. This finds exact reuses, not re-encodes or trims -- for those you need
 * perceptual hashing of several frames, which belongs in the edge function.
 *
 * A placeholder thumbnail (failed transcode) would otherwise group hundreds of
 * unrelated videos together, so any group larger than --max-group is reported
 * as suspected-placeholder rather than as cheating. That is the same trap
 * migration 049 fixed for images.
 *
 *   cd dashboard && node scripts/video-duplicates.mjs
 *   node scripts/video-duplicates.mjs --org <uuid> --json
 *   node scripts/video-duplicates.mjs --write     # persist for the Duplicates page
 *
 * --write stores the thumbnail fingerprint on every video, then for the ones
 * that actually landed in a duplicate group it downloads the MP4 and records
 * the full-file SHA-256, byte size and duration. That second pass is the
 * evidence an admin shows a member whose points are revoked: "identical file,
 * same 3,110,336 bytes, same SHA" is checkable, "our system flagged it" is not.
 * It runs only over flagged rows, so it is ~140 downloads and not 3,222.
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const envPath = path.join(process.cwd(), '.env.local')
if (!fs.existsSync(envPath)) {
  console.error('Run this from the dashboard/ directory (.env.local not found).')
  process.exit(1)
}
const env = fs.readFileSync(envPath, 'utf8')
const cfg = k => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim()

const URL_  = cfg('NEXT_PUBLIC_SUPABASE_URL')
const SVC   = cfg('SUPABASE_SERVICE_ROLE_KEY')
const HOST  = cfg('BUNNY_CDN_HOSTNAME')
const TOKEN = cfg('BUNNY_TOKEN_AUTH_KEY')

const args     = process.argv.slice(2)
const argVal   = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const JSON_OUT = args.includes('--json')
const MAX_GROUP = Number(argVal('--max-group') ?? 25)
const CONC      = Number(argVal('--concurrency') ?? 16)
const WRITE     = args.includes('--write')

function sign(p, ttl = 7200) {
  if (!TOKEN) return `https://${HOST}${p}`
  const exp = Math.floor(Date.now() / 1000) + ttl
  const md5 = crypto.createHash('md5').update(TOKEN + p + String(exp)).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `https://${HOST}${p}?token=${md5}&expires=${exp}`
}

const H_ = { apikey: SVC, Authorization: `Bearer ${SVC}` }
const q  = p => fetch(`${URL_}/rest/v1/${p}`, { headers: H_ }).then(r => r.json())

let orgId = argVal('--org')
if (!orgId) {
  const chs = await q('challenges?select=org_id&status=eq.active&limit=1')
  orgId = chs[0]?.org_id
  if (!orgId) { console.error('No active challenge; pass --org <uuid>.'); process.exit(1) }
}

// PostgREST caps a response at 1000 rows however large the limit, so page it.
// Getting this wrong is what made the first Duplicates page report zero groups.
// The ORDER BY must be on a UNIQUE column. Paging an unstable order lets rows
// shift between requests, so the same row comes back on two pages and others
// are skipped entirely. Ordering by submitted_date did exactly that here and
// inflated the first run's duplicate counts -- a member with 3 submissions was
// reported as having 4, which would have meant accusing people over an
// artefact of my own paging.
async function all(pathBase) {
  const out = []
  const seen = new Set()
  const joiner = pathBase.includes('?') ? '&' : '?'
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${URL_}/rest/v1/${pathBase}${joiner}order=id.asc`, {
      headers: { ...H_, Range: `${from}-${from + 999}` },
    })
    const page = await res.json()
    if (!Array.isArray(page) || page.length === 0) break
    for (const row of page) {
      if (row?.id && seen.has(row.id)) continue   // belt and braces
      if (row?.id) seen.add(row.id)
      out.push(row)
    }
    if (page.length < 1000) break
  }
  return out
}

const sel = 'id,user_id,task_id,submitted_date,status,points_awarded,proof_url'
const subs = await all(
  `task_submissions?select=${sel}&org_id=eq.${orgId}&proof_url=like.bunny://*`
)
if (!JSON_OUT) console.error(`Fingerprinting ${subs.length} videos ...`)

const profiles = await all(`profiles?select=id,name,email&org_id=eq.${orgId}`)
const tasks    = await all(`tasks?select=id,title`)
const pName = Object.fromEntries(profiles.map(p => [p.id, p.name]))
const pMail = Object.fromEntries(profiles.map(p => [p.id, p.email]))
const tName = Object.fromEntries(tasks.map(t => [t.id, t.title]))

// ---------- duration, read from the mp4 header ----------
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

async function patch(id, body) {
  const res = await fetch(`${URL_}/rest/v1/task_submissions?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...H_, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${id}: ${res.status} ${await res.text()}`)
}

// ---------- fingerprint ----------
async function fingerprint(sub) {
  const guid = sub.proof_url.replace('bunny://', '')
  try {
    const res = await fetch(sign(`/${guid}/thumbnail.jpg`))
    if (!res.ok) return { ...sub, guid, hash: null, why: `HTTP ${res.status}` }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 512) return { ...sub, guid, hash: null, why: 'thumbnail too small' }
    return { ...sub, guid, hash: crypto.createHash('sha256').update(buf).digest('hex') }
  } catch (e) {
    return { ...sub, guid, hash: null, why: String(e.message || e).slice(0, 60) }
  }
}

const done = []
let idx = 0, completed = 0
await Promise.all(Array.from({ length: CONC }, async () => {
  while (idx < subs.length) {
    const mine = subs[idx++]
    done.push(await fingerprint(mine))
    if (!JSON_OUT && ++completed % 250 === 0) console.error(`  ${completed}/${subs.length}`)
  }
}))

// ---------- group ----------
const byHash = new Map()
for (const d of done) {
  if (!d.hash) continue
  if (!byHash.has(d.hash)) byHash.set(d.hash, [])
  byHash.get(d.hash).push(d)
}

const groups = [...byHash.entries()]
  .filter(([, rows]) => rows.length > 1)
  .map(([hash, rows]) => {
    const members = new Set(rows.map(r => r.user_id))
    const taskIds = new Set(rows.map(r => r.task_id))
    return {
      hash: hash.slice(0, 16),
      count: rows.length,
      distinctMembers: members.size,
      distinctTasks: taskIds.size,
      // Which rule was broken matters more than the raw count.
      kind: members.size > 1 ? 'SHARED ACROSS MEMBERS'
          : taskIds.size > 1 ? 'one member, several different tasks'
          : 'one member, same task on different days',
      placeholder: rows.length > MAX_GROUP,
      approvedPoints: rows.filter(r => r.status === 'approved')
                          .reduce((a, r) => a + (r.points_awarded || 0), 0),
      rows: rows.map(r => ({
        member: pName[r.user_id] || r.user_id,
        email: pMail[r.user_id],
        task: tName[r.task_id] || r.task_id,
        date: r.submitted_date,
        status: r.status,
        points: r.points_awarded,
        guid: r.guid,
      })),
    }
  })
  .sort((a, b) => b.approvedPoints - a.approvedPoints || b.count - a.count)

// ---------- persist ----------
if (WRITE) {
  const real0 = groups.filter(g => !g.placeholder)
  const flagged = new Set(real0.flatMap(g => g.rows.map(r => r.guid)))

  // Every scanned video gets its fingerprint, so the Duplicates page and any
  // future submission can be compared without re-downloading anything.
  let wrote = 0, failedWrites = 0
  let wi = 0
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (wi < done.length) {
      const d = done[wi++]
      if (!d.hash) continue
      try { await patch(d.id, { video_fingerprint: d.hash }); wrote++ }
      catch (e) { failedWrites++; if (failedWrites < 4) console.error('  ' + e.message) }
    }
  }))
  console.error(`Stored ${wrote} fingerprints (${failedWrites} failed).`)

  // Hard evidence, only for videos already in a group.
  const toProve = done.filter(d => d.hash && flagged.has(d.guid))
  let proved = 0, pi = 0
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (pi < toProve.length) {
      const d = toProve[pi++]
      for (const r of ['240p', '360p', '480p', '720p']) {
        try {
          const res = await fetch(sign(`/${d.guid}/play_${r}.mp4`))
          if (!res.ok) continue
          const buf = Buffer.from(await res.arrayBuffer())
          const dur = findMvhd(buf)
          await patch(d.id, {
            video_file_sha: crypto.createHash('sha256').update(buf).digest('hex'),
            video_bytes: buf.length,
            video_seconds: dur ? Math.round(dur * 10) / 10 : null,
          })
          proved++
          break
        } catch { /* try next rendition */ }
      }
    }
  }))
  console.error(`Stored full-file evidence for ${proved}/${toProve.length} flagged videos.`)
}

const real = groups.filter(g => !g.placeholder)
const suspectedPlaceholder = groups.filter(g => g.placeholder)
const failed = done.filter(d => !d.hash)

if (JSON_OUT) {
  console.log(JSON.stringify({ scanned: done.length, groups: real, suspectedPlaceholder, failed }, null, 2))
} else {
  console.log(`\nScanned ${done.length} videos, ${failed.length} unreadable.\n`)
  console.log(`Reused videos: ${real.length} groups, `
    + `${real.reduce((a, g) => a + g.count, 0)} submissions, `
    + `${real.reduce((a, g) => a + g.approvedPoints, 0).toLocaleString()} approved points.\n`)
  for (const g of real) {
    console.log(`[${g.kind}] x${g.count}  ${g.approvedPoints} pts  (${g.hash})`)
    for (const r of g.rows) {
      console.log(`   ${String(r.member).padEnd(26)} ${r.date}  ${String(r.status).padEnd(9)}`
        + `${String(r.points ?? '-').padStart(4)}  ${r.task}`)
    }
    console.log('')
  }
  if (suspectedPlaceholder.length) {
    console.log(`Ignored ${suspectedPlaceholder.length} oversized group(s) as probable placeholder `
      + `thumbnails (> ${MAX_GROUP} videos sharing one image), not cheating.`)
  }
}
