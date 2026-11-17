
        /* =====================================================================
           11. BAÚS, LOOT, AUTO-BAÚ E FORJA
           ===================================================================== */
        let chestAnimating = false;
        let autoChestEnabled = false;
        let autoLog = null;
        let rolledItem = null;
        let inspectedSlotKey = null;

        function traitLabel(it) {
          const tr = it && it.tr && TRAITS[it.tr];
          return tr && it.tv > 0 ? tr.icon + ' +' + it.tv + '% ' + tr.label : '';
        }
        const isHighRarity = (it) => it.rarity === 'legendary' || it.rarity === 'mythic';

        function rollRandomEquipment() {
          const type = pick(Object.keys(GEAR_LABELS));
          const def = GEAR_DEFS[type];
          const variant = pick(def.variants);
          const rarity = rollRarity(state.chestLevel);

          // Baús evoluídos também dão itens de nível mais alto
          const lvl = Math.max(1, state.heroLevel + Math.floor(Math.random() * 3) - 1 + Math.floor((state.chestLevel - 1) / 2));
          const mult = RARITIES[rarity].mult;
          const jitter = rnd(0.92, 1.08);
          const suffix = { common: 'Simples', uncommon: 'do Bosque', rare: 'do Guardião', epic: 'Arcano', legendary: 'Celestial', mythic: 'do Éter Supremo' }[rarity];
          const hasTrait = !!variant.t && rarity !== 'common';

          return {
            type: type,
            v: variant.id,
            name: variant.name + ' ' + suffix,
            level: lvl,
            rarity: rarity,
            atk: Math.round((8 + lvl * 5) * mult * def.a * variant.a * jitter * GEAR_SCALE),
            hp: Math.round((20 + lvl * 15) * mult * def.h * variant.h * jitter * GEAR_SCALE),
            tr: hasTrait ? variant.t[0] : '',
            tv: hasTrait ? Math.max(1, Math.round(variant.t[1] * mult)) : 0,
            sellGold: 25 + lvl * 14 + Math.round(mult * 18)
          };
        }

        function equipItem(item) {
          state.equipment[item.type] = {
            type: item.type, name: item.name, level: item.level, rarity: item.rarity, atk: item.atk, hp: item.hp,
            v: item.v || '', tr: item.tr || '', tv: item.tv || 0
          };
          syncHeroVitals();
          updateHeroGlow();
        }

        function dismantleItem(item) {
          const gold = Math.round((item.sellGold || 40) * getHeroStats().goldMult);
          const ess = RARITIES[item.rarity].ess;
          state.gold += gold;
          state.essences += ess;
          addHeroXp(Math.round(10 + item.level * 1.5));
          return { gold: gold, ess: ess };
        }

        /* Decide o destino de um item sorteado. Retorna 'equipped' | 'dismantled' | 'prompt' */
        function resolveItem(item, auto) {
          if (isHighRarity(item)) state.stats.rareFound++;
          if (!auto) return 'prompt';
          const better = itemPower(item) > itemPower(state.equipment[item.type], item.type);
          if (isHighRarity(item) && better) return 'prompt';
          if (better) { equipItem(item); return 'equipped'; }
          return 'dismantled';
        }

        function openChestSequence() {
          if (chestAnimating) return;
          if (state.keys <= 0) {
            if (autoChestEnabled) finishAutoChest();
            SFX.error();
            showToast('Sem chaves! Vá na Arena, Expedições ou na Loja.');
            return;
          }
          chestAnimating = true;
          state.keys = Math.max(0, state.keys - 1);
          state.stats.chestsOpened++;
          refreshHUD();
          saveGame();

          const chestSvg = $('chest-svg');
          const chestZone = $('chest-click-zone');
          SFX.chestShake();
          chestSvg.classList.add('anim-chest-shake');

          setTimeout(() => {
            chestSvg.classList.remove('anim-chest-shake');
            chestZone.classList.add('chest-opened');
            SFX.chestOpen();

            setTimeout(() => {
              const item = rollRandomEquipment();
              chestZone.classList.remove('chest-opened');
              chestAnimating = false;
              onItemRolled(item);
            }, 340);
          }, 460);
        }

        function onItemRolled(item) {
          const auto = autoChestEnabled;
          const outcome = resolveItem(item, auto);

          if (outcome === 'prompt') {
            if (auto) {
              autoChestEnabled = false;
              updateAutoChestBtn();
              showToast('✨ Auto-Baú pausou: item ' + RARITIES[item.rarity].label + ' encontrado!');
              finishAutoChest(true);
            }
            rolledItem = item;
            showLootModal(item);
            refreshHUD();
            saveGame();
            return;
          }

          if (autoLog) {
            autoLog.opened++;
            if (outcome === 'equipped') { autoLog.equipped++; showToast('⚙️ Auto: ' + item.name + ' equipado!'); }
            else {
              const d = dismantleItem(item);
              autoLog.dismantled++; autoLog.gold += d.gold; autoLog.ess += d.ess;
            }
          }
          refreshHUD();
          saveGame();
          if (state.keys > 0 && autoChestEnabled) {
            setTimeout(openChestSequence, 320);
          } else {
            finishAutoChest();
          }
        }

        function finishAutoChest(silent) {
          const log = autoLog;
          autoLog = null;
          autoChestEnabled = false;
          updateAutoChestBtn();
          if (log && log.opened > 0 && !silent) {
            showToast('⚙️ Auto-Baú: ' + log.opened + ' abertos • ' + log.equipped + ' equipados • ' + log.dismantled + ' desmontados (+' + fmt(log.gold) + '🪙 +' + log.ess + '🔥)');
          }
        }

        /* Abre vários baús de uma vez (sem animação). Também usado pelos testes. */
        function openChestsBulk(n) {
          const sum = { opened: 0, equipped: 0, dismantled: 0, gold: 0, ess: 0, prompted: false };
          if (chestAnimating) return sum;
          while (sum.opened < n && state.keys > 0) {
            state.keys--;
            state.stats.chestsOpened++;
            sum.opened++;
            const item = rollRandomEquipment();
            const outcome = resolveItem(item, true);
            if (outcome === 'prompt') {
              rolledItem = item;
              sum.prompted = true;
              break;
            }
            if (outcome === 'equipped') sum.equipped++;
            else { const d = dismantleItem(item); sum.dismantled++; sum.gold += d.gold; sum.ess += d.ess; }
          }
          return sum;
        }

        function updateAutoChestBtn() {
          $('btn-auto-chest').classList.toggle('active', autoChestEnabled);
          setText('auto-chest-state', autoChestEnabled ? 'ON' : 'OFF');
        }

        function showLootModal(item) {
          const slotKey = item.type;
          const current = state.equipment[slotKey];
          const rar = RARITIES[item.rarity];

          const badge = $('loot-rarity-badge');
          badge.textContent = rar.label;
          badge.style.backgroundColor = rar.bg;
          badge.style.color = rar.text;
          badge.style.borderColor = rar.border;

          $('loot-title').textContent = item.name;
          $('loot-subtitle').textContent = GEAR_LABELS[item.type] + ' • Nível ' + item.level;

          const prev = $('loot-icon-preview');
          prev.className = 'rarity-' + item.rarity;
          prev.style.borderColor = rar.border;
          prev.innerHTML = getGearSVG(item.type, item.rarity, item.v);
          setText('loot-trait', traitLabel(item));
          toggleShow('loot-trait', !!item.tr);
          $('loot-modal').style.setProperty('--ray', rar.ray);

          const fmtDiff = (diff) => diff > 0
            ? '<span style="color:#16a34a;">(▲ +' + fmt(diff) + ')</span>'
            : diff < 0
              ? '<span style="color:#dc2626;">(▼ ' + fmt(diff) + ')</span>'
              : '<span style="color:#6e6552;">(= 0)</span>';

          const m = enhMult(slotKey);
          const pNew = itemPower(item, slotKey);
          const pOld = itemPower(current, slotKey);
          const aNew = Math.round(item.atk * m), aOld = current ? Math.round(current.atk * m) : 0;
          const hNew = Math.round(item.hp * m), hOld = current ? Math.round(current.hp * m) : 0;

          $('loot-cmp-power').innerHTML = fmt(pNew) + ' ' + fmtDiff(pNew - pOld);
          $('loot-cmp-atk').innerHTML = '+' + fmt(aNew) + ' ' + fmtDiff(aNew - aOld);
          $('loot-cmp-hp').innerHTML = '+' + fmt(hNew) + ' ' + fmtDiff(hNew - hOld);

          const verdict = $('loot-verdict');
          if (pNew > pOld) { verdict.textContent = '▲ MELHOR que o seu equipamento!'; verdict.style.color = '#16a34a'; }
          else if (pNew < pOld) { verdict.textContent = '▼ Mais fraco que o equipado'; verdict.style.color = '#b45309'; }
          else { verdict.textContent = '= Mesmo poder'; verdict.style.color = '#6e6552'; }

          $('loot-current').textContent = 'Equipado: ' + (current ? current.name + ' (Nv. ' + current.level + ', Poder ' + fmt(pOld) + ')' : 'nada') +
            (state.slotEnhance[slotKey] ? ' • Forja +' + state.slotEnhance[slotKey] + ' será mantida' : '');
          $('loot-sell-val').textContent = fmt(Math.round(item.sellGold * getHeroStats().goldMult));
          $('loot-sell-ess').textContent = rar.ess;
          $('loot-modal').classList.add('open');
          if (isHighRarity(item)) SFX.legendary(); else if (pNew > pOld) SFX.win();
        }

        function openForgeModal(slotKey) {
          inspectedSlotKey = slotKey;
          const it = state.equipment[slotKey];
          if (!it) return;
          const enh = state.slotEnhance[slotKey] || 0;
          const rar = RARITIES[it.rarity];
          const mult = enhMult(slotKey);

          const badge = $('insp-rarity');
          badge.textContent = rar.label;
          badge.style.backgroundColor = rar.bg;
          badge.style.color = rar.text;
          badge.style.borderColor = rar.border;

          $('insp-name').textContent = it.name;
          $('insp-sub').textContent = GEAR_LABELS[slotKey] + ' • Nível ' + it.level + ' • Forja +' + enh + (enh >= MAX_ENHANCE ? ' (MÁX)' : '');

          const iconBox = $('insp-icon');
          iconBox.className = 'rarity-' + it.rarity;
          iconBox.style.borderColor = rar.border;
          iconBox.innerHTML = getGearSVG(slotKey, it.rarity, it.v);
          setText('insp-trait', traitLabel(it));
          toggleShow('insp-trait', !!it.tr);

          const curAtk = Math.round(it.atk * mult), curHp = Math.round(it.hp * mult);
          const nxtMult = 1 + (enh + 1) * 0.14;
          const nxtAtk = Math.round(it.atk * nxtMult), nxtHp = Math.round(it.hp * nxtMult);
          const more = enh < MAX_ENHANCE;
          $('insp-stats').innerHTML =
            '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Poder Total:</span><strong>' + fmt(Math.round(curAtk * 5.2 + curHp * 0.85)) + '</strong></div>' +
            '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Ataque:</span><strong>+' + fmt(curAtk) + (more ? ' <span style="color:#16a34a;">→ ' + fmt(nxtAtk) + '</span>' : '') + '</strong></div>' +
            '<div style="display:flex;justify-content:space-between;"><span>Vida:</span><strong>+' + fmt(curHp) + (more ? ' <span style="color:#16a34a;">→ ' + fmt(nxtHp) + '</span>' : '') + '</strong></div>';

          const btn = $('btn-forge-slot');
          if (more) {
            btn.disabled = false; btn.style.opacity = '';
            $('forge-cost-label').textContent = fmt(forgeGoldCost(enh)) + ' 🪙 + ' + forgeEssCost(enh) + ' 🔥';
          } else {
            btn.disabled = true; btn.style.opacity = '0.5';
            $('forge-cost-label').textContent = 'Nível máximo';
          }
          $('inspect-modal').classList.add('open');
        }

        function forgeSlot(slotKey) {
          const enh = state.slotEnhance[slotKey] || 0;
          if (enh >= MAX_ENHANCE) return false;
          const goldCost = forgeGoldCost(enh), essCost = forgeEssCost(enh);
          if (state.gold < goldCost || state.essences < essCost) return false;
          state.gold -= goldCost;
          state.essences -= essCost;
          state.slotEnhance[slotKey] = enh + 1;
          state.stats.upgradesDone++;
          syncHeroVitals();
          return true;
        }
