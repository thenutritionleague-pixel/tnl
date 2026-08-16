#!/usr/bin/env node
/**
 * YiNL smoke test — run BEFORE and AFTER any shared change.
 *
 * Written after two outages on 16 Aug 2026 that had the same cause: a GRANT was
 * changed and only *some* consumers were re-tested.
 *   1. Revoking get_team_leaderboard_points broke the members' Leaderboard tab.
 *      A grep for `rpc('get_team_leaderboard_points'` missed it because the real
 *      call is split across two lines.
 *   2. Revoking from PUBLIC stripped service_role's inherited privilege, so the
 *      dashboard lost approval counts and rejection history.
 *
 * Neither would have shipped if every role had been exercised. So this checks
 * ALL THREE roles that touch the database:
 *   anon           — the login screen, before sign-in
 *   authenticated  — a real signed-in member (the mobile app)
 *   service_role   — the dashboard's server actions and pg_cron
 *
 * Usage:
 *   node scripts/smoke.mjs                 # run checks, print a table
 *   node scripts/smoke.mjs --save baseline # record current results
 *   node scripts/smoke.mjs --diff baseline # compare against a recording
 *
 * Exit code is 1 if anything fails, so it can gate a deploy.
 *
 * Requires in dashboard/.env.local:
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *   SMOKE_MEMBER_EMAIL, SMOKE_MEMBER_PASSWORD   (a real member used read-only)
 */
import fs from 'node:fs'
import path from 'node:path'

const envPath = path.join(process.cwd(), '.env.local')
if (!fs.existsSync(envPath)) {
  console.error('Run this from the dashboard/ directory (.env.local not found).')
  process.exit(1)
}
const env = fs.readFileSync(envPath, 'utf8')
const cfg = k => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim()

const URL_ = cfg('NEXT_PUBLIC_SUPABASE_URL')
const ANON = cfg('NEXT_PUBLIC_SUPABASE_ANON_KEY')
const SVC  = cfg('SUPABASE_SERVICE_ROLE_KEY') || cfg('SUPABASE_SERVICE_KEY')
const MEMBER_EMAIL = cfg('SMOKE_MEMBER_EMAIL')
const MEMBER_PW    = cfg('SMOKE_MEMBER_PASSWORD')

