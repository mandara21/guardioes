
        /* =====================================================================
           17. INTERFACE: AVISOS, HUD E RENDERIZAÇÃO POR ABA
           ===================================================================== */
        const ui = { tab: 'batalha', down: false };

        function showToast(msg) {
          const stack = $('toast-stack');
          while (stack.children.length >= 3) stack.firstChild.remove();
          const t = document.createElement('div');
          t.className = 'toast';
          t.textContent = msg;
          stack.appendChild(t);
          setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 2800);
        }

        function toggleShow(id, on, disp) {
          const el = $(id);
          const v = on ? (disp || 'block') : 'none';
          if (el && el._d !== v) { el._d = v; el.style.display = v; }
        }

        function refreshHUD() {
          const st = getHeroStats();
          setText('hdr-trophies', fmt(state.trophies));
          setText('hdr-essences', fmt(state.essences));
          setText('hdr-gold', fmt(state.gold));
          setText('hdr-gems', fmt(state.gems));
          setText('hero-power-val', fmt(st.power));
          setText('hero-level-label', 'Jef • Nv. ' + state.heroLevel);
          $('xp-fill').style.width = clamp(state.heroXp / xpReq(state.heroLevel) * 100, 0, 100).toFixed(1) + '%';
          setText('keys-count-val', fmt(state.keys));
          setText('panel-essences', fmt(state.essences));
          setText('chest-lvl-pill', 'Nv. ' + state.chestLevel);
          setText('chest-evolve-cost', fmt(chestEvolveCost(state.chestLevel)));
          const maxed = state.chestLevel >= MAX_CHEST, canEvo = !maxed && chestMissing().length === 0;
          setText('chest-evo-label', maxed ? 'Baú Nv. ' + state.chestLevel + ' (MÁX)' : 'Baú Nv. ' + state.chestLevel + (canEvo ? ' ▲' : ' 🔒'));
          const evb = $('btn-evolve-chest');
          evb.classList.toggle('ready', canEvo); evb.classList.toggle('max', maxed);
          setText('av-lvl', state.heroLevel);
          $('btn-avatar').style.setProperty('--xp', clamp(state.heroXp / xpReq(state.heroLevel) * 100, 0, 100).toFixed(0));
          toggleShow('av-dot', state.talentPoints > 0);

          const noKeys = state.keys <= 0;
          $('keys-pill').classList.toggle('empty', noKeys);
          $('btn-open-chest').classList.toggle('disabled-state', noKeys);
          setText('open-chest-label', noKeys ? 'Sem chaves' : 'Abrir baú');
          const bulk = $('btn-bulk-chest');
          setText(bulk, '×' + Math.max(2, Math.min(10, state.keys)));
          bulk.disabled = state.keys < 2;

          const ta = $('talent-alert-pill');
          if (state.talentPoints > 0) { toggleShow('talent-alert-pill', true); setText(ta, '+' + state.talentPoints + ' Talento!'); }
          else toggleShow('talent-alert-pill', false);

          const dailyOk = anyQuestReady(), achOk = anyAchReady(), expOk = anyExpeditionReady();
          toggleShow('hero-notif-dot', state.talentPoints > 0);
          toggleShow('quest-notif-dot', dailyOk || achOk);
          toggleShow('adv-notif-dot', expOk);
          toggleShow('daily-ready-badge', dailyOk, 'inline');
          toggleShow('ach-ready-badge', achOk, 'inline');
          toggleShow('exp-ready-badge', expOk, 'inline');
        }

        const gearClass = {};
        function renderGearSlots() {
          Object.keys(GEAR_LABELS).forEach((slotKey) => {
            const el = $('slot-' + slotKey);
            const item = state.equipment[slotKey];
            const enh = state.slotEnhance[slotKey] || 0;
            if (!el || !item) return;
            const cls = 'gear-slot rarity-' + item.rarity;
            if (gearClass[slotKey] !== cls) { gearClass[slotKey] = cls; el.className = cls; }
            const tr = item.tr && TRAITS[item.tr] ? TRAITS[item.tr].icon : '';
            setHTML(el, (enh > 0 ? '<span class="enhance-badge">+' + enh + '</span>' : '') +
              (tr ? '<span class="trait-badge">' + tr + '</span>' : '') +
              '<div class="gear-ico">' + getGearSVG(slotKey, item.rarity, item.v) + '</div>' +
              '<div class="gear-lvl-tag">Nv. ' + item.level + '</div>');
          });
        }

        function renderHeroStats() {
          const st = getHeroStats();
          setText('hero-tab-lvl-badge', 'Nível ' + state.heroLevel);
          setText('stat-atk', fmt(st.atk));
          setText('stat-hp', fmt(st.hp));
          setText('stat-def', fmt(st.def));
          setText('stat-crit', st.crit + '%');
          setText('stat-aspd', st.atkSpeedMult.toFixed(2).replace('.', ',') + 'x');
          setText('stat-ls', Math.round(st.lifesteal * 100) + '%');
          setText('train-atk-lvl', state.trainAtk);
          setText('train-hp-lvl', state.trainHp);
          setText('train-atk-cost', fmt(trainCost(state.trainAtk)));
          setText('train-hp-cost', fmt(trainCost(state.trainHp)));
          $('btn-train-atk').classList.toggle('muted', state.gold < trainCost(state.trainAtk));
          $('btn-train-hp').classList.toggle('muted', state.gold < trainCost(state.trainHp));
        }

        const shopScale = () => 1 + state.runBest * 0.1;
        const priceKeys = () => Math.round(200 * shopScale());
        const priceForge = () => Math.round(450 * shopScale());
        const goldPack = () => Math.round(1200 * (1 + state.runBest * 0.15));

        function renderShop() {
          const g = dailyGiftInfo();
          setText('daily-streak-badge', 'DIA ' + g.day + '/7');
          setText('daily-gift-desc', fmt(g.gold) + ' moedas + ' + g.keys + ' chaves + ' + g.gems + ' gemas + ' + g.food + ' Ração' + (g.day === 7 ? ' • 🎉 Dia especial!' : ''));
          $('daily-streak-bar').style.width = (((g.claimedToday ? g.day : g.day - 1) / 7) * 100).toFixed(0) + '%';
          const btn = $('btn-daily-gift');
          setText(btn, g.claimedToday ? 'Já resgatado hoje — volte amanhã!' : 'Resgatar Presente Diário');
          btn.classList.toggle('muted', g.claimedToday);
          setText('price-keys', fmt(priceKeys()));
          setText('price-forge', fmt(priceForge()));
          setText('gold-pack-desc', fmt(goldPack()) + ' moedas para evoluir o baú e atributos.');
        }

        function renderActiveTab() {
          switch (ui.tab) {
            case 'batalha': renderGearSlots(); break;
            case 'heroi': renderHeroStats(); renderTalentTree(); renderPetsGrid(); renderLeaderboard(); renderRebirth(); break;
            case 'loja': renderShop(); renderPremium(); break;
            case 'aventura': renderArena(); renderExpeditions(); break;
            case 'missoes': renderQuests(); break;
          }
        }

        function afterAction() {
          refreshHUD();
          renderActiveTab();
          saveGame();
        }

        function switchTab(tabName) {
          ui.tab = tabName;
          $('app-container').setAttribute('data-tab', tabName);
          document.querySelectorAll('.tab-view').forEach((sec) => sec.classList.toggle('active', sec.id === 'tab-' + tabName));
          document.querySelectorAll('.nav-item').forEach((btn) => btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName));
          ensureDaily(); regenTickets();
          refreshHUD();
          renderActiveTab();
          window.scrollTo(0, 0);
        }

        /* =====================================================================
           18. AÇÕES DO JOGADOR (usadas pelos botões e pelos testes)
           ===================================================================== */
        function doTrain(kind) {
          const key = kind === 'atk' ? 'trainAtk' : 'trainHp';
          const cost = trainCost(state[key]);
          if (state.gold < cost) { SFX.error(); showToast('Precisa de ' + fmt(cost) + ' moedas!'); return false; }
          state.gold -= cost;
          state[key]++;
          state.stats.upgradesDone++;
          SFX.coin();
          syncHeroVitals();
          return true;
        }

        /* O que ainda falta para evoluir o baú (lista de textos; vazia = pode evoluir) */
        function chestMissing() {
          if (state.chestLevel >= MAX_CHEST) return ['nível máximo'];
          const r = chestReq(state.chestLevel), miss = [];
          if (state.heroLevel < r.hero) miss.push('herói Nv. ' + r.hero);
          if (state.gold < r.gold) miss.push(fmt(r.gold) + ' 🪙');
          if (state.essences < r.ess) miss.push(r.ess + ' 🔥');
          return miss;
        }

        function doEvolveChest() {
          if (state.chestLevel >= MAX_CHEST) { SFX.error(); showToast('O Baú já está no nível máximo!'); return false; }
          const miss = chestMissing();
          if (miss.length) { SFX.error(); showToast('Para evoluir o Baú falta: ' + miss.join(' • ')); return false; }
          const r = chestReq(state.chestLevel);
          state.gold -= r.gold;
          state.essences -= r.ess;
          state.chestLevel++;
          state.stats.bestChest = Math.max(state.stats.bestChest || 1, state.chestLevel);
          state.stats.upgradesDone++;
          SFX.chestOpen();
          showToast('Baú evoluído para o Nível ' + state.chestLevel + '! Itens melhores e mais raros.');
          return true;
        }

        const RAR_COLORS = { common: '#9ca3af', uncommon: '#4ade80', rare: '#60a5fa', epic: '#a855f7', legendary: '#fbbf24', mythic: '#f87171' };
        function renderChestModal() {
          const L = state.chestLevel, maxed = L >= MAX_CHEST;
          setText('cm-title', 'Baú Nível ' + L + (maxed ? ' (MÁX)' : ''));
          setText('cm-sub', maxed ? 'Seu baú está no nível máximo.' : 'Evoluir aumenta a chance de itens raros e o nível dos itens.');
          let html = '';
          if (!maxed) {
            const r = chestReq(L);
            const row = (ic, label, have, need) => '<div class="cm-req ' + (have >= need ? 'ok' : 'no') + '"><span>' + ic + ' ' + label + '</span><b>' + fmt(have) + ' / ' + fmt(need) + ' ' + (have >= need ? '✓' : '✗') + '</b></div>';
            html = row('🪙', 'Ouro', state.gold, r.gold) + row('🔥', 'Essências', state.essences, r.ess) + row('⭐', 'Nível do herói', state.heroLevel, r.hero);
          }
          setHTML('cm-reqs', html);
          const cur = chestOdds(L), nxt = maxed ? null : chestOdds(L + 1);
          let odds = '';
          RARITY_ORDER.slice().reverse().forEach((k) => {
            odds += '<div class="cm-odd"><i style="background:' + RAR_COLORS[k] + '"></i><span>' + RARITIES[k].label + '</span><b>' + cur[k].toFixed(cur[k] < 10 ? 1 : 0).replace('.', ',') + '%</b>' +
              (nxt ? '<em class="' + (nxt[k] > cur[k] ? 'up' : (nxt[k] < cur[k] ? 'down' : '')) + '">' + (nxt[k] > cur[k] ? '▲' : nxt[k] < cur[k] ? '▼' : '') + ' ' + nxt[k].toFixed(nxt[k] < 10 ? 1 : 0).replace('.', ',') + '%</em>' : '') + '</div>';
          });
          setHTML('cm-odds', odds);
          const btn = $('btn-do-evolve');
          btn.classList.toggle('muted', maxed || chestMissing().length > 0);
          setText(btn, maxed ? 'Nível máximo' : '▲ Evoluir para o Nível ' + (L + 1));
        }

        function jumpTo(world, stage, farm) {
          state.world = world; state.stage = stage;
          if (farm !== undefined) state.autoAdvance = !farm;
          state.bestStage[world] = state.bestStage[world] || 1;
          combat.state = 'fight'; combat.transT = 0; combat.sched.length = 0; combat.deathFarm = false;
          stopWalking();
          $('battle-stage').classList.remove('defeat');
          spawnWave();
          renderControlLabels();
          saveGame();
        }

        function buy(kind) {
          switch (kind) {
            case 'keys':
              if (state.gold < priceKeys()) { SFX.error(); showToast('Moedas insuficientes (' + fmt(priceKeys()) + ')!'); return false; }
              state.gold -= priceKeys(); state.keys += 3; SFX.coin(); showToast('+3 Chaves adquiridas!'); return true;
            case 'mystic':
              if (state.gems < 15) { SFX.error(); showToast('Gemas insuficientes (15)!'); return false; }
              state.gems -= 15; state.keys += 10; SFX.chestOpen(); showToast('+10 Chaves Místicas adquiridas!'); return true;
            case 'forge':
              if (state.gold < priceForge()) { SFX.error(); showToast('Moedas insuficientes (' + fmt(priceForge()) + ')!'); return false; }
              state.gold -= priceForge(); state.essences += 25; state.petFood += 10; SFX.coin(); showToast('+25 Essências de Forja e +10 Ração!'); return true;
            case 'tickets':
              if (state.gems < 5) { SFX.error(); showToast('Gemas insuficientes (5)!'); return false; }
              state.gems -= 5; state.arenaTickets += 3; SFX.coin(); showToast('+3 Ingressos de Arena!'); return true;
            case 'gold':
              if (state.gems < 10) { SFX.error(); showToast('Gemas insuficientes (10)!'); return false; }
              state.gems -= 10; state.gold += goldPack(); SFX.coin(); showToast('+' + fmt(goldPack()) + ' Moedas adquiridas!'); return true;
          }
          return false;
        }

        /* =====================================================================
           19. SAVE: EXPORTAR / IMPORTAR / REINICIAR
           ===================================================================== */
        function exportSaveCode() {
          saveGame();
          const bytes = new TextEncoder().encode(JSON.stringify(state));
          let bin = '';
          bytes.forEach((b) => { bin += String.fromCharCode(b); });
          return btoa(bin);
        }

        function importSaveCode(code) {
          try {
            const bin = atob(String(code).replace(/\s+/g, ''));
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const parsed = JSON.parse(new TextDecoder().decode(bytes));
            if (!parsed || typeof parsed !== 'object' || typeof parsed.gold !== 'number' || !parsed.equipment) return false;
            state = migrateState(parsed);
            state.lastSeen = Date.now();
            saveGame();
            bootGame();
            return true;
          } catch (e) {
            return false;
          }
        }

        function bootGame() {
          SFX.enabled = state.sfxEnabled;
          SFX.vibrate = state.vibEnabled;
          combat.speed = state.speed; combat.paused = false;
          combat.state = 'fight'; combat.transT = 0; combat.defending = false; combat.defendT = 0;
          combat.cd = { slash: 0, shield: 0, aether: 0 };
          combat.streak = 0; combat.deathFarm = false; combat.sched.length = 0;
          $('hero-shield-aura').classList.remove('active');
          $('battle-stage').classList.remove('defeat', 'walking');
          autoChestEnabled = false; autoLog = null; rolledItem = null; chestAnimating = false;
          duel.queued = null;
          ensureDaily(); regenTickets();
          combat.heroMaxHp = 1; combat.heroHp = 1;
          syncHeroVitals();
          combat.heroHp = combat.heroMaxHp;
          petKey = '';
          spawnWave();
          generateRivals();
          renderControlLabels();
          updateAutoChestBtn();
          updateHeroHpBar();
          refreshHUD();
          renderActiveTab();
        }

        /* =====================================================================
           20. LIGAÇÃO DOS EVENTOS
           ===================================================================== */
        document.addEventListener('pointerdown', () => { ui.down = true; }, true);
        ['pointerup', 'pointercancel'].forEach((ev) => document.addEventListener(ev, () => { ui.down = false; }, true));

        document.querySelectorAll('.nav-item').forEach((btn) => {
          btn.addEventListener('click', function () { switchTab(this.getAttribute('data-tab')); });
        });

        function wireSubTabs(attr, panels) {
          document.querySelectorAll('button[' + attr + ']').forEach((btn) => {
            btn.addEventListener('click', function () {
              const sub = this.getAttribute(attr);
              document.querySelectorAll('button[' + attr + ']').forEach((b) => b.classList.toggle('active', b === this));
              Object.keys(panels).forEach((k) => { $(panels[k]).style.display = (k === sub) ? (panels[k].indexOf('quests') === 0 ? 'flex' : 'block') : 'none'; });
              renderActiveTab();
            });
          });
        }
        wireSubTabs('data-adv-sub', { arena: 'adv-sub-arena', expeditions: 'adv-sub-expeditions' });
        wireSubTabs('data-hero-sub', { stats: 'hero-sub-stats', pets: 'hero-sub-pets', ranking: 'hero-sub-ranking', rebirth: 'hero-sub-rebirth' });
        wireSubTabs('data-quest-sub', { daily: 'quests-daily', ach: 'quests-ach' });

        /* Mundos e fases */
        $('btn-prev-world').addEventListener('click', () => {
          if (state.world <= 1) return;
          jumpTo(state.world - 1, 1, true);
          showToast('↻ Mundo ' + state.world + ' — modo Farmar');
        });
        $('btn-next-world').addEventListener('click', () => {
          if (state.world >= state.maxWorldUnlocked) { showToast('Vença o Chefe da Fase 10 para liberar o próximo mundo!'); return; }
          const next = state.world + 1;
          const frontier = next === state.maxWorldUnlocked;
          jumpTo(next, frontier ? Math.min(10, state.bestStage[next] || 1) : 1, !frontier);
        });
        $('wave-track').addEventListener('click', (e) => {
          const dot = e.target.closest('[data-stage-dot]');
          if (!dot) return;
          const n = Number(dot.getAttribute('data-stage-dot'));
          const best = state.bestStage[state.world] || 1;
          if (n > best) { showToast('🔒 Vença a fase ' + (n - 1) + ' para liberar esta.'); return; }
          if (n === state.stage) return;
          jumpTo(state.world, n, n < best ? true : undefined);
          if (n < best) showToast('↻ Fase ' + n + ' — modo Farmar (toque em ▶ para avançar)');
        });

        $('btn-header-ranking').addEventListener('click', () => { switchTab('heroi'); document.querySelector('button[data-hero-sub="ranking"]').click(); });
        $('talent-alert-pill').addEventListener('click', () => { switchTab('heroi'); document.querySelector('button[data-hero-sub="stats"]').click(); });

        /* Controles de batalha */
        $('btn-pause').addEventListener('click', () => { combat.paused = !combat.paused; renderControlLabels(); });
        $('btn-speed').addEventListener('click', () => {
          combat.speed = combat.speed >= 3 ? 1 : combat.speed + 1;
          state.speed = combat.speed;
          renderControlLabels(); saveGame();
        });
        $('btn-auto-skill').addEventListener('click', () => {
          state.autoSkills = !state.autoSkills;
          showToast(state.autoSkills ? '🤖 Habilidades automáticas ligadas' : 'Habilidades automáticas desligadas');
          renderControlLabels(); saveGame();
        });
        $('btn-advance').addEventListener('click', () => {
          state.autoAdvance = !state.autoAdvance;
          combat.deathFarm = false;
          showToast(state.autoAdvance ? '▶ Avançando de fase após cada vitória' : '↻ Modo Farmar: repetindo a fase atual');
          renderControlLabels(); updateHint(); saveGame();
        });
        $('btn-skill-slash').addEventListener('click', castSlash);
        $('btn-defend').addEventListener('click', castShield);
        $('btn-aether').addEventListener('click', castAether);

        /* Baú */
        $('chest-click-zone').addEventListener('click', openChestSequence);
        $('btn-open-chest').addEventListener('click', openChestSequence);
        $('btn-bulk-chest').addEventListener('click', () => {
          const n = Math.min(10, state.keys);
          if (n < 2 || chestAnimating) return;
          const sum = openChestsBulk(n);
          SFX.chestOpen();
          showToast('📦 ' + sum.opened + ' baús: ' + sum.equipped + ' equipados • ' + sum.dismantled + ' desmontados (+' + fmt(sum.gold) + '🪙 +' + sum.ess + '🔥)');
          if (sum.prompted && rolledItem) showLootModal(rolledItem);
          afterAction();
        });
        $('btn-auto-chest').addEventListener('click', () => {
          if (!autoChestEnabled && state.keys <= 0) { SFX.error(); showToast('Sem chaves para iniciar o Auto-Baú!'); return; }
          if (autoChestEnabled) { finishAutoChest(); return; }
          autoChestEnabled = true;
          autoLog = { opened: 0, equipped: 0, dismantled: 0, gold: 0, ess: 0 };
          updateAutoChestBtn();
          openChestSequence();
        });
        $('btn-evolve-chest').addEventListener('click', () => { renderChestModal(); $('chest-modal').classList.add('open'); });
        $('btn-do-evolve').addEventListener('click', () => { if (doEvolveChest()) afterAction(); renderChestModal(); });
        $('btn-close-chest').addEventListener('click', () => { $('chest-modal').classList.remove('open'); });
        $('btn-stage-pick').addEventListener('click', () => { renderWaveTrack(); updateHint(); $('stage-modal').classList.add('open'); });
        $('btn-close-stage').addEventListener('click', () => { $('stage-modal').classList.remove('open'); });
        $('wave-track').addEventListener('click', (e) => { const d = e.target.closest('[data-stage-dot]'); if (d && !d.classList.contains('locked')) $('stage-modal').classList.remove('open'); });
        $('btn-avatar').addEventListener('click', () => { switchTab('heroi'); document.querySelector('button[data-hero-sub="stats"]').click(); });
        $('btn-gold-plus').addEventListener('click', () => switchTab('loja'));
        $('btn-gems-plus').addEventListener('click', () => switchTab('loja'));
        $('keys-pill').addEventListener('click', () => switchTab('loja'));

        $('btn-equip-loot').addEventListener('click', () => {
          if (!rolledItem) return;
          equipItem(rolledItem);
          rolledItem = null;
          $('loot-modal').classList.remove('open');
          SFX.coin();
          showToast('Equipamento equipado!');
          afterAction();
        });
        $('btn-sell-loot').addEventListener('click', () => {
          if (!rolledItem) return;
          const d = dismantleItem(rolledItem);
          rolledItem = null;
          $('loot-modal').classList.remove('open');
          SFX.coin();
          showToast('Item desmontado: +' + fmt(d.gold) + ' 🪙 e +' + d.ess + ' 🔥!');
          afterAction();
        });

        Object.keys(GEAR_LABELS).forEach((slotKey) => { $('slot-' + slotKey).addEventListener('click', () => openForgeModal(slotKey)); });
        $('btn-forge-slot').addEventListener('click', () => {
          if (!inspectedSlotKey) return;
          const enh = state.slotEnhance[inspectedSlotKey] || 0;
          if (forgeSlot(inspectedSlotKey)) {
            SFX.chestOpen();
            showToast('🔥 ' + GEAR_LABELS[inspectedSlotKey] + ' forjado para +' + (enh + 1) + '!');
            openForgeModal(inspectedSlotKey);
            afterAction();
          } else if (enh < MAX_ENHANCE) {
            SFX.error();
            showToast('Precisa de ' + fmt(forgeGoldCost(enh)) + ' 🪙 e ' + forgeEssCost(enh) + ' 🔥 para forjar!');
          }
        });
        $('btn-close-inspect').addEventListener('click', () => { $('inspect-modal').classList.remove('open'); });

        /* Arena */
        $('btn-refresh-rivals').addEventListener('click', () => {
          if (duel.active) return;
          if (state.gold < 50) { SFX.error(); showToast('Precisa de 50 moedas para atualizar rivais!'); return; }
          state.gold -= 50; SFX.coin();
          generateRivals(); if (online.on) loadRivals(true);
          showToast('Novos oponentes encontrados!');
          afterAction();
        });
        $('btn-duel-power').addEventListener('click', () => {
          if (!duel.active || duel.cdPower > 0) return;
          duel.queued = duel.queued === 'power' ? null : 'power';
          updateDuelButtons();
        });
        $('btn-duel-guard').addEventListener('click', () => {
          if (!duel.active || duel.cdGuard > 0) return;
          duel.queued = duel.queued === 'guard' ? null : 'guard';
          updateDuelButtons();
        });
        $('btn-close-duel').addEventListener('click', () => {
          if (duel.timer) { clearInterval(duel.timer); duel.timer = null; }
          duel.active = false;
          $('duel-modal').classList.remove('open');
          afterAction();
        });

        /* Herói */
        $('btn-train-atk').addEventListener('click', () => { if (doTrain('atk')) afterAction(); });
        $('btn-train-hp').addEventListener('click', () => { if (doTrain('hp')) afterAction(); });
        $('btn-respec').addEventListener('click', () => { if (doRespec()) afterAction(); });
        $('btn-hatch-egg').addEventListener('click', () => { if (hatchEgg()) afterAction(); });

        /* Loja */
        $('btn-daily-gift').addEventListener('click', () => { if (claimDailyGift()) afterAction(); });
        $('btn-buy-keys').addEventListener('click', () => { if (buy('keys')) afterAction(); });
        $('btn-buy-mystic-keys').addEventListener('click', () => { if (buy('mystic')) afterAction(); });
        $('btn-buy-forge-pack').addEventListener('click', () => { if (buy('forge')) afterAction(); });
        $('btn-buy-tickets').addEventListener('click', () => { if (buy('tickets')) afterAction(); });
        $('btn-buy-gold').addEventListener('click', () => { if (buy('gold')) afterAction(); });

        /* Botões criados dinamicamente (delegação) */
        document.body.addEventListener('click', (e) => {
          const el = e.target.closest('[data-act]');
          if (!el) return;
          const act = el.getAttribute('data-act'), id = el.getAttribute('data-id');
          let changed = false;
          switch (act) {
            case 'duel': startColiseumDuel(Number(id)); renderActiveTab(); return;
            case 'exp-send': changed = sendExpedition(id); break;
            case 'exp-collect': changed = collectExpedition(id); break;
            case 'talent':
              if (state.talentPoints <= 0) { SFX.error(); showToast('Suba o nível de Jef para ganhar Pontos de Talento!'); return; }
              changed = doTalent(id); if (changed) SFX.chestOpen(); break;
            case 'pet-equip':
              if (state.pets[id] && state.pets[id].unlocked) {
                state.activePet = id; applyWorldTheme(); syncHeroVitals(); changed = true;
                showToast('🐾 ' + PET_CATALOG[id].name + ' equipado!');
              }
              break;
            case 'pet-feed': {
              const pObj = state.pets[id];
              if (!pObj) return;
              const cost = pObj.level * 3;
              if (state.petFood < cost) { SFX.error(); showToast('Precisa de ' + cost + ' Ração Mística (ganhe em Expedições)!'); return; }
              state.petFood -= cost; pObj.level++; SFX.coin(); syncHeroVitals(); changed = true;
              showToast('🐾 ' + PET_CATALOG[id].name + ' subiu para o Nível ' + pObj.level + '!');
              break;
            }
            case 'login': openLogin(); return;
            case 'name': openName(); return;
            case 'pack': openBuy(id); return;
            case 'spend': spendItem(id); return;
            case 'equip': equipSkin(id); return;
            case 'starup': changed = doStarUp(id); if (changed) SFX.chestOpen(); break;
            case 'quest-claim': changed = claimQuest(el.getAttribute('data-kind'), id); break;
          }
          if (changed) afterAction();
        });

        /* Configurações */
        const syncSettingsLabels = () => {
          setText('sfx-status-label', SFX.enabled ? 'ATIVADO' : 'MUDO');
          setText('vib-status-label', SFX.vibrate ? 'ATIVADA' : 'DESLIGADA');
        };
        $('btn-open-settings').addEventListener('click', () => { syncSettingsLabels(); $('settings-modal').classList.add('open'); });
        $('btn-toggle-sfx').addEventListener('click', () => { SFX.enabled = !SFX.enabled; state.sfxEnabled = SFX.enabled; syncSettingsLabels(); saveGame(); SFX.coin(); });
        $('btn-toggle-vib').addEventListener('click', () => { SFX.vibrate = !SFX.vibrate; state.vibEnabled = SFX.vibrate; syncSettingsLabels(); saveGame(); SFX.buzz(30); });
        $('btn-close-settings').addEventListener('click', () => { $('settings-modal').classList.remove('open'); });

        $('btn-export-save').addEventListener('click', () => {
          $('saveio-text').value = exportSaveCode();
          $('settings-modal').classList.remove('open');
          $('saveio-modal').classList.add('open');
        });
        $('btn-saveio-copy').addEventListener('click', () => {
          const ta = $('saveio-text');
          ta.value = exportSaveCode();
          const done = () => showToast('📋 Código copiado!');
          const fallback = () => { try { ta.focus(); ta.select(); document.execCommand('copy'); done(); } catch (e) { showToast('Selecione o texto e copie manualmente.'); } };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, fallback);
          else fallback();
        });
        $('btn-saveio-import').addEventListener('click', () => {
          const code = $('saveio-text').value.trim();
          if (!code) { showToast('Cole um código de save na caixa primeiro.'); return; }
          if (importSaveCode(code)) {
            $('saveio-modal').classList.remove('open');
            showToast('✅ Save importado com sucesso!');
          } else {
            SFX.error();
            showToast('❌ Código inválido. Confira se copiou tudo.');
          }
        });
        $('btn-saveio-close').addEventListener('click', () => { $('saveio-modal').classList.remove('open'); });
        $('btn-close-offline').addEventListener('click', () => { $('offline-modal').classList.remove('open'); afterAction(); });

        let rbTimer = null;
        $('btn-rebirth').addEventListener('click', function () {
          if (rebirthGain() < 1) return;
          if (!this._armed) {
            this._armed = true;
            this.textContent = '⚠️ Toque de novo: reinicia a jornada!';
            rbTimer = setTimeout(() => { this._armed = false; renderRebirth(); }, 3500);
            return;
          }
          clearTimeout(rbTimer); this._armed = false;
          const gain = doRebirth();
          if (gain) {
            SFX.legendary(); SFX.buzz && SFX.buzz(80);
            bootGame(); saveGame();
            showToast('✨ Você renasceu! +' + gain + ' ⭐ — use-as na aba Herói.');
            switchTab('heroi');
            const b = document.querySelector('button[data-hero-sub="rebirth"]'); if (b) b.click();
          }
        });

        let resetArmed = false, resetTimer = null;
        $('btn-reset-save').addEventListener('click', function () {
          if (!resetArmed) {
            resetArmed = true;
            this.textContent = '⚠️ Toque de novo para APAGAR tudo';
            resetTimer = setTimeout(() => { resetArmed = false; this.textContent = 'Resetar Save'; }, 3500);
            return;
          }
          clearTimeout(resetTimer); resetArmed = false; this.textContent = 'Resetar Save';
          try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
          state = createFreshState();
          $('settings-modal').classList.remove('open');
          bootGame();
          showToast('Progresso reiniciado!');
        });

        /* =====================================================================
           21. INICIALIZAÇÃO E LAÇO PRINCIPAL
           ===================================================================== */
        bootGame();
        checkOffline();
        refreshHUD();

        let lastT = performance.now(), hudAcc = 0, secAcc = 0, saveAcc = 0;

        function secondly() {
          ensureDaily();
          regenTickets();
          updateHint();
          updateExpeditionTimers(); onlineTick();
          if (ui.tab === 'aventura') updateArenaTimer();
          if (ui.tab !== 'batalha' && !ui.down) renderActiveTab();
        }

        setInterval(() => {
          const now = performance.now();
          let dt = (now - lastT) / 1000;
          lastT = now;
          if (document.hidden) return;
          dt = Math.min(dt, 0.5);
          tick(dt);
          updateSkillButtons();
          hudAcc += dt; secAcc += dt; saveAcc += dt;
          if (hudAcc >= 0.25) { hudAcc = 0; refreshHUD(); }
          if (secAcc >= 1) { secAcc = 0; secondly(); }
          if (saveAcc >= 8) { saveAcc = 0; saveGame(); }
        }, 100);

        document.addEventListener('visibilitychange', () => {
          if (document.hidden) { saveGame(); pushProgress(false, true); return; }
          lastT = performance.now();
          if (checkOffline()) afterAction();
        });
        window.addEventListener('pagehide', saveGame);

        initOnline();

        /* Gancho para testes automatizados (não afeta o jogo) */
        window.GDB = {
          get state() { return state; },
          combat: combat, tick: tick, fmt: fmt, stats: getHeroStats,
          bulk: openChestsBulk, buy: buy, forge: forgeSlot, talent: doTalent, train: doTrain, evolve: doEvolveChest,
          claim: claimQuest, daily: claimDailyGift, offline: computeOffline, applyOffline: applyOffline,
          expSend: sendExpedition, expCollect: collectExpedition, expeditions: EXPEDITIONS,
          online: online, rankings: loadLeaderboard, openBuy: openBuy, isVip: isVip,
          roll: rollRandomEquipment, equip: equipItem, chestReq: chestReq, chestOdds: chestOdds, chestMissing: chestMissing, MAX_CHEST: MAX_CHEST, GEAR_DEFS: GEAR_DEFS, TRAITS: TRAITS, itemPower: itemPower, svg: getGearSVG,
          rebirth: doRebirth, rebirthGain: rebirthGain, starUp: doStarUp, jumpTo: jumpTo, exportSave: exportSaveCode, importSave: importSaveCode, spawn: spawnWave,
          tabs: switchTab, refresh: afterAction, ach: ACHIEVEMENTS, dailyDefs: DAILY_DEFS, dailyReady: dailyReady, achReady: achReady,
          enemyHp: (idx) => 110 * Math.pow(BAL.hp, idx), enemyAtk: (idx) => 11 * Math.pow(BAL.atk, idx), BAL
        };
