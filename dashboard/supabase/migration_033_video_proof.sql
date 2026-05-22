-- Add proof_type to tasks so admins can mark certain tasks as video uploads.
-- Existing tasks default to 'image' which preserves the current behavior.
-- max_video_seconds caps duration for video tasks (e.g. 90 for a 1.5-min task).

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS proof_type text NOT NULL DEFAULT 'image'
    CHECK (proof_type IN ('image', 'video')),
  ADD COLUMN IF NOT EXISTS max_video_seconds integer;

COMMENT ON COLUMN tasks.proof_type IS 'image (default) or video. Mobile picker + dashboard viewer branch on this.';
COMMENT ON COLUMN tasks.max_video_seconds IS 'Duration cap for video tasks; ignored when proof_type=image.';

-- Bump task-proofs bucket file-size cap to fit compressed 90s videos (~30MB).
-- Storage transforms still only work on images; videos stream via Range requests.
UPDATE storage.buckets
SET file_size_limit = 31457280  -- 30 MB
WHERE id = 'task-proofs';

-- Update mobile RPC to return proof_type + max_video_seconds so the picker
-- branches on the correct type. Keep return-column order stable.
create or replace function public.get_mobile_tasks(p_team_id uuid, p_org_id uuid)
returns table (
  id uuid, challenge_id uuid, title text, description text,
  points integer, points_tiers jsonb, week_number integer, category text, icon text,
  is_active boolean, start_date date, end_date date,
  proof_type text, max_video_seconds integer
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return query
  select
    t.id, t.challenge_id, t.title, t.description,
    t.points, t.points_tiers, t.week_number, t.category, t.icon,
    t.is_active, t.start_date, t.end_date,
    t.proof_type, t.max_video_seconds
  from tasks t
  join challenges c on t.challenge_id = c.id
  where
    c.org_id = p_org_id
    and c.status = 'active'
    and c.manually_closed = false
    and t.is_active = true
    and (
      not exists (select 1 from challenge_teams ct where ct.challenge_id = c.id)
      or exists  (select 1 from challenge_teams ct where ct.challenge_id = c.id and ct.team_id = p_team_id)
    )
    and (
      not exists (select 1 from task_teams tt where tt.task_id = t.id)
      or exists  (select 1 from task_teams tt where tt.task_id = t.id and tt.team_id = p_team_id)
    )
  order by t.week_number, t.created_at;
end;
$$;

revoke execute on function public.get_mobile_tasks(uuid, uuid) from anon;
grant  execute on function public.get_mobile_tasks(uuid, uuid) to authenticated;
