-- Paintiano · Pro travels with the Battle account (Nov 2026)
-- Run once in Supabase → SQL Editor → New query → Run.
-- Safe to run again: everything is "if not exists".
--
-- A Paintiano with Pro that is linked to Paintiano Battle notes that Battle account on its licence
-- (battle_uid = the account id inside the link Battle gave it). A Paintiano opened from Battle on
-- the same account, without the key, asks for it and gets Pro too (api/battle-pro.js).

alter table public.licenses add column if not exists battle_uid text;
create index if not exists licenses_battle_uid on public.licenses (battle_uid) where battle_uid is not null;
notify pgrst, 'reload schema';
