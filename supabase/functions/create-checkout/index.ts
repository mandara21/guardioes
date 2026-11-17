// Cria um pagamento no Mercado Pago (Checkout Pro: Pix, cartão, boleto...) e devolve o link.
// O jogador paga na página do Mercado Pago — o jogo nunca vê dados de cartão.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { PACKS, cors, json } from '../_shared/mod.ts';

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json({ error: 'method' }, 405, headers);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // 1) quem está comprando? (valida o token do jogador)
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: 'not_logged' }, 401, headers);
  const user = userData.user;

  // 2) precisa ter nome de jogador (cadastro concluído)
  const { data: player } = await admin.from('players').select('banned').eq('user_id', user.id).maybeSingle();
  if (!player) return json({ error: 'no_player' }, 400, headers);
  if (player.banned) return json({ error: 'banned' }, 403, headers);

  // 3) o que está comprando? (preço vem do servidor)
  let body: { pack_id?: string; adult?: boolean } = {};
  try { body = await req.json(); } catch { /* corpo inválido */ }
  const pack = body.pack_id ? PACKS[body.pack_id] : undefined;
  if (!pack) return json({ error: 'unknown_pack' }, 400, headers);
  if (body.adult !== true) return json({ error: 'adult_required' }, 400, headers);

  const site = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '');
  const mpToken = Deno.env.get('MP_ACCESS_TOKEN');
  if (!site || !mpToken) return json({ error: 'server_not_configured' }, 500, headers);

  // 4) registra a compra como "pendente"; o id vira a referência do pagamento
  const { data: purchase, error: insErr } = await admin.from('purchases')
    .insert({ user_id: user.id, pack_id: body.pack_id, crystals: pack.crystals, amount_cents: pack.cents })
    .select('id').single();
  if (insErr || !purchase) return json({ error: 'db' }, 500, headers);

  // 5) cria a preferência no Mercado Pago
  const resp = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${mpToken}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': purchase.id },
    body: JSON.stringify({
      items: [{
        id: body.pack_id, title: `${pack.title} — Guardiões do Baú`, quantity: 1,
        currency_id: 'BRL', unit_price: pack.cents / 100,
      }],
      external_reference: purchase.id,
      payer: user.email ? { email: user.email } : undefined,
      notification_url: `${supabaseUrl}/functions/v1/mp-webhook`,
      back_urls: { success: `${site}/?pago=ok`, pending: `${site}/?pago=pendente`, failure: `${site}/?pago=falha` },
      auto_return: 'approved',
      statement_descriptor: 'GUARDIOES BAU',
    }),
  });
  const pref = await resp.json();
  if (!resp.ok || !pref.init_point) {
    console.error('mercadopago', resp.status, JSON.stringify(pref));
    return json({ error: 'provider' }, 502, headers);
  }
  return json({ url: pref.init_point, purchase_id: purchase.id }, 200, headers);
});
