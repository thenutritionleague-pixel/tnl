-- 072: cap the champion list when many teams tie.
--
-- 071 named every tied team. Dry-run against the week ending 17 Aug -- which
-- held only Task 0, where every team scored the same 100 -- produced a title
-- listing 26 team names. Correct, and unreadable.
--
-- Title now names at most three; the body lists up to ten and then says how
-- many more. A tie is still never broken by sort order.

create or replace function public.announce_weekly_champion()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c       record;
  v_count int;
  v_top3  text;
  v_top10 text;
  v_from  date;
  v_to    date;
  v_title text;
  v_body  text;
begin
  v_to   := (date_trunc('week', current_timestamp))::date;
  v_from := v_to - 7;

  for c in
    select id, org_id from challenges
    where status = 'active' and coalesce(manually_closed, false) = false
  loop
    select count(*) into v_count
    from public.weekly_champion_teams(c.id, v_from, v_to);

    if coalesce(v_count, 0) = 0 then
      continue;   -- nobody scored: say nothing rather than announce a phantom
    end if;

    select string_agg(nm, ', ' order by rn)
      into v_top3
    from (select trim(coalesce(team_emoji,'') || ' ' || team_name) nm,
                 row_number() over (order by team_name) rn
          from public.weekly_champion_teams(c.id, v_from, v_to)) x
    where rn <= 3;

    select string_agg(nm, ', ' order by rn)
      into v_top10
    from (select trim(coalesce(team_emoji,'') || ' ' || team_name) nm,
                 row_number() over (order by team_name) rn
          from public.weekly_champion_teams(c.id, v_from, v_to)) x
    where rn <= 10;

    if v_count = 1 then
      v_title := '🏆 Weekly Champion: ' || v_top3;
      v_body  := v_top3 || ' earned the most points this week. Amazing effort — keep pushing!';
    elsif v_count <= 3 then
      v_title := '🏆 Weekly Champions: ' || v_top3;
      v_body  := v_count || ' teams tied for the most points this week: ' || v_top3
                 || '. Outstanding effort!';
    else
      v_title := '🏆 Weekly Champions: ' || v_count || ' teams tied';
      v_body  := v_count || ' teams tied for the most points this week: ' || v_top10
                 || case when v_count > 10
                         then ', and ' || (v_count - 10) || ' more' else '' end
                 || '. Outstanding effort!';
    end if;

    insert into feed_items (org_id, type, title, content, challenge_id, is_auto_generated)
    values (c.org_id, 'achievement', v_title, v_body, c.id, true);
  end loop;
end;
$function$;
