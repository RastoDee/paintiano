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

-- The server key needs explicit rights (newer Supabase projects do not grant
-- them to new tables/functions by default), then the API reloads its schema.
grant select, insert, update, delete on public.ai_usage to service_role;
grant execute on function public.ai_hit(text, integer) to service_role;
notify pgrst, 'reload schema';

-- 3) Pro AI bought before the daily limit keeps AI without a daily limit.
alter table public.licenses add column if not exists ai_unlimited boolean not null default false;
update public.licenses set ai_unlimited = true
 where tier = 'pro_ai' and status = 'active' and ai_unlimited = false;
-- ↑ Run step 3 only ONCE, when the new pricing goes live (main). Running it
--   again later would also free every Pro AI bought after that day.

-- 4) Yearly counter for Pro AI pieces & melodies (Nov 2026: 1,000 a year, calendar year).
--    Run this part before the yearly cap goes to main; until it exists the server
--    simply does not count the year (the daily cap still holds).
create table if not exists public.ai_usage_year (
  bucket text    not null,
  yr     integer not null default extract(year from current_date)::int,
  n      integer not null default 0,
  primary key (bucket, yr)
);
alter table public.ai_usage_year enable row level security;

create or replace function public.ai_hit_year(p_bucket text, p_cap integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v integer; y integer := extract(year from current_date)::int;
begin
  insert into ai_usage_year (bucket, yr, n) values (p_bucket, y, 1)
  on conflict (bucket, yr) do update set n = ai_usage_year.n + 1
    where ai_usage_year.n < p_cap
  returning n into v;
  return coalesce(v, -1);
end $$;
revoke all on function public.ai_hit_year(text, integer) from public, anon, authenticated;
grant select, insert, update, delete on public.ai_usage_year to service_role;
grant execute on function public.ai_hit_year(text, integer) to service_role;
notify pgrst, 'reload schema';

-- 5) Refund fair use (Nov 2026): per licence key, how many watermark-free exports
--    and AI pieces & melodies were made — numbers only, never the works. A full
--    refund is given up to 5 exports and 30 AI pieces; look the key up in
--    "licenses" (columns exports, ai_pieces) when a refund is asked for.
--    Until this part is run the server simply does not count.
alter table public.licenses add column if not exists exports   integer not null default 0;
alter table public.licenses add column if not exists ai_pieces integer not null default 0;

create or replace function public.lic_usage_hit(p_key text, p_exports integer, p_ai integer)
returns void
language sql
security definer
set search_path = public
as $$
  update licenses
     set exports   = exports   + greatest(0, least(coalesce(p_exports, 0), 50)),
         ai_pieces = ai_pieces + greatest(0, least(coalesce(p_ai, 0), 50))
   where key = p_key;
$$;
revoke all on function public.lic_usage_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.lic_usage_hit(text, integer, integer) to service_role;
notify pgrst, 'reload schema';
