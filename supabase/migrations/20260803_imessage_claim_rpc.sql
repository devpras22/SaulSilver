-- Atomic compare-and-set for iMessage webhook dedup.
--
-- claim_imessage_message_id(phone, msg_id) returns true if the caller wins the
-- claim (should process), false if another concurrent request already claimed
-- that messageId (should bail). Race-proof: Postgres serializes concurrent
-- calls on the row lock, so only one of N concurrent webhooks wins.
--
-- This is the fix for the triple-send. Linq's 10s webhook timeout fires
-- retries while the first (slow) request is still running; the racy
-- read-then-write in app code let all 3 through. Doing it in one SQL statement
-- closes the TOCTOU window.
create or replace function public.claim_imessage_message_id(
  p_phone text,
  p_message_id text
) returns boolean
language plpgsql
security definer
as $$
declare
  v_existing text;
begin
  -- Read current value (NULL if row doesn't exist yet).
  select last_inbound_message_id into v_existing
  from public.imessage_convos
  where phone = p_phone
  for update;  -- row lock — concurrent callers block here until we commit

  -- If this messageId is already claimed, we lost the race.
  if v_existing = p_message_id then
    return false;
  end if;

  -- Otherwise claim it (insert the row if new, update if existing).
  insert into public.imessage_convos (phone, last_inbound_message_id, updated_at)
  values (p_phone, p_message_id, now())
  on conflict (phone) do update
    set last_inbound_message_id = excluded.last_inbound_message_id,
        updated_at = now();

  return true;
end;
$$;

-- Allow the service role (which bypasses RLS anyway) and anyone authenticated.
grant execute on function public.claim_imessage_message_id(text, text) to authenticated, anon, service_role;
