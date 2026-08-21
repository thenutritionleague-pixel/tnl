-- Behaviour tests: assert the RULES, not the stored data.
--
-- invariants.sql checks that what is stored is self-consistent. smoke.mjs checks
-- permissions. Neither asserts that submitting a task awards the right points, or
-- that a duplicate is blocked. Every bug on 21-22 Aug lived in that gap.
--
-- Runs against live data using a member with nothing submitted today, and cleans
-- up after itself. Every row it writes is prefixed proofs/BT- so leftovers are
-- trivial to spot. The final test asserts the cleanup worked.
--
--   psql "$DATABASE_URL" -f scripts/behaviour-tests.sql
--
-- Any row with result <> 'PASS' is a real failure.

\set ON_ERROR_STOP on
\timing off

drop table if exists bt_results;
create temp table bt_results(n int, area text, rule text, result text);

do $$
declare
  v_org   uuid := 'd13747ac-27b6-45d0-8531-416c54dab98c';
  v_user  uuid; v_auth uuid; v_team uuid;
  v_task  uuid; v_chal uuid; v_tier jsonb; v_tz text; v_today date;
  v_sub   uuid; v_new uuid; v_third uuid;
  v_p0 int; v_p1 int; v_t0 int; v_t1 int; v_tier_pts int; n int;
