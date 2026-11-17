# Guardiões do Baú — versão online

Jogo idle/RPG para celular. Esta pasta contém o **site** (`index.html`) e o **servidor** (`supabase/`):

| O quê | Como funciona |
|---|---|
| Ranking | Só jogadores reais com conta. Não existe nenhum jogador falso. |
| Arena | Duelos contra o "fantasma" (atributos salvos) de outros jogadores reais. Treinos com NPC existem, mas **não dão troféus**. |
| Salvar na nuvem | Entre com e-mail (código, sem senha) ou Google. Troque de aparelho sem perder o progresso. |
| Loja com dinheiro real | Compra de **💠 Cristais** (Pix, cartão ou boleto via Mercado Pago). Cristais compram aparências, Passe VIP e um pacote inicial. |
| Segurança do dinheiro | O saldo de Cristais fica **no servidor**. O navegador não consegue criar nem alterar Cristais. |
| Baú difícil de evoluir | O baú vai do Nv. 1 ao 20. Cada nível exige **ouro + essências + nível do herói** (custo cresce rápido). Níveis altos dão mais chance de peças Épicas, Lendárias e Míticas — mas o Nv. 20 é uma meta de longo prazo. Toque em "Baú Nv. N" para ver os requisitos e as chances. |
| 12 espaços de equipamento | Arma, Armadura, Luvas, Anel, Elmo, Amuleto, Botas, Escudo, **Capa, Cinto, Grevas e Relíquia**. São 37 peças diferentes; as Incomuns ou melhores podem trazer bônus (crítico, vel. de ataque, roubo de vida, dano de habilidade, ouro, XP, defesa), todos com limite. |
| Tela de batalha limpa | Cena grande, só o essencial por cima e o painel de equipamentos embaixo com o baú no centro. |

> Sem preencher o `config.js` o jogo funciona 100% offline (sem conta, ranking ou loja). Dá para publicar assim para testar.

---

## ⚠️ Leia antes de abrir a loja

1. **GitHub Pages e vendas.** Os termos do GitHub Pages dizem que ele não deve ser usado para rodar negócio online ou site cujo objetivo principal seja transações comerciais. Um jogo com loja dentro é uma área cinzenta. Para ficar tranquilo(a), use **Cloudflare Pages** ou **Netlify** (grátis, aceitam uso comercial; é só arrastar esta pasta). O site é estático e funciona igual em qualquer um. Se usar GitHub Pages mesmo assim, é por sua conta e risco.
2. **Brasil: ECA Digital (Lei 15.211/2025, em vigor desde março de 2026).** Proíbe *loot boxes* em jogos acessados por crianças e adolescentes e exige verificação de idade. Por isso, aqui **Cristais não compram baús, chaves nem nada aleatório**, e a compra exige confirmar 18+. O jogo continua tendo baús, mas só se abrem com chaves ganhas jogando ou compradas com ouro/gemas do jogo. Se você mudar isso, consulte um(a) advogado(a). **Não sou advogado e isto não é aconselhamento jurídico.**
3. **Obrigações de quem vende:** CPF/CNPJ (MEI), emissão de nota quando aplicável, Termos de Uso e Política de Privacidade (modelos prontos em `termos.html` e `privacidade.html`: troque os trechos `[entre colchetes]` e revise), canal de suporte e política de reembolso (7 dias de arrependimento, CDC art. 49).
4. **Trapaça.** O jogo roda no navegador do jogador, então quem entende de programação consegue mexer no próprio save. O servidor reduz o estrago: limita saltos impossíveis de fase/estrelas/troféus, guarda Cristais e compras só no servidor e permite banir. Não existe garantia total em jogo que roda no cliente. Veja "Moderação" no fim.

---

## Passo a passo (cerca de 40 minutos)

### 1) Banco de dados e login — Supabase (grátis)
1. Crie conta em https://supabase.com e um **New project** (guarde a senha do banco).
2. Menu **SQL Editor → New query**, cole **todo** o conteúdo de `supabase/schema.sql` e clique **Run**. (Pode rodar de novo sem problema.)
3. **Authentication → URL Configuration**: em *Site URL* coloque o endereço final do jogo (ex.: `https://seujogo.pages.dev/`). Em *Redirect URLs* coloque o mesmo endereço.
4. **Authentication → Emails → Templates → "Magic Link"** (e "Confirm signup"): inclua o código no texto, por exemplo:
   `Seu código para entrar no Guardiões do Baú: <b>{{ .Token }}</b>`
   (sem isso o e-mail só traz um link; o jogo usa o código de 6 dígitos).
5. *(Opcional)* **Authentication → Providers → Google**: ative e cole o Client ID/Secret do Google Cloud.
6. **Project Settings → API**: copie **Project URL** e a chave **anon public** para o `config.js`.

