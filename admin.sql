-- =====================================================================
--  GUARDIÕES DO BAÚ — PAINEL ADMIN  (rode DEPOIS do schema.sql)
--
--  1) Cole este arquivo inteiro em: Supabase > SQL Editor > New query > Run
--  2) Role até o FIM deste arquivo, troque ferreirazaita2@gmail.com pelo e-mail com
--     que você entra no jogo, e rode de novo (ou rode só aquela linha).
--  3) Abra  https://SEU-SITE/admin.html  (entre antes no jogo, no mesmo navegador).
--
--  É seguro rodar mais de uma vez. Toda a segurança está aqui no servidor:
--  quem não está na tabela "admins" recebe "forbidden" em qualquer função admin_*.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) TABELAS
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_log (
  id         bigint generated always as identity primary key,
  admin_id   uuid,
  action     text not null,
  detail     jsonb,
  created_at timestamptz not null default now()
);

-- Equipamentos criados no painel (entram nos baús junto com as peças do jogo)
create table if not exists public.custom_items (
  id          text primary key,                         -- ex.: c_espada_do_dragao
  slot        text not null,                            -- weapon, armor, gloves, ring, helmet, amulet, boots, shield, cape, belt, legs, relic
  name        text not null,
  a           numeric not null default 1,               -- multiplicador de ataque (1 = normal)
  h           numeric not null default 1,               -- multiplicador de vida   (1 = normal)
  trait       text,                                     -- crit, aspd, ls, skill, gold, xp, defp (ou nulo)
  trait_base  numeric not null default 0,               -- valor base do bônus (cresce com a raridade)
  art         text,                                     -- só arma: sword, axe, spear, staff
  min_rarity  text not null default 'common',           -- só cai nessa raridade ou melhor
  weight      numeric not null default 1,               -- 1 = chance normal; 0.2 = bem mais raro
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Loja: nome/descrição/ícone para pacotes criados no painel
alter table public.shop_items add column if not exists name  text;
alter table public.shop_items add column if not exists descr text;
alter table public.shop_items add column if not exists icon  text;
alter table public.shop_items add column if not exists sort  int not null default 100;

update public.shop_items
   set name = 'Pacote do Guardião', icon = '🎒', sort = 10
 where id = 'bundle_guardiao' and name is null;

do $$
declare t text;
begin
  foreach t in array array['admins','admin_log','custom_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2) FUNÇÕES AUXILIARES
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Mantém só as chaves permitidas, com números inteiros positivos e limite máximo
create or replace function public._clean_payload(p jsonb, allowed text[], maxes jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare k text; v numeric; out jsonb := '{}'::jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return out; end if;
  foreach k in array allowed loop
    if p ? k and jsonb_typeof(p -> k) = 'number' then
      v := floor((p ->> k)::numeric);
      if v > 0 then out := out || jsonb_build_object(k, least(v, (maxes ->> k)::numeric)); end if;
    end if;
  end loop;
  return out;
end $$;

create or replace function public._admin_log(p_action text, p_detail jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.admin_log (admin_id, action, detail) values (auth.uid(), p_action, p_detail);
$$;

-- ---------------------------------------------------------------------
-- 3) FUNÇÕES PÚBLICAS (o jogo chama para montar a loja e as peças novas)
-- ---------------------------------------------------------------------
-- Pacotes à venda por Cristais. Só conteúdo FIXO (nada aleatório, sem chaves/baús).
create or replace function public.get_shop()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', coalesce(s.name, s.id), 'descr', s.descr, 'icon', coalesce(s.icon, '🎁'),
      'price', s.price, 'payload', s.payload, 'one_time', s.one_time,
      'owned', (s.one_time and exists (select 1 from public.deliveries d where d.user_id = auth.uid() and d.item_id = s.id))
    ) order by s.sort, s.id), '[]'::jsonb)
  from public.shop_items s
  where s.kind = 'bundle' and s.active;
$$;

