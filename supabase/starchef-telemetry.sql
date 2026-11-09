-- ============================================================================
--  5-Star Chef Restaurant (starchefmia.com) — play log
--
--  Same shared Supabase project and the same design as Chasing P1's log, with
--  the lessons it paid for already applied:
--
--   * Writes go through SECURITY DEFINER functions, never the table. The tables
--     have RLS on and NO policies, so visitors can neither read nor write them
--     directly. (An UPDATE on a table the caller cannot SELECT silently matches
--     nothing and returns 204 — that cost Chasing P1 a day of data.)
--   * Country is read HERE from Cloudflare's `cf-ipcountry` request header. No
--     IP address is read, stored or requested by the browser, and the client
--     cannot set the value. A two-letter code is not personal data.
--   * Nothing typed by the player is stored (the optional restaurant name is
--     recorded only as "named: true/false").
--   * Reading the log needs the existing Chasing P1 admin token (public.cp_admin),
--     so there is no second secret to manage.
--
--  Two tables:
--    sc_games  one row per GAME (a five-pick run), upserted as it progresses
--    sc_loads  one row per VISIT arrival; a load whose visit_id never reaches
--              sc_games is somebody who arrived and left
--
--  Run the whole file in the Supabase SQL editor. Safe to run more than once.
-- ============================================================================

-- ---- country from the request ---------------------------------------------
create or replace function public.sc_request_country()
returns text
language plpgsql
stable
as $$
declare
  h jsonb;
  c text;
begin
  begin
    h := current_setting('request.headers', true)::jsonb;
  exception when others then
    return null;
  end;
  if h is null then return null; end if;
  c := coalesce(h->>'cf-ipcountry', h->>'x-vercel-ip-country', h->>'x-country-code', h->>'fly-client-country');
  -- "XX" unknown, "T1" Tor: Cloudflare placeholders.
  if c is null or c in ('XX', 'T1', '') then return null; end if;
  return upper(left(c, 2));
end;
$$;

-- ---- games -----------------------------------------------------------------
create table if not exists public.sc_games (
  session_id       text primary key,          -- one per game (stable across a page refresh)
  visit_id         text,                      -- one per sitting (30 min idle ends it)
  game_index       int not null default 1,    -- 1st, 2nd, ... game of the sitting
  env              text not null default 'prod',
  created_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  started_at       timestamptz,
  duration_s       int not null default 0,
  picks            int not null default 0,    -- courses served, 0..5
  finished         boolean not null default false,
  score_hundredths int,                       -- 448 = 4.48 stars, set when finished
  spent_cents      int not null default 0,
  shared           boolean not null default false,
  share_result     text,                      -- shared | cancelled | unsupported | copied | downloaded
  country          text,
  referrer         text,
  device           text,                      -- mobile | tablet | desktop
  platform         text,                      -- iOS | Android | Windows | macOS | ...
  screen           text,
  app_version      text,
  meta             jsonb not null default '{}'::jsonb
);

create index if not exists sc_games_created_at_idx on public.sc_games (created_at desc);
create index if not exists sc_games_visit_id_idx   on public.sc_games (visit_id);

alter table public.sc_games enable row level security;
-- No policies on purpose: reachable only through the functions below.

