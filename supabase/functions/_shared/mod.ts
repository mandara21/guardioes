// Código compartilhado entre as funções.
// O catálogo de preços fica AQUI, no servidor: o navegador nunca decide o valor cobrado.
export const PACKS: Record<string, { crystals: number; cents: number; title: string }> = {
  cristais_60:   { crystals: 60,   cents: 490,  title: '60 Cristais' },
  cristais_140:  { crystals: 140,  cents: 990,  title: '140 Cristais' },
  cristais_400:  { crystals: 400,  cents: 2490, title: '400 Cristais' },
  cristais_900:  { crystals: 900,  cents: 4990, title: '900 Cristais' },
  cristais_2000: { crystals: 2000, cents: 9990, title: '2000 Cristais' },
};

export function cors(origin: string | null) {
  const allowed = Deno.env.get('SITE_URL') ?? '';
  const ok = origin && allowed && origin.replace(/\/$/, '') === new URL(allowed).origin;
  return {
    'Access-Control-Allow-Origin': ok ? origin! : (allowed ? new URL(allowed).origin : '*'),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
