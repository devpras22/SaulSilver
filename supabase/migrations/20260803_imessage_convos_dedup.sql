-- Idempotency for Linq webhook retries.
--
-- PROBLEM: the Linq webhook does a lot of async work (2 OpenAI calls, Senso,
-- Supabase, image fetches, sendMessage) before returning 200. Linq has a webhook
-- timeout and RETRIES when the handler doesn't answer fast enough. Each retry
-- reprocessed the same inbound message → the user got 2-3 identical responses
-- (image + text repeated). Classic "three bubbles" loop.
--
-- FIX: store the last inbound messageId we processed per sender. The webhook
-- reads it at the top; if the incoming messageId matches, it returns 200
-- instantly and does nothing. Idempotent — first fire marks + runs, retries see
-- the mark and no-op.
alter table public.imessage_convos
  add column if not exists last_inbound_message_id text;
