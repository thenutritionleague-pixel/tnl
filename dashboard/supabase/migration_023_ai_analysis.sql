-- AI analysis fields for task_submissions
alter table task_submissions
  add column if not exists ai_status text
    check (ai_status in ('analyzing', 'approved', 'rejected', 'needs_review')),
  add column if not exists ai_feedback text,
  add column if not exists ai_confidence numeric(4,3);
