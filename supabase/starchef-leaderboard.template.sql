-- ============================================================================
--  5-Star Chef Restaurant — leaderboards (today / this week / this month / all time)
--
--  GENERATED from supabase/starchef-leaderboard.template.sql (the dish rows come from
--  src/data/chef-catalog.json). Edit the template, then regenerate.
--
--  Modelled on Chasing P1's weekly board, with these rules:
--   * Opt-in: nothing is public until the player taps "Post" on the results screen.
--   * A player is a browser (player_id), shown by its restaurant name. One entry per
--     player per board: their BEST score in that window. A worse post never costs a
--     place. Ties go to whoever reached the score first.
--   * Restaurant names are unique (case-insensitive): the first player to post a name
--     keeps it. Posting under a new name renames that player's entry everywhere.
--   * Windows are UTC: day from midnight, week from Monday, month from the 1st.
--   * Scores are NOT trusted from the browser. The client sends the five dish ids; the
--     server checks five different courses within $50 and computes the score itself
--     from sc_dishes (a copy of the catalog's ratings below).
--   * `env` keeps localhost testing ('dev') off the public boards ('prod').
--   * Tables have RLS on and no policies; everything goes through the functions below,
--     and none of them returns player_id.
--
--  Needs public.cp_admin (the Chasing P1 admin token) for the admin reader.
--  Run the whole file in the Supabase SQL editor. Safe to run more than once
--  (re-run it if dish ratings ever change).
-- ============================================================================

-- ---- the catalog, for server-side scoring ---------------------------------
create table if not exists public.sc_dishes (
  id            text primary key,
  course        text not null,
  cost_cents    integer not null,
  rating_tenths integer not null
);
alter table public.sc_dishes enable row level security;

insert into public.sc_dishes (id, course, cost_cents, rating_tenths) values
  /*DISH_ROWS*/
on conflict (id) do update set
  course = excluded.course, cost_cents = excluded.cost_cents, rating_tenths = excluded.rating_tenths;

-- ---- players (one name each, names unique) and their posts ---------------------
create table if not exists public.sc_board_players (
  env        text not null default 'prod',
  player_id  text not null,
  name       text not null,
  name_key   text not null,          -- lower-cased, spaces collapsed: the uniqueness key
  first_seen timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (env, player_id),
  unique (env, name_key)
);
alter table public.sc_board_players enable row level security;

create table if not exists public.sc_board_posts (
  id               bigserial primary key,
  env              text not null default 'prod',
  player_id        text not null,
  score_hundredths integer not null,   -- computed here, 300..500
  spent_cents      integer not null,
  dish_ids         text[] not null,
  posted_at        timestamptz not null default now()
);
create index if not exists sc_board_posts_env_time_idx   on public.sc_board_posts (env, posted_at desc);
create index if not exists sc_board_posts_env_player_idx on public.sc_board_posts (env, player_id);
alter table public.sc_board_posts enable row level security;

revoke all on public.sc_dishes, public.sc_board_players, public.sc_board_posts from anon, authenticated;

-- Names that do not go on a public board (same list as Chasing P1). Word-boundary
-- matches for short stems so real words are not caught; small leetspeak fold.
create or replace function public.sc_board_name_blocked(p_name text)
returns boolean
language sql
immutable
as $$
  select translate(lower(p_name), '0134579@$!', 'oieastgasi') ~
    '(fuck|shit|cunt|nigg|faggot|retard|whore|hitler|nazi|pedo|paedo|wank|bitch|\mfag\M|\mkike\M|\mspic\M|\mchink\M|\mrape|\mporn|\mslut\M|\mtwat\M|\mpenis\M|\mvagina\M|\mcock\M|\mdick\M)';
$$;

-- Start and end of each window (UTC). 'all' has no start and no end.
create or replace function public.sc_board_since(p_period text, p_at timestamptz default now())
returns timestamptz
language sql
stable
as $$
  select case p_period
    when 'day'   then date_trunc('day',   p_at at time zone 'utc') at time zone 'utc'
    when 'week'  then date_trunc('week',  p_at at time zone 'utc') at time zone 'utc'
    when 'month' then date_trunc('month', p_at at time zone 'utc') at time zone 'utc'
    else '-infinity'::timestamptz
  end;
$$;

create or replace function public.sc_board_until(p_period text, p_at timestamptz default now())
returns timestamptz
language sql
stable
as $$
  select case p_period
    when 'day'   then public.sc_board_since('day', p_at)   + interval '1 day'
    when 'week'  then public.sc_board_since('week', p_at)  + interval '7 days'
    when 'month' then public.sc_board_since('month', p_at) + interval '1 month'
    else null
  end;
$$;

-- ----------------------------------------------------------------------------
--  POST. p = { env, player_id, name, dish_ids: [5 ids] }
--  Returns { score, ranks: {day,week,month,all}, totals: {...} } or raises one of:
--    'name taken' | 'name not allowed' | 'bad name' | 'bad menu' | 'player_id required'
-- ----------------------------------------------------------------------------
create or replace function public.sc_board_post(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_env     text := case when p->>'env' = 'dev' then 'dev' else 'prod' end;
  v_player  text := left(nullif(trim(p->>'player_id'), ''), 80);
  v_name    text;
  v_key     text;
  v_owner   text;
  v_ids     text[];
  v_count   integer;
  v_courses integer;
  v_cost    integer;
  v_tenths  integer;
  v_score   integer;
  v_ranks   jsonb := '{}'::jsonb;
  v_totals  jsonb := '{}'::jsonb;
  v_period  text;
  v_since   timestamptz;
  v_rank    integer;
  v_total   integer;
begin
  if v_player is null then raise exception 'player_id required'; end if;

  v_name := regexp_replace(coalesce(p->>'name', ''), '[[:cntrl:]]', '', 'g');
  v_name := trim(regexp_replace(v_name, '\s+', ' ', 'g'));
  if char_length(v_name) < 1 or char_length(v_name) > 28 then raise exception 'bad name'; end if;
  if public.sc_board_name_blocked(v_name) then raise exception 'name not allowed'; end if;
  v_key := lower(v_name);

  -- The menu: five known dishes, five different courses, within the $50 budget.
  begin
    select array_agg(x) into v_ids from jsonb_array_elements_text(p->'dish_ids') x;
  exception when others then
    raise exception 'bad menu';
  end;
  select count(*), count(distinct course), sum(cost_cents), sum(rating_tenths)
    into v_count, v_courses, v_cost, v_tenths
    from public.sc_dishes where id = any(v_ids);
  if coalesce(array_length(v_ids, 1), 0) <> 5 or v_count <> 5 or v_courses <> 5 or v_cost > 5000 then
    raise exception 'bad menu';
  end if;
  v_score := v_tenths * 2;   -- mean of five ratings, in hundredths of a star

  -- Name ownership: first come, first served; renaming frees the player's old name.
  select player_id into v_owner from public.sc_board_players where env = v_env and name_key = v_key;
  if v_owner is not null and v_owner <> v_player then raise exception 'name taken'; end if;
  insert into public.sc_board_players as pl (env, player_id, name, name_key)
  values (v_env, v_player, v_name, v_key)
  on conflict (env, player_id) do update set name = excluded.name, name_key = excluded.name_key, updated_at = now();

  insert into public.sc_board_posts (env, player_id, score_hundredths, spent_cents, dish_ids)
  values (v_env, v_player, v_score, v_cost, v_ids);

  foreach v_period in array array['day', 'week', 'month', 'all'] loop
    v_since := public.sc_board_since(v_period);
    with best as (
      select distinct on (player_id) player_id, score_hundredths, posted_at
        from public.sc_board_posts
       where env = v_env and posted_at >= v_since
       order by player_id, score_hundredths desc, posted_at
    ), ranked as (
      select player_id, row_number() over (order by score_hundredths desc, posted_at, player_id) as rank,
             count(*) over () as total
        from best
    )
    select rank, total into v_rank, v_total from ranked where player_id = v_player;
    v_ranks  := v_ranks  || jsonb_build_object(v_period, v_rank);
    v_totals := v_totals || jsonb_build_object(v_period, v_total);
  end loop;

  return jsonb_build_object('score', v_score, 'ranks', v_ranks, 'totals', v_totals);
end;
$$;

grant execute on function public.sc_board_post(jsonb) to anon, authenticated;

-- ----------------------------------------------------------------------------
--  READ. All four boards in one call:
--    { day|week|month|all: { total, top: [<=10 x {rank,name,score,you}],
--                            you: {rank,score}|null, would_rank, seconds_left },
--      name: this player's posted name | null }
--  p_score (hundredths) asks where an unposted score WOULD land.
-- ----------------------------------------------------------------------------
create or replace function public.sc_board_get(
  p_player_id text    default null,
  p_score     integer default null,
  p_env       text    default 'prod'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_env    text := case when p_env = 'dev' then 'dev' else 'prod' end;
  v_out    jsonb := '{}'::jsonb;
  v_period text;
  v_since  timestamptz;
  v_until  timestamptz;
  v_top    jsonb;
  v_total  integer;
  v_you    jsonb;
  v_would  integer;
  v_name   text;
begin
  foreach v_period in array array['day', 'week', 'month', 'all'] loop
    v_since := public.sc_board_since(v_period);
    v_until := public.sc_board_until(v_period);
    with best as (
      select distinct on (player_id) player_id, score_hundredths, posted_at
        from public.sc_board_posts
       where env = v_env and posted_at >= v_since
       order by player_id, score_hundredths desc, posted_at
    ), ranked as (
      select b.*, pl.name,
             row_number() over (order by b.score_hundredths desc, b.posted_at, b.player_id) as rank
        from best b
        join public.sc_board_players pl on pl.env = v_env and pl.player_id = b.player_id
    )
    select
      coalesce(jsonb_agg(jsonb_build_object('rank', rank, 'name', name, 'score', score_hundredths,
                                            'you', coalesce(player_id = p_player_id, false))
                         order by rank) filter (where rank <= 10), '[]'::jsonb),
      count(*),
      (jsonb_agg(jsonb_build_object('rank', rank, 'score', score_hundredths))
         filter (where player_id = p_player_id)) -> 0
      into v_top, v_total, v_you
      from ranked;

    v_would := null;
    if p_score is not null and p_score > 0 then
      -- Ties go to entries already there, so an equal score ranks below them.
      with best as (
        select distinct on (player_id) player_id, score_hundredths
          from public.sc_board_posts
         where env = v_env and posted_at >= v_since
         order by player_id, score_hundredths desc, posted_at
      )
      select count(*) + 1 into v_would from best
       where player_id is distinct from p_player_id and score_hundredths >= p_score;
      -- Your own better entry stays: an unposted lower score would not move you.
      if v_you is not null and (v_you->>'score')::integer >= p_score then
        v_would := (v_you->>'rank')::integer;
      end if;
    end if;

    v_out := v_out || jsonb_build_object(v_period, jsonb_build_object(
      'total', v_total, 'top', v_top, 'you', v_you, 'would_rank', v_would,
      'seconds_left', case when v_until is null then null
                           else greatest(0, extract(epoch from v_until - now()))::integer end));
  end loop;

  if p_player_id is not null then
    select name into v_name from public.sc_board_players where env = v_env and player_id = p_player_id;
  end if;
  return v_out || jsonb_build_object('name', v_name);
end;
$$;

grant execute on function public.sc_board_get(text, integer, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
--  ADMIN. Posts with names, for checking. Same token as the dashboard.
-- ----------------------------------------------------------------------------
create or replace function public.sc_board_admin(p_token text, p_days int default 31)
returns table (posted_at timestamptz, env text, name text, score_hundredths integer, spent_cents integer,
               dish_ids text[], player_id text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_token is null or p_token <> (select t.token from public.cp_admin t where t.id = 1) then
    raise exception 'not authorised';
  end if;
  return query
    select po.posted_at, po.env, pl.name, po.score_hundredths, po.spent_cents, po.dish_ids, po.player_id
      from public.sc_board_posts po
      left join public.sc_board_players pl on pl.env = po.env and pl.player_id = po.player_id
     where po.posted_at >= now() - make_interval(days => greatest(p_days, 1))
     order by po.posted_at desc;
end;
$$;

grant execute on function public.sc_board_admin(text, int) to anon, authenticated;

-- ----------------------------------------------------------------------------
--  REMOVING A PLAYER BY HAND (editor only, not part of the migration):
--    select * from public.sc_board_players where name ilike '%...%';
--    delete from public.sc_board_posts   where env = 'prod' and player_id = '...';
--    delete from public.sc_board_players where env = 'prod' and player_id = '...';
-- ----------------------------------------------------------------------------

select (select count(*) from public.sc_dishes) as dishes_loaded,   -- expect 90
       public.sc_board_since('week') as this_week_started,
       public.sc_board_name_blocked('The Linen Table') as should_be_false;
