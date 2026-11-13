# Bunny → Gumlet migration plan

Status: **BUILT + backend LIVE (13 Nov 2026).** Edge functions `gumlet-upload`,
`gumlet-webhook`, `analyze-submission` (v89+) deployed; migration 095 applied; Flutter +
dashboard changes ship with the next Netlify build. Still open: §6 delete-after-decision
sweep, §7 peak load test. Original plan written 9 Nov 2026 below.
Bunny account is **deactivated**. Gumlet is the 100% replacement, not a side-by-side.

---

## 0. Read first — blocking facts

1. **Video upload is broken right now.** The live web app still uploads to Bunny
   (`bunny-upload-init` → TUS to `video.bunnycdn.com`). With the account off, every
   video submission fails at upload. Any instance that runs before this migration
   ships must have **no video-proof tasks**, or members cannot submit.
2. **Old videos are gone from playback.** Every `bunny://<guid>` row (7,231 on
   National, 157 on Gurugram) now points at a dead CDN. Dashboard must show
   "video no longer available" for these instead of a broken player. Do not
   touch their status or points.
3. **Gumlet plan is 3,000 storage minutes.** Gumlet counts *input minutes stored*.
   National produced ~7,231 videos × ~56 s median ≈ **6,700 minutes** — more than
   double the plan. We must delete videos after they are decided (§6) or we will
   hit `402 plan_limit_exhausted` mid-event and uploads stop.
4. `bunny-upload-init` and `bunny-video-delete` edge functions were **never
   committed to this repo** (deployed only). The new Gumlet functions must be
   committed from day one.

---

## 1. What we need from the Gumlet account

| Item | Where | Used by |
|---|---|---|
| API key | Dashboard → Developer → API Keys | edge functions only (secret `GUMLET_API_KEY`) |
| Workspace (collection) ID | Video → Workspaces | `GUMLET_WORKSPACE_ID` |
| **MP4 enabled** on the workspace ("Generate MP4" / `mp4_access`) | Workspace processing settings | AI needs an MP4 file, not HLS |
| Lowest MP4 resolution we can get (target 480p or 360p) | Processing settings | small file → fast Gemini upload |
| Signed URL on + sign secret | Video Protection → Signed URL | `GUMLET_SIGN_SECRET` (admin playback) |
| Webhook endpoint + Secret Token | dash.gumlet.com/developer/webhooks | `GUMLET_WEBHOOK_TOKEN` |
| Webhook triggers: `video.status.ready`, `video.status.errored` (optionally `stream_ready`) | same | |
| Confirm with Gumlet support: max file size, rate limits, concurrent processing, does deleting an asset free storage minutes immediately, are recycle-bin assets billed | support | §6, §7 |

Secrets go in Supabase edge-function secrets **and** Netlify env (dashboard needs
`GUMLET_SIGN_SECRET` + `GUMLET_WORKSPACE_ID` for admin playback signing).

---

## 2. Target flow

```
Member picks video (Flutter web)
  │
  ├─1─▶ edge fn gumlet-upload-init
  │       POST /v1/video/assets/upload {workspace_id, format:"MP4"/ABR, mp4_access:true, title}
  │       → asset_id
  │       → pre-sign ALL multipart part URLs (GET .../multipartupload/{n}/sign)
  │       returns {asset_id, part_urls[], part_size, proof_url:"gumlet://<asset_id>"}
  │
  ├─2─▶ browser PUTs each part (≥5 MB parts) straight to S3, retry per part, keep ETags
  ├─3─▶ edge fn gumlet-upload-complete {asset_id, parts:[{PartNumber,ETag}]}
  │       POST .../multipartupload/complete
  ├─4─▶ insert task_submissions (proof_url = gumlet://<asset_id>)   ← existing durable insert
  │
Gumlet transcodes
  │
  ├─5─▶ webhook → edge fn gumlet-webhook
  │       verify header x-gumlet-token == GUMLET_WEBHOOK_TOKEN
  │       ready   → store duration/bytes, trigger analyze-submission for that row
  │       errored → needs_review "video could not be processed" (or ask re-upload)
  │
  ├─6─▶ analyze-submission (gumlet branch)
  │       fetch MP4 → Gemini → approved | rejected (with reason) | needs_review (with reason)
  │
  └─7─▶ after final decision + appeal window → DELETE /v1/video/assets/{id}  (§6)
```

Fallback: webhook can lag (Gumlet retries failed deliveries only every ~30 min for
24 h). So a cron **still polls** `GET /v1/video/assets/{id}` for any gumlet row
pending > 90 s with no webhook seen. Webhook = fast path, poll = safety net.

Why multipart and not the single PUT: web uploads are uncompressed (no
`video_compress` on web). National p90 file = **254 MB**, avg 95 MB. A single PUT
that drops at 90% restarts from zero — that is the "submitted but missing" bug
class we already fixed for Bunny with per-chunk TUS retry. Multipart keeps that.
Part URLs expire (S3 presign, ~1 h) — init must sign them all up front, and
`gumlet-upload-complete` must re-sign if a slow member exceeds the expiry.