-- Equipamentos criados no painel (inclui os desativados, para quem já ganhou uma peça continuar com ela)
create or replace function public.get_custom_items()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'slot', slot, 'name', name, 'a', a, 'h', h, 'trait', trait, 'tb', trait_base,
      'art', art, 'minR', min_rarity, 'w', weight, 'active', active
    ) order by created_at, id), '[]'::jsonb)
  from public.custom_items;
$$;

-- ---------------------------------------------------------------------
-- 4) FUNÇÕES DO PAINEL (todas exigem admin)
-- ---------------------------------------------------------------------
create or replace function public.admin_whoami()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'admin', public.is_admin());
$$;

-- ----- Loja -----
create or replace function public.admin_list_shop()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'name', coalesce(name, id), 'descr', descr, 'icon', coalesce(icon, '🎁'), 'price', price,
      'payload', payload, 'one_time', one_time, 'active', active, 'sort', sort
    ) order by sort, id) from public.shop_items where kind = 'bundle'), '[]'::jsonb));
end $$;

create or replace function public.admin_save_shop_item(
  p_id text, p_name text, p_descr text, p_icon text, p_price int,
  p_payload jsonb, p_one_time boolean, p_active boolean, p_sort int default 100)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  nm text := btrim(coalesce(p_name, ''));
  ds text := nullif(btrim(coalesce(p_descr, '')), '');
  ic text := nullif(btrim(coalesce(p_icon, '')), '');
  pl jsonb; old_kind text;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_id is null or p_id !~ '^[a-z0-9_]{3,30}$' then return jsonb_build_object('ok', false, 'error', 'invalid_id'); end if;
  if nm = '' or char_length(nm) > 30 or nm ~ '[<>&"]' then return jsonb_build_object('ok', false, 'error', 'invalid_name'); end if;
  if ds is not null and (char_length(ds) > 120 or ds ~ '[<>&"]') then return jsonb_build_object('ok', false, 'error', 'invalid_descr'); end if;
  if ic is not null and (char_length(ic) > 8 or ic ~ '[<>&"]') then return jsonb_build_object('ok', false, 'error', 'invalid_icon'); end if;
  if p_price is null or p_price < 1 or p_price > 100000 then return jsonb_build_object('ok', false, 'error', 'invalid_price'); end if;

  -- só conteúdo fixo e sem chaves/baús/gemas (regra do ECA Digital: Cristais não compram nada aleatório)
  pl := public._clean_payload(p_payload, array['essences','tickets','petFood','goldHours'],
        '{"essences":5000,"tickets":50,"petFood":5000,"goldHours":48}'::jsonb);
  if pl = '{}'::jsonb then return jsonb_build_object('ok', false, 'error', 'empty_payload'); end if;

  select kind into old_kind from public.shop_items where id = p_id;
  if found and old_kind <> 'bundle' then return jsonb_build_object('ok', false, 'error', 'not_bundle'); end if;

  insert into public.shop_items (id, kind, price, payload, one_time, active, name, descr, icon, sort)
  values (p_id, 'bundle', p_price, pl, coalesce(p_one_time, true), coalesce(p_active, true), nm, ds, ic, coalesce(p_sort, 100))
  on conflict (id) do update set
    price = excluded.price, payload = excluded.payload, one_time = excluded.one_time, active = excluded.active,
    name = excluded.name, descr = excluded.descr, icon = excluded.icon, sort = excluded.sort;

  perform public._admin_log('shop_save', jsonb_build_object('id', p_id, 'price', p_price, 'payload', pl, 'active', coalesce(p_active, true)));
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

