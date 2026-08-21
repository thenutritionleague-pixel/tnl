-- Admin adjustments made after a challenge closes must still count -- but only
-- while that challenge is ACTIVE.
--
-- Both leaderboard paths counted only transactions dated INSIDE the challenge
-- window, so an adjustment made after the end date inserted cleanly, appeared in
-- the member's history, and was ignored by every total. Two real Kanpur
-- corrections were lost this way on 31 May: Rohit Jain +150, and a -50 meant to
-- take back wrongly-given points from Heya Tandon, who still holds them. It would
-- have hit National straight after 24 Aug -- exactly when final reconciliation,
-- dispute settlement and bonus awards happen.
--
-- The upper bound gains 60 days, but ONLY while status = 'active'. A first
-- version applied the grace to every challenge and retroactively moved two
-- COMPLETED Kanpur teams (43,250 -> 43,400 and 45,750 -> 45,700, org total
-- 488,220 -> 488,320). No rank changed, but a published number a member has
-- already seen must never move months later. Completed and archived challenges
-- keep the strict original window and stay frozen exactly as announced.
--
-- A transaction falling inside another challenge's real window is left to that
-- challenge, so the grace can never double-count if a second event is added.

CREATE OR REPLACE VIEW team_points_view AS
 WITH team_challenge AS (
         SELECT DISTINCT tm.team_id, tm.org_id, c.id AS challenge_id,
                c.start_date, c.end_date, c.status
           FROM team_members tm
             JOIN challenges c ON c.org_id = tm.org_id
          WHERE NOT (EXISTS (SELECT 1 FROM challenge_teams ct WHERE ct.challenge_id = c.id))
             OR (EXISTS (SELECT 1 FROM challenge_teams ct WHERE ct.challenge_id = c.id AND ct.team_id = tm.team_id))
        ), task_pts AS (
         SELECT tm.team_id, s.challenge_id,
            COALESCE(sum(COALESCE(s.points_awarded, t.points, 0)), 0::bigint) AS pts
           FROM task_submissions s
             JOIN team_members tm ON tm.user_id = s.user_id AND tm.org_id = s.org_id
             JOIN tasks t ON t.id = s.task_id
          WHERE s.status = 'approved'::text AND COALESCE(s.is_team_task, false) = false
          GROUP BY tm.team_id, s.challenge_id
        ), manual_pts AS (
         SELECT tm.team_id, tc_1.challenge_id,
            COALESCE(sum(pt.amount), 0::bigint) AS pts
           FROM team_members tm
             JOIN points_transactions pt ON pt.user_id = tm.user_id AND pt.org_id = tm.org_id
             JOIN team_challenge tc_1 ON tc_1.team_id = tm.team_id AND tc_1.org_id = tm.org_id
          WHERE pt.is_manual = true
            AND COALESCE(pt.transaction_date, pt.created_at::date) >= tc_1.start_date
            AND COALESCE(pt.transaction_date, pt.created_at::date)
                <= (COALESCE(tc_1.end_date, '2100-01-01'::date)
                    + CASE WHEN tc_1.status = 'active'::text THEN 60 ELSE 0 END)
            AND NOT (EXISTS (SELECT 1 FROM challenges c2
                   WHERE c2.org_id = tc_1.org_id AND c2.id <> tc_1.challenge_id
                     AND COALESCE(pt.transaction_date, pt.created_at::date) >= c2.start_date
                     AND COALESCE(pt.transaction_date, pt.created_at::date) <= COALESCE(c2.end_date, '2100-01-01'::date)))
          GROUP BY tm.team_id, tc_1.challenge_id
        ), team_legacy_pts AS (
         SELECT tt.team_id, tc_1.challenge_id,
            COALESCE(sum(tt.amount), 0::bigint) AS pts
           FROM team_transactions tt
             JOIN team_challenge tc_1 ON tc_1.team_id = tt.team_id AND tc_1.org_id = tt.org_id
          WHERE COALESCE(tt.transaction_date, tt.created_at::date) >= tc_1.start_date
            AND COALESCE(tt.transaction_date, tt.created_at::date)
                <= (COALESCE(tc_1.end_date, '2100-01-01'::date)
                    + CASE WHEN tc_1.status = 'active'::text THEN 60 ELSE 0 END)
            AND NOT (EXISTS (SELECT 1 FROM challenges c2
                   WHERE c2.org_id = tc_1.org_id AND c2.id <> tc_1.challenge_id
                     AND COALESCE(tt.transaction_date, tt.created_at::date) >= c2.start_date
                     AND COALESCE(tt.transaction_date, tt.created_at::date) <= COALESCE(c2.end_date, '2100-01-01'::date)))
          GROUP BY tt.team_id, tc_1.challenge_id
        )
 SELECT tc.team_id, tc.challenge_id,
    (COALESCE(tp.pts, 0::bigint) + COALESCE(mp.pts, 0::bigint) + COALESCE(lp.pts, 0::bigint))::integer AS total_points
   FROM team_challenge tc
     LEFT JOIN task_pts tp ON tp.team_id = tc.team_id AND tp.challenge_id = tc.challenge_id
     LEFT JOIN manual_pts mp ON mp.team_id = tc.team_id AND mp.challenge_id = tc.challenge_id
     LEFT JOIN team_legacy_pts lp ON lp.team_id = tc.team_id AND lp.challenge_id = tc.challenge_id;