### 2) Pagamentos — Mercado Pago
1. Crie conta em https://www.mercadopago.com.br/developers → **Suas integrações → Criar aplicação** (tipo *Checkout Pro*).
2. Em **Credenciais**, use primeiro as de **teste** e depois as de **produção**. Copie o **Access Token**.
3. Em **Webhooks**, cadastre a URL `https://SEU-PROJETO.supabase.co/functions/v1/mp-webhook`, marque o evento **Pagamentos** e copie a **chave secreta** da assinatura.

### 3) Funções do servidor (Supabase CLI)
Instale o CLI (https://supabase.com/docs/guides/cli) e, dentro desta pasta:

```bash
supabase login
supabase link --project-ref SEU-PROJECT-REF          # o "ref" aparece na URL do painel
supabase secrets set MP_ACCESS_TOKEN="APP_USR-..." MP_WEBHOOK_SECRET="..." SITE_URL="https://seujogo.pages.dev"
supabase functions deploy create-checkout
supabase functions deploy mp-webhook --no-verify-jwt
```

### 4) Publicar o site
1. Preencha o `config.js` (URL, chave anon e `SITE_URL`).
2. **Cloudflare Pages / Netlify:** arraste a pasta (ou conecte o repositório). Pasta de publicação: a raiz. Sem build.
   **GitHub Pages:** suba tudo no repositório, em *Settings → Pages → Source* escolha **GitHub Actions** (o arquivo `.github/workflows/pages.yml` já está pronto). Lembre do aviso 1.
3. Abra o jogo, entre com seu e-mail, escolha um nome e confira o ranking.

### 5) Testar a compra antes de valer dinheiro
Com as credenciais de **teste** do Mercado Pago, compre o menor pacote usando os cartões de teste da documentação deles. Os 💠 devem chegar sozinhos em alguns segundos. Depois troque para as credenciais de **produção** (`supabase secrets set MP_ACCESS_TOKEN=...`) e faça uma compra real de R$ 4,90 para conferir.

---

## Como o dinheiro é protegido
- `create-checkout` calcula o preço **no servidor** (`supabase/functions/_shared/mod.ts`). O navegador só diz "quero o pacote X".
- O Mercado Pago avisa o `mp-webhook`. A função **não confia no aviso**: ela consulta o pagamento na API do Mercado Pago com o seu token, confere status e valor, e só então chama `credit_purchase`, que é **idempotente** (o mesmo pagamento nunca credita duas vezes).
- Estorno ou chargeback retira os Cristais (`reverse_purchase`). O saldo pode ficar negativo, o que bloqueia novos gastos.
- As tabelas têm RLS ligado e **nenhuma política**: ninguém lê nem escreve direto. Tudo passa por funções que validam.

## Mudar preços e itens
- **Pacotes de Cristais:** `supabase/functions/_shared/mod.ts` (preço real cobrado) **e** a lista `PACKS` em `fonte/js/35-online.js` (o que aparece na tela). Depois `python3 build.py index.html` dentro de `fonte/` e reenvie as funções (`supabase functions deploy create-checkout`).
- **Itens pagos com Cristais:** tabela `shop_items` (rode um `update` no SQL Editor) e a tela em `fonte/js/35-online.js`.

## Moderação e manutenção (SQL Editor)
```sql
-- jogadores com valores corrigidos pelo servidor (suspeitos)
select name, flags, best_idx, total_stars, updated_at from players where flags > 0 order by flags desc;
-- banir (some do ranking e da Arena, e não envia mais progresso)
update players set banned = true where lower(name) = lower('NomeDoTrapaceiro');
-- renomear um nome ofensivo
update players set name = 'Jogador123' where lower(name) = lower('NomeOfensivo');
-- ver compras
select p.name, u.pack_id, u.amount_cents/100.0 as reais, u.status, u.paid_at from purchases u join players p using (user_id) order by u.created_at desc limit 50;
-- apagar uma conta inteira (pedido LGPD): apaga jogador, save, carteira e compras
delete from auth.users where email = 'pessoa@email.com';
```

## Reconstruir o jogo a partir do código-fonte
Em `fonte/` estão o HTML, CSS e JS separados. `cd fonte && python3 build.py ../index.html` gera o `index.html` novo (sem dependências). Os números de equilíbrio (custo do baú, chances, pesos das peças e limites dos bônus) ficam no começo de `fonte/js/00-core.js`.

## Estrutura
```
index.html  config.js  termos.html  privacidade.html  .nojekyll
.github/workflows/pages.yml        (publicação no GitHub Pages)
supabase/schema.sql                (tabelas, RLS, funções)
supabase/functions/create-checkout (cria o pagamento)
supabase/functions/mp-webhook      (entrega os Cristais)
fonte/                             (código-fonte do jogo)
```