-- ----- Equipamentos -----
create or replace function public.admin_save_custom_item(
  p_id text, p_slot text, p_name text, p_a numeric, p_h numeric,
  p_trait text, p_trait_base numeric, p_art text, p_min_rarity text, p_weight numeric, p_active boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  nm text := btrim(coalesce(p_name, ''));
  tr text := nullif(btrim(coalesce(p_trait, '')), '');
  ar text := nullif(btrim(coalesce(p_art, '')), '');
  mr text := coalesce(nullif(btrim(coalesce(p_min_rarity, '')), ''), 'common');
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_id is null or p_id !~ '^c_[a-z0-9_]{2,28}$' then return jsonb_build_object('ok', false, 'error', 'invalid_id'); end if;
  if p_slot is null or p_slot <> all (array['weapon','armor','gloves','ring','helmet','amulet','boots','shield','cape','belt','legs','relic']) then
    return jsonb_build_object('ok', false, 'error', 'invalid_slot');
  end if;
  if nm = '' or char_length(nm) > 24 or nm ~ '[<>&"]' then return jsonb_build_object('ok', false, 'error', 'invalid_name'); end if;
  if p_a is null or p_a < 0.3 or p_a > 1.6 or p_h is null or p_h < 0.3 or p_h > 1.6 then return jsonb_build_object('ok', false, 'error', 'invalid_mult'); end if;
  if tr is not null and tr <> all (array['crit','aspd','ls','skill','gold','xp','defp']) then return jsonb_build_object('ok', false, 'error', 'invalid_trait'); end if;
  if tr is not null and (p_trait_base is null or p_trait_base <= 0 or p_trait_base > 10) then return jsonb_build_object('ok', false, 'error', 'invalid_trait_base'); end if;
  if tr is null then p_trait_base := 0; end if;
  if ar is not null and (p_slot <> 'weapon' or ar <> all (array['sword','axe','spear','staff'])) then ar := null; end if;
  if mr <> all (array['common','uncommon','rare','epic','legendary','mythic']) then return jsonb_build_object('ok', false, 'error', 'invalid_rarity'); end if;
  if p_weight is null or p_weight < 0.05 or p_weight > 5 then return jsonb_build_object('ok', false, 'error', 'invalid_weight'); end if;

  insert into public.custom_items (id, slot, name, a, h, trait, trait_base, art, min_rarity, weight, active)
  values (p_id, p_slot, nm, p_a, p_h, tr, p_trait_base, ar, mr, p_weight, coalesce(p_active, true))
  on conflict (id) do update set
    slot = excluded.slot, name = excluded.name, a = excluded.a, h = excluded.h, trait = excluded.trait,
    trait_base = excluded.trait_base, art = excluded.art, min_rarity = excluded.min_rarity,
    weight = excluded.weight, active = excluded.active;

  perform public._admin_log('item_save', jsonb_build_object('id', p_id, 'slot', p_slot, 'name', nm, 'active', coalesce(p_active, true)));
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

-- ----- Jogadores / presentes -----
create or replace function public.admin_search_players(p_q text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  return jsonb_build_object('ok', true, 'players', coalesce((
    select jsonb_agg(x) from (
      select jsonb_build_object('name', name, 'level', level, 'best_idx', best_idx, 'banned', banned) as x
      from public.players
      where position(lower(btrim(coalesce(p_q, ''))) in lower(name)) > 0
      order by (lower(name) = lower(btrim(coalesce(p_q, '')))) desc, name
      limit 12) t), '[]'::jsonb));
end $$;

-- Envia um presente a um jogador (pelo nome) ou a todos (p_target = '*').
-- p_payload: gold, essences, keys, gems, tickets, petFood, goldHours, crystals, gear {id, rarity}
create or replace function public.admin_gift(p_target text, p_payload jsonb, p_msg text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  tg text := btrim(coalesce(p_target, ''));
  msg text := nullif(btrim(coalesce(p_msg, '')), '');
  pl jsonb; cr numeric := 0; gear jsonb := null; gid text; grar text;
  uids uuid[]; n int; everyone boolean := (tg = '*');
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if msg is not null and (char_length(msg) > 60 or msg ~ '[<>&"]') then return jsonb_build_object('ok', false, 'error', 'invalid_msg'); end if;

  pl := public._clean_payload(p_payload, array['gold','essences','keys','gems','tickets','petFood','goldHours'],
        '{"gold":1000000000000,"essences":50000,"keys":1000,"gems":100000,"tickets":50,"petFood":5000,"goldHours":48}'::jsonb);

  if p_payload is not null and jsonb_typeof(p_payload) = 'object' and jsonb_typeof(p_payload -> 'crystals') = 'number' then
    cr := floor((p_payload ->> 'crystals')::numeric);
    if cr < 0 then cr := 0; end if;
    cr := least(cr, case when everyone then 1000 else 100000 end);
  end if;

  if p_payload is not null and jsonb_typeof(p_payload) = 'object' and jsonb_typeof(p_payload -> 'gear') = 'object' then
    gid := p_payload -> 'gear' ->> 'id'; grar := coalesce(p_payload -> 'gear' ->> 'rarity', 'common');
    if not exists (select 1 from public.custom_items where id = gid) then return jsonb_build_object('ok', false, 'error', 'unknown_item'); end if;
    if grar <> all (array['common','uncommon','rare','epic','legendary','mythic']) then return jsonb_build_object('ok', false, 'error', 'invalid_rarity'); end if;
    gear := jsonb_build_object('id', gid, 'rarity', grar);
    pl := pl || jsonb_build_object('gear', gear);
  end if;

  if pl = '{}'::jsonb and cr <= 0 then return jsonb_build_object('ok', false, 'error', 'empty_payload'); end if;
  if msg is not null then pl := pl || jsonb_build_object('msg', msg); end if;

  if everyone then
    select coalesce(array_agg(user_id), '{}') into uids from public.players where not banned;
  else
    if tg = '' then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
    select coalesce(array_agg(user_id), '{}') into uids from public.players where lower(name) = lower(tg);
  end if;
  n := coalesce(array_length(uids, 1), 0);
  if n = 0 then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;

  if cr > 0 then
    insert into public.wallet (user_id, crystals)
      select u, cr::int from unnest(uids) as u
    on conflict (user_id) do update set crystals = public.wallet.crystals + excluded.crystals;
  end if;

  if pl <> '{}'::jsonb and (pl - 'msg') <> '{}'::jsonb then
    insert into public.deliveries (user_id, item_id, payload)
      select u, 'gift_' || to_char(now(), 'YYYYMMDDHH24MISSMS'), pl from unnest(uids) as u;
  end if;

  perform public._admin_log('gift', jsonb_build_object('target', case when everyone then '*' else tg end, 'count', n,
                                                         'payload', pl, 'crystals', cr));
  return jsonb_build_object('ok', true, 'count', n);
end $$;

create or replace function public.admin_recent_log()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  return jsonb_build_object('ok', true, 'log', coalesce((
    select jsonb_agg(jsonb_build_object('at', created_at, 'action', action, 'detail', detail) order by id desc)
    from (select * from public.admin_log order by id desc limit 30) l), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------
-- 5) PERMISSÕES
-- ---------------------------------------------------------------------
revoke all on function
  public.is_admin(), public._clean_payload(jsonb,text[],jsonb), public._admin_log(text,jsonb),
  public.get_shop(), public.get_custom_items(), public.admin_whoami(),
  public.admin_list_shop(),
  public.admin_save_shop_item(text,text,text,text,int,jsonb,boolean,boolean,int),
  public.admin_save_custom_item(text,text,text,numeric,numeric,text,numeric,text,text,numeric,boolean),
  public.admin_search_players(text), public.admin_gift(text,jsonb,text), public.admin_recent_log()
from public, anon, authenticated;

grant execute on function public.get_shop(), public.get_custom_items() to anon, authenticated;
grant execute on function
  public.admin_whoami(), public.admin_list_shop(),
  public.admin_save_shop_item(text,text,text,text,int,jsonb,boolean,boolean,int),
  public.admin_save_custom_item(text,text,text,numeric,numeric,text,numeric,text,text,numeric,boolean),
  public.admin_search_players(text), public.admin_gift(text,jsonb,text), public.admin_recent_log()
to authenticated;

-- ---------------------------------------------------------------------
-- 6) QUEM É ADMIN  >>> TROQUE O E-MAIL ABAIXO PELO SEU E RODE DE NOVO <<<
--    (você precisa já ter entrado no jogo uma vez com esse e-mail)
-- ---------------------------------------------------------------------
insert into public.admins (user_id)
  select id from auth.users where lower(email) = lower('SEU_EMAIL_AQUI')
on conflict do nothing;
