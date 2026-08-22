-- 056: one definition of "who missed a task", not two.
--
-- write_missed_transactions_for_date carried a full second copy of the INSERT,
-- written before migrations 054 and 055. It was missing every guard the org
-- version has gained:
--   * no team-task exclusion   -> marks 9 of 10 squad members absent
--   * no multi-day window rule -> marks day 1 of a 7-day task as missed
--   * no task start/end check  -> marks tasks that had not begun
--   * no join-date check       -> marks members who had not signed up yet
--
-- Nothing in the app or cron calls it, but service_role can, and
-- backfill_missed_transactions() loops it over every date of a challenge.
-- Running that today would recreate thousands of false "Missed" labels.
--
-- Rather than patch the copy (which drifts again on the next fix), make it
-- delegate. write_missed_transactions_for_org is now the only place the rule
-- lives, so backfill_missed_transactions is correct for free.

CREATE OR REPLACE FUNCTION public.write_missed_transactions_for_date(p_target_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org   RECORD;
  v_total int := 0;
  v_rows  int;
BEGIN
  FOR v_org IN
    SELECT DISTINCT c.org_id
    FROM challenges c
    WHERE c.status = 'active' AND c.manually_closed = false
  LOOP
    SELECT write_missed_transactions_for_org(v_org.org_id, p_target_date) INTO v_rows;
    v_total := v_total + v_rows;
  END LOOP;
  RETURN v_total;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.write_missed_transactions_for_date(date) FROM anon, authenticated;
