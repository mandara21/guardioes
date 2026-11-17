-- =====================================================================
--  GUARDIÕES DO BAÚ — banco de dados (Supabase / PostgreSQL)
--  Cole este arquivo inteiro em: Supabase > SQL Editor > New query > Run
--  É seguro rodar mais de uma vez (idempotente).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1) TABELAS (ninguém acessa direto: RLS ligado e SEM políticas.
--    Todo acesso passa pelas funções abaixo, que validam tudo.)
-- ---------------------------------------------------------------------
create table if not exists public.players (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  name         text not null,
  best_idx     int  not null default 0,      -- fases concluídas (melhor de todas)
  trophies     int  not null default 1000,
  total_stars  int  not null default 0,
  rebirths     int  not null default 0,
  level        int  not null default 1,
  power        bigint not null default 0,
  snapshot     jsonb,                        -- atributos usados pelos rivais na Arena
  flags        int  not null default 0,      -- vezes que o servidor corrigiu valores suspeitos
  banned       boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  progress_at  timestamptz not null default now()
);
create unique index if not exists players_name_lower_uq on public.players (lower(name));
create index if not exists players_best_idx   on public.players (best_idx desc, updated_at);
create index if not exists players_trophies   on public.players (trophies desc, updated_at);
create index if not exists players_stars      on public.players (total_stars desc, updated_at);

create table if not exists public.saves (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null,
  version    int   not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  crystals int not null default 0
);

create table if not exists public.purchases (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  pack_id             text not null,
  crystals            int  not null,
  amount_cents        int  not null,
  status              text not null default 'pending' check (status in ('pending','paid','refunded')),
  provider            text not null default 'mercadopago',
  provider_payment_id text unique,
  created_at          timestamptz not null default now(),
  paid_at             timestamptz
);
create index if not exists purchases_user on public.purchases (user_id, created_at desc);