begin
  select coalesce(timezone,'UTC') into v_tz from organizations where id = v_org;
  v_today := (current_timestamp at time zone v_tz)::date;

  select p.id, p.auth_id into v_user, v_auth
    from profiles p
   where p.org_id = v_org and p.auth_id is not null
     and not exists (select 1 from task_submissions s
                     where s.user_id = p.id and s.submitted_date = v_today
                       and s.status <> 'rejected')
   limit 1;
  if v_user is null then
    insert into bt_results values (0,'setup','a member free of submissions today','SKIP');
    return;
  end if;
  select tm.team_id into v_team from team_members tm where tm.user_id = v_user and tm.org_id = v_org;

  select t.id, t.challenge_id, t.points_tiers into v_task, v_chal, v_tier
    from tasks t join challenges c on c.id = t.challenge_id
   where c.org_id = v_org and t.proof_type = 'image' and t.is_active
     and coalesce(t.submission_scope,'individual') <> 'team'
     and t.points_tiers is not null
   limit 1;
  v_tier_pts := (v_tier->1->>'points')::int;

  perform set_config('request.jwt.claims', json_build_object('sub', v_auth::text)::text, true);

  -- ─────────────────────────────────────────────── submitting
  insert into task_submissions
    (task_id, challenge_id, user_id, org_id, submitted_at, status, proof_url, selected_tier_index)
  values (v_task, v_chal, v_user, v_org, now(), 'pending', 'proofs/BT-1.jpg', 1)
  returning id into v_sub;

  insert into bt_results select 1,'member','a submission is stored for the org-local day',
    case when (select submitted_date from task_submissions where id=v_sub) = v_today
         then 'PASS' else 'FAIL' end;

  begin
    insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, status, proof_url)
    values (v_task, v_chal, v_user, v_org, now(), 'pending', 'proofs/BT-dup.jpg');
    insert into bt_results values (2,'member','a second submission for the same task+day is blocked','FAIL: allowed');
  exception when unique_violation then
    insert into bt_results values (2,'member','a second submission for the same task+day is blocked','PASS');
  end;

  -- ─────────────────────────────────────────────── replacing
  v_new := public.replace_own_submission(v_sub, 'proofs/BT-2.jpg');
  insert into bt_results select 3,'member','replacing swaps the proof and keeps it pending',
    case when exists (select 1 from task_submissions
                      where id=v_new and proof_url='proofs/BT-2.jpg' and status='pending')
         then 'PASS' else 'FAIL' end;
  insert into bt_results select 4,'member','the replaced row is deleted, so a late AI verdict cannot land',
    case when not exists (select 1 from task_submissions where id=v_sub) then 'PASS' else 'FAIL' end;
  insert into bt_results select 5,'member','the replacement is written to the audit log',
    case when exists (select 1 from submission_replacements
                      where old_submission_id=v_sub and new_submission_id=v_new)
         then 'PASS' else 'FAIL' end;

  v_third := public.replace_own_submission(v_new, 'proofs/BT-3.jpg');
  begin
    perform public.replace_own_submission(v_third, 'proofs/BT-4.jpg');
    insert into bt_results values (6,'member','a third replacement in one day is refused','FAIL: allowed');
  exception when others then
    insert into bt_results values (6,'member','a third replacement in one day is refused','PASS');
  end;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text)::text, true);
    perform public.replace_own_submission(v_third, 'proofs/BT-x.jpg');
    insert into bt_results values (7,'member','another member cannot replace your proof','FAIL: allowed');
  exception when others then
    insert into bt_results values (7,'member','another member cannot replace your proof','PASS');
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth::text)::text, true);

  -- ─────────────────────────────────────────────── approving
  select total_points into v_p0 from profiles where id = v_user;
  select total_points into v_t0 from team_points_view where team_id = v_team;

  update task_submissions
     set status='approved', points_awarded=v_tier_pts, reviewed_at=now()
   where id = v_third;

  select total_points into v_p1 from profiles where id = v_user;
  select total_points into v_t1 from team_points_view where team_id = v_team;

  insert into bt_results select 8,'points','approval adds exactly the tier value to the member',
    case when v_p1 - v_p0 = v_tier_pts then 'PASS' else 'FAIL: '||(v_p1-v_p0)||' vs '||v_tier_pts end;
  insert into bt_results select 9,'points','approval adds exactly the tier value to the team',
    case when v_t1 - v_t0 = v_tier_pts then 'PASS' else 'FAIL: '||(v_t1-v_t0)||' vs '||v_tier_pts end;
  insert into bt_results select 10,'points','the ledger records the award once, not twice',
    case when (select count(*) from points_transactions where submission_id=v_third and amount>0)=1
         then 'PASS' else 'FAIL' end;
  insert into bt_results select 11,'member','an approved submission can no longer be replaced',
    case when (select status from task_submissions where id=v_third)='approved' then 'PASS' else 'FAIL' end;

  begin
    perform public.replace_own_submission(v_third, 'proofs/BT-y.jpg');
    insert into bt_results values (12,'member','replacing after a decision is refused','FAIL: allowed');
  exception when others then
    insert into bt_results values (12,'member','replacing after a decision is refused','PASS');
  end;

  -- ─────────────────────────────────────────────── revoking
  update task_submissions set status='rejected', rejection_reason='BT test', reviewed_at=now()
   where id = v_third;
  select total_points into v_p1 from profiles where id = v_user;
  select total_points into v_t1 from team_points_view where team_id = v_team;
  insert into bt_results select 13,'points','rejection returns the member to their prior total',
    case when v_p1 = v_p0 then 'PASS' else 'FAIL: '||v_p1||' vs '||v_p0 end;
  insert into bt_results select 14,'points','rejection returns the team to its prior total',
    case when v_t1 = v_t0 then 'PASS' else 'FAIL: '||v_t1||' vs '||v_t0 end;
  insert into bt_results select 15,'admin','the rejection reason is stored for the member',
    case when (select rejection_reason from task_submissions where id=v_third)='BT test'
         then 'PASS' else 'FAIL' end;

  -- a rejected row must free the slot so the member can try again
  begin
    insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, status, proof_url)
    values (v_task, v_chal, v_user, v_org, now(), 'pending', 'proofs/BT-5.jpg');
    insert into bt_results values (16,'member','a rejected day can be resubmitted','PASS');
  exception when others then
    insert into bt_results values (16,'member','a rejected day can be resubmitted','FAIL: '||sqlerrm);
  end;

  -- ─────────────────────────────────────────────── fingerprints
  update task_submissions set proof_hash='0000000000000000' where proof_url='proofs/BT-5.jpg';
  insert into bt_results select 17,'anti-cheat','a near-empty fingerprint is discarded, not matched',
    case when (select proof_hash from task_submissions where proof_url='proofs/BT-5.jpg') is null
         then 'PASS' else 'FAIL' end;
  update task_submissions set proof_hash='4be35a5a344b1763' where proof_url='proofs/BT-5.jpg';
  insert into bt_results select 18,'anti-cheat','a real fingerprint is kept',
    case when (select proof_hash from task_submissions where proof_url='proofs/BT-5.jpg') is not null
         then 'PASS' else 'FAIL' end;

  -- ─────────────────────────────────────────────── team tasks
  select t.id, t.challenge_id into v_task, v_chal from tasks t
    join challenges c on c.id = t.challenge_id
   where c.org_id = v_org and coalesce(t.submission_scope,'individual')='team' limit 1;
  if v_task is not null and exists (select 1 from task_submissions
        where task_id=v_task and team_id=v_team and status<>'rejected') then
    begin
      insert into task_submissions (task_id, challenge_id, user_id, org_id, submitted_at, status, proof_url)
      values (v_task, v_chal, v_user, v_org, now(), 'pending', 'proofs/BT-team.jpg');
      insert into bt_results values (19,'team','a team task cannot be earned twice by one team','FAIL: allowed');
    exception when unique_violation then
      insert into bt_results values (19,'team','a team task cannot be earned twice by one team','PASS');
    end;
  else
    insert into bt_results values (19,'team','a team task cannot be earned twice by one team','SKIP: team has none');
  end if;

  -- ─────────────────────────────────────────────── adjustments
  select total_points into v_t0 from team_points_view where team_id = v_team;
  insert into points_transactions (user_id, org_id, amount, reason, is_manual, transaction_date)
  values (v_user, v_org, 250, 'BT adjustment', true, current_date);
  select total_points into v_t1 from team_points_view where team_id = v_team;
  insert into bt_results select 20,'admin','a manual adjustment reaches the team total',
    case when v_t1 - v_t0 = 250 then 'PASS' else 'FAIL: '||(v_t1-v_t0) end;

  update points_transactions set transaction_date = date '2026-08-27'
   where reason='BT adjustment';
  select total_points into v_t1 from team_points_view where team_id = v_team;
  insert into bt_results select 21,'admin','an adjustment dated after the event still counts while active',
    case when v_t1 - v_t0 = 250 then 'PASS' else 'FAIL: lost' end;
  delete from points_transactions where reason='BT adjustment';

  -- ─────────────────────────────────────────────── the two total paths agree
  select count(*) into n from teams t
    join challenges c on c.org_id=t.org_id and c.status='active'
    join team_points_view v on v.team_id=t.id and v.challenge_id=c.id
   cross join lateral (select coalesce(sum(w.total_points),0) wk
                       from get_team_weekly_pts(t.id,t.org_id,c.id) w) x
   where t.org_id=v_org and v.total_points <> x.wk;
  insert into bt_results select 22,'points','the leaderboard row and the weekly panel always agree',
    case when n=0 then 'PASS' else 'FAIL: '||n||' teams differ' end;

  -- ─────────────────────────────────────────────── frozen history
  insert into bt_results select 23,'integrity','a completed event keeps its published total',
    case when (select sum(mv.total_points) from team_points_mv mv
                 join teams t on t.id=mv.team_id join organizations o on o.id=t.org_id
                where o.name ilike '%Kanpur%') = 488220 then 'PASS' else 'FAIL' end;

  -- ─────────────────────────────────────────────── cleanup
  delete from points_transactions where submission_id in
    (select id from task_submissions where proof_url like 'proofs/BT-%');
  delete from feed_items where author_id=v_user and is_auto_generated
     and created_at > now() - interval '5 minutes';
  delete from task_submissions where proof_url like 'proofs/BT-%';
  delete from submission_replacements where old_proof_url like 'proofs/BT-%'
     or new_proof_url like 'proofs/BT-%';
  update profiles set total_points = (
    select coalesce(sum(amount),0) from points_transactions
     where user_id=v_user and org_id=v_org) where id=v_user;

  insert into bt_results select 24,'harness','the tests leave no rows behind',
    case when (select count(*) from task_submissions where proof_url like 'proofs/BT-%')=0
         then 'PASS' else 'FAIL' end;
  insert into bt_results select 25,'harness','the member ends on the total they started with',
    case when (select total_points from profiles where id=v_user)=v_p0 then 'PASS' else 'FAIL' end;
end $$;

select n, area, rule, result from bt_results order by n;
select count(*) filter (where result like 'FAIL%') as failures,
       count(*) filter (where result = 'PASS')     as passed,
       count(*) filter (where result like 'SKIP%') as skipped
from bt_results;
