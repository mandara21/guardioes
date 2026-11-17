
        /* =====================================================================
           12. ARENA DOS GUARDIÕES (ingressos + duelo com habilidades)
           ===================================================================== */
        const RIVAL_TEMPLATES = [
          { name: 'Kael, Lâmina Sombria',  color: '#475569', hood: '#1e293b', blade: '#38bdf8' },
          { name: 'Lyra da Tempestade',    color: '#7c3aed', hood: '#facc15', blade: '#c084fc' },
          { name: 'Varek, Punho de Ferro', color: '#b45309', hood: '#78350f', blade: '#fbbf24' },
          { name: 'Soren, Olho de Águia',  color: '#15803d', hood: '#14532d', blade: '#4ade80' },
          { name: 'Morgana Escarlate',     color: '#be123c', hood: '#881337', blade: '#fb7185' },
          { name: 'Thorgar, o Imortal',    color: '#0f766e', hood: '#134e4a', blade: '#2dd4bf' }
        ];

        const LEAGUES = [
          { name: 'Bronze III',      icon: '🥉', min: 0,    gems: 0 },
          { name: 'Prata I',         icon: '🥈', min: 1150, gems: 5 },
          { name: 'Ouro II',         icon: '🥇', min: 1350, gems: 10 },
          { name: 'Diamante I',      icon: '💎', min: 1650, gems: 15 },
          { name: 'Mestre Guardião', icon: '👑', min: 2000, gems: 25 }
        ];
        const getLeagueForTrophies = (pts) => LEAGUES[leagueIndex(pts)];

        let arenaRivals = [];
        const duel = { active: false, timer: null, rivalTimer: null, queued: null, cdPower: 0, cdGuard: 0 };

        function regenTickets() {
          const now = Date.now();
          if (state.arenaTickets >= ARENA_MAX_TICKETS) { state.arenaTicketAt = now; return; }
          const gained = Math.floor((now - state.arenaTicketAt) / ARENA_TICKET_MS);
          if (gained > 0) {
            state.arenaTickets = Math.min(ARENA_MAX_TICKETS, state.arenaTickets + gained);
            state.arenaTicketAt = state.arenaTickets >= ARENA_MAX_TICKETS ? now : state.arenaTicketAt + gained * ARENA_TICKET_MS;
          }
        }

        function buildRivalSVG(r, size) {
          const sz = size || 46;
          return '<svg viewBox="0 0 80 80" width="' + sz + '" height="' + sz + '" class="anim-idle" style="overflow:visible;">' +
            '<ellipse cx="40" cy="74" rx="18" ry="4.5" fill="rgba(0,0,0,0.3)"/>' +
            '<path d="M36 42 L32 66 L62 66 L54 42 Z" fill="' + r.hood + '" stroke="#291d18" stroke-width="2.5"/>' +
            '<rect x="29" y="40" width="24" height="22" rx="5" fill="' + r.color + '" stroke="#291d18" stroke-width="2.5"/>' +
            '<rect x="26" y="14" width="30" height="27" rx="8" fill="#fed7aa" stroke="#291d18" stroke-width="2.5"/>' +
            '<path d="M25 24 C25 11 57 11 57 24 L54 18 L40 16 L27 18 Z" fill="' + r.hood + '" stroke="#291d18" stroke-width="2.3"/>' +
            '<circle cx="34" cy="29" r="2.4" fill="#dc2626"/><circle cx="46" cy="29" r="2.4" fill="#dc2626"/>' +
            '<g transform="translate(22, 46) rotate(32)"><rect x="-4" y="-24" width="6" height="24" rx="2" fill="' + r.blade + '" stroke="#291d18" stroke-width="2.2"/></g>' +
            '</svg>';
        }

        const RIVAL_TIERS = [
          { tag: 'Fácil',   mult: 0.84, trophies: 25, gold: 120, k: 6,  keys: 1, tagBg: '#dcfce7', tagColor: '#166534' },
          { tag: 'Médio',   mult: 1.06, trophies: 40, gold: 210, k: 10, keys: 1, tagBg: '#fef3c7', tagColor: '#92400e' },
          { tag: 'Difícil', mult: 1.30, trophies: 65, gold: 340, k: 16, keys: 2, tagBg: '#fee2e2', tagColor: '#991b1b' }
        ];

        const hashStr = (str) => { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; };
        function realRivalObj(row) {
          const tpl = RIVAL_TEMPLATES[hashStr(String(row.name)) % RIVAL_TEMPLATES.length];
          return Object.assign({}, tpl, { name: String(row.name), real: true, level: row.level, power: Number(row.power) || 1, snap: row.snapshot || {} });
        }
        /* Com o servidor ligado: rivais REAIS (duelo contra o "fantasma" do jogador) + 2 treinos com NPC sem troféus */
        function generateRivals() {
          const npcN = online.on ? 2 : 3;
          const picks = RIVAL_TEMPLATES.slice().sort(() => Math.random() - 0.5).slice(0, npcN);
          const npcs = picks.map((tpl, i) => Object.assign({}, tpl, { tier: RIVAL_TIERS[i], npc: true }));
          const reals = online.on ? (online.rivals || []).slice(0, 3).map(realRivalObj) : [];
          arenaRivals = reals.concat(npcs);
        }

        /* Os atributos do rival acompanham SEMPRE o poder atual do herói */
        function rivalView(r) {
          const p = getHeroStats();
          const sg = stageGold(Math.max(curIdx(), state.runBest));
          if (r.real) {
            const ratio = r.power / Math.max(1, p.power);
            const t = ratio < 0.9 ? RIVAL_TIERS[0] : ratio < 1.15 ? RIVAL_TIERS[1] : RIVAL_TIERS[2], sn = r.snap || {};
            return Object.assign({}, r, {
              tag: '👤 ' + t.tag, tagBg: t.tagBg, tagColor: t.tagColor,
              power: Math.round(r.power), atk: Math.max(1, Math.round(sn.atk || 1)), def: Math.max(0, Math.round(sn.def || 0)), hp: Math.max(1, Math.round(sn.hp || 1)),
              rewardTrophies: t.trophies, rewardGold: Math.max(t.gold, sg * t.k), rewardKeys: t.keys
            });
          }
          const t = r.tier, training = online.on;
          return Object.assign({}, r, {
            tag: training ? '🤖 Treino' : t.tag, tagBg: training ? '#e2e8f0' : t.tagBg, tagColor: training ? '#334155' : t.tagColor,
            power: Math.round(p.power * t.mult), atk: Math.round(p.atk * t.mult), def: Math.round(p.def * t.mult),
            hp: Math.round(p.hp * t.mult * 1.05),
            rewardTrophies: training ? 0 : t.trophies, rewardGold: Math.max(t.gold, sg * t.k), rewardKeys: t.keys
          });
        }

        function renderArena() {
          if (!arenaRivals.length) generateRivals();
          setHTML('arena-rivals-container', arenaRivals.map(rivalView).map((r, i) =>
            '<div class="row-card">' +
              '<div style="width:46px;height:46px;border-radius:12px;background:#e8dfc8;border:1px solid #cfc19f;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + buildRivalSVG(r, 42) + '</div>' +
              '<div style="flex:1;min-width:0;">' +
                '<div style="display:flex;align-items:center;gap:5px;">' +
                  '<strong style="font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(r.name) + '</strong>' +
                  '<span style="font-size:10px;font-weight:800;padding:1px 6px;border-radius:999px;background:' + r.tagBg + ';color:' + r.tagColor + ';">' + r.tag + '</span>' +
                '</div>' +
                '<div style="font-size:11.5px;color:#575040;font-weight:700;margin-top:2px;">⚔️ Poder ' + fmt(r.power) + (r.real ? ' • Nv. ' + esc(r.level) : '') + '</div>' +
                '<div style="font-size:10.5px;color:#2d6a4f;font-weight:800;margin-top:1px;">' + (r.rewardTrophies ? '+' + r.rewardTrophies + ' 🏆 • ' : '') + '+' + fmt(r.rewardGold) + ' 🪙 • +' + r.rewardKeys + ' 🔑</div>' +
              '</div>' +
              '<button class="btn-green' + (state.arenaTickets > 0 ? '' : ' muted') + '" data-act="duel" data-id="' + i + '" style="flex-shrink:0;">Batalhar</button>' +
            '</div>').join(''));
          const lg = getLeagueForTrophies(state.trophies);
          setText('arena-league-badge', lg.icon + ' ' + lg.name + ' • ' + fmt(state.trophies) + ' pts');
          updateArenaTimer();
          if (online.on) loadRivals(false);
        }

        function updateArenaTimer() {
          setText('arena-tickets', state.arenaTickets + '/' + ARENA_MAX_TICKETS);
          if (state.arenaTickets >= ARENA_MAX_TICKETS) setText('arena-ticket-timer', 'Cheio');
          else setText('arena-ticket-timer', 'Próximo em ' + fmtTime((state.arenaTicketAt + ARENA_TICKET_MS - Date.now()) / 1000));
        }

        function duelLog(html, color) {
          const log = $('duel-log');
          log.insertAdjacentHTML('beforeend', '<div' + (color ? ' style="color:' + color + ';"' : '') + '>' + html + '</div>');
          log.scrollTop = log.scrollHeight;
        }

        function startColiseumDuel(idx) {
          if (!arenaRivals[idx] || duel.active) return;
          const rival = rivalView(arenaRivals[idx]);
          regenTickets();
          if (state.arenaTickets <= 0) { SFX.error(); showToast('Sem ingressos! Aguarde ou compre na Loja.'); return; }
          if (state.arenaTickets >= ARENA_MAX_TICKETS) state.arenaTicketAt = Date.now();
          state.arenaTickets--;
          saveGame();

          duel.active = true; duel.queued = null; duel.cdPower = 0; duel.cdGuard = 0;
          const p1 = getHeroStats();
          let p1Hp = p1.hp, p2Hp = rival.hp;
          const p1Max = p1.hp, p2Max = rival.hp;
          let turn = 1;

          setText('duel-title', 'Jef vs. ' + rival.name);
          setText('duel-turn-badge', 'Turno 1');
          setText('duel-p1-pwr', '⚡ ' + fmt(p1.power));
          setText('duel-p2-name', rival.name.split(',')[0]);
          setText('duel-p2-pwr', '⚡ ' + fmt(rival.power));
          $('duel-p1-sprite').innerHTML = $('hero-svg').outerHTML.replace('id="hero-svg"', '').replace('width="64"', 'width="66"').replace('height="64"', 'height="66"');
          $('duel-p2-sprite').innerHTML = buildRivalSVG(rival, 66);
          $('duel-log').innerHTML = '';
          duelLog('⚔️ O duelo começou entre <strong>Jef</strong> e <strong>' + esc(rival.name) + '</strong>! Use os botões para ajudar.');
          $('duel-result-box').style.display = 'none';
          $('btn-close-duel').style.display = 'none';
          $('duel-actions').style.display = 'grid';
          updateDuelButtons();

          const syncBars = () => {
            $('duel-p1-bar').style.width = Math.max(0, Math.round((p1Hp / p1Max) * 100)) + '%';
            setText('duel-p1-hp', fmt(Math.max(0, p1Hp)) + ' / ' + fmt(p1Max));
            $('duel-p2-bar').style.width = Math.max(0, Math.round((p2Hp / p2Max) * 100)) + '%';
            setText('duel-p2-hp', fmt(Math.max(0, p2Hp)) + ' / ' + fmt(p2Max));
          };
          syncBars();
          $('duel-modal').classList.add('open');

          const lunge = (id, px) => { const s = $(id); s.style.transform = 'translateX(' + px + 'px)'; setTimeout(() => { s.style.transform = ''; }, 150); };

          duel.timer = setInterval(() => {
            setText('duel-turn-badge', 'Turno ' + turn);

            // --- turno do Jef ---
            const power = duel.queued === 'power';
            const guard = duel.queued === 'guard';
            duel.queued = null;
            if (power) duel.cdPower = 3;
            if (guard) duel.cdGuard = 3;
            const crit1 = Math.random() * 100 < p1.crit;
            const dmg1 = Math.max(8, Math.round(p1.atk * (power ? 1.8 : 1) * (crit1 ? p1.critMult : 1) * rnd(0.9, 1.1) * (150 / (150 + rival.def))));
            p2Hp = Math.max(0, p2Hp - dmg1);
            lunge('duel-p1-sprite', 60);
            SFX.hit(crit1 || power);
            spawnFloater('duel-fx-layer', 72, 34, (power ? '💥 ' : '') + (crit1 ? 'CRÍTICO! ' : '') + '-' + fmt(dmg1), crit1 || power ? '#facc15' : '#ffffff', crit1 || power);
            duelLog('🗡️ Turno ' + turn + ': Jef ' + (power ? 'usou <strong>Golpe Forte</strong> e ' : '') + 'acertou <strong>' + fmt(dmg1) + '</strong>' + (crit1 ? ' (CRÍTICO!)' : '') + '.');
            if (guard) duelLog('🛡️ Jef se prepara para defender!', '#0369a1');
            syncBars();

            if (p2Hp <= 0) { endColiseumDuel(true, rival); return; }

            // --- turno do rival ---
            duel.rivalTimer = setTimeout(() => {
              if (!duel.active || p2Hp <= 0) return;
              const dmg2 = Math.max(6, Math.round(rival.atk * rnd(0.9, 1.1) * (150 / (150 + p1.def)) * (guard ? 0.4 : 1)));
              p1Hp = Math.max(0, p1Hp - dmg2);
              lunge('duel-p2-sprite', -60);
              SFX.hit(false);
              spawnFloater('duel-fx-layer', 26, 34, (guard ? '🛡️ ' : '') + '-' + fmt(dmg2), '#fca5a5', false);
              duelLog('🛡️ ' + esc(rival.name.split(',')[0]) + ' contra-atacou por <strong>' + fmt(dmg2) + '</strong>' + (guard ? ' (defendido)' : '') + '.', '#991b1b');
              syncBars();
              if (p1Hp <= 0) endColiseumDuel(false, rival);
            }, 380);

            duel.cdPower = Math.max(0, duel.cdPower - 1);
            duel.cdGuard = Math.max(0, duel.cdGuard - 1);
            updateDuelButtons();
            turn++;
          }, 1100);
        }

        function updateDuelButtons() {
          const bp = $('btn-duel-power'), bg = $('btn-duel-guard');
          const setBtn = (b, label, cd, key) => {
            const queued = duel.queued === key;
            b.textContent = queued ? label + ' ✓' : (cd > 0 ? label + ' (' + cd + ')' : label);
            b.disabled = cd > 0 || !duel.active;
            b.style.opacity = b.disabled ? '0.5' : '1';
            b.classList.toggle('warn', queued);
          };
          setBtn(bp, '💥 Golpe Forte', duel.cdPower, 'power');
          setBtn(bg, '🛡️ Guardar', duel.cdGuard, 'guard');
        }

        function endColiseumDuel(won, rival) {
          clearInterval(duel.timer); clearTimeout(duel.rivalTimer);
          duel.timer = null; duel.active = false;
          $('duel-actions').style.display = 'none';
          const box = $('duel-result-box');
          box.style.display = 'block';
          $('btn-close-duel').style.display = 'block';

          if (won) {
            state.stats.arenaWins++;
            state.trophies += rival.rewardTrophies;
            state.gold += rival.rewardGold;
            state.keys += rival.rewardKeys;
            state.essences += 2;
            addHeroXp(22);
            SFX.legendary();
            let promo = '';
            const li = leagueIndex(state.trophies);
            if (li > state.leagueRewarded) {
              let gems = 0;
              for (let k = state.leagueRewarded + 1; k <= li; k++) gems += LEAGUES[k].gems;
              state.gems += gems; state.leagueRewarded = li;
              promo = '<div style="font-size:12px;margin-top:4px;font-weight:900;">🎉 Promovido à liga ' + LEAGUES[li].icon + ' ' + LEAGUES[li].name + '! +' + gems + ' 💎</div>';
            }
            box.style.background = '#dcfce7'; box.style.borderColor = '#22c55e'; box.style.color = '#14532d';
            box.innerHTML = '<strong>🏆 VITÓRIA NA ARENA!</strong><div style="font-size:12px;margin-top:3px;">+' + rival.rewardTrophies + ' 🏆 • +' + fmt(rival.rewardGold) + ' 🪙 • +' + rival.rewardKeys + ' 🔑 • +2 🔥</div>' + promo;
          } else {
            const lost = Math.min(20, Math.round(rival.rewardTrophies * 0.4));
            state.trophies = Math.max(800, state.trophies - lost);
            SFX.lose();
            box.style.background = '#fee2e2'; box.style.borderColor = '#ef4444'; box.style.color = '#7f1d1d';
            box.innerHTML = '<strong>💀 DERROTA NA ARENA</strong><div style="font-size:12px;margin-top:3px;">-' + lost + ' 🏆. Use Golpe Forte e Guardar nos momentos certos, forje equipamentos e evolua seus talentos!</div>';
          }
          generateRivals();
          afterAction();
        }

        /* =====================================================================
           13. EXPEDIÇÕES (em tempo real, rendem até com o jogo fechado)
           ===================================================================== */
        const EXPEDITIONS = [
          { id: 'e1', name: 'Bosque Goblin',       minLvl: 1, dur: 30,   gold: 150, keys: 1, food: 3,  ess: 2,  bg: '#e3efe4', icon: '🌲' },
          { id: 'e2', name: 'Refúgio Enluarado',   minLvl: 3, dur: 120,  gold: 260, keys: 2, food: 5,  ess: 4,  bg: '#ebe5f5', icon: '🌙' },
          { id: 'e3', name: 'Minas Vulcânicas',    minLvl: 5, dur: 600,  gold: 450, keys: 2, food: 8,  ess: 7,  bg: '#f7ead9', icon: '🌋' },
          { id: 'e4', name: 'Cidadela das Nuvens', minLvl: 8, dur: 1800, gold: 780, keys: 3, food: 12, ess: 12, bg: '#e0f0f8', icon: '🐉' }
        ];
        const expGoldScale = () => 1 + state.runBest * 0.06;
        function expStatus(ex) {
          const run = state.expeditions[ex.id];
          if (!run) return 'idle';
          return Date.now() >= run.endAt ? 'ready' : 'running';
        }

        function renderExpeditions() {
          setHTML('expeditions-container', EXPEDITIONS.map((ex) => {
            const status = expStatus(ex);
            const ok = state.heroLevel >= ex.minLvl;
            let action;
            if (status === 'ready') action = '<button class="btn-green" data-act="exp-collect" data-id="' + ex.id + '" style="background:#d97706;">Coletar!</button>';
            else if (status === 'running') action = '<span class="badge-pill" id="exp-timer-' + ex.id + '">⏳</span>';
            else action = '<button class="btn-green ' + (ok ? '' : 'muted') + '" data-act="exp-send" data-id="' + ex.id + '">' + (ok ? 'Enviar' : 'Nv. ' + ex.minLvl) + '</button>';
            return '<div style="background:' + ex.bg + ';border:1px solid #d5cbb2;border-radius:15px;padding:12px;">' +
              '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">' +
                '<div style="display:flex;align-items:center;gap:10px;min-width:0;">' +
                  '<div style="font-size:28px;">' + ex.icon + '</div>' +
                  '<div style="min-width:0;">' +
                    '<div style="font-family:Georgia,serif;font-size:14.5px;font-weight:800;">' + ex.name + ' <span class="badge-pill">Nv. ' + ex.minLvl + '+</span></div>' +
                    '<div style="font-size:11.5px;font-weight:700;color:#4f493c;margin-top:2px;">🪙 ' + fmt(Math.round(ex.gold * expGoldScale())) + ' • 🔑 ' + ex.keys + ' • 🍖 ' + ex.food + ' • 🔥 ' + ex.ess + '</div>' +
                    '<div class="mini-note">Duração: ' + fmtTime(ex.dur) + '</div>' +
                  '</div>' +
                '</div>' + action +
              '</div>' +
              (status === 'running' ? '<div class="prog-bar" style="margin-top:8px;"><div id="exp-bar-' + ex.id + '" style="width:0%"></div></div>' : '') +
            '</div>';
          }).join(''));
          updateExpeditionTimers();
        }

        function updateExpeditionTimers() {
          let flipped = false;
          EXPEDITIONS.forEach((ex) => {
            const run = state.expeditions[ex.id];
            if (!run) return;
            const left = (run.endAt - Date.now()) / 1000;
            if (left <= 0) { if ($('exp-timer-' + ex.id)) flipped = true; return; }
            setText('exp-timer-' + ex.id, '⏳ ' + fmtTime(left));
            const bar = $('exp-bar-' + ex.id);
            if (bar) bar.style.width = clamp((1 - left / ex.dur) * 100, 0, 100).toFixed(1) + '%';
          });
          if (flipped && ui.tab === 'aventura') renderExpeditions();
        }

        const anyExpeditionReady = () => EXPEDITIONS.some((ex) => expStatus(ex) === 'ready');

        function sendExpedition(id) {
          const ex = EXPEDITIONS.find((x) => x.id === id);
          if (!ex || expStatus(ex) !== 'idle') return false;
          if (state.heroLevel < ex.minLvl) { SFX.error(); showToast('Requer Nível ' + ex.minLvl + ' do herói!'); return false; }
          state.expeditions[id] = { endAt: Date.now() + ex.dur * 1000 };
          SFX.coin();
          showToast('🗺️ Expedição enviada! Volta em ' + fmtTime(ex.dur) + '.');
          return true;
        }

        function collectExpedition(id) {
          const ex = EXPEDITIONS.find((x) => x.id === id);
          if (!ex || expStatus(ex) !== 'ready') return false;
          const gold = Math.round(ex.gold * expGoldScale());
          state.gold += gold; state.keys += ex.keys; state.petFood += ex.food; state.essences += ex.ess;
          delete state.expeditions[id];
          state.stats.expeditions++;
          addHeroXp(20 + state.heroLevel * 2);
          SFX.chestOpen();
          showToast(ex.name + ': +' + fmt(gold) + '🪙 +' + ex.keys + '🔑 +' + ex.food + '🍖 +' + ex.ess + '🔥');
          return true;
        }

        /* =====================================================================
           14. TALENTOS, MASCOTES E RANKING
           ===================================================================== */
        const TALENT_DEFS = [
          { key: 'fury',    name: '🔥 Fúria da Lâmina',  desc: '+3% Crítico e +5% Velocidade de Ataque por nível' },
          { key: 'bastion', name: '🛡️ Bastião de Pedra', desc: '+8% Vida Máxima e +4% Cura por onda' },
          { key: 'fortune', name: '🍀 Fortuna do Baú',   desc: '+12% Ouro e +3% Chance de Chave Extra' },
          { key: 'vampire', name: '🩸 Sede de Sangue',   desc: '+2% de Roubo de Vida por nível' },
          { key: 'arcane',  name: '✦ Maestria Arcana',   desc: '+6% dano das habilidades e -4% recarga por nível' }
        ];

        function renderTalentTree() {
          setText('talent-pts-badge', state.talentPoints + (state.talentPoints === 1 ? ' ponto' : ' pontos'));
          setHTML('talent-tree-list', TALENT_DEFS.map((t) => {
            const lvl = state.talents[t.key] || 0;
            const can = state.talentPoints > 0 && lvl < 10;
            return '<div class="row-card">' +
              '<div><div style="font-size:12.5px;font-weight:800;">' + t.name + ' <span style="color:#2d6a4f;">(Nv. ' + lvl + '/10)</span></div>' +
              '<div class="mini-note">' + t.desc + '</div></div>' +
              '<button class="btn-green ' + (can ? '' : 'muted') + '" data-act="talent" data-id="' + t.key + '" style="min-width:44px;">+1</button></div>';
          }).join(''));
        }

        function doTalent(key) {
          if (state.talentPoints <= 0 || (state.talents[key] || 0) >= 10) return false;
          state.talentPoints--;
          state.talents[key] = (state.talents[key] || 0) + 1;
          state.stats.upgradesDone++;
          syncHeroVitals();
          return true;
        }

        /* ---------------- Renascimento ---------------- */
        function stageLabel(cleared) {
          if (cleared <= 0) return '—';
          return 'Mundo ' + (Math.floor((cleared - 1) / 10) + 1) + ' • Fase ' + (((cleared - 1) % 10) + 1);
        }

        function renderRebirth() {
          const gain = rebirthGain();
          setText('rb-stars', fmt(state.stars));
          setText('rb-best', stageLabel(state.runBest));
          setText('rb-gain', '+' + gain + ' ⭐');
          const btn = $('btn-rebirth');
          if (btn && !btn._armed) btn.textContent = gain >= 1 ? '✨ Renascer (+' + gain + ' ⭐)' : '🔒 Renascer';
          if (btn) btn.disabled = gain < 1;
          setText('rb-need', gain >= 1
            ? 'Quanto mais longe você for antes de renascer, mais ⭐ ganha.'
            : 'Conclua o ' + stageLabel(REBIRTH_MIN) + ' (' + state.runBest + '/' + REBIRTH_MIN + ' fases) para liberar o Renascimento.');
          const u = state.starUp;
          setText('rb-bonus', '⚔️ ×' + Math.pow(1.08, u.power).toFixed(2).replace('.', ',') + ' atk/vida  •  🪙 +' + (u.wealth * 10) + '% ouro  •  📖 +' + (u.wisdom * 10) + '% XP');
          setHTML('rb-upgrades', Object.keys(STAR_UPS).map((k) => {
            const d = STAR_UPS[k], lvl = u[k] || 0, maxed = lvl >= d.max, cost = d.cost(lvl);
            const can = !maxed && state.stars >= cost;
            return '<div class="row-card">' +
              '<div><div style="font-size:12.5px;font-weight:800;">' + d.icon + ' ' + d.name + ' <span style="color:#2d6a4f;">(Nv. ' + lvl + '/' + d.max + ')</span></div>' +
              '<div class="mini-note">' + d.desc + '</div></div>' +
              '<button class="btn-green ' + (can ? '' : 'muted') + '" data-act="starup" data-id="' + k + '" style="min-width:58px;">' + (maxed ? 'MÁX' : cost + ' ⭐') + '</button></div>';
          }).join(''));
        }

        function doStarUp(key) {
          const d = STAR_UPS[key];
          if (!d) return false;
          const lvl = state.starUp[key] || 0, cost = d.cost(lvl);
          if (lvl >= d.max) return false;
          if (state.stars < cost) { SFX.error(); showToast('Precisa de ' + cost + ' ⭐ (ganhe renascendo)!'); return false; }
          state.stars -= cost; state.starUp[key] = lvl + 1;
          state.stats.upgradesDone++;
          syncHeroVitals();
          return true;
        }

        function doRebirth() {
          const gain = rebirthGain();
          if (gain < 1) return false;
          const fresh = createFreshState();
          state.stars += gain; state.totalStars += gain; state.stats.rebirths++;
          const lg = state.starUp.legacy || 0;
          ['gold', 'keys', 'essences', 'chestLevel', 'heroLevel', 'heroXp', 'talentPoints', 'trainAtk', 'trainHp'].forEach((k) => { state[k] = fresh[k]; });
          state.talents = fresh.talents; state.equipment = fresh.equipment; state.slotEnhance = fresh.slotEnhance;
          state.gold += 400 * lg; state.keys += 4 * lg;
          state.world = 1; state.stage = 1; state.autoAdvance = true; state.runBest = 0;
          state.bestStage[1] = state.bestStage[1] || 1;
          return gain;
        }

        function doRespec() {
          const spent = Object.keys(state.talents).reduce((a, k) => a + state.talents[k], 0);
          if (spent <= 0) { showToast('Você ainda não distribuiu talentos.'); return false; }
          if (state.gems < 5) { SFX.error(); showToast('Precisa de 5 💎 para redistribuir!'); return false; }
          state.gems -= 5;
          Object.keys(state.talents).forEach((k) => { state.talents[k] = 0; });
          state.talentPoints += spent;
          syncHeroVitals();
          SFX.coin();
          showToast('↺ ' + spent + ' pontos devolvidos. Distribua como quiser!');
          return true;
        }

        function renderPetsGrid() {
          setText('pet-food-count', state.petFood);
          setHTML('pets-grid', Object.keys(PET_CATALOG).map((pid) => {
            const meta = PET_CATALOG[pid];
            const ps = state.pets[pid] || { unlocked: false, level: 1 };
            const eq = state.activePet === pid;
            const cost = ps.level * 3;
            return '<div style="background:' + (eq ? '#fef3c7' : '#f6f2e2') + ';border:1.5px solid ' + (eq ? '#d97706' : '#dcd4bc') + ';border-radius:14px;padding:10px;text-align:center;opacity:' + (ps.unlocked ? '1' : '0.6') + ';">' +
              '<div style="margin:0 auto 4px auto;">' + getPetSVG(pid, 46) + '</div>' +
              '<div style="font-size:12.5px;font-weight:900;">' + meta.name + '</div>' +
              '<div style="font-size:11px;font-weight:800;color:#2d6a4f;margin-bottom:6px;">' + meta.bonusText + ' (Nv. ' + ps.level + ')</div>' +
              (ps.unlocked
                ? '<div style="display:flex;gap:4px;">' +
                    '<button class="btn-outline" data-act="pet-equip" data-id="' + pid + '" style="flex:1;padding:5px 4px;font-size:11px;">' + (eq ? 'Equipado' : 'Equipar') + '</button>' +
                    '<button class="btn-green' + (state.petFood >= cost ? '' : ' muted') + '" data-act="pet-feed" data-id="' + pid + '" style="flex:1;padding:5px 4px;font-size:11px;">🍖 ' + cost + '</button>' +
                  '</div>'
                : '<div style="font-size:11px;font-weight:800;color:#6e6552;">Choque um ovo!</div>') +
            '</div>';
          }).join(''));
        }

        function hatchEgg() {
          if (state.gems < 12) { SFX.error(); showToast('Precisa de 12 💎 para chocar um Ovo Místico!'); return false; }
          state.gems -= 12;
          const allIds = Object.keys(PET_CATALOG);
          const locked = allIds.filter((id) => !state.pets[id].unlocked);
          const chosen = locked.length > 0 ? pick(locked) : pick(allIds);
          if (!state.pets[chosen].unlocked) {
            state.pets[chosen].unlocked = true;
            state.activePet = chosen;
            showToast('🥚 Novo Mascote: ' + PET_CATALOG[chosen].name + '!');
          } else {
            state.pets[chosen].level++;
            showToast('🐾 ' + PET_CATALOG[chosen].name + ' subiu para o Nível ' + state.pets[chosen].level + '!');
          }
          SFX.legendary();
          applyWorldTheme();
          syncHeroVitals();
          return true;
        }

        function renderLeaderboard() { renderRanking(); }

        /* =====================================================================
           15. MISSÕES DIÁRIAS + CONQUISTAS EM NÍVEIS
           ===================================================================== */
        const DAILY_DEFS = [
          { id: 'd1', title: 'Caçador Diário',   desc: 'Derrote 25 inimigos',            target: 25, key: 'goblinsDefeated', gold: 200, gems: 1, keys: 1, ess: 2 },
          { id: 'd2', title: 'Abridor de Baús',  desc: 'Abra 4 baús',                    target: 4,  key: 'chestsOpened',    gold: 150, gems: 1, keys: 1, ess: 0 },
          { id: 'd3', title: 'Duelista',         desc: 'Vença 2 duelos na Arena',        target: 2,  key: 'arenaWins',       gold: 250, gems: 2, keys: 1, ess: 2 },
          { id: 'd4', title: 'Ferreiro',         desc: 'Faça 2 melhorias (Forja/Treino/Talento)', target: 2, key: 'upgradesDone', gold: 200, gems: 1, keys: 1, ess: 3 },
          { id: 'd5', title: 'Explorador',       desc: 'Complete 1 expedição',           target: 1,  key: 'expeditions',     gold: 250, gems: 2, keys: 1, ess: 2 }
        ];
        const DAILY_BONUS = { gems: 5, keys: 3, ess: 10 };
        const DAILY_KEYS = ['goblinsDefeated', 'chestsOpened', 'arenaWins', 'upgradesDone', 'expeditions'];

        const ACHIEVEMENTS = [
          { id: 'q1', title: 'Primeiros Passos',      unit: 'ondas vencidas',     val: () => state.stats.battlesWon,      tiers: [1, 10, 50, 150, 400, 1000] },
          { id: 'q2', title: 'Caçador de Tesouros',   unit: 'baús abertos',       val: () => state.stats.chestsOpened,    tiers: [5, 25, 75, 200, 500, 1500] },
          { id: 'q3', title: 'Gladiador da Arena',    unit: 'duelos vencidos',    val: () => state.stats.arenaWins,       tiers: [2, 10, 30, 80, 200] },
          { id: 'q4', title: 'Defensor da Trilha',    unit: 'inimigos derrotados', val: () => state.stats.goblinsDefeated, tiers: [15, 100, 400, 1500, 5000, 15000] },
          { id: 'q5', title: 'Mestre Forjador',       unit: 'melhorias feitas',   val: () => state.stats.upgradesDone,    tiers: [3, 15, 50, 150, 400] },
          { id: 'q6', title: 'Conquistador',          unit: 'fases concluídas',   val: () => state.stats.bestIdx,         tiers: [10, 20, 30, 45, 60, 90] },
          { id: 'q7', title: 'Colecionador Lendário', unit: 'itens lendários/míticos', val: () => state.stats.rareFound,  tiers: [1, 5, 15, 40] },
          { id: 'q8', title: 'Explorador do Reino',   unit: 'expedições',         val: () => state.stats.expeditions,     tiers: [1, 10, 40, 120] },
          { id: 'q9', title: 'Alma Renascida',        unit: 'renascimentos',      val: () => state.stats.rebirths,        tiers: [1, 3, 6, 12, 25] },
          { id: 'q10', title: 'Mestre do Baú',        unit: 'nível máximo do baú', val: () => state.stats.bestChest,      tiers: [3, 6, 10, 15, 20] }
        ];
        const achReward = (t) => ({ gold: 150 * (t + 1), gems: 3 + 2 * t, keys: 1 + Math.floor((t + 1) / 2) });

        function dailySnapshot() {
          const o = {};
          DAILY_KEYS.forEach((k) => { o[k] = state.stats[k]; });
          return o;
        }
        function ensureDaily() {
          const today = dayKey();
          if (state.daily.date !== today) state.daily = { date: today, base: dailySnapshot(), claimed: {}, bonus: false };
        }
        const dailyProgress = (def) => Math.max(0, (state.stats[def.key] || 0) - (state.daily.base[def.key] || 0));
        const dailyScale = () => 1 + state.runBest * 0.08;
        const dailyReady = (def) => !state.daily.claimed[def.id] && dailyProgress(def) >= def.target;
        const dailyAllClaimed = () => DAILY_DEFS.every((d) => state.daily.claimed[d.id]);
        const achReady = (a) => { const t = state.questTier[a.id] || 0; return t < a.tiers.length && a.val() >= a.tiers[t]; };
        const anyQuestReady = () => DAILY_DEFS.some(dailyReady) || (dailyAllClaimed() && !state.daily.bonus);
        const anyAchReady = () => ACHIEVEMENTS.some(achReady);

        function questCard(title, desc, cur, target, rewardHtml, btn, done) {
          const pct = Math.round(Math.min(1, cur / target) * 100);
          return '<div class="panel-card" style="margin-bottom:0;' + (done ? 'opacity:.65;' : '') + '">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<strong style="font-size:14px;">' + title + '</strong>' +
              '<span style="font-size:12px;font-weight:800;color:#6e6552;">' + fmt(Math.min(cur, target)) + '/' + fmt(target) + '</span></div>' +
            '<div style="font-size:12px;color:#6e6552;margin:2px 0 8px 0;">' + desc + '</div>' +
            '<div class="prog-bar" style="margin-bottom:9px;"><div style="width:' + pct + '%;"></div></div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
              '<span style="font-size:12px;font-weight:800;">' + rewardHtml + '</span>' + btn + '</div></div>';
        }

        function renderQuests() {
          ensureDaily();
          const sc = dailyScale();
          let html = DAILY_DEFS.map((d) => {
            const cur = dailyProgress(d), claimed = !!state.daily.claimed[d.id], ready = dailyReady(d);
            const reward = '🪙 ' + fmt(Math.round(d.gold * sc)) + ' • 💎 ' + d.gems + ' • 🔑 ' + d.keys + (d.ess ? ' • 🔥 ' + d.ess : '');
            const btn = '<button class="btn-green ' + (ready ? '' : 'muted') + '" data-act="quest-claim" data-kind="daily" data-id="' + d.id + '">' + (claimed ? 'Recebido' : (ready ? 'Resgatar' : 'Em progresso')) + '</button>';
            return questCard(d.title, d.desc, cur, d.target, reward, btn, claimed);
          }).join('');
          const all = dailyAllClaimed();
          html += '<div class="panel-card" style="margin-bottom:0;border:2px solid #d4a338;' + (state.daily.bonus ? 'opacity:.65;' : '') + '">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
              '<div><strong style="font-size:14px;">🎁 Baú de Bônus Diário</strong><div class="mini-note">Conclua as 5 missões: +' + DAILY_BONUS.gems + ' 💎 +' + DAILY_BONUS.keys + ' 🔑 +' + DAILY_BONUS.ess + ' 🔥</div></div>' +
              '<button class="btn-green ' + (all && !state.daily.bonus ? '' : 'muted') + '" data-act="quest-claim" data-kind="bonus" data-id="bonus">' + (state.daily.bonus ? 'Recebido' : (all ? 'Abrir!' : 'Bloqueado')) + '</button></div></div>';
          html += '<div class="mini-note" style="text-align:center;">As missões diárias renovam à meia-noite.</div>';
          setHTML('quests-daily', html);

          setHTML('quests-ach', ACHIEVEMENTS.map((a) => {
            const t = state.questTier[a.id] || 0;
            if (t >= a.tiers.length) {
              return questCard(a.title + ' <span class="badge-pill">COMPLETO</span>', 'Todos os níveis concluídos!', 1, 1, '🏅', '<button class="btn-green muted">Concluído</button>', true);
            }
            const target = a.tiers[t], r = achReward(t), ready = a.val() >= target;
            const reward = '🪙 ' + fmt(r.gold) + ' • 💎 ' + r.gems + ' • 🔑 ' + r.keys;
            const btn = '<button class="btn-green ' + (ready ? '' : 'muted') + '" data-act="quest-claim" data-kind="ach" data-id="' + a.id + '">' + (ready ? 'Resgatar' : 'Em progresso') + '</button>';
            return questCard(a.title + ' <span class="badge-pill">Nível ' + (t + 1) + '/' + a.tiers.length + '</span>', 'Alcance ' + fmt(target) + ' ' + a.unit, a.val(), target, reward, btn, false);
          }).join(''));
        }

        function claimQuest(kind, id) {
          ensureDaily();
          if (kind === 'daily') {
            const d = DAILY_DEFS.find((x) => x.id === id);
            if (!d || !dailyReady(d)) return false;
            const gold = Math.round(d.gold * dailyScale());
            state.daily.claimed[id] = true;
            state.gold += gold; state.gems += d.gems; state.keys += d.keys; state.essences += d.ess;
            showToast('Missão concluída: +' + fmt(gold) + '🪙 +' + d.gems + '💎 +' + d.keys + '🔑');
          } else if (kind === 'bonus') {
            if (!dailyAllClaimed() || state.daily.bonus) return false;
            state.daily.bonus = true;
            state.gems += DAILY_BONUS.gems; state.keys += DAILY_BONUS.keys; state.essences += DAILY_BONUS.ess;
            showToast('🎁 Bônus diário: +' + DAILY_BONUS.gems + '💎 +' + DAILY_BONUS.keys + '🔑 +' + DAILY_BONUS.ess + '🔥');
          } else {
            const a = ACHIEVEMENTS.find((x) => x.id === id);
            if (!a || !achReady(a)) return false;
            const t = state.questTier[id] || 0, r = achReward(t);
            state.questTier[id] = t + 1;
            state.gold += r.gold; state.gems += r.gems; state.keys += r.keys;
            showToast('🏅 ' + a.title + ': +' + fmt(r.gold) + '🪙 +' + r.gems + '💎 +' + r.keys + '🔑');
          }
          SFX.chestOpen();
          return true;
        }

        /* =====================================================================
           16. PRESENTE DIÁRIO (sequência de 7 dias) E PROGRESSO OFFLINE
           ===================================================================== */
        function dailyGiftInfo() {
          const today = dayKey();
          const claimedToday = state.dailyDate === today;
          let day;
          if (claimedToday) day = state.dailyStreak;
          else if (state.dailyDate === dayKey(Date.now() - 86400000)) day = (state.dailyStreak % 7) + 1;
          else day = 1;
          day = clamp(day || 1, 1, 7);
          const sc = 1 + state.runBest * 0.05;
          return {
            claimedToday: claimedToday, day: day,
            gold: Math.round((300 + 100 * (day - 1)) * sc),
            keys: 3 + (day >= 4 ? 1 : 0) + (day === 7 ? 2 : 0),
            gems: 5 + (day === 7 ? 10 : 0),
            food: 5
          };
        }

        function claimDailyGift() {
          const g = dailyGiftInfo();
          if (g.claimedToday) { showToast('Presente de hoje já resgatado! Volte amanhã.'); return false; }
          state.dailyDate = dayKey();
          state.dailyStreak = g.day;
          state.gold += g.gold; state.keys += g.keys; state.gems += g.gems; state.petFood += g.food;
          SFX.legendary();
          showToast('🎁 Dia ' + g.day + ': +' + fmt(g.gold) + '🪙 +' + g.keys + '🔑 +' + g.gems + '💎 +' + g.food + '🍖');
          return true;
        }

        function computeOffline(elapsedSec) {
          const cap = 8 * 3600;
          const sec = Math.min(elapsedSec, cap);
          const idx = curIdx();
          const st = getHeroStats();
          const waves = Math.floor(sec / 30);
          const eff = 0.8;
          return {
            elapsed: elapsedSec, capped: elapsedSec > cap, waves: waves,
            gold: Math.round(waves * stageGold(idx) * 1.84 * st.goldMult * eff),
            xp: Math.round(waves * 3 * xpPerKill(idx) * st.xpMult * eff),
            keys: Math.floor(waves * st.extraKeyChance * eff),
            ess: Math.floor(waves * 0.1)
          };
        }

        function applyOffline(info) {
          state.gold += info.gold; state.keys += info.keys; state.essences += info.ess;
          addHeroXp(info.xp);
          state.stats.battlesWon += info.waves;
          const body = $('offline-body');
          body.innerHTML =
            '<div>⏱️ Tempo fora: <strong>' + fmtTime(info.elapsed) + '</strong>' + (info.capped ? ' <span class="mini-note">(máx. 8h)</span>' : '') + '</div>' +
            '<div>⚔️ Ondas vencidas: <strong>' + fmt(info.waves) + '</strong></div>' +
            '<div>🪙 Moedas: <strong>+' + fmt(info.gold) + '</strong></div>' +
            '<div>✨ Experiência: <strong>+' + fmt(info.xp) + '</strong></div>' +
            '<div>🔑 Chaves: <strong>+' + fmt(info.keys) + '</strong> &nbsp; 🔥 Essências: <strong>+' + fmt(info.ess) + '</strong></div>' +
            (anyExpeditionReady() ? '<div style="color:#b45309;">🗺️ Há expedições prontas para coletar!</div>' : '');
          $('offline-modal').classList.add('open');
          SFX.chestOpen();
        }

        function checkOffline() {
          const away = (Date.now() - state.lastSeen) / 1000;
          if (away >= 60) { applyOffline(computeOffline(away)); saveGame(); return true; }
          return false;
        }