const results = []
const record = (role, name, ok, detail = '') => {
  results.push({ role, name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${role.padEnd(14)} ${name}${ok ? '' : `  <-- ${detail}`}`)
}

const post = (p, headers, body) =>
  fetch(`${URL_}/rest/v1/rpc/${p}`, { method: 'POST', headers, body: JSON.stringify(body) })
const get = (p, headers) => fetch(`${URL_}/rest/v1/${p}`, { headers })

async function main() {
  console.log(`\nSmoke test against ${URL_}\n${'='.repeat(72)}`)

  // ---------- anon: what a visitor on the login screen can reach ----------
  const anonH = { apikey: ANON, 'Content-Type': 'application/json' }
  {
    const r = await post('check_email_access', anonH, { lookup_email: 'nobody@example.com' })
    record('anon', 'check_email_access (login gate)', r.status === 200, `HTTP ${r.status}`)
  }
  {
    // Must STAY blocked: the anon key is public, in every client bundle.
    const r = await post('increment_member_points', anonH,
      { p_user_id: '00000000-0000-0000-0000-000000000000', p_amount: 1 })
    record('anon', 'increment_member_points IS BLOCKED', r.status >= 400, `HTTP ${r.status} — anyone could award points!`)
  }

  // ---------- authenticated: the member app ----------
  let memberOk = false, mh = null, me = null, challengeIds = [], teamId = null
  if (MEMBER_EMAIL && MEMBER_PW) {
    const s = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: anonH,
      body: JSON.stringify({ email: MEMBER_EMAIL, password: MEMBER_PW }),
    }).then(r => r.json())
    memberOk = !!s.access_token
    record('authenticated', 'member sign-in', memberOk, 'check SMOKE_MEMBER_* in .env.local')
    if (memberOk) {
      mh = { apikey: ANON, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' }
      me = (await get(`profiles?select=id,org_id&auth_id=eq.${s.user.id}`, mh).then(r => r.json()))[0]
      challengeIds = (await get(`challenges?select=id&org_id=eq.${me.org_id}`, mh).then(r => r.json())).map(c => c.id)
      teamId = (await get(`team_members?select=team_id&user_id=eq.${me.id}&org_id=eq.${me.org_id}`, mh)
        .then(r => r.json()))[0]?.team_id ?? null
    }
  } else {
    record('authenticated', 'member sign-in', false, 'SMOKE_MEMBER_EMAIL / SMOKE_MEMBER_PASSWORD not set')
  }

  if (memberOk) {
    // Every RPC the mobile app calls. get_team_leaderboard_points is here
    // because missing it is precisely what broke the Leaderboard tab.
    const rpcs = [
      ['get_mobile_tasks',            { p_team_id: teamId, p_org_id: me.org_id }],
      ['get_active_challenge',        { p_org_id: me.org_id }],
      ['get_team_leaderboard_points', { p_challenge_ids: challengeIds }],
      ['get_team_weekly_pts',         { p_team_id: teamId, p_org_id: me.org_id, p_challenge_id: challengeIds[0] }],
    ]
    for (const [name, body] of rpcs) {
      const r = await post(name, mh, body)
      record('authenticated', `rpc ${name}`, r.status === 200, `HTTP ${r.status}`)
    }
    // Every table the app reads.
    for (const t of ['profiles', 'teams', 'team_members', 'challenges', 'task_submissions',
                     'points_transactions', 'feed_items', 'feed_reactions', 'messages',
                     'events', 'event_participations', 'policies', 'invite_whitelist']) {
      const r = await get(`${t}?select=*&limit=1`, mh)
      record('authenticated', `read ${t}`, r.status === 200, `HTTP ${r.status}`)
    }
    // Must STAY blocked.
    const r = await post('increment_member_points', mh, { p_user_id: me.id, p_amount: 1 })
    record('authenticated', 'increment_member_points IS BLOCKED', r.status >= 400, `HTTP ${r.status}`)
  }

  // ---------- service_role: the dashboard's server actions + pg_cron ----------
  // This whole block exists because it was the gap the second time: everything
  // member-facing passed while the dashboard was broken.
  const sh = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' }
  const org = me?.org_id ?? (await get('organizations?select=id&limit=1', sh).then(r => r.json()))[0]?.id
  const challenge = (await get(`challenges?select=id&org_id=eq.${org}&limit=1`, sh).then(r => r.json()))[0]?.id
  const dashRpcs = [
    ['get_approval_counts',        { org_id_param: org }],
    ['get_org_task_breakdown',     { org_id_param: org }],
    ['get_org_rejection_history',  { org_id_param: org, limit_param: 5, offset_param: 0, task_filter: null }],
    ['get_challenge_report_stats', { challenge_id_param: challenge }],
  ]
  for (const [name, body] of dashRpcs) {
    const r = await post(name, sh, body)
    record('service_role', `rpc ${name}`, r.status === 200, `HTTP ${r.status}`)
  }
  for (const t of ['task_submissions', 'profiles', 'invite_whitelist', 'admin_users', 'teams']) {
    const r = await get(`${t}?select=*&limit=1`, sh)
    record('service_role', `read ${t}`, r.status === 200, `HTTP ${r.status}`)
  }

  // ---------- report ----------
  const failed = results.filter(r => !r.ok)
  console.log('='.repeat(72))
  console.log(`${results.length - failed.length}/${results.length} passed`)

  const arg = process.argv[2], file = process.argv[3]
  if (arg === '--save' && file) {
    fs.writeFileSync(`${file}.json`, JSON.stringify(results, null, 2))
    console.log(`baseline saved to ${file}.json`)
  }
  if (arg === '--diff' && file) {
    const before = JSON.parse(fs.readFileSync(`${file}.json`, 'utf8'))
    const key = r => `${r.role}|${r.name}`
    const map = new Map(before.map(r => [key(r), r.ok]))
    const regressions = results.filter(r => map.get(key(r)) === true && !r.ok)
    if (regressions.length) {
      console.log(`\nREGRESSIONS vs ${file} — these worked before your change:`)
      regressions.forEach(r => console.log(`  ${r.role} ${r.name}  (${r.detail})`))
      process.exit(1)
    }
    console.log(`\nNo regressions vs ${file}.`)
  }

  if (failed.length) { console.log('\nFAILURES:'); failed.forEach(r => console.log(`  ${r.role} ${r.name} — ${r.detail}`)) }
  process.exit(failed.length ? 1 : 0)
}

main().catch(e => { console.error('smoke test crashed:', e); process.exit(1) })
