-- Fix Supabase Security Advisor warnings:
--   1. function_search_path_mutable   — 10 functions missing SET search_path
--   2. anon/authenticated can execute SECURITY DEFINER functions — revoke on trigger/cron funcs
--   3. public_bucket_allows_listing   — avatars bucket broad SELECT policy

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 1: Add SET search_path TO 'public' to 10 functions
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.write_missed_transactions_for_date(p_target_date date)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inserted int := 0;
begin
  insert into points_transactions (user_id, org_id, amount, reason, is_manual)
  select distinct
    om.user_id,
    c.org_id,
    0,
    'Task missed: ' || t.title || ' (' || p_target_date::text || ')',
    false
  from challenges c
  join tasks t
    on  t.challenge_id = c.id
    and t.is_active    = true
  join org_members om
    on  om.org_id = c.org_id
  where
    c.status              = 'active'
    and c.manually_closed = false
    and p_target_date >= c.start_date
    and (c.end_date is null or p_target_date <= c.end_date)
    and (
      not exists (select 1 from challenge_teams ct where ct.challenge_id = c.id)
      or exists (
        select 1 from team_members tm2
        join challenge_teams ct2 on ct2.team_id = tm2.team_id
        where tm2.user_id = om.user_id and ct2.challenge_id = c.id
      )
    )
    and (
      not exists (select 1 from task_teams tt where tt.task_id = t.id)
      or exists (
        select 1 from team_members tm3
        join task_teams tt3 on tt3.team_id = tm3.team_id
        where tm3.user_id = om.user_id and tt3.task_id = t.id
      )
    )
    and not exists (
      select 1 from task_submissions ts
      where ts.task_id        = t.id
        and ts.user_id        = om.user_id
        and ts.submitted_date = p_target_date
        and ts.status         in ('approved', 'pending', 'expired')
    )
    and not exists (
      select 1 from points_transactions pt
      where pt.user_id = om.user_id
        and pt.org_id  = c.org_id
        and pt.amount  = 0
        and pt.reason  = 'Task missed: ' || t.title || ' (' || p_target_date::text || ')'
    );

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create or replace function public.backfill_missed_transactions(p_challenge_id uuid default null)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_challenge record;
  v_date      date;
  v_today     date := current_date;
  v_total     int  := 0;
  v_rows      int;
begin
  for v_challenge in
    select id, start_date, end_date
    from   challenges
    where  status = 'active'
      and  manually_closed = false
      and  (p_challenge_id is null or id = p_challenge_id)
  loop
    v_date := v_challenge.start_date;
    while v_date < v_today loop
      exit when v_challenge.end_date is not null and v_date > v_challenge.end_date;
      select write_missed_transactions_for_date(v_date) into v_rows;
      v_total := v_total + v_rows;
      v_date  := v_date + 1;
    end loop;
  end loop;
  return 'Backfill complete. Inserted ' || v_total || ' missed-task transactions.';
end;
$$;

create or replace function public.fn_trigger_ai_analysis()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _url    text := current_setting('app.ai_analyze_url',    true);
  _secret text := current_setting('app.ai_webhook_secret', true);
begin
  if _url is null or _url = '' then
    return new;
  end if;

  perform net.http_post(
    url     := _url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || coalesce(_secret, '')
    ),
    body    := jsonb_build_object(
      'record', jsonb_build_object('id', new.id, 'org_id', new.org_id)
    )::text
  );

  return new;
end;
$$;

create or replace function public.get_active_challenge(p_org_id uuid)
returns table (id uuid, name text, status text, start_date date, end_date date, manually_closed boolean)
language sql
security definer
set search_path to 'public'
as $$
  select id, name, status, start_date, end_date, manually_closed
  from public.challenges
  where org_id = p_org_id
    and status = 'active'
  order by created_at desc
  limit 1;
$$;