create table if not exists public.entitlements (
  user_id    uuid not null references auth.users(id) on delete cascade,
  item_id    text not null,
  expires_at timestamptz,                    -- null = permanente
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table if not exists public.deliveries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  item_id    text not null,
  payload    jsonb not null,
  claimed    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists deliveries_user on public.deliveries (user_id, claimed);

-- Catálogo do que se compra com Cristais (preço mandatório = o do servidor)
create table if not exists public.shop_items (
  id       text primary key,
  kind     text not null check (kind in ('skin','vip','bundle')),
  price    int  not null check (price > 0),
  payload  jsonb not null default '{}'::jsonb,
  one_time boolean not null default true,
  active   boolean not null default true
);

insert into public.shop_items (id, kind, price, payload, one_time) values
  ('skin_ouro',   'skin',   120, '{}'::jsonb, true),
  ('skin_sombra', 'skin',   120, '{}'::jsonb, true),
  ('skin_gelo',   'skin',   120, '{}'::jsonb, true),
  ('vip_30',      'vip',    150, '{"days":30}'::jsonb, false),
  ('bundle_guardiao', 'bundle', 180, '{"essences":150,"tickets":5,"petFood":40,"goldHours":2}'::jsonb, true)
on conflict (id) do update set price = excluded.price, payload = excluded.payload,
  kind = excluded.kind, one_time = excluded.one_time;

-- Liga RLS e tira qualquer acesso direto às tabelas
do $$
declare t text;
begin
  foreach t in array array['players','saves','wallet','purchases','entitlements','deliveries','shop_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2) FUNÇÕES DO JOGO (chamadas pelo navegador via supabase /rpc)
-- ---------------------------------------------------------------------

-- Nome do jogador: 3-16 caracteres, único (sem diferenciar maiúsculas)
create or replace function public.register_player(p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  nm  text := btrim(coalesce(p_name, ''));
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'not_logged'); end if;
  if exists (select 1 from players where user_id = uid) then
    return jsonb_build_object('ok', false, 'error', 'already_registered');
  end if;
  if nm !~ '^[A-Za-zÀ-ÿ0-9 _.\-]{3,16}$' or nm ~ '  ' then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  -- lista mínima de palavras proibidas (edite à vontade)
  if lower(nm) ~ '(admin|moderador|suporte|fdp|porra|caralho|puta|merda|nazi|hitler)' then
    return jsonb_build_object('ok', false, 'error', 'blocked_name');
  end if;
  begin
    insert into players (user_id, name) values (uid, nm);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'name_taken');
  end;
  insert into wallet (user_id) values (uid) on conflict do nothing;
  return jsonb_build_object('ok', true, 'name', nm);
end $$;

-- Envia progresso. O servidor NÃO confia cegamente: limita saltos impossíveis.
create or replace function public.submit_progress(
  p_best_idx int, p_trophies int, p_stars int, p_rebirths int,
  p_level int, p_power bigint, p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  p   players%rowtype;
  mins numeric;
  cap_idx int; cap_stars int; cap_tro int;
  n_idx int; n_stars int; n_reb int; n_tro int; n_lvl int; n_pow bigint;
  flagged boolean := false;
  snap jsonb := null;
  k text;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'not_logged'); end if;
  select * into p from players where user_id = uid for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  if p.banned then return jsonb_build_object('ok', false, 'error', 'banned'); end if;

  mins := greatest(extract(epoch from (now() - p.progress_at)) / 60.0, 0);

  -- 1ª sincronização aceita um save já existente (até 150 fases); depois, ritmo plausível
  if p.best_idx = 0 then cap_idx := 150; else cap_idx := p.best_idx + 6 + floor(mins * 1.5)::int; end if;
  cap_stars := p.total_stars + 150 + floor(mins * 4)::int + (case when p.total_stars = 0 then 600 else 0 end);
  cap_tro   := p.trophies + 150 + floor(mins * 25)::int + (case when p.best_idx = 0 then 20000 else 0 end);

  n_idx   := greatest(p.best_idx,    least(coalesce(p_best_idx, 0), 5000));
  n_stars := greatest(p.total_stars, least(coalesce(p_stars, 0), 1000000));
  n_reb   := greatest(p.rebirths,    least(coalesce(p_rebirths, 0), 100000));
  n_tro   := greatest(0, least(coalesce(p_trophies, 1000), 100000));
  n_lvl   := greatest(1, least(coalesce(p_level, 1), 1000));
  n_pow   := greatest(0, least(coalesce(p_power, 0), 100000000000000));

  if n_idx   > cap_idx   then n_idx   := cap_idx;   flagged := true; end if;
  if n_stars > cap_stars then n_stars := cap_stars; flagged := true; end if;
  if n_tro   > cap_tro   then n_tro   := cap_tro;   flagged := true; end if;
  if n_reb > p.rebirths + 1 + floor(mins / 5)::int + (case when p.rebirths = 0 then 60 else 0 end) then
    n_reb := p.rebirths; flagged := true;
  end if;

  -- snapshot da Arena: só chaves conhecidas e números dentro de limites
  if p_snapshot is not null and jsonb_typeof(p_snapshot) = 'object' then
    snap := '{}'::jsonb;
    foreach k in array array['atk','hp','def','crit','critMult','spd','lifesteal'] loop
      if p_snapshot ? k and jsonb_typeof(p_snapshot -> k) = 'number' then
        snap := snap || jsonb_build_object(k, least(greatest((p_snapshot ->> k)::numeric, 0), 1e13));
      end if;
    end loop;
    if not (snap ? 'atk' and snap ? 'hp') then snap := null; end if;
  end if;

  update players set
    best_idx = n_idx, total_stars = n_stars, rebirths = n_reb, trophies = n_tro,
    level = n_lvl, power = n_pow,
    snapshot = coalesce(snap, snapshot),
    flags = flags + (case when flagged then 1 else 0 end),
    updated_at = now(),
    progress_at = case when n_idx > p.best_idx or n_stars > p.total_stars then now() else progress_at end
  where user_id = uid;

  return jsonb_build_object('ok', true, 'flagged', flagged, 'best_idx', n_idx, 'trophies', n_tro);
end $$;

-- Ranking público. kind: 'stages' | 'trophies' | 'stars'
create or replace function public.get_leaderboard(p_kind text default 'stages', p_limit int default 50)
returns table (rank bigint, name text, value bigint, level int, trophies int, is_me boolean)
language sql stable security definer set search_path = public as $$
  with r as (
    select user_id, name, level, trophies,
      case p_kind when 'trophies' then trophies when 'stars' then total_stars else best_idx end::bigint as v,
      updated_at
    from players
    where not banned
  ), ranked as (
    select row_number() over (order by v desc, updated_at asc) as rk, * from r where v > 0
  )
  select rk, ranked.name, v, ranked.level, ranked.trophies, (ranked.user_id = auth.uid())
  from ranked
  order by rk
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

-- Posição do próprio jogador
create or replace function public.my_rank(p_kind text default 'stages')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); mine bigint; pos bigint; total bigint;
begin
  if uid is null then return null; end if;
  select case p_kind when 'trophies' then trophies when 'stars' then total_stars else best_idx end
    into mine from players where user_id = uid and not banned;
  if mine is null then return null; end if;
  select count(*) + 1 into pos from players
    where not banned and (case p_kind when 'trophies' then trophies when 'stars' then total_stars else best_idx end) > mine;
  select count(*) into total from players where not banned;
  return jsonb_build_object('rank', pos, 'value', mine, 'total', total);
