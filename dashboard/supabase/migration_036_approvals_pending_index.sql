-- migration_036_approvals_pending_index.sql
--
-- Approvals queue was scanning the org's entire submission history to find
-- pending rows. The existing index idx_task_submissions_org_sub is
-- (org_id, submitted_at DESC) with no status predicate, so Postgres walked it
-- newest-first and discarded every approved/rejected row until it collected a
-- page of 50 pending.
--
-- The cost scales with how MUCH of the event has already been reviewed: early
-- on most rows are pending and it looks fine, but as approvals accumulate the
-- scan runs longer every day. Measured on a 100-team / 1,000-member /
-- 20k-submission load-test org:
--
--   before:  452 ms   (Rows Removed by Filter, buffers hit=489)
--   after:    24 ms   (index returns exactly the 50 rows wanted)
--
-- The pending COUNT badge on the dashboard uses the same predicate and drops
-- from ~587 ms to ~1 ms.
--
-- CONCURRENTLY so this does not take a write lock on task_submissions.
-- Already applied live on 2026-08-14 ahead of the National event.

create index concurrently if not exists idx_task_submissions_org_pending
on public.task_submissions (org_id, submitted_at desc)
where status = 'pending';
