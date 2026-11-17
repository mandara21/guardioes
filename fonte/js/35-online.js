        /* =====================================================================
           16. ONLINE: conta, save na nuvem, ranking de jogadores reais, loja premium
           Fala direto com o Supabase (Auth + RPC + Edge Functions) usando fetch.
           Sem URL/chave em config.js o jogo roda 100% offline, como antes.
           ===================================================================== */
        const GCFG = window.GAME_CONFIG || {};
        const SB_URL = String(GCFG.SUPABASE_URL || '').replace(/\/$/, '');
        const SB_KEY = String(GCFG.SUPABASE_ANON_KEY || '');
        const SESSION_KEY = 'guardioes_session_v1';
        const online = {
          on: !!(SB_URL && SB_KEY), session: null, me: null, lb: {}, lbAt: {}, lbKind: 'stages', myRank: {},
          rivals: [], rivalsAt: 0, lastPush: 0, pending: null, busy: false
        };

        const PACKS = [
          { id: 'cristais_60',   n: 60,   price: 'R$ 4,90' },
          { id: 'cristais_140',  n: 140,  price: 'R$ 9,90',  tag: '+17%' },
          { id: 'cristais_400',  n: 400,  price: 'R$ 24,90', tag: 'Popular', best: true },
          { id: 'cristais_900',  n: 900,  price: 'R$ 49,90', tag: '+10%' },
          { id: 'cristais_2000', n: 2000, price: 'R$ 99,90', tag: 'Melhor valor' }
        ];
        const SKINS = {
          skin_ouro:   { name: 'Guardião Dourado', price: 120, filter: 'sepia(.85) saturate(2.4) hue-rotate(-6deg) brightness(1.08) drop-shadow(0 0 4px rgba(255,200,60,.8))' },
          skin_sombra: { name: 'Cavaleiro Sombrio', price: 120, filter: 'grayscale(.9) contrast(1.2) brightness(.62) drop-shadow(0 0 4px rgba(150,80,255,.8))' },
          skin_gelo:   { name: 'Lâmina Gélida',    price: 120, filter: 'hue-rotate(155deg) saturate(1.5) brightness(1.12) drop-shadow(0 0 4px rgba(120,220,255,.85))' }
        };
        const VIP_PRICE = 150, BUNDLE_PRICE = 180;
        const ONLINE_ERR = {
          not_logged: 'Entre na sua conta primeiro.', no_player: 'Escolha seu nome de jogador primeiro.', banned: 'Conta suspensa.',
          no_funds: 'Cristais insuficientes.', already_owned: 'Você já tem este item.', unknown_item: 'Item indisponível.',
          adult_required: 'Confirme que você tem 18 anos ou mais.', provider: 'O Mercado Pago não respondeu. Tente de novo.',
          server_not_configured: 'Loja ainda não configurada pelo dono do jogo.', invalid_name: 'Use 3 a 16 letras, números, espaço, _ . ou -',
          blocked_name: 'Esse nome não é permitido.', name_taken: 'Esse nome já está em uso.', already_registered: 'Você já escolheu um nome.'
        };
        const onlineErr = (e) => ONLINE_ERR[e] || 'Algo deu errado. Tente novamente.';

        /* ---- sessão ---- */
        function loadSession() {
          try { const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); if (s && s.access_token && s.refresh_token) return s; } catch (e) {}
          return null;
        }
        function storeSession(s) {
          online.session = s;
          try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); } catch (e) {}
        }
        function sessionFromAuth(d) {
          if (!d || !d.access_token) return null;
          return { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (Number(d.expires_in) || 3600) * 1000, user: d.user || null };
        }

        async function rawFetch(path, opt) {
          opt = opt || {};
          const headers = { apikey: SB_KEY, 'Content-Type': 'application/json', Authorization: 'Bearer ' + (opt.token || SB_KEY) };
          try {
            const res = await fetch(SB_URL + path, { method: opt.method || 'POST', headers, body: opt.body === undefined ? undefined : JSON.stringify(opt.body), keepalive: !!opt.keepalive });
            let data = null; try { data = await res.json(); } catch (e) {}
            return { ok: res.ok, status: res.status, data, offline: false };
          } catch (e) { return { ok: false, status: 0, data: null, offline: true }; }
        }

        async function getToken() {
          const s = online.session;
          if (!s) return null;
          if (s.expires_at - Date.now() > 60000) return s.access_token;
          const r = await rawFetch('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: s.refresh_token } });
          if (r.ok && r.data && r.data.access_token) {
            const ns = sessionFromAuth(r.data); ns.user = ns.user || s.user; storeSession(ns); return ns.access_token;
          }
          if (r.status === 400 || r.status === 401 || r.status === 403) { storeSession(null); online.me = null; renderAccount(); }
          return s.expires_at > Date.now() ? s.access_token : null;
        }

        async function rpc(name, args, opt) {
          opt = opt || {};
          const token = opt.anon ? null : await getToken();
          if (!opt.anon && !token) return { ok: false, status: 401, data: null };
          return rawFetch('/rest/v1/rpc/' + name, { body: args || {}, token: token, keepalive: opt.keepalive });
        }

        /* ---- login ---- */
        async function sendLoginCode(email) {
          const site = String(GCFG.SITE_URL || (location.origin + location.pathname));
          return rawFetch('/auth/v1/otp?redirect_to=' + encodeURIComponent(site), { body: { email: email, create_user: true } });
        }
        async function verifyLoginCode(email, code) {
          const r = await rawFetch('/auth/v1/verify', { body: { type: 'email', email: email, token: code } });
          if (r.ok && r.data && r.data.access_token) { storeSession(sessionFromAuth(r.data)); return true; }
          return false;
        }
        function loginGoogle() {
          const site = String(GCFG.SITE_URL || (location.origin + location.pathname));
          location.href = SB_URL + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(site);
        }
        function logout() {
          storeSession(null); online.me = null; online.myRank = {}; applySkin(); renderAccount(); renderPremium(); renderRanking();
          showToast('Você saiu da conta. Seu progresso continua salvo neste aparelho.');
        }
        async function consumeAuthHash() {
          const h = location.hash || '';
          if (h.indexOf('access_token=') < 0 && h.indexOf('error_description=') < 0) return;
          const p = new URLSearchParams(h.replace(/^#/, ''));
          try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
          if (p.get('error_description')) { showToast('Login não concluído: ' + p.get('error_description')); return; }
          const s = { access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_at: Date.now() + (Number(p.get('expires_in')) || 3600) * 1000, user: null };
          if (s.access_token && s.refresh_token) storeSession(s);
        }

        /* ---- eu (nome, cristais, itens, entregas) ---- */
        function isVip() { try { return !!(online.me && (online.me.entitlements || []).some((e) => e.item === 'vip_30' && e.expires_at && new Date(e.expires_at).getTime() > Date.now())); } catch (e) { return false; } }
        const ownsItem = (id) => !!(online.me && (online.me.entitlements || []).some((e) => e.item === id));
        function applySkin() {
          const id = (state.skin && ownsItem(state.skin)) ? state.skin : '';
          document.body.setAttribute('data-skin', id);
        }
        async function refreshMe() {
          if (!online.session) return null;
          const r = await rpc('get_me');
          if (!r.ok || !r.data) return null;
          online.me = r.data;
          applySkin(); syncHeroVitals();
          if (online.me.deliveries && online.me.deliveries.length) applyDeliveries(online.me.deliveries);
          renderAccount(); renderPremium();
          return online.me;
        }
        function applyDeliveries(list) {
          const done = state.deliveredIds || (state.deliveredIds = []);
          const ids = []; let text = [];
          list.forEach((d) => {
            if (!done.includes(d.id)) {
              const p = d.payload || {};
              if (p.essences) { state.essences += clamp(Math.floor(num(p.essences, 0)), 0, 5000); text.push(p.essences + ' 🔥'); }
              if (p.tickets) { state.arenaTickets += clamp(Math.floor(num(p.tickets, 0)), 0, 50); text.push(p.tickets + ' 🎟️'); }
              if (p.petFood) { state.petFood += clamp(Math.floor(num(p.petFood, 0)), 0, 5000); text.push(p.petFood + ' 🍖'); }
              if (p.goldHours) { state.gold += Math.round(stageGold(Math.max(curIdx(), state.runBest)) * 90 * clamp(num(p.goldHours, 0), 0, 48)); text.push('ouro'); }
              done.push(d.id); if (done.length > 60) done.shift();
            }
            ids.push(d.id);
          });
          saveGame(); afterAction();
          if (text.length) showToast('🎁 Pacote recebido: ' + text.join(' • '));
          rpc('ack_deliveries', { p_ids: ids });
        }

        /* ---- progresso e nuvem ---- */
        function snapshotForArena() {
          const s = getHeroStats();
          return { atk: s.atk, hp: s.hp, def: s.def, crit: s.crit, critMult: s.critMult, spd: s.atkSpeedMult, lifesteal: s.lifesteal };
        }
        async function pushProgress(force, keepalive) {
          if (!online.on || !online.session || !online.me || !online.me.name) return;
          const now = Date.now();
          if (!force && now - online.lastPush < 60000) return;
          online.lastPush = now; online.lbAt = {};
          const st = getHeroStats();
          rpc('submit_progress', {
            p_best_idx: state.stats.bestIdx, p_trophies: state.trophies, p_stars: state.totalStars, p_rebirths: state.stats.rebirths,
            p_level: state.heroLevel, p_power: Math.round(st.power), p_snapshot: snapshotForArena()
          }, { keepalive: keepalive });
          if (!online.pending) rpc('save_cloud', { p_data: state, p_version: SAVE_VERSION }, { keepalive: keepalive });
        }
        function onlineTick() { if (online.on && online.session) pushProgress(false); }

        const saveSummary = (s) => 'Nível ' + (s.heroLevel || 1) + '<br>' + stageLabel(s.stats && s.stats.bestIdx || 0) + '<br>⭐ ' + (s.totalStars || 0) + ' • 🏆 ' + (s.trophies || 0);
        async function cloudSync() {
          const r = await rpc('load_cloud');
          if (!r.ok) return;
          const cloud = r.data && r.data.data ? r.data : null;
          const localFresh = state.stats.bestIdx === 0 && state.heroLevel <= 1 && state.totalStars === 0;
          if (!cloud) { pushProgress(true); return; }
          let cs; try { cs = migrateState(cloud.data); } catch (e) { pushProgress(true); return; }
          const L = [state.stats.bestIdx, state.totalStars, state.stats.rebirths], C = [cs.stats.bestIdx, cs.totalStars, cs.stats.rebirths];
          const localGE = L.every((v, i) => v >= C[i]), cloudGE = C.every((v, i) => v >= L[i]);
          const cloudAt = new Date(cloud.updated_at).getTime() || 0;
          if (localGE && cloudGE) {                       // progresso igual: vale o mais recente
            if ((state.lastSeen || 0) >= cloudAt - 120000) pushProgress(true); else adoptCloudSave(cs);
            return;
          }
          if (localGE) { pushProgress(true); return; }    // este aparelho está à frente
          if (cloudGE) { adoptCloudSave(cs); return; }    // a nuvem está à frente
          online.pending = cs;
          $('sync-cloud').innerHTML = saveSummary(cs); $('sync-local').innerHTML = saveSummary(state);
          $('sync-modal').classList.add('open');
        }
        function adoptCloudSave(cs) {
          state = cs; state.lastSeen = Date.now(); online.pending = null;
          saveGame(); bootGame(); applySkin(); afterAction();
          showToast('☁️ Progresso da nuvem carregado!');
        }

        /* ---- ranking ---- */
        async function loadLeaderboard(kind, force) {
          if (!online.on) return;
          kind = kind || online.lbKind; online.lbKind = kind;
          if (!force && online.lb[kind] && Date.now() - (online.lbAt[kind] || 0) < 20000) { renderRanking(); return; }
          const r = await rpc('get_leaderboard', { p_kind: kind, p_limit: 50 }, { anon: !online.session });
          if (r.ok && Array.isArray(r.data)) { online.lb[kind] = r.data; online.lbAt[kind] = Date.now(); }
          else if (!online.lb[kind]) online.lb[kind] = null;
          if (online.session && online.me && online.me.name) {
            const m = await rpc('my_rank', { p_kind: kind });
            if (m.ok) online.myRank[kind] = m.data;
          }
          renderRanking();
        }
        function rankValue(kind, v) {
          if (kind === 'trophies') { const lg = getLeagueForTrophies(v); return lg.icon + ' ' + fmt(v); }
          if (kind === 'stars') return '⭐ ' + fmt(v);
          return stageLabel(v);
        }
        function renderRanking() {
          const box = $('leaderboard-container'); if (!box) return;
          const kind = online.lbKind;
          document.querySelectorAll('button[data-rank-kind]').forEach((b) => b.classList.toggle('active', b.getAttribute('data-rank-kind') === kind));
          if (!online.on) { setText('rank-note', 'O ranking online não está ativo nesta versão. Hospede o jogo com o servidor configurado (veja o README).'); setHTML('leaderboard-container', ''); return; }
          if (!online.session) setHTML('rank-note', '<button class="btn-green" data-act="login" style="width:100%;padding:9px;">👤 Entrar para aparecer no ranking</button>');
          else if (!online.me || !online.me.name) setHTML('rank-note', '<button class="btn-green" data-act="name" style="width:100%;padding:9px;">✏️ Escolher meu nome de jogador</button>');
          else {
            const m = online.myRank[kind];
            setText('rank-note', m ? ('Você está em #' + fmt(m.rank) + ' de ' + fmt(m.total) + ' jogadores.') : 'Só jogadores reais aparecem aqui.');
          }
          const rows = online.lb[kind];
          if (rows === undefined) { setHTML('leaderboard-container', '<div class="mini-note">Carregando…</div>'); return; }
          if (rows === null) { setHTML('leaderboard-container', '<div class="mini-note">Não foi possível carregar o ranking agora.</div>'); return; }
          if (!rows.length) { setHTML('leaderboard-container', '<div class="mini-note">Ninguém no ranking ainda. Seja o primeiro!</div>'); return; }
          setHTML('leaderboard-container', rows.map((r) => {
            const rk = Number(r.rank);
            const medal = rk === 1 ? '🥇' : rk === 2 ? '🥈' : rk === 3 ? '🥉' : '#' + rk;
            return '<div class="rank-row' + (r.is_me ? ' me' : '') + '"><span class="rank-pos">' + medal + '</span>' +
              '<div style="flex:1;min-width:0;"><div class="rank-name">' + esc(r.name) + '</div><div class="mini-note">Nível ' + esc(r.level) + '</div></div>' +
              '<span class="rank-val">' + rankValue(kind, Number(r.value)) + '</span></div>';
          }).join(''));
        }

        /* ---- rivais reais da Arena ---- */
        async function loadRivals(force) {
          if (!online.on || !online.session || !online.me || !online.me.name) return;
          if (!force && Date.now() - online.rivalsAt < 60000) return;
          online.rivalsAt = Date.now();
          const r = await rpc('get_rivals', { p_power: Math.round(getHeroStats().power), p_count: 4 });
          if (r.ok && Array.isArray(r.data)) { online.rivals = r.data; if (!duel.active) { generateRivals(); if (ui.tab === 'aventura') renderArena(); } }
        }

        /* ---- interface: conta, login, nome ---- */
        function renderAccount() {
          let line;
          if (!online.on) line = 'Modo offline: seu progresso fica só neste aparelho.';
          else if (!online.session) line = 'Você não está conectado. Entre para salvar na nuvem e entrar no ranking.';
          else if (online.me && online.me.name) line = '👤 <b>' + esc(online.me.name) + '</b>' + (isVip() ? ' <span class="vip-badge">👑 VIP</span>' : '') + ' • ☁️ nuvem ativa';
          else line = 'Conectado. Falta escolher seu nome de jogador.';
          setHTML('settings-account', line);
          const b = $('btn-account');
          if (b) { b.textContent = !online.on ? '👤 Conta (indisponível offline)' : online.session ? '🚪 Sair da conta' : '👤 Entrar / criar conta'; }
          const sa = $('splash-acct'), sl = $('splash-login');
          if (sa) {
            if (!online.on) { sa.textContent = 'Modo offline • progresso salvo neste aparelho'; if (sl) sl.style.display = 'none'; }
            else if (online.session && online.me && online.me.name) { sa.innerHTML = 'Bem-vindo, <b>' + esc(online.me.name) + '</b>!'; if (sl) sl.style.display = 'none'; }
            else if (online.session) { sa.textContent = 'Conectado. Escolha seu nome dentro do jogo.'; if (sl) sl.style.display = 'none'; }
            else { sa.textContent = 'Jogue já. Entre quando quiser para usar o ranking.'; if (sl) sl.style.display = 'inline-block'; }
          }
        }
        function openLogin() {
          if (!online.on) { showToast('O modo online não está configurado nesta versão.'); return; }
          $('login-err').textContent = ''; $('login-step-email').style.display = 'block'; $('login-step-code').style.display = 'none';
          $('login-modal').classList.add('open');
        }
        function openName() { $('name-err').textContent = ''; $('name-modal').classList.add('open'); setTimeout(() => $('name-input').focus(), 80); }
        async function afterLogin() {
          const me = await refreshMe();
          if (!me) { showToast('Não consegui falar com o servidor. Tente de novo.'); return; }
          if (!me.name) { openName(); return; }
          await cloudSync(); loadRivals(true); if (ui.tab === 'heroi') loadLeaderboard(online.lbKind, true);
        }
        function wireOnline() {
          const termsOk = () => { if (!$('login-terms').checked) { $('login-err').textContent = 'Marque que leu os Termos e a Privacidade.'; return false; } return true; };
          $('btn-google').addEventListener('click', () => { if (termsOk()) loginGoogle(); });
          $('btn-send-code').addEventListener('click', async () => {
            const email = $('login-email').value.trim();
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $('login-err').textContent = 'Digite um e-mail válido.'; return; }
            if (!termsOk()) return;
            $('login-err').textContent = ''; $('btn-send-code').disabled = true;
            const r = await sendLoginCode(email); $('btn-send-code').disabled = false;
            if (!r.ok) { $('login-err').textContent = r.offline ? 'Sem conexão com o servidor.' : 'Não foi possível enviar o código. Confira o e-mail.'; return; }
            $('login-step-email').style.display = 'none'; $('login-step-code').style.display = 'block';
            $('login-code-hint').textContent = 'Enviamos um código para ' + email + '. Veja também a caixa de spam.';
            $('login-code').value = ''; setTimeout(() => $('login-code').focus(), 80);
          });
          $('btn-verify-code').addEventListener('click', async () => {
            const email = $('login-email').value.trim(), code = $('login-code').value.replace(/\s+/g, '');
            if (code.length < 6) { $('login-err').textContent = 'Digite o código completo.'; return; }
            $('btn-verify-code').disabled = true;
            const ok = await verifyLoginCode(email, code); $('btn-verify-code').disabled = false;
            if (!ok) { $('login-err').textContent = 'Código incorreto ou expirado.'; return; }
            $('login-modal').classList.remove('open'); await afterLogin();
          });
          $('btn-login-close').addEventListener('click', () => $('login-modal').classList.remove('open'));
          $('btn-name-ok').addEventListener('click', async () => {
            const nm = $('name-input').value.trim(); $('btn-name-ok').disabled = true;
            const r = await rpc('register_player', { p_name: nm }); $('btn-name-ok').disabled = false;
            if (!r.ok || !r.data) { $('name-err').textContent = 'Sem conexão com o servidor.'; return; }
            if (!r.data.ok) { $('name-err').textContent = onlineErr(r.data.error); return; }
            $('name-modal').classList.remove('open'); showToast('Bem-vindo, ' + r.data.name + '!');
            await refreshMe(); await cloudSync(); loadRivals(true); loadLeaderboard(online.lbKind, true);
          });
          $('btn-sync-cloud').addEventListener('click', () => { $('sync-modal').classList.remove('open'); if (online.pending) adoptCloudSave(online.pending); });
          $('btn-sync-local').addEventListener('click', () => { $('sync-modal').classList.remove('open'); online.pending = null; pushProgress(true); showToast('☁️ Progresso deste aparelho enviado para a nuvem.'); });
          $('btn-account').addEventListener('click', () => { if (!online.on) { showToast('O modo online não está configurado nesta versão.'); return; } $('settings-modal').classList.remove('open'); if (online.session) logout(); else openLogin(); });
          if ($('splash-login')) $('splash-login').addEventListener('click', openLogin);
          if ($('splash-play')) $('splash-play').addEventListener('click', () => { const s = $('splash'); if (!s) return; s.classList.add('hide'); setTimeout(() => s.remove(), 600); });
          document.querySelectorAll('button[data-rank-kind]').forEach((b) => b.addEventListener('click', () => { online.lbKind = b.getAttribute('data-rank-kind'); renderRanking(); loadLeaderboard(online.lbKind, true); }));
          $('btn-rank-refresh').addEventListener('click', () => loadLeaderboard(online.lbKind, true));
          document.querySelector('button[data-hero-sub="ranking"]').addEventListener('click', () => loadLeaderboard(online.lbKind));
          document.querySelector('button[data-shop-sub]').parentNode.addEventListener('click', (e) => {
            const b = e.target.closest('button[data-shop-sub]'); if (!b) return;
            const sub = b.getAttribute('data-shop-sub');
            document.querySelectorAll('button[data-shop-sub]').forEach((x) => x.classList.toggle('active', x === b));
            $('shop-sub-items').style.display = sub === 'items' ? 'block' : 'none';
            $('shop-sub-premium').style.display = sub === 'premium' ? 'block' : 'none';
            if (sub === 'premium') { renderPremium(); if (online.session) refreshMe(); }
          });
          $('btn-buy-cancel').addEventListener('click', () => $('buy-modal').classList.remove('open'));
          $('btn-buy-go').addEventListener('click', startCheckout);
          window.addEventListener('pagehide', () => pushProgress(true, true));
          // fecha o splash ao tocar fora do botão? não: exige toque em JOGAR (também libera o som)
          const chest = $('chest-svg');
          if (chest && $('splash-chest')) {
            $('splash-chest').innerHTML = chest.outerHTML.replace(/id="(\w+)"/g, 'id="$1-s"').replace(/url\(#(\w+)\)/g, 'url(#$1-s)').replace(/href="#(\w+)"/g, 'href="#$1-s"');
          }
        }

        /* ---- loja premium ---- */
        function renderPremium() {
          if (!$('premium-account')) return;
          const me = online.me;
          if (!online.on) {
            setHTML('premium-account', '<strong style="font-family:var(--font-display);font-size:16px;">💠 Loja Premium</strong><div class="mini-note" style="margin-top:4px;">Disponível quando o jogo estiver hospedado com o servidor configurado. Nesta versão offline não há compras.</div>');
            setHTML('pack-grid', ''); setHTML('skin-list', ''); setHTML('vip-card', ''); setHTML('bundle-card', ''); return;
          }
          if (!online.session) setHTML('premium-account', '<strong style="font-family:var(--font-display);font-size:16px;">Sua conta</strong><div class="mini-note" style="margin:4px 0 8px;">Para comprar, entre na sua conta. Seus Cristais ficam guardados no servidor.</div><button class="btn-green" data-act="login" style="width:100%;padding:10px;">👤 Entrar / criar conta</button>');
          else if (!me || !me.name) setHTML('premium-account', '<strong style="font-family:var(--font-display);font-size:16px;">Quase lá</strong><div class="mini-note" style="margin:4px 0 8px;">Escolha seu nome de jogador para liberar a loja.</div><button class="btn-green" data-act="name" style="width:100%;padding:10px;">✏️ Escolher nome</button>');
          else setHTML('premium-account', '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><div><strong style="font-family:var(--font-display);font-size:16px;">' + esc(me.name) + '</strong>' + (isVip() ? ' <span class="vip-badge">👑 VIP</span>' : '') + '<div class="mini-note">Seu saldo</div></div><div style="font-family:var(--font-display);font-weight:800;font-size:24px;color:#6d28d9;">' + fmt(me.crystals || 0) + ' 💠</div></div>');

          setHTML('pack-grid', PACKS.map((p) =>
            '<div class="pack' + (p.best ? ' best' : '') + '" data-act="pack" data-id="' + p.id + '">' + (p.tag ? '<span class="pk-tag">' + p.tag + '</span>' : '') +
            '<div class="pk-ic">💠</div><div class="pk-n">' + p.n + '</div><span class="pk-price">' + p.price + '</span></div>').join(''));

          const heroSvg = $('hero-svg') ? $('hero-svg').outerHTML.replace(/ id="[^"]*"/g, '') : '';
          const equipped = state.skin || '';
          setHTML('skin-list', Object.keys(SKINS).map((id) => {
            const sk = SKINS[id], own = ownsItem(id);
            const btn = own
              ? '<button class="btn-green' + (equipped === id ? ' muted' : '') + '" data-act="equip" data-id="' + id + '" style="min-width:86px;">' + (equipped === id ? 'Equipado ✓' : 'Equipar') + '</button>'
              : '<button class="btn-green" data-act="spend" data-id="' + id + '" style="min-width:86px;">' + sk.price + ' 💠</button>';
            return '<div class="row-card skin-chip"><div class="skin-prev" style="--f:' + sk.filter + '"><span style="display:flex;filter:' + sk.filter + ';">' + heroSvg + '</span></div>' +
              '<div style="flex:1;min-width:0;"><div style="font-family:var(--font-display);font-weight:800;font-size:14px;">' + sk.name + '</div><div class="mini-note">Aparência exclusiva</div></div>' + btn + '</div>';
          }).join('') + (equipped ? '<button class="btn-outline" data-act="equip" data-id="" style="width:100%;">Voltar à aparência padrão</button>' : ''));

          let vipLine = 'Ouro e experiência +25% por 30 dias. Compras empilham.';
          if (isVip()) { const e = me.entitlements.find((x) => x.item === 'vip_30'); vipLine = '✅ Ativo até ' + new Date(e.expires_at).toLocaleDateString('pt-BR') + '. Comprar de novo soma +30 dias.'; }
          setHTML('vip-card', '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><div><strong style="font-family:var(--font-display);font-size:15px;">👑 Passe VIP — 30 dias</strong><div class="mini-note">' + vipLine + '</div></div><button class="btn-green" data-act="spend" data-id="vip_30" style="min-width:86px;">' + VIP_PRICE + ' 💠</button></div>');
          setHTML('bundle-card', '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><div><strong style="font-family:var(--font-display);font-size:15px;">🎒 Pacote do Guardião <span class="mini-note">(1 por conta)</span></strong><div class="mini-note">150 🔥 Essências • 5 🎟️ Ingressos • 40 🍖 Ração • 2h de ouro</div></div><button class="btn-green" data-act="spend" data-id="bundle_guardiao" style="min-width:86px;">' + BUNDLE_PRICE + ' 💠</button></div>');
        }
        async function spendItem(id) {
          if (!online.session) { openLogin(); return; }
          if (!online.me || !online.me.name) { openName(); return; }
          const r = await rpc('spend_crystals', { p_item: id });
          if (!r.ok || !r.data) { showToast('Sem conexão com o servidor.'); return; }
          if (!r.data.ok) { SFX.error(); showToast(onlineErr(r.data.error)); return; }
          SFX.legendary(); showToast('✨ Compra concluída!');
          if (SKINS[id]) state.skin = id;
          await refreshMe(); saveGame();
        }
        function equipSkin(id) { state.skin = id && ownsItem(id) ? id : ''; applySkin(); saveGame(); renderPremium(); }

        let buyPack = null;
        function openBuy(id) {
          const p = PACKS.find((x) => x.id === id); if (!p) return;
          if (!online.session) { openLogin(); return; }
          if (!online.me || !online.me.name) { openName(); return; }
          buyPack = p; $('buy-title').textContent = p.n + ' Cristais'; $('buy-price').textContent = p.price;
          $('buy-adult').checked = false; $('buy-err').textContent = ''; $('btn-buy-go').disabled = false;
          $('buy-modal').classList.add('open');
        }
        async function startCheckout() {
          if (!buyPack) return;
          if (!$('buy-adult').checked) { $('buy-err').textContent = 'Confirme que você tem 18 anos ou mais.'; return; }
          $('btn-buy-go').disabled = true; $('buy-err').textContent = '';
          const token = await getToken();
          const r = await rawFetch('/functions/v1/create-checkout', { token: token, body: { pack_id: buyPack.id, adult: true } });
          if (r.ok && r.data && r.data.url) {
            try { sessionStorage.setItem('gdb_cr_before', String((online.me && online.me.crystals) || 0)); } catch (e) {}
            saveGame(); location.href = r.data.url; return;
          }
          $('btn-buy-go').disabled = false;
          $('buy-err').textContent = r.offline ? 'Sem conexão com o servidor.' : onlineErr(r.data && r.data.error);
        }
        async function checkPaymentReturn() {
          const q = new URLSearchParams(location.search), st = q.get('pago');
          if (!st) return;
          try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
          if (st === 'falha') { showToast('Pagamento não concluído. Nada foi cobrado.'); return; }
          showToast(st === 'ok' ? '✅ Pagamento recebido! Confirmando…' : '⏳ Pagamento pendente. Os Cristais chegam quando for aprovado.');
          let before = 0; try { before = Number(sessionStorage.getItem('gdb_cr_before')) || 0; } catch (e) {}
          for (let i = 0; i < 20; i++) {
            const me = await refreshMe();
            if (me && me.crystals > before) { SFX.legendary(); showToast('💠 +' + (me.crystals - before) + ' Cristais na sua conta!'); return; }
            await new Promise((res) => setTimeout(res, 3000));
          }
        }

        async function initOnline() {
          if (/[?&]nosplash\b/.test(location.search) && $('splash')) $('splash').remove();
          wireOnline(); renderAccount(); renderPremium(); renderRanking();
          if (!online.on) return;
          online.session = loadSession();
          await consumeAuthHash();
          renderAccount();
          if (online.session) { await afterLogin(); await checkPaymentReturn(); }
          renderAccount();
        }