---

## 3. The 5-minute promise

Target: **every video submission shows a result within 5 minutes of submit** —
Approved, Rejected (with reason), or Under review (with reason).

National baseline on Bunny (time from submit to AI approve/reject):
**p50 3.0 min · p75 11 min · p90 48 min.** Peak load 225 videos/hour (~4/min).
So today the promise holds for only ~55% of videos. The slow tail was Bunny's
transcode queue (~1.6 done/min vs ~3/min intake on 24 Aug), not Gemini.

Time budget for one video:

| Step | Expected | Lever |
|---|---|---|
| Gumlet queue + transcode to MP4 | unknown — **must load-test** (docs: "few minutes" queue) | lowest MP4 res; short clips |
| Webhook delivery | seconds | poll fallback |
| MP4 download + Gemini | 20–60 s for a 20–40 MB file | small rendition |
| Write decision | <1 s | — |

How we guarantee 5 min even if Gumlet is slow:

- At **5 min** with no decision, member sees **"Under review — your video is
  taking longer than usual, it will be checked shortly"**. AI keeps trying in the
  background and can still auto-decide; admin only gets it if AI still has no
  answer at ~60 min (current escalation rule, migration 091).
- This is a display state, not a status write, so it does NOT dump hundreds of rows
  into the admin queue at peak (the 24 Aug lesson: a 15-min hard escalation
  produced 87 admin rows that would have resolved by themselves).
- **Member-facing wording change → must be agreed with the client before build.**

Every outcome must carry a reason the member can act on. Existing reasons from
analyze-submission are reused; new Gumlet-specific ones:
- errored on processing → "We couldn't process this video. Please re-upload (MP4 from your camera works best)."
- too short (`video_seconds` < task minimum) → existing rule.

---

## 4. Code changes (file list)

**New edge functions (commit to repo!)** — `dashboard/supabase/functions/`
- `gumlet-upload-init` — create asset, pre-sign parts.
- `gumlet-upload-complete` — complete multipart, re-sign expired parts.
- `gumlet-webhook` — verify token, update row, dispatch analysis. `verify_jwt = false`.
- `gumlet-video-delete` — replaces `bunny-video-delete` (failed-upload cleanup + §6 sweep).

**Mobile (Flutter web)**
- `mobile/lib/core/services/bunny_video_service.dart` → new `gumlet_video_service.dart`
  (multipart PUT, per-part retry, progress callback — same shape as today).
- `mobile/lib/core/services/task_service.dart:619` — call Gumlet service; proof_url `gumlet://`.
- `mobile/lib/features/tasks/screens/task_submission_screen.dart:391` — error-message
  mapping (currently matches Bunny TUS URL).
- Delete Bunny service once nothing imports it. Add tests next to the existing 38.

**analyze-submission** — `dashboard/supabase/functions/analyze-submission/index.ts`
- Replace `bunnyCheckStatus`, `bunnySignPath`, `bunnyResolvePlayableUrl`
  (lines ~17–20, 70, 138–420) with Gumlet equivalents (GET asset → `status`,
  `input.duration`, `input.size`, MP4 URL).
- `isBunny` branch (~1052) → `isGumlet`. `bunny://` rows → skip analysis (file gone).
- Thumbnail duplicate check (~740, ~1122): `like 'bunny://%'` → gumlet; thumbnail
  URL pattern `thumbnail-1-0.png`. Re-verify the fixed-frame assumption on Gumlet
  before trusting thumbnail-equal as "same video".
- Video SHA duplicate (migration 069/064) works on file bytes — provider-agnostic, keep.

**dispatch-analysis** — `dashboard/supabase/functions/dispatch-analysis/index.ts` (bunny refs).
**Delete** `dashboard/supabase/functions/bunny-nudge` (Bunny-specific /reencode tool).

**Dashboard (Next.js)**
- `src/app/(dashboard)/organizations/[id]/approvals/actions.ts` (sign fn line 17–67, 225)
- `src/app/(dashboard)/organizations/[id]/members/[mid]/actions.ts` (13–60)
- `.../approvals/ai-actions.ts`, `.../approvals/_components/approvals-client.tsx`
- `.../members/[mid]/_components/member-detail-client.tsx` (67, 106, 297, 326)
- `.../duplicates/actions.ts`, `.../duplicates/_components/video-duplicates.tsx`
- `src/lib/supabase/queries.ts`, `src/lib/supabase/admin-queries.ts`
- Signing: HMAC-SHA1 hex over (path without `https://video.gumlet.io`) + expires →
  `?token=..&expires=..`. Verify key encoding (docs say hex, example is base64).
- `bunny://` → "Video no longer available (archived)" placeholder.

**SQL (new migration, ~095)**
- `retry_stuck_ai_submissions()` — today keyed on Bunny wording "Video still processing
  — will retry." and Bunny-tuned windows (60 min / 6 h, migrations 085–092). Re-tune
  for Gumlet after load test. Keep: reset-stale-claims logic, attempt-based clock (090).