create or replace function public.sc_log_game(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req_country text;
begin
  if p is null or (p->>'session_id') is null then
    return;
  end if;
  req_country := public.sc_request_country();

  insert into public.sc_games as g (
    session_id, visit_id, game_index, env, started_at, duration_s,
    picks, finished, score_hundredths, spent_cents, shared, share_result,
    country, referrer, device, platform, screen, app_version, meta, last_activity_at
  ) values (
    left(p->>'session_id', 80),
    left(p->>'visit_id', 80),
    coalesce((p->>'game_index')::int, 1),
    case when p->>'env' = 'dev' then 'dev' else 'prod' end,
    (p->>'started_at')::timestamptz,
    greatest(coalesce((p->>'duration_s')::int, 0), 0),
    least(greatest(coalesce((p->>'picks')::int, 0), 0), 5),
    coalesce((p->>'finished')::boolean, false),
    (p->>'score_hundredths')::int,
    greatest(coalesce((p->>'spent_cents')::int, 0), 0),
    coalesce((p->>'shared')::boolean, false),
    left(p->>'share_result', 20),
    req_country,
    left(p->>'referrer', 300),
    left(p->>'device', 20),
    left(p->>'platform', 20),
    left(p->>'screen', 20),
    left(p->>'app_version', 40),
    coalesce(p->'meta', '{}'::jsonb),
    now()
  )
  on conflict (session_id) do update set
    visit_id         = coalesce(g.visit_id, excluded.visit_id),
    game_index       = least(g.game_index, excluded.game_index),
    duration_s       = greatest(g.duration_s, excluded.duration_s),
    picks            = greatest(g.picks, excluded.picks),
    finished         = g.finished or excluded.finished,
    score_hundredths = coalesce(excluded.score_hundredths, g.score_hundredths),
    spent_cents      = greatest(g.spent_cents, excluded.spent_cents),
    shared           = g.shared or excluded.shared,
    share_result     = coalesce(excluded.share_result, g.share_result),
    country          = coalesce(g.country, excluded.country),
    referrer         = coalesce(g.referrer, excluded.referrer),
    device           = coalesce(g.device, excluded.device),
    platform         = coalesce(g.platform, excluded.platform),
    screen           = coalesce(g.screen, excluded.screen),
    app_version      = coalesce(excluded.app_version, g.app_version),
    meta             = g.meta || excluded.meta,
    last_activity_at = now();
end;
$$;

grant execute on function public.sc_log_game(jsonb) to anon, authenticated;

-- ---- loads -----------------------------------------------------------------
create table if not exists public.sc_loads (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  visit_id    text,
  env         text not null default 'prod',
  referrer    text,
  device      text,
  platform    text,
  screen      text,
  app_version text,
  country     text,
  webdriver   boolean,
  meta        jsonb not null default '{}'::jsonb
);

create index if not exists sc_loads_created_at_idx on public.sc_loads (created_at desc);
create index if not exists sc_loads_visit_id_idx   on public.sc_loads (visit_id);

alter table public.sc_loads enable row level security;

create or replace function public.sc_log_load(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p is null or (p->>'visit_id') is null then
    return;
  end if;
  -- One arrival per sitting; later page loads in the same sitting are not new arrivals.
  if exists (select 1 from public.sc_loads l where l.visit_id = p->>'visit_id') then
    return;
  end if;
  insert into public.sc_loads (visit_id, env, referrer, device, platform, screen, app_version, country, webdriver, meta)
  values (
    left(p->>'visit_id', 80),
    case when p->>'env' = 'dev' then 'dev' else 'prod' end,
    left(p->>'referrer', 300),
    left(p->>'device', 20),
    left(p->>'platform', 20),
    left(p->>'screen', 20),
    left(p->>'app_version', 40),
    public.sc_request_country(),
    (p->>'webdriver')::boolean,
    coalesce(p->'meta', '{}'::jsonb)
  );
end;
$$;

grant execute on function public.sc_log_load(jsonb) to anon, authenticated;

-- ---- readers (admin token = the existing Chasing P1 token in public.cp_admin) --
create or replace function public.sc_games_admin(p_token text, p_limit int default 1000, p_before timestamptz default null)
returns setof public.sc_games
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_token is null or p_token <> (select t.token from public.cp_admin t where t.id = 1) then
    raise exception 'not authorised';
  end if;
  return query
    select * from public.sc_games g
    where p_before is null or g.created_at < p_before
    order by g.created_at desc
    limit least(greatest(coalesce(p_limit, 1000), 1), 1000);
end;
$$;

create or replace function public.sc_loads_admin(p_token text, p_limit int default 1000, p_before timestamptz default null)
returns setof public.sc_loads
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_token is null or p_token <> (select t.token from public.cp_admin t where t.id = 1) then
    raise exception 'not authorised';
  end if;
  return query
    select * from public.sc_loads l
    where p_before is null or l.created_at < p_before
    order by l.created_at desc
    limit least(greatest(coalesce(p_limit, 1000), 1), 1000);
end;
$$;

grant execute on function public.sc_games_admin(text, int, timestamptz) to anon, authenticated;
grant execute on function public.sc_loads_admin(text, int, timestamptz) to anon, authenticated;

-- ---- check -----------------------------------------------------------------
-- Should list the four functions and two tables. (Country reads null from the
-- SQL editor because the editor is not a browser request; that is expected.)
select routine_name from information_schema.routines
where routine_schema = 'public' and routine_name like 'sc\_%' order by 1;
