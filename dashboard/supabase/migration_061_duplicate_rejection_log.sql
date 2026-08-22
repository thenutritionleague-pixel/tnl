-- 061: a permanent, checkable record of every duplicate rejection.
--
-- Rejecting a submission removes its points, and the member will ask why. The
-- submission's rejection_reason answers that for the member, but the client
-- needs one place showing every decision and the evidence behind it -- and it
-- has to survive the submission itself being edited, resubmitted or removed.
--
-- Populated 22 Aug 2026 with 130 rejections worth 23,610 points across 99
-- members. Every row is reproducible: re-hashing the two files named in a row
-- yields the checksum stored, so nobody has to take the system's word for it.

CREATE TABLE IF NOT EXISTS duplicate_rejection_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL,
  proof_kind        text NOT NULL CHECK (proof_kind IN ('image','video')),
  group_kind        text NOT NULL,
  fingerprint       text NOT NULL,

  submission_id     uuid NOT NULL,
  member_name       text,
  member_email      text,
  team_name         text,
  task_title        text,
  submitted_date    date,
  points_removed    integer NOT NULL DEFAULT 0,

  -- the earlier submission it duplicates, which was KEPT
  kept_submission_id  uuid,
  kept_member_name    text,
  kept_task_title     text,
  kept_submitted_date date,

  file_bytes        bigint,
  file_sha          text,
  video_seconds     numeric,

  reason            text NOT NULL,
  rejected_at       timestamptz NOT NULL DEFAULT now(),
  rejected_by       text
);

CREATE INDEX IF NOT EXISTS duplicate_rejection_log_org_idx ON duplicate_rejection_log (org_id, rejected_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS duplicate_rejection_log_submission_idx ON duplicate_rejection_log (submission_id);

ALTER TABLE duplicate_rejection_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON duplicate_rejection_log FROM anon, authenticated;
