// Recebe o aviso do Mercado Pago ("o pagamento X mudou") e entrega os Cristais.
// Segurança: NÃO confiamos no corpo do aviso. Só usamos o id do pagamento e
// consultamos a API do Mercado Pago com o seu token para ler o status real.
import { createClient } from 'npm:@supabase/supabase-js@2';

async function hmacHex(secret: string, text: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const ok = () => new Response('ok', { status: 200 });
  const url = new URL(req.url);
  let body: any = {};
  try { body = await req.json(); } catch { /* alguns avisos vêm só na query */ }

  const type = body.type ?? url.searchParams.get('type') ?? url.searchParams.get('topic');
  const dataId = String(body?.data?.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '');
  if (type !== 'payment' || !dataId) return ok();

  // Assinatura (recomendado): configure MP_WEBHOOK_SECRET com a "chave secreta" do painel do Mercado Pago
  const secret = Deno.env.get('MP_WEBHOOK_SECRET');
  if (secret) {
    const sig = req.headers.get('x-signature') ?? '';
    const ts = /ts=([^,]+)/.exec(sig)?.[1];
    const v1 = /v1=([^,]+)/.exec(sig)?.[1];
    const reqId = req.headers.get('x-request-id') ?? '';
    if (!ts || !v1) return new Response('bad signature', { status: 401 });
    const manifest = `id:${dataId.toLowerCase()};request-id:${reqId};ts:${ts};`;
    if ((await hmacHex(secret, manifest)) !== v1) return new Response('bad signature', { status: 401 });
  }

  const mpToken = Deno.env.get('MP_ACCESS_TOKEN');
  if (!mpToken) return new Response('not configured', { status: 500 });

  // Consulta o pagamento direto no Mercado Pago (fonte da verdade)
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, {
    headers: { Authorization: `Bearer ${mpToken}` },
  });
  if (!r.ok) return new Response('payment lookup failed', { status: 502 }); // o MP tenta de novo depois
  const pay = await r.json();
  const ref = pay.external_reference as string | undefined;
  if (!ref) return ok();

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  if (pay.status === 'approved') {
    const cents = Math.round(Number(pay.transaction_amount) * 100);
    const { data, error } = await admin.rpc('credit_purchase', { p_purchase: ref, p_payment_id: String(pay.id), p_amount_cents: cents });
    if (error) { console.error('credit_purchase', error.message); return new Response('db', { status: 500 }); }
    if (data && data.ok === false) console.error('credit_purchase recusado', JSON.stringify(data));
  } else if (pay.status === 'refunded' || pay.status === 'charged_back' || pay.status === 'cancelled') {
    const { error } = await admin.rpc('reverse_purchase', { p_purchase: ref });
    if (error) { console.error('reverse_purchase', error.message); return new Response('db', { status: 500 }); }
  }
  return ok();
});