end $$;

-- Rivais reais para a Arena (duelo assíncrono contra o "fantasma" do jogador)
create or replace function public.get_rivals(p_power bigint, p_count int default 4)
returns table (name text, level int, power bigint, trophies int, snapshot jsonb)
language sql stable security definer set search_path = public as $$
  select pl.name, pl.level, pl.power, pl.trophies, pl.snapshot
  from players pl
  where pl.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    and not pl.banned and pl.snapshot is not null and pl.power > 0
    and pl.updated_at > now() - interval '30 days'
  order by abs(ln(greatest(pl.power, 1)) - ln(greatest(coalesce(p_power, 1), 1))) + random() * 0.35
  limit greatest(1, least(coalesce(p_count, 4), 10));
$$;

-- Save na nuvem
create or replace function public.save_cloud(p_data jsonb, p_version int default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'not_logged'); end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if octet_length(p_data::text) > 300000 then return jsonb_build_object('ok', false, 'error', 'too_big'); end if;
  insert into saves (user_id, data, version, updated_at) values (uid, p_data, coalesce(p_version, 1), now())
  on conflict (user_id) do update set data = excluded.data, version = excluded.version, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.load_cloud()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); s saves%rowtype;
begin
  if uid is null then return null; end if;
  select * into s from saves where user_id = uid;
  if not found then return null; end if;
  return jsonb_build_object('data', s.data, 'version', s.version, 'updated_at', s.updated_at);
end $$;

-- Tudo sobre mim em uma chamada: nome, cristais, itens e entregas pendentes
create or replace function public.get_me()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p players%rowtype; cr int; ent jsonb; del jsonb;
begin
  if uid is null then return null; end if;
  select * into p from players where user_id = uid;
  insert into wallet (user_id) values (uid) on conflict do nothing;
  select crystals into cr from wallet where user_id = uid;
  select coalesce(jsonb_agg(jsonb_build_object('item', item_id, 'expires_at', expires_at)), '[]'::jsonb)
    into ent from entitlements where user_id = uid and (expires_at is null or expires_at > now());
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'item', item_id, 'payload', payload) order by created_at), '[]'::jsonb)
    into del from deliveries where user_id = uid and not claimed;
  return jsonb_build_object(
    'name', p.name, 'registered', p.user_id is not null, 'banned', coalesce(p.banned, false),
    'crystals', cr, 'entitlements', ent, 'deliveries', del);
end $$;

