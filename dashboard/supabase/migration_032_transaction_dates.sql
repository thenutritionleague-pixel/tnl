-- Add optional event date to individual point adjustments.
-- NULL = use created_at::date (backward compat for all existing rows).
ALTER TABLE points_transactions
  ADD COLUMN IF NOT EXISTS transaction_date date;

-- Same for team-level adjustments.
ALTER TABLE team_transactions
  ADD COLUMN IF NOT EXISTS transaction_date date;
