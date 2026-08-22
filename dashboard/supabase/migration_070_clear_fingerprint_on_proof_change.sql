-- 070: clear the stored fingerprint when the proof file is replaced.
--
-- A resubmit updates task_submissions in place: proof_url starts pointing at a
-- brand-new upload, but video_fingerprint / video_file_sha / video_bytes /
-- video_seconds / proof_hash still describe the file that used to be there.
--
-- Every duplicate check then compares the member's NEW recording against their
-- OWN OLD fingerprint, finds a match, and rejects a genuinely different file.
-- Confirmed on five members (Balaji Nagarajan, Adarsh Bhawsinka, Miruchi Shah,
-- Rahul Khetan, and by the same mechanism on images) by downloading the real
-- files: e.g. the row claimed 2,882,558 bytes / 42.9 s while the file actually
-- at proof_url was 4,446,279 bytes / 56.24 s.
--
-- Adarsh was hit three times in one afternoon — he re-uploaded a new video at
-- 13:32, 16:29 and 16:31 and the duplicate cron rejected each within minutes.
--
-- Fix: whenever proof_url changes, drop every derived fingerprint field so the
-- next analysis recomputes them from the file that is actually there.

create or replace function public.clear_video_fingerprint_on_proof_change()
returns trigger
language plpgsql
as $function$
begin
  -- Only when the proof itself changed. An ordinary status or AI update must
  -- keep the fingerprint, or every review would discard the evidence.
  if new.proof_url is distinct from old.proof_url then
    new.video_fingerprint := null;
    new.video_file_sha    := null;
    new.video_bytes       := null;
    new.video_seconds     := null;
    -- proof_hash is the image equivalent and has the same problem.
    new.proof_hash        := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists clear_fingerprint_on_proof_change on public.task_submissions;

-- BEFORE UPDATE OF proof_url: fires only on the column that matters, and BEFORE
-- so the nulls land in the same write rather than costing a second UPDATE.
create trigger clear_fingerprint_on_proof_change
  before update of proof_url on public.task_submissions
  for each row
  execute function public.clear_video_fingerprint_on_proof_change();