-- Gasta Cristais (saldo guardado no servidor; o navegador não consegue alterar)
create or replace function public.spend_crystals(p_item text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); it shop_items%rowtype; bal int; cur timestamptz; newexp timestamptz;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'not_logged'); end if;
  select * into it from shop_items where id = p_item and active;
  if not found then return jsonb_build_object('ok', false, 'error', 'unknown_item'); end if;
  insert into wallet (user_id) values (uid) on conflict do nothing;
  select crystals into bal from wallet where user_id = uid for update;
  if bal < it.price then return jsonb_build_object('ok', false, 'error', 'no_funds', 'crystals', bal); end if;

  if it.one_time and (exists (select 1 from entitlements where user_id = uid and item_id = it.id)
                   or exists (select 1 from deliveries where user_id = uid and item_id = it.id)) then
    return jsonb_build_object('ok', false, 'error', 'already_owned');
  end if;

  update wallet set crystals = crystals - it.price where user_id = uid;

  if it.kind = 'skin' then
    insert into entitlements (user_id, item_id) values (uid, it.id) on conflict do nothing;
  elsif it.kind = 'vip' then
    select expires_at into cur from entitlements where user_id = uid and item_id = it.id;
    newexp := greatest(coalesce(cur, now()), now()) + make_interval(days => coalesce((it.payload ->> 'days')::int, 30));
    insert into entitlements (user_id, item_id, expires_at) values (uid, it.id, newexp)
      on conflict (user_id, item_id) do update set expires_at = excluded.expires_at;
  else
    insert into deliveries (user_id, item_id, payload) values (uid, it.id, it.payload);
  end if;
  return jsonb_build_object('ok', true, 'crystals', bal - it.price);
end $$;

-- Confirma que o navegador já aplicou a entrega no save
create or replace function public.ack_deliveries(p_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update deliveries set claimed = true where user_id = auth.uid() and id = any(p_ids);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- 3) FUNÇÕES DE PAGAMENTO (só a service_role das Edge Functions chama)
-- ---------------------------------------------------------------------
create or replace function public.credit_purchase(p_purchase uuid, p_payment_id text, p_amount_cents int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pu purchases%rowtype;
begin
  select * into pu from purchases where id = p_purchase for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'unknown_purchase'); end if;
  if pu.status = 'paid' then return jsonb_build_object('ok', true, 'already', true); end if;
  if pu.status = 'refunded' then return jsonb_build_object('ok', false, 'error', 'refunded'); end if;
  if p_amount_cents is distinct from pu.amount_cents then
    return jsonb_build_object('ok', false, 'error', 'amount_mismatch');
  end if;
  update purchases set status = 'paid', provider_payment_id = p_payment_id, paid_at = now() where id = pu.id;
  insert into wallet (user_id, crystals) values (pu.user_id, pu.crystals)
    on conflict (user_id) do update set crystals = wallet.crystals + excluded.crystals;
  return jsonb_build_object('ok', true, 'crystals', pu.crystals);
end $$;

create or replace function public.reverse_purchase(p_purchase uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pu purchases%rowtype;
begin
  select * into pu from purchases where id = p_purchase for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'unknown_purchase'); end if;
  if pu.status <> 'paid' then return jsonb_build_object('ok', true, 'noop', true); end if;
  update purchases set status = 'refunded' where id = pu.id;
  update wallet set crystals = crystals - pu.crystals where user_id = pu.user_id;  -- pode ficar negativo: bloqueia novos gastos
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- 4) PERMISSÕES: quem pode chamar o quê
-- ---------------------------------------------------------------------
revoke all on function
  public.register_player(text), public.submit_progress(int,int,int,int,int,bigint,jsonb),
  public.get_leaderboard(text,int), public.my_rank(text), public.get_rivals(bigint,int),
  public.save_cloud(jsonb,int), public.load_cloud(), public.get_me(),
  public.spend_crystals(text), public.ack_deliveries(uuid[]),
  public.credit_purchase(uuid,text,int), public.reverse_purchase(uuid)
from public, anon, authenticated;

grant execute on function public.get_leaderboard(text,int) to anon, authenticated;
grant execute on function
  public.register_player(text), public.submit_progress(int,int,int,int,int,bigint,jsonb),
  public.my_rank(text), public.get_rivals(bigint,int), public.save_cloud(jsonb,int),
  public.load_cloud(), public.get_me(), public.spend_crystals(text), public.ack_deliveries(uuid[])
to authenticated;
grant execute on function public.credit_purchase(uuid,text,int), public.reverse_purchase(uuid) to service_role;
