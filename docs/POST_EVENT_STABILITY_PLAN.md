# Post-Event Stability Plan

**Start after 24 Aug 2026** (National Edition ends). Written 22 Aug, the morning
after a night in which five separate bugs reached members and one careless deploy
caused a 40-minute outage at peak hour.

The goal is not "write more tests". It is to remove the three structural reasons
those bugs were possible at all.

---

## Why the app feels unstable

Not carelessness, and not bad code. Three specific gaps:

**1. Nothing was watching.** Every bug on 21–22 Aug was invisible until a person
noticed a number. A member messaged about 1,000 points. A screenshot showed
15,040 next to 16,040. The orphan-recovery cron died and pg_cron logged the error
and moved on. Admin adjustments were silently discarded for three months.

*Partly fixed already* — `run_integrity_checks()` runs every 15 minutes
(migration 053). What remains is making an open alert reach a human.

**2. The same fact is computed in more than one place.** Team totals lived in
`team_points_view` **and** `get_team_weekly_pts`. One was fixed and shipped; the
other stayed broken. Duplicated logic always drifts.

**3. Everything is verified in production.** There is no staging. Changes are
deployed and then inspected. A bad edge-function deploy became a live outage
instead of a failed build.

---

## The work, in priority order

### 1. Staging Supabase project — *the one that makes everything else safe*

**Effort:** ~4 hours · **Risk:** none (nothing touches production)

A second Supabase project that mirrors production schema, seeded with anonymised
data. Every migration and edge-function change proves itself there first.

- Create the project; apply `supabase/migration_*.sql` in order to confirm the
  chain actually replays cleanly from scratch (it has never been tested)
- Seed one org, ~20 members, 3 teams, a challenge with 4 tasks, and a mix of
  approved / rejected / pending submissions
- Point a `.env.staging` at it
- **Acceptance:** `npm run smoke` and `invariants.sql` both pass on staging

This is the highest-value item. It converts "I think this works" into "I watched
this work" — and it is the precondition for App Store releases, where a bad build
is live for a week rather than a minute.

### 2. Behaviour tests in CI

**Effort:** ~6 hours · **Risk:** none

The current tests check permissions (`smoke.mjs`) and stored data
(`invariants.sql`). **Nothing asserts that the rules behave correctly.** Not one
of the 21 Aug bugs would have been caught by a browser test — they were logic and
data bugs.

Write these against staging, as SQL or a small Node runner:

| Rule | Assertion |
|---|---|
| Approval awards points | ledger, member total and team total all move by exactly the tier value |
| Rejection revokes | all three return to their prior values |
| One submission per member/task/day | a second insert raises 23505 |
| Team task once per team | a teammate's second attempt raises 23505 |
| `replace_own_submission` | swaps proof, moves no points, blocks a third attempt |
| Duplicate detection | distance 0 rejects, 1–8 goes to review, a degenerate hash is ignored |
| Post-event adjustment | counts while active, ignored once completed |
| Team total = sum of parts | across every team, after each of the above |

Run on every push. **A red test blocks the deploy.**

### 3. CI deploy for the edge function

**Effort:** ~2 hours · **Risk:** none

Today `analyze-submission` is deployed by pasting ~28KB of minified code into a
tool call. That is how it broke twice on 21 Aug — once with placeholder content,
once with `verify_jwt` silently flipped to true, which killed every cron call.

- GitHub Action on push to `main` when the function changes
- `supabase functions deploy analyze-submission --project-ref <ref>`
- **`verify_jwt` must stay false** — the crons and DB triggers call it without a
  JWT. Pin it in config, not in a human's memory.
- Post-deploy check: fire one known submission and assert it reaches a verdict.
  A deploy that lands but does not process is not a successful deploy.

### 4. Collapse the duplicated points logic

**Effort:** ~3 hours · **Risk:** medium — touches the leaderboard, do it on
staging first with test 8 above as the gate

`team_points_view` and `get_team_weekly_pts` compute the same total from the same
inputs. Make the RPC read the view, or derive both from one function. Invariant
14 asserts they agree; this removes the possibility of disagreement.

### 5. Remote kill switch — *required before App Store*

**Effort:** ~3 hours · **Risk:** low

A `feature_flags` table the app reads at startup and caches. Lets you disable a
broken feature without an app release.

Minimum flags: `replace_submission_enabled`, `video_upload_enabled`,
`ai_review_enabled`, plus a global `maintenance_message`.

On web a bug is fixed in minutes. On iOS review takes 1–7 days. Without this, a
bad release is live for a week. **This is the difference between shipping natively
being survivable and not.**

### 6. Alerting on integrity failures

**Effort:** ~1 hour · **Risk:** none

`integrity_alerts` records problems but nothing announces them. Add a cron that
posts any row with `resolved_at IS NULL` to email or WhatsApp. A monitor nobody
reads is a monitor that does not exist.

---

## Smaller items carried over from 21–22 Aug

- **OpenAI cost.** ~$15/day. Measured: `detail:low` changed ~7% of decisions and
  a shortened prompt changed far more, so neither is free. The real option is
  Gemini Flash for food photos (~70% cheaper) — **validate with an A/B over a few
  hundred already-decided submissions** before switching, not 14.
- **EXIF is stripped on upload.** If a photo's origin is ever disputed, that
  evidence is already gone. Consider retaining EXIF, or accept that pixel
  analysis is the only route.
- **Duplicate detection is per-member.** Two different members sharing one photo
  is still not detected. Cross-member comparison needs the degenerate-hash filter
  from migration 049 or it produces mass false positives.
- **Members with a fixed daily setup keep getting flagged** at 6–8 bits. Not
  cheating. Consider excluding the background region from the fingerprint, or
  accept the review load.
- **Read-only sub-admin** is built and live; nobody is flagged yet.

---

## Sequencing

**Week 1 after the event:** items 1, 2, 3 — staging, behaviour tests, CI deploy.
These are pure additions. Nothing they touch can break production.

**Week 2:** items 4, 5, 6 — the refactor, the kill switch, alerting. Item 4 is
the only one that touches live logic, and by then it has staging and tests
protecting it.

**Do not start any of this during an event.** Every failure on 21 Aug came from
changing a running system under time pressure.