create or replace function public.get_mobile_tasks(p_team_id uuid, p_org_id uuid)
returns table (
  id uuid, challenge_id uuid, title text, description text,
  points integer, week_number integer, category text, icon text,
  is_active boolean, start_date date, end_date date
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return query
  select
    t.id, t.challenge_id, t.title, t.description,
    t.points, t.week_number, t.category, t.icon,
    t.is_active, t.start_date, t.end_date
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

create or replace function public.handle_challenge_status_change()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if OLD.status = 'upcoming' and NEW.status = 'active' then
    insert into feed_items (org_id, type, title, content, challenge_id, is_auto_generated)
    values (
      NEW.org_id, 'announcement', '🚀 Challenge Started!',
      'The challenge "' || NEW.name || '" has just kicked off. Get moving!',
      NEW.id, true
    );
  elsif OLD.status = 'active' and NEW.status = 'completed' then
    insert into feed_items (org_id, type, title, content, challenge_id, is_auto_generated)
    values (
      NEW.org_id, 'announcement', '🏁 Challenge Completed!',
      'The challenge "' || NEW.name || '" has ended. Check the leaderboard for final results!',
      NEW.id, true
    );
  end if;
  return NEW;
end;
$$;

create or replace function public.handle_leaderboard_change()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_challenge_id uuid;
  v_team_id      uuid;
  v_team_name    text;
  v_team_emoji   text;
  v_team_points  bigint;
  v_new_rank     int;
  v_prev_rank    int;
begin
  if NEW.is_manual = true then return NEW; end if;

  select id into v_challenge_id
  from public.challenges
  where org_id = NEW.org_id and status = 'active'
  order by created_at desc limit 1;

  if v_challenge_id is null then return NEW; end if;

  select tm.team_id, t.name, t.emoji
  into   v_team_id, v_team_name, v_team_emoji
  from   public.team_members tm
  join   public.teams t on t.id = tm.team_id
  where  tm.user_id = NEW.user_id and tm.org_id = NEW.org_id
  limit 1;

  if v_team_id is null then return NEW; end if;

  select coalesce(sum(tk.points), 0) into v_team_points
  from   public.task_submissions s
  join   public.tasks tk on tk.id = s.task_id
  join   public.team_members tm on tm.user_id = s.user_id
                               and tm.org_id  = s.org_id
                               and tm.team_id = v_team_id
  where  s.challenge_id = v_challenge_id
    and  s.org_id       = NEW.org_id
    and  s.status       = 'approved';

  select count(*)::int + 1 into v_new_rank
  from (
    select tm.team_id, sum(tk.points) as pts
    from   public.task_submissions s
    join   public.tasks tk on tk.id = s.task_id
    join   public.team_members tm on tm.user_id = s.user_id and tm.org_id = s.org_id
    where  s.challenge_id = v_challenge_id and s.org_id = NEW.org_id and s.status = 'approved'
    group  by tm.team_id
  ) all_teams
  where all_teams.pts > v_team_points;

  select count(*)::int + 1 into v_prev_rank
  from (
    select tm.team_id, sum(tk.points) as pts
    from   public.task_submissions s
    join   public.tasks tk on tk.id = s.task_id
    join   public.team_members tm on tm.user_id = s.user_id and tm.org_id = s.org_id
    where  s.challenge_id = v_challenge_id and s.org_id = NEW.org_id and s.status = 'approved'
    group  by tm.team_id
  ) all_teams
  where all_teams.pts > (v_team_points - NEW.amount);

  if v_new_rank < v_prev_rank then
    insert into public.feed_items (org_id, type, title, content, challenge_id, is_auto_generated)
    values (
      NEW.org_id, 'leaderboard_change',
      v_team_emoji || ' ' || v_team_name || ' moved up!',
      v_team_name || ' climbed from #' || v_prev_rank || ' to #' || v_new_rank || ' on the leaderboard.',
      v_challenge_id, true
    );
  end if;

  return NEW;
end;
$$;

create or replace function public.handle_milestone_reached()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_thresholds int[] := array[100, 250, 500, 1000];
  v_threshold  int;
  v_emoji      text;
begin
  foreach v_threshold in array v_thresholds loop
    if OLD.total_points < v_threshold and NEW.total_points >= v_threshold then
      v_emoji := case v_threshold
        when 100  then '🌱'
        when 250  then '🥦'
        when 500  then '🔥'
        when 1000 then '🏆'
        else '⭐'
      end;
      insert into feed_items (org_id, type, title, content, author_id, is_auto_generated)
      values (
        NEW.org_id, 'milestone',
        v_emoji || ' Milestone Reached!',
        NEW.name || ' just hit ' || v_threshold || ' points — keep it up!',
        NEW.id, true
      );
    end if;
  end loop;
  return NEW;
end;
$$;

create or replace function public.handle_submission_approved()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if NEW.status = 'approved' and OLD.status != 'approved' then
    insert into points_transactions (user_id, org_id, amount, reason, submission_id, is_manual)
    values (NEW.user_id, NEW.org_id, coalesce(NEW.points_awarded, 0), 'Task approved', NEW.id, false);

    update profiles
    set total_points = total_points + coalesce(NEW.points_awarded, 0)
    where id = NEW.user_id;

    insert into feed_items (org_id, type, title, content, author_id, challenge_id, is_auto_generated)
    values (NEW.org_id, 'submission_approved', 'Task Completed', '', NEW.user_id, NEW.challenge_id, true);
  end if;
  return NEW;
end;
$$;

create or replace function public.set_submitted_date_local()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_timezone text;
begin
  select timezone into v_timezone from organizations where id = NEW.org_id;
  if v_timezone is null then v_timezone := 'UTC'; end if;
  NEW.submitted_date := (NEW.submitted_at at time zone v_timezone)::date;
  return NEW;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 2: Revoke EXECUTE from anon/authenticated on trigger + cron functions
-- ─────────────────────────────────────────────────────────────────────────────

-- Revoke from anon only (authenticated still needs these for RLS / mobile RPCs)
revoke execute on function public.auth_user_id()                    from anon;
revoke execute on function public.auth_user_org_id()                from anon;
revoke execute on function public.get_active_challenge(uuid)        from anon;
revoke execute on function public.get_mobile_tasks(uuid, uuid)      from anon;
revoke execute on function public.is_admin_of(uuid)                 from anon;
revoke execute on function public.sync_user_invites(uuid, text)     from anon;

-- Revoke from both anon AND authenticated (trigger/cron only — postgres + service_role unaffected)
revoke execute on function public.backfill_missed_transactions(uuid)         from anon, authenticated;
revoke execute on function public.enforce_team_role_uniqueness()             from anon, authenticated;
revoke execute on function public.fn_trigger_ai_analysis()                   from anon, authenticated;
revoke execute on function public.handle_new_user()                          from anon, authenticated;
revoke execute on function public.retry_stuck_ai_submissions()               from anon, authenticated;
revoke execute on function public.set_submitted_date_local()                 from anon, authenticated;
revoke execute on function public.sync_auth_email_to_profile()               from anon, authenticated;
revoke execute on function public.sync_profile_email_to_auth()               from anon, authenticated;
revoke execute on function public.trigger_analyze_submission()               from anon, authenticated;
revoke execute on function public.write_missed_transactions_for_date(date)   from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 3: Avatars bucket — remove broad ALL policy, add scoped write policies
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "avatars: allow all authenticated" on storage.objects;

create policy "avatars: authenticated can upload own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars: authenticated can update own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars: authenticated can delete own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
-- No SELECT policy: avatars is a PUBLIC bucket — files served by public URL without policy
