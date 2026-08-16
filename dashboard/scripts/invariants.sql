-- YiNL invariants — things that must ALWAYS be true.
--
-- Written after 16 Aug 2026, when several bugs reached members despite passing
-- every check I had. The reason: my checks answered "can this be reached?" and
-- "is the stored state consistent right now?". The bugs were neither. They were
-- BEHAVIOUR OVER TIME — a sequence across components:
--
--   admin rejects  ->  cron fires 60s later  ->  AI re-approves  ->  rejection gone
--   admin edits an email  ->  nothing relinks the member  ->  wrong org
--   Bunny stalls   ->  retry window expires  ->  submission stuck forever
--
-- At any instant each component looked correct, so no endpoint test or data
-- audit could see it. What DOES catch this class is asserting the OUTCOME that
-- must hold once everything has settled, and checking it continuously.
--
-- Every row returned by this file is a real problem. Empty output = healthy.
--   psql "$DATABASE_URL" -f scripts/invariants.sql
-- Run it after any deploy, and on a schedule during an event.

\echo '== 1. A human decision must never be overturned by the AI =='
-- rejectSubmission used to null ai_status, which made the retry cron re-fire
-- the AI on a submission an admin had just rejected.
-- Signature of the BUG: the re-approval lands within ~5 minutes of the revoke,
-- because the cron fires every minute. A member legitimately resubmitting their
-- own rejected video (allowed by the "resubmit own rejected" RLS policy, which
-- reuses the same row) takes far longer. Without this window the check flags
-- every legitimate revoke-then-resubmit as a fault.
select 'human rejection re-approved by AI' as problem, s.id, p.name,
       revoked.created_at as revoked_at, reapproved.created_at as reapproved_at
from task_submissions s
join profiles p on p.id = s.user_id
join lateral (select created_at from points_transactions pt
              where pt.submission_id = s.id and pt.reason = 'Approval revoked'
              order by created_at desc limit 1) revoked on true
join lateral (select created_at from points_transactions pt
              where pt.submission_id = s.id and pt.reason = 'Task approved'
                and pt.created_at > revoked.created_at
              order by created_at asc limit 1) reapproved on true
join challenges c on c.id = s.challenge_id and c.status = 'active'   -- live events only
where s.status = 'approved'
  and reapproved.created_at - revoked.created_at < interval '5 minutes';

\echo '== 2. Points must equal the ledger, always =='
select 'points != ledger' as problem, p.id, p.name, p.total_points,
       coalesce((select sum(amount) from points_transactions pt
                 where pt.user_id = p.id and pt.org_id = p.org_id), 0) as ledger
from profiles p
where p.org_id is not null
  and p.total_points <> coalesce((select sum(amount) from points_transactions pt
                                  where pt.user_id = p.id and pt.org_id = p.org_id), 0);

\echo '== 3. Nothing may sit unresolved for more than an hour =='
-- Catches a stalled Bunny transcode, a dead retry cron, or a crashed edge fn.
select 'submission stuck > 60 min' as problem, s.id, p.name, s.ai_status,
       round(extract(epoch from (now() - s.submitted_at)) / 60) as mins_old
from task_submissions s join profiles p on p.id = s.user_id
where s.status = 'pending'
  and s.ai_status is distinct from 'needs_review'   -- needs_review = a human owns it
  and s.submitted_at < now() - interval '60 minutes';

\echo '== 4. No member may be stranded in a finished event =='
-- A member with a pending invite elsewhere should already have been relinked.
select 'member stranded in old org' as problem, p.email, o.name as sitting_in
from profiles p
join organizations o on o.id = p.org_id
join invite_whitelist w on lower(trim(w.email)) = lower(trim(p.email))
where w.used_at is null and w.org_id is distinct from p.org_id;

\echo '== 5. Every active member must have a team and an org row =='
select 'active member missing team or org_members' as problem, p.email, o.name as org
from profiles p join organizations o on o.id = p.org_id
join challenges c on c.org_id = p.org_id and c.status = 'active'
where not exists (select 1 from team_members tm where tm.user_id = p.id and tm.org_id = p.org_id)
   or not exists (select 1 from org_members om where om.user_id = p.id and om.org_id = p.org_id);

\echo '== 6. Emails must be stored lowercase everywhere =='
-- A capitalised row cannot be matched by the apps, which lowercase before
-- calling Supabase Auth, and signInWithOtp would mint a second account.
select 'email not lowercase' as problem, 'profiles' as tbl, email from profiles where email <> lower(trim(email))
union all select 'email not lowercase', 'invite_whitelist', email from invite_whitelist where email <> lower(trim(email))
union all select 'email not lowercase', 'auth.users', email from auth.users where email <> lower(email);

\echo '== 7. A team must never exceed its roster =='
select 'team over 10 members' as problem, t.name, count(*) as members
from team_members tm join teams t on t.id = tm.team_id
join challenges c on c.org_id = t.org_id and c.status = 'active'
group by t.id, t.name having count(*) > 10;

\echo '== 8. Finished events must never change =='
-- Kanpur 488,220 and Gurugram 267,200 are published results.
select 'historical points changed' as problem, o.name, sum(mv.total_points) as now_shows, x.expected
from team_points_mv mv
join teams t on t.id = mv.team_id
join organizations o on o.id = t.org_id
join (values ('Yi Nutrition League 2.0 (Kanpur Edition)', 488220::bigint),
             ('Yi Nutrition League 2.0 (Gurugram)',       267200::bigint)) as x(org, expected)
  on x.org = o.name
group by o.name, x.expected having sum(mv.total_points) <> x.expected;

\echo '== 9. Every cron must have run recently =='
-- Compare each job against ITS OWN cadence. A weekly job that has not run in
-- two hours is healthy; a per-minute job that has not run in fifteen is not.
select 'cron job not running' as problem, j.jobid, j.schedule, left(j.command, 40) as command,
       max(r.start_time) as last_run
from cron.job j left join cron.job_run_details r on r.jobid = j.jobid
where j.active
group by j.jobid, j.schedule, j.command
having max(r.start_time) is null and j.schedule ~ '^(\*|\*/)'   -- frequent job that has NEVER run
    or max(r.start_time) < now() - (case
         -- '*/N * * * *' runs every N minutes: allow 3 missed cycles before alarming.
         when j.schedule ~ '^\*/[0-9]+ '
           then ((substring(j.schedule from '^\*/([0-9]+) '))::int * 3) * interval '1 minute'
         when j.schedule ~ '^\* '        then interval '15 minutes'  -- every minute
         when j.schedule ~ '^[0-9]+ \*'  then interval '2 hours'     -- hourly
         else interval '26 hours' end);                             -- daily or weekly

\echo '== 10. The points RPC must stay closed to the public =='
-- It was callable by anonymous visitors; the anon key ships in every bundle.
select 'increment_member_points is PUBLICLY callable' as problem, rolname
from pg_roles r
where rolname in ('anon', 'authenticated')
  and has_function_privilege(r.rolname, 'public.increment_member_points(uuid,integer)', 'EXECUTE');

\echo ''
\echo 'No rows above = healthy.'
