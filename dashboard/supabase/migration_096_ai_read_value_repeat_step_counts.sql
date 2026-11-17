-- 096: remember the number the image AI read, so a repeated step count is seen.
--
-- The exact-duplicate cron (062/067) rejects the SAME FILE uploaded twice, on
-- storage's MD5. It cannot see a fresh screenshot of an old screen: new bytes,
-- same number. analyze-submission (v90) now stores the main number it read and,
-- for step tasks, sends an approval to needs_review when this member already has
-- an approved screenshot for the same task on another day with exactly that
-- count. Never an automatic rejection: two real days can land on one number.
--
-- Verified live 17 Nov in a throwaway org: 8,432 approved; a different 8,432
-- screenshot next day -> needs_review; 9,105 -> approved; the identical 8,432
-- file -> rejected by the cron on its next run. Applied to DB.
alter table public.task_submissions add column if not exists ai_read_value numeric;
comment on column public.task_submissions.ai_read_value is 'Main number the image AI read from a numeric proof (e.g. steps). Used to flag the same count re-submitted on another day from a different file.';