- Any `like 'bunny://%'` in crons/functions (058, 062, 069, 075, 077–081) → include `gumlet://`.
- Optional column `video_provider_status text` + `video_ready_at timestamptz` to
  measure Gumlet transcode time per row (we couldn't measure Bunny's — never again).

**Secrets to remove after cutover:** `BUNNY_API_KEY`, `BUNNY_LIBRARY_ID`,
`BUNNY_CDN_HOSTNAME`, `BUNNY_TOKEN_AUTH_KEY` (Supabase + Netlify).

---

## 5a. VERIFIED on real asset `6af6e05e8974fccf91f280bd` (13 Nov 2026)

- Setup: workspace `tnl-app` = `6af6dbf68974fccf91f231a0` (Direct Upload). All 4 secrets
  set in Supabase; API key (Video Admin) returns 200 on GET asset.
- Status after processing: `"ready"`. `progress` 0–100. `processed_at` (ms) is present.
- Timing: 17 s clip, 80 MB, 2560×1440 → **~60 s** created → processed, with the
  workspace default profile rendering 360p…2160p. Fewer/lower renditions should be faster.
- Duration / size: `input.duration` (s), `input.size` (bytes).
- **`original_download_url` IS returned** — presigned S3, 2 h expiry, no signing needed.
  Usable as the AI fallback while transcode runs. Requires `keep_original: true` (default).
- **Signed URL key = base64-decode `GUMLET_SIGN_SECRET`**, HMAC-SHA1 hex over
  `path_without_host + expires`, `?token=..&expires=..`. Verified 206 on `main.m3u8`.
  Unsigned HLS → 401.
- Thumbnail `thumbnail-1-0.png` is **public even with signed URLs on** (200 unsigned).
- **MP4: `mp4_access` was false on this asset → `download.mp4` and `main.mp4` both 403.**
  The `*_avc_<res>.mp4` files in `storage_details` are HLS byte-range sources, not
  servable (403 signed). ⇒ `gumlet-upload-init` MUST send `mp4_access: true` and an
  explicit low `resolution` list. Verify `download.mp4` on the first such upload.
- Webhook endpoint not deployed yet — Gumlet retries ~24 h, harmless.
- Temporary `gumlet-probe` edge function was deployed for this check and is now an
  inert 410 stub (no delete tool via MCP; remove from dashboard when convenient).

## 5. Open doc questions to verify on a real asset (day 1 of build)

Gumlet docs contradict themselves. Upload one test video and check:
- MP4 URL: `.../{workspace}/{asset}/download.mp4` vs `.../main.mp4`? Per-resolution MP4 URL?
- First status after direct upload: `upload-pending` vs `pre-queued`; is there a `processing`?
- Is `original_download_url` returned? (Fallback to analyse the original if transcode stalls.)
- Sign-secret format: hex vs base64.
- Real time from complete → `video.status.ready` for a 100 MB and 250 MB phone clip.

---

## 6. Storage minutes (3,000-minute plan)

- `keep_original: false` on create — don't store the 250 MB original once MP4 exists
  (check that this doesn't change billed minutes; minutes are input-duration based).
- Delete asset after **final decision + 48 h appeal window** via cron →
  `gumlet-video-delete`. Approved videos: keep the thumbnail + `video_file_sha` +
  `video_fingerprint` in our DB so duplicate detection still works after deletion.
- Failed / abandoned uploads (`upload-pending` > 2 h) → delete.
- End of each instance: bulk-delete that org's assets (user plan: "empty it for the
  separate instance"). Confirm recycle-bin assets don't count.
- Dashboard tile: current Gumlet storage minutes used (from API) so we see it coming.
- Rough sizing: 1,000 members × 1 video/day × 1 min ≈ 1,000 min/day. Without the
  delete sweep, 3,000 min lasts ~3 days.

---

## 7. Test before any event uses it

1. Unit: Gumlet service part-split/retry/resume; webhook token check; status mapping.
2. One real upload per browser: iPhone Safari, Android Chrome, desktop Chrome.
3. Kill network at 50% → upload resumes, not restarts.
4. Load test (throwaway org, purge SQL in memory `project_loadtest_aug2026`):
   **4 videos/min for 30 min, files 50–250 MB.** Measure p50/p90 submit→decision.
   Pass = p90 ≤ 5 min. If not, lower MP4 resolution / ask Gumlet about priority queue.
5. Webhook down (wrong URL) → poll fallback still decides within budget.
6. `npm run build` (dashboard) + `flutter test` (mobile) green before deploy.

---

## 8. Order of work (est. 4–6 days + load test)

1. Account setup §1 + verify §5 with one manual upload (½ day)
2. Edge functions init/complete/webhook/delete + commit (1 day)
3. Flutter Gumlet service + tests (1 day)
4. analyze-submission + dispatch-analysis Gumlet branch (1 day)
5. Dashboard playback signing + `bunny://` placeholder (½ day)
6. SQL migration: crons re-tuned, delete sweep (½ day)
7. Load test + tune (1 day)
8. Remove Bunny code + secrets
