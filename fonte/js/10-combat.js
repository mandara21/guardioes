
        /* =====================================================================
           6. COMBATE: ESTADO, CENÁRIO E INIMIGOS
           ===================================================================== */
        const combat = {
          paused: false,
          speed: state.speed,
          state: 'fight',          // fight | clear (andando) | dead
          transT: 0,
          defending: false, defendT: 0,
          cd: { slash: 0, shield: 0, aether: 0 },
          heroHp: 1, heroMaxHp: 1,
          heroAtkT: 0, petAtkT: 0,
          enemies: [], focus: -1,
          sched: [],
          streak: 0, deathFarm: false
        };

        const BASE_CD = { slash: 4, shield: 6.5, aether: 7.5 };

        function later(delay, fn) { combat.sched.push({ t: delay, fn: fn }); }
        function runSched(dt) {
          for (let i = combat.sched.length - 1; i >= 0; i--) {
            const s = combat.sched[i];
            if (!s) continue;
            s.t -= dt;
            if (s.t <= 0) {
              combat.sched.splice(i, 1);
              try { s.fn(); } catch (e) { console.error(e); }
            }
          }
        }

        const aliveEnemies = () => combat.enemies.filter((e) => e.hp > 0);

        let ambKey = '', petKey = '';
        function buildAmbient(type) {
          if (ambKey === type) return;
          ambKey = type;
          let html = '';
          for (let i = 0; i < 14; i++) {
            const mid = (type === 'star' || type === 'orb' || type === 'spore');
            html += '<span class="amb amb-' + type + '" style="left:' + rnd(0, 100).toFixed(1) + '%;' +
              (mid ? 'top:' + rnd(8, 84).toFixed(0) + 'px;' : '') +
              'animation-delay:' + (-rnd(0, 8)).toFixed(2) + 's;animation-duration:' + rnd(4, 9).toFixed(2) + 's"></span>';
          }
          setHTML('ambient-layer', html);
        }

        function applyWorldTheme() {
          const w = worldInfo(state.world);
          $('sky-stop-1').setAttribute('stop-color', w.sky1);
          $('sky-stop-2').setAttribute('stop-color', w.sky2);
          $('ground-rect').setAttribute('fill', w.ground);
          $('path-stop-1').setAttribute('stop-color', w.path1);
          $('path-stop-2').setAttribute('stop-color', w.path2);
          setHTML('scene-near', sceneRepeat(sceneTile(w.theme), 230, 4));
          setHTML('scene-far', sceneRepeat(SC.hills('rgba(0,0,0,0.16)'), 230, 4));
          setHTML('sky-deco', skyDecoFor(w.theme));
          buildAmbient(w.amb);
          if (petKey !== state.activePet) {
            petKey = state.activePet;
            $('stage-pet-wrap').innerHTML = getPetSVG(state.activePet, 36);
          }
          updateHeroGlow();
        }

        /* O brilho do herói reflete a melhor raridade equipada */
        function updateHeroGlow() {
          let best = 0;
          Object.keys(state.equipment).forEach((k) => { best = Math.max(best, RARITY_ORDER.indexOf(state.equipment[k].rarity)); });
          const wrap = $('hero-wrap');
          if (best >= 3) {
            wrap.classList.add('hero-glow');
            wrap.style.setProperty('--glow', RARITIES[RARITY_ORDER[best]].border);
          } else {
            wrap.classList.remove('hero-glow');
          }
        }

        function renderWaveTrack() {
          const best = state.bestStage[state.world] || 1;
          let html = '';
          for (let i = 1; i <= 10; i++) {
            const cls = i === state.stage ? 'active' : (i < state.stage ? 'done' : (i > best ? 'locked' : ''));
            html += '<div class="wave-dot ' + cls + '" data-stage-dot="' + i + '">' + (i === 10 ? '💀' : i) + '</div>';
          }
          setHTML('wave-track', html);
          const w = worldInfo(state.world);
          setText('zone-name-label', w.name);
          setText('stage-title-label', 'Mundo ' + state.world + ' • Fase ' + state.stage);
        }

        function updateHint() {
          const w = worldInfo(state.world);
          let hint = '', sub = w.sub;
          if (state.stage === 10) sub = '⚠️ CHEFE! Golpe pesado a cada 3 ataques';
          else if (!state.autoAdvance) sub = '↻ Modo Farmar: repetindo esta fase';
          if (state.keys > 0 && state.stats.chestsOpened === 0) hint = '👇 Toque no baú para ganhar equipamentos!';
          else if (combat.deathFarm && !state.autoAdvance) hint = '💡 Jef recuou para farmar. Ele volta a avançar sozinho quando estiver mais forte (ou toque ▶).';
          setText('stage-sub-label', sub);
          const h = $('hint-line');
          setText(h, hint);
          h.classList.toggle('show', !!hint);
        }

        function spawnWave() {
          applyWorldTheme();
          const w = worldInfo(state.world);
          const idx = curIdx();
          const isBoss = state.stage === 10;
          const hpB = 110 * Math.pow(BAL.hp, idx);
          const atkB = 11 * Math.pow(BAL.atk, idx);
          const mk = (i, name, kind, hpM, atkM, boss) => ({
            id: i, name: name, kind: kind, boss: boss,
            hp: Math.round(hpB * hpM), maxHp: Math.round(hpB * hpM), atk: Math.max(2, Math.round(atkB * atkM)),
            interval: boss ? 2.3 : 2.7, atkT: -0.5 - i * 0.7, atkCount: 0, warned: false, el: null, card: null
          });
          combat.enemies = isBoss
            ? [mk(0, w.mobs[0], 0, 1.05, 1, false), mk(1, w.boss, 0, 2.85, 1.6, true), mk(2, w.mobs[2], 2, 1.05, 1.1, false)]
            : [mk(0, w.mobs[0], 0, 1, 1, false), mk(1, w.mobs[1], 1, 1.12, 1.08, false), mk(2, w.mobs[2], 2, 1.22, 1.15, false)];
          combat.focus = -1;
          combat.sched.length = 0;
          combat.heroAtkT = 0; combat.petAtkT = 0;

          let cards = '';
          combat.enemies.forEach((en, i) => {
            const slot = $('enemy-slot-' + i);
            slot.className = 'enemy-slot enemy-slot-' + i + ' enter' + (en.boss ? ' is-boss' : '');
            slot.style.opacity = ''; slot.style.transform = '';
            slot.innerHTML = '<div class="warn-mark">!</div>' +
              '<div class="mini-hp-bar" style="' + (en.boss ? 'width:62px;' : '') + '"><div class="mini-hp-fill" style="width:100%;background:#ef4444;"></div></div>' +
              '<div class="spr">' + buildEnemySVG(w.theme, en.kind, en.boss) + '</div>';
            en.el = { slot: slot, bar: slot.querySelector('.mini-hp-fill'), spr: slot.querySelector('.spr'), warn: slot.querySelector('.warn-mark') };
            slot.onclick = function () { setFocus(i); };
            cards += '<div class="enemy-card" id="ecard-' + i + '"><div class="enemy-card-name">' + esc(en.name) + '</div>' +
              '<div class="enemy-card-bar"><div class="enemy-card-fill" style="width:100%;"></div></div><div class="enemy-card-hp">' + fmt(en.hp) + ' / ' + fmt(en.maxHp) + '</div></div>';
          });
          $('enemy-cards-grid').innerHTML = cards;
          combat.enemies.forEach((en, i) => {
            const root = $('ecard-' + i);
            en.card = { root: root, fill: root.querySelector('.enemy-card-fill'), hp: root.querySelector('.enemy-card-hp') };
          });
          renderWaveTrack();
          updateAliveText();
          updateHint();
          if (isBoss) {
            stageBanner('⚠️ CHEFE!', 'boss');
            const st = $('battle-stage'); st.classList.remove('bossflash'); void st.offsetWidth; st.classList.add('bossflash');
            SFX.warn();
          }
        }

        function updateAliveText() {
          const n = aliveEnemies().length;
          setText('stage-alive-text', n === 1 ? '1 inimigo vivo' : (n + ' inimigos vivos'));
          updateStageProgress();
        }

        /* barra de progresso do mundo (10 fases) */
        function updateStageProgress() {
          const el = $('stage-prog-fill');
          if (!el) return;
          const total = combat.enemies.length || 3;
          const dead = total - aliveEnemies().length;
          const pct = clamp(((state.stage - 1) + dead / total) / 10 * 100, 0, 100);
          el.style.width = pct.toFixed(1) + '%';
        }

        function updateEnemyBars(en) {
          const pct = Math.max(0, Math.round((en.hp / en.maxHp) * 100));
          if (en.el) en.el.bar.style.width = pct + '%';
          if (en.card) {
            en.card.fill.style.width = pct + '%';
            en.card.hp.textContent = en.hp <= 0 ? 'Derrotado' : (fmt(en.hp) + ' / ' + fmt(en.maxHp));
            en.card.root.classList.toggle('dead', en.hp <= 0);
          }
        }

        function setFocus(i) {
          const en = combat.enemies[i];
          if (!en || en.hp <= 0) return;
          combat.focus = (combat.focus === i) ? -1 : i;
          combat.enemies.forEach((e, k) => { if (e.el) e.el.slot.classList.toggle('targeted', k === combat.focus); });
          SFX.tone(660, 'sine', 0.05, 0.05);
        }

        function pickTarget() {
          const f = combat.enemies[combat.focus];
          if (f && f.hp > 0) return f;
          return combat.enemies.find((e) => e.hp > 0) || null;
        }

        /* =====================================================================
           7. EFEITOS VISUAIS
           ===================================================================== */
        const SLOT_X = [68, 86, 60];       // centro aproximado (%) dos inimigos na tela
        const SLOT_Y = [-12, 40, 92];      // deslocamento vertical (px) dos efeitos de cada inimigo
        const SLOT_RIGHT = ['22%', '4%', '30%'];

        function spawnFloater(layerId, xPct, yPx, text, color, big) {
          const layer = $(layerId);
          if (!layer || layer.childElementCount > 40) return;
          const div = document.createElement('div');
          div.className = 'dmg-floater';
          div.style.left = xPct + '%';
          div.style.top = yPx + 'px';
          div.style.color = color || '#ffffff';
          div.style.fontSize = big ? '16px' : '12.5px';
          div.textContent = text;
          layer.appendChild(div);
          setTimeout(() => div.remove(), 860);
        }

        function burst(layerId, xPct, yPx, kind, count, spread) {
          const layer = $(layerId);
          if (!layer || layer.childElementCount > 46) return;
          for (let i = 0; i < count; i++) {
            const p = document.createElement('i');
            p.className = 'fx-part ' + kind;
            p.style.left = xPct + '%';
            p.style.top = yPx + 'px';
            p.style.setProperty('--dx', rnd(-spread, spread).toFixed(0) + 'px');
            p.style.setProperty('--dy', rnd(-spread * 1.3, -spread * 0.1).toFixed(0) + 'px');
            layer.appendChild(p);
            setTimeout(() => p.remove(), 720);
          }
        }

        function triggerSlash(targetIdx) {
          const layer = $('fx-layer');
          if (!layer) return;
          const el = document.createElement('div');
          el.className = 'slash-fx';
          el.style.right = SLOT_RIGHT[targetIdx] || '18%';
          el.style.top = (SLOT_Y[targetIdx] + 18) + 'px';
          el.innerHTML = '<svg viewBox="0 0 60 60" width="52" height="52"><path d="M10 48 Q30 10 52 14 Q34 26 16 52 Z" fill="#fef08a" stroke="#f59e0b" stroke-width="2"/></svg>';
          layer.appendChild(el);
          setTimeout(() => el.remove(), 330);
        }

        function restartAnim(el, cls) {
          if (!el) return;
          el.classList.remove(cls);
          void el.offsetWidth;
          el.classList.add(cls);
        }
        function shakeStage() { restartAnim($('battle-stage'), 'anim-shake'); }

        function stageBanner(text, cls) {
          const el = $('stage-fx');
          el.textContent = text;
          el.className = 'stage-fx ' + (cls || '');
          void el.offsetWidth;
          el.classList.add('show');
        }

        function startWalking() {
          $('battle-stage').classList.add('walking');
          const h = $('hero-svg'); h.classList.remove('anim-idle'); h.classList.add('anim-walk');
        }
        function stopWalking() {
          $('battle-stage').classList.remove('walking');
          const h = $('hero-svg'); h.classList.remove('anim-walk'); h.classList.add('anim-idle');
        }

        function updateHeroHpBar() {
          const pct = clamp(Math.round((combat.heroHp / combat.heroMaxHp) * 100), 0, 100);
          const bar = $('hero-mini-hp');
          bar.style.width = pct + '%';
          bar.style.background = pct > 50 ? '#4ade80' : pct > 25 ? '#facc15' : '#ef4444';
          setText('stage-hp-text', fmt(combat.heroHp) + ' / ' + fmt(combat.heroMaxHp));
        }

        function syncHeroVitals() {
          const stats = getHeroStats();
          const ratio = combat.heroMaxHp > 0 ? (combat.heroHp / combat.heroMaxHp) : 1;
          combat.heroMaxHp = stats.hp;
          combat.heroHp = Math.max(1, Math.round(stats.hp * ratio));
          updateHeroHpBar();
        }

        function healHero(n) {
          if (n <= 0 || combat.heroHp >= combat.heroMaxHp) return;
          combat.heroHp = Math.min(combat.heroMaxHp, combat.heroHp + n);
          updateHeroHpBar();
        }

        /* =====================================================================
           8. DANO, MORTE, RECOMPENSAS E PROGRESSÃO
           ===================================================================== */
        function flashEnemy(en) { if (en && en.el) restartAnim(en.el.spr, 'anim-hit'); }

        function damageEnemy(en, dmg) {
          if (!en || en.hp <= 0) return false;
          en.hp = Math.max(0, en.hp - dmg);
          updateEnemyBars(en);
          flashEnemy(en);
          if (en.hp <= 0) { onEnemyKilled(en); return true; }
          return false;
        }

        function onEnemyKilled(en) {
          const st = getHeroStats();
          const idx = curIdx();
          state.stats.goblinsDefeated++;
          const g = Math.max(1, Math.round(stageGold(idx) * 0.28 * st.goldMult));
          state.gold += g;
          addHeroXp(Math.round(xpPerKill(idx) * st.xpMult));
          en.el.slot.classList.remove('enter', 'targeted');
          en.el.slot.classList.add('dying');
          en.el.warn.classList.remove('on');
          if (combat.focus === en.id) combat.focus = -1;
          burst('fx-layer', SLOT_X[en.id], 30 + SLOT_Y[en.id], 'coin', 5, 38);
          spawnFloater('fx-layer', SLOT_X[en.id], 4 + SLOT_Y[en.id], '+' + fmt(g), '#fde047', false);
          updateAliveText();
          checkWaveCleared();
        }

        function checkWaveCleared() {
          if (combat.state === 'fight' && combat.enemies.length && combat.enemies.every((e) => e.hp <= 0)) onWaveCleared();
        }

        function heroStrike(mult, isSkill) {
          if (combat.state !== 'fight') return;
          const tgt = pickTarget();
          if (!tgt) return;
          const st = getHeroStats();
          const isCrit = Math.random() * 100 < st.crit;
          const dmg = Math.max(1, Math.round(st.atk * (mult || 1) * (isSkill ? st.skillMult : 1) * (isCrit ? st.critMult : 1) * rnd(0.92, 1.08)));

          const hw = $('hero-wrap');
          hw.classList.add('lunge');
          setTimeout(() => hw.classList.remove('lunge'), 150);
          SFX.hit(isCrit);
          triggerSlash(tgt.id);
          if (isCrit) shakeStage();
          spawnFloater('fx-layer', SLOT_X[tgt.id], 16 + SLOT_Y[tgt.id], isCrit ? ('CRÍTICO! -' + fmt(dmg)) : ('-' + fmt(dmg)), isCrit ? '#facc15' : '#ffffff', isCrit);
          if (st.lifesteal > 0) {
            const heal = Math.round(dmg * st.lifesteal);
            if (heal > 0) { healHero(heal); }
          }
          damageEnemy(tgt, dmg);
        }

        function petStrike() {
          const tgt = pickTarget();
          if (!tgt) return;
          const st = getHeroStats();
          const pet = state.pets[state.activePet] || { level: 1 };
          const scale = 1 + ((pet.level || 1) - 1) * 0.15;
          const dmg = Math.max(1, Math.round(st.atk * 0.3 * scale * rnd(0.9, 1.1)));
          const layer = $('fx-layer');
          if (layer && layer.childElementCount < 40) {
            const p = document.createElement('i');
            p.className = 'fx-part proj';
            p.style.left = '14%'; p.style.top = '104px';
            p.style.setProperty('--dx', Math.round(layer.clientWidth * (SLOT_X[tgt.id] - 14) / 100) + 'px');
            p.style.setProperty('--dy', (SLOT_Y[tgt.id] - 40) + 'px');
            layer.appendChild(p);
            setTimeout(() => p.remove(), 300);
          }
          spawnFloater('fx-layer', SLOT_X[tgt.id], 34 + SLOT_Y[tgt.id], '🐾 -' + fmt(dmg), '#93c5fd', false);
          damageEnemy(tgt, dmg);
        }

        function enemyAttack(en) {
          const st = getHeroStats();
          const heavy = en.boss && ((en.atkCount + 1) % 3 === 0);
          en.atkCount++;
          en.warned = false;
          en.el.warn.classList.remove('on');

          const slot = en.el.slot;
          slot.style.transform = 'translateX(-32px)';
          setTimeout(() => { if (en.hp > 0) slot.style.transform = ''; }, 170);

          const raw = en.atk * (heavy ? 2.2 : 1) * (150 / (150 + st.def)) * rnd(0.92, 1.08);
          const blocked = combat.defending;
          const dmg = Math.max(1, Math.round(raw * (blocked ? 0.3 : 1)));
          combat.heroHp = Math.max(0, combat.heroHp - dmg);

          restartAnim($('hero-svg'), 'anim-hit');
          spawnFloater('fx-layer', 22, 62, (blocked ? '🛡️ ' : (heavy ? '💢 ' : '')) + '-' + fmt(dmg), heavy ? '#f87171' : '#fca5a5', heavy);
          if (heavy) { shakeStage(); SFX.buzz(50); }
          SFX.tone(heavy ? 120 : 200, 'triangle', 0.09, 0.06, 90);
          updateHeroHpBar();

          if (combat.heroHp <= 0) { heroDeath(); return; }

          if (blocked) {
            const reflect = Math.round(st.atk * 0.65 * st.skillMult);
            spawnFloater('fx-layer', SLOT_X[en.id], 28 + SLOT_Y[en.id], '🛡️ REFLEXO -' + fmt(reflect), '#38bdf8', false);
            damageEnemy(en, reflect);
          }
        }

        function heroDeath() {
          if (combat.state === 'dead') return;
          combat.state = 'dead';
          combat.transT = 1.9;
          combat.sched.length = 0;
          combat.defending = false;
          $('hero-shield-aura').classList.remove('active');
          state.stats.deaths++;
          combat.streak = 0;
          combat.deathFarm = true;
          const fromStage = state.stage;
          if (state.stage > 1) state.stage--;
          state.autoAdvance = false;
          $('battle-stage').classList.add('defeat');
          stageBanner('JEF CAIU!', 'boss');
          shakeStage();
          SFX.lose();
          showToast('💀 Jef caiu na Fase ' + fromStage + '. Voltando para a Fase ' + state.stage + ' (modo Farmar) para evoluir.');
          renderControlLabels();
          renderWaveTrack();
          saveGame();
        }

        function onWaveCleared() {
          if (combat.state !== 'fight') return;
          combat.state = 'clear';
          combat.transT = 0.95;
          combat.sched.length = 0;
          const st = getHeroStats();
          const idx = curIdx();
          const boss = state.stage === 10;
          state.stats.battlesWon++;
          state.stats.bestIdx = Math.max(state.stats.bestIdx, idx + 1);
          state.runBest = Math.max(state.runBest, idx + 1);
          if (state.runBest >= REBIRTH_MIN && !state.rebirthHint) {
            state.rebirthHint = true;
            showToast('⭐ Renascimento liberado! Veja na aba Herói.');
          }
          const gain = Math.round(stageGold(idx) * (boss ? 5 : 1) * st.goldMult);
          state.gold += gain;

          let msg = '+' + fmt(gain) + ' 🪙';
          if (boss) {
            const ess = 3 + Math.floor(state.world / 2);
            state.keys += 1; state.essences += ess;
            msg = 'CHEFE VENCIDO! +1 🔑 +' + ess + ' 🔥 +' + fmt(gain) + ' 🪙';
            stageBanner('CHEFE DERROTADO!', 'win');
            SFX.legendary();
            unlockNextWorld();
          } else {
            if (Math.random() < st.extraKeyChance) { state.keys += 1; msg = '+1 🔑 BÔNUS! +' + fmt(gain) + ' 🪙'; }
            unlockNextStage();
          }
          spawnFloater('fx-layer', 50, 40, msg, boss ? '#facc15' : '#4ade80', boss);
          if (!boss) SFX.win();
          startWalking();

          // Depois de uma derrota, volta a avançar sozinho quando vence algumas ondas seguidas
          combat.streak++;
          if (combat.deathFarm && !state.autoAdvance && combat.streak >= 6) {
            state.autoAdvance = true; combat.deathFarm = false;
            showToast('💪 Jef está mais forte! Voltando a avançar de fase.');
            renderControlLabels();
          }
          refreshHUD();
        }

        function unlockNextStage() {
          if (state.stage < 10) state.bestStage[state.world] = Math.max(state.bestStage[state.world] || 1, state.stage + 1);
        }
        function unlockNextWorld() {
          state.bossCleared[state.world] = true;
          if (state.world >= state.maxWorldUnlocked) {
            const next = state.world + 1;
            state.maxWorldUnlocked = next;
            state.bestStage[next] = state.bestStage[next] || 1;
            const gems = next <= WORLDS.length ? 8 : 5;
            state.gems += gems;
            showToast('🌍 Mundo ' + next + ' desbloqueado! +' + gems + ' 💎');
          }
        }

        function advanceStage() {
          if (!state.autoAdvance) return;
          if (state.stage < 10) {
            state.stage++;
          } else {
            state.world = Math.min(99, state.world + 1);
            state.stage = 1;
            state.maxWorldUnlocked = Math.max(state.maxWorldUnlocked, state.world);
          }
          state.bestStage[state.world] = Math.max(state.bestStage[state.world] || 1, state.stage);
        }

        function finishTransition() {
          const was = combat.state;
          stopWalking();
          $('battle-stage').classList.remove('defeat');
          if (was === 'clear') {
            healHero(Math.round(combat.heroMaxHp * getHeroStats().regenPct));
            advanceStage();
          } else if (was === 'dead') {
            combat.heroHp = combat.heroMaxHp;
          }
          combat.state = 'fight';
          updateHeroHpBar();
          spawnWave();
          refreshHUD();
          saveGame();
        }

        function addHeroXp(xp) {
          state.heroXp += xp;
          let leveled = 0;
          let req = xpReq(state.heroLevel);
          while (state.heroXp >= req && leveled < 50) {
            state.heroXp -= req;
            state.heroLevel++;
            state.talentPoints++;
            leveled++;
            req = xpReq(state.heroLevel);
          }
          if (leveled > 0) {
            syncHeroVitals();
            stageBanner('NÍVEL ' + state.heroLevel + '!', 'lvl');
            SFX.levelUp();
            showToast('⭐ Jef alcançou o Nível ' + state.heroLevel + '! (+' + leveled + ' ponto de talento)');
            burst('fx-layer', 18, 40, 'spark', 8, 46);
          }
        }

        /* =====================================================================
           9. HABILIDADES ATIVAS
           ===================================================================== */
        const skillCd = (key) => BASE_CD[key] * (1 - getHeroStats().cdr);

        function castSlash() {
          if (combat.cd.slash > 0 || combat.state !== 'fight') return false;
          combat.cd.slash = skillCd('slash');
          heroStrike(1.25, true);
          later(0.18, () => heroStrike(1.25, true));
          return true;
        }

        function castShield() {
          if (combat.cd.shield > 0 || combat.state !== 'fight') return false;
          combat.cd.shield = skillCd('shield');
          combat.defending = true;
          combat.defendT = 4.0;
          $('hero-shield-aura').classList.add('active');
          SFX.tone(360, 'sine', 0.2, 0.09, 520);
          spawnFloater('fx-layer', 20, 4, '🛡️ ESCUDO!', '#7dd3fc', false);
          return true;
        }

        function castAether() {
          if (combat.cd.aether > 0 || combat.state !== 'fight') return false;
          combat.cd.aether = skillCd('aether');
          SFX.aether();
          shakeStage();
          const layer = $('fx-layer');
          const st = getHeroStats();
          const dmg = Math.round(st.atk * 2.35 * st.skillMult);
          combat.enemies.slice().forEach((en, i) => {
            if (en.hp <= 0) return;
            const beam = document.createElement('div');
            beam.className = 'beam-fx';
            beam.style.right = ['39%', '22%', '5%'][i];
            layer.appendChild(beam);
            setTimeout(() => beam.remove(), 530);
            spawnFloater('fx-layer', SLOT_X[i], 10, '✦ -' + fmt(dmg), '#38bdf8', true);
            damageEnemy(en, dmg);
          });
          return true;
        }

        function updateSkillButtons() {
          [['slash', 'btn-skill-slash'], ['shield', 'btn-defend'], ['aether', 'btn-aether']].forEach((pair) => {
            const key = pair[0], btn = $(pair[1]);
            const cd = combat.cd[key], total = skillCd(key);
            const cooling = cd > 0;
            if (btn._cool !== cooling) { btn._cool = cooling; btn.classList.toggle('cooling', cooling); btn.classList.toggle('ready', !cooling); btn.disabled = cooling; }
            btn.firstElementChild.style.transform = 'scaleY(' + (cooling ? Math.min(1, cd / total).toFixed(2) : 0) + ')';
            const num = btn.querySelector('.cd-num');
            setText(num, cooling ? cd.toFixed(1) : '');
          });
        }

        function renderControlLabels() {
          const sp = $('btn-speed'), au = $('btn-auto-skill'), ad = $('btn-advance'), pa = $('btn-pause');
          setHTML(pa, combat.paused ? '▶' : '❚❚');
          pa.classList.toggle('warn', combat.paused);
          setHTML(sp, '⚡<br>' + combat.speed + 'x');
          sp.classList.toggle('on', combat.speed > 1);
          setHTML(au, '🤖<br>' + (state.autoSkills ? 'ON' : 'OFF'));
          au.classList.toggle('on', state.autoSkills);
          setHTML(ad, state.autoAdvance ? '▶<br>Fase' : '↻<br>Farm');
          ad.classList.toggle('warn', !state.autoAdvance);
          ad.classList.toggle('on', state.autoAdvance);
        }

        /* =====================================================================
           10. LOOP DE SIMULAÇÃO (independe do tempo de renderização)
           ===================================================================== */
        function tick(rawDt) {
          if (combat.paused) return;
          const dt = rawDt * combat.speed;
          runSched(dt);

          Object.keys(combat.cd).forEach((k) => { if (combat.cd[k] > 0) combat.cd[k] = Math.max(0, combat.cd[k] - dt); });
          if (combat.defending) {
            combat.defendT -= dt;
            if (combat.defendT <= 0) { combat.defending = false; $('hero-shield-aura').classList.remove('active'); }
          }

          if (combat.transT > 0) {
            combat.transT -= dt;
            if (combat.transT <= 0) finishTransition();
            return;
          }
          if (combat.state !== 'fight') return;

          const st = getHeroStats();
          const atkInterval = 1.35 / st.atkSpeedMult;
          combat.heroAtkT += dt;
          let guard = 0;
          while (combat.heroAtkT >= atkInterval && combat.state === 'fight' && guard++ < 6) {
            combat.heroAtkT -= atkInterval;
            heroStrike(1.0, false);
          }

          combat.petAtkT += dt;
          if (combat.petAtkT >= 3.2 && combat.state === 'fight') { combat.petAtkT = 0; petStrike(); }

          for (let i = 0; i < combat.enemies.length; i++) {
            const en = combat.enemies[i];
            if (combat.state !== 'fight') break;
            if (en.hp <= 0) continue;
            en.atkT += dt;
            const willHeavy = en.boss && ((en.atkCount + 1) % 3 === 0);
            if (willHeavy && !en.warned && en.atkT >= en.interval - 0.9) {
              en.warned = true;
              en.el.warn.classList.add('on');
              SFX.warn();
            }
            if (en.atkT >= en.interval) {
              en.atkT -= en.interval;
              enemyAttack(en);
            }
          }

          if (state.autoSkills && combat.state === 'fight') {
            const alive = aliveEnemies();
            if (combat.cd.slash <= 0) castSlash();
            if (combat.cd.aether <= 0 && alive.length >= 2) castAether();
            if (combat.cd.shield <= 0 && !combat.defending && combat.state === 'fight') {
              const charging = alive.some((e) => e.warned);
              if (charging || combat.heroHp / combat.heroMaxHp < 0.55) castShield();
            }
          }
        }
