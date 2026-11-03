-- Paintiano · AI fair use (Nov 2026)
-- Run once in Supabase → SQL Editor → New query → Run.
-- Safe to run again: everything is "if not exists" / "or replace".

-- 1) Daily AI counter. One row per bucket per day:
--    bucket = 'k:<hash of licence key>:p|s' or 'n:<hash of network>:p|s'
--    (p = pieces & melodies, s = small calls). No IPs, no keys in clear text.
create table if not exists public.ai_usage (
  bucket text    not null,
  day    date    not null default current_date,
  n      integer not null default 0,
  primary key (bucket, day)
);
alter table public.ai_usage enable row level security;   -- only the server (service role) touches it

-- 2) Count one call; returns the new count, or -1 when the cap is already reached.
create or replace function public.ai_hit(p_bucket text, p_cap integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v integer;
begin
  insert into ai_usage (bucket, day, n) values (p_bucket, current_date, 1)
  on conflict (bucket, day) do update set n = ai_usage.n + 1
    where ai_usage.n < p_cap
  returning n into v;
  return coalesce(v, -1);
end $$;
revoke all on function public.ai_hit(text, integer) from public, anon, authenticated;

-- 3) Pro AI bought before the daily limit keeps AI without a daily limit.
alter table public.licenses add column if not exists ai_unlimited boolean not null default false;
update public.licenses set ai_unlimited = true
 where tier = 'pro_ai' and status = 'active' and ai_unlimited = false;
-- ↑ Run step 3 only ONCE, when the new pricing goes live (main). Running it
--   again later would also free every Pro AI bought after that day.
