-- A near-empty fingerprint is not a fingerprint.
-- computeDHash compares adjacent pixel brightness on an 8x8 grid. A largely flat
-- image -- a step-counter screenshot on white -- sets almost none of the 64 bits,
-- so every such image lands on the same few values and collides with every other.
-- Live on 21 Aug: 21 rows carried 0000000000000000, linking members whose files
-- ranged 5KB-160KB, plus 82 more groups under 8 bits.
-- Harmless on Steps (the AI skips duplicate checks there); NOT harmless on a food
-- task, where distance 0 now auto-rejects as "the same photo you already
-- submitted". One Crunch Before Lunch row already had the all-zero hash.
-- Storing NULL means the comparison skips it -- no check rather than a wrong one.
create or replace function public.null_degenerate_proof_hash()
returns trigger language plpgsql as $$
declare v_bits int;
begin
  if new.proof_hash is null then return new; end if;
  select coalesce(sum(length(replace(('x'||substr(new.proof_hash,i,1))::bit(4)::text,'0',''))),0)
    into v_bits from generate_series(1,16) i;
  if v_bits < 8 then new.proof_hash := null; end if;
  return new;
end; $$;
drop trigger if exists trg_null_degenerate_proof_hash on task_submissions;
create trigger trg_null_degenerate_proof_hash
  before insert or update of proof_hash on task_submissions
  for each row execute function public.null_degenerate_proof_hash();
