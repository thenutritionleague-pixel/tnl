-- 058: duplicate detection for videos.
--
-- Images have had this since 049. Videos never had any: proof_hash was null for
-- all 3,222 of them, so the same clip submitted every day was judged as if it
-- were new each time. A scan on 22 Aug found 68 reused videos across 69
-- members worth 26,020 approved points, including three cases of one clip
-- shared between two different members.
--
-- Videos get their OWN columns rather than reusing proof_hash. The edge
-- function (analyze-submission ~line 846) selects every non-null proof_hash for
-- a member and runs hamming() over it with NO proof-type filter -- so a 64-char
-- SHA sitting in that column would be compared against a 16-char image dHash
-- and would corrupt image duplicate detection. Separate column, no interference.

ALTER TABLE task_submissions
  ADD COLUMN IF NOT EXISTS video_fingerprint text,   -- thumbnail SHA-256: the grouping key
  ADD COLUMN IF NOT EXISTS video_file_sha    text,   -- full-file SHA-256: the evidence
  ADD COLUMN IF NOT EXISTS video_bytes       bigint,
  ADD COLUMN IF NOT EXISTS video_seconds     numeric(7,1);

COMMENT ON COLUMN task_submissions.video_fingerprint IS
  'SHA-256 of the Bunny thumbnail. Bunny renders it from a fixed frame, so an identical source file yields identical bytes. Exact matches only -- a re-encode or trim will differ.';
COMMENT ON COLUMN task_submissions.video_file_sha IS
  'SHA-256 of the MP4 itself. Populated only for submissions already in a duplicate group, as proof to show a member whose points are revoked.';

CREATE INDEX IF NOT EXISTS task_submissions_video_fingerprint_idx
  ON task_submissions (video_fingerprint) WHERE video_fingerprint IS NOT NULL;

-- Grouped by fingerprint ALONE, unlike the image version which groups by
-- (hash, task_title). A video reused across two different tasks is still a
-- reuse, and one shared between two members is the most serious case of all --
-- both would be invisible if the task title were part of the key.
CREATE OR REPLACE FUNCTION public.get_video_duplicate_groups(p_org_id uuid)
 RETURNS TABLE(
   fingerprint text, group_kind text, group_size int,
   distinct_members int, distinct_tasks int, approved_points bigint,
   submission_id uuid, user_id uuid, member_name text, member_email text,
   team_name text, task_title text, submitted_date date, status text,
   points_awarded integer, proof_url text,
   video_file_sha text, video_bytes bigint, video_seconds numeric,
   review_verdict text, review_note text, reviewed_email text,
   reviewed_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with vids as (
    select s.id, s.user_id, s.task_id, s.video_fingerprint, s.video_file_sha,
           s.video_bytes, s.video_seconds, s.proof_url, s.submitted_date,
           s.status, s.points_awarded, t.title as task_title
    from task_submissions s
    join tasks t on t.id = s.task_id
    where s.org_id = p_org_id
      and s.video_fingerprint is not null
  ),
  groups as (
    select video_fingerprint,
           count(*)::int                     as group_size,
           count(distinct user_id)::int      as distinct_members,
           count(distinct task_id)::int      as distinct_tasks,
           coalesce(sum(points_awarded) filter (where status = 'approved'), 0) as approved_points
    from vids
    group by video_fingerprint
    -- Once an admin rejects one of a pair the duplicate is dealt with, so the
    -- group should stop being flagged. Same rule as the image version.
    having count(*) filter (where status <> 'rejected') > 1
  )
  select g.video_fingerprint,
         case when g.distinct_members > 1 then 'shared_across_members'
              when g.distinct_tasks   > 1 then 'same_member_different_tasks'
              else 'same_member_different_days' end,
         g.group_size, g.distinct_members, g.distinct_tasks, g.approved_points,
         v.id, v.user_id, p.name, p.email,
         coalesce(tt.name, '—'), v.task_title, v.submitted_date, v.status,
         v.points_awarded, v.proof_url,
         v.video_file_sha, v.video_bytes, v.video_seconds,
         dr.verdict, dr.note, dr.reviewed_email, dr.reviewed_at
  from groups g
  join vids v on v.video_fingerprint = g.video_fingerprint
  join profiles p on p.id = v.user_id
  left join team_members tm on tm.user_id = v.user_id and tm.org_id = p_org_id
  left join teams tt on tt.id = tm.team_id
  left join duplicate_group_reviews dr
         on dr.org_id = p_org_id
        and dr.proof_hash = g.video_fingerprint
        and dr.task_title = '(video)'
  order by g.approved_points desc, g.video_fingerprint, v.submitted_date;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_video_duplicate_groups(uuid) FROM anon, authenticated;
