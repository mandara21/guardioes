        /* =====================================================================
           1. UTILITÁRIOS
           ===================================================================== */
        const $ = (id) => document.getElementById(id);
        const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
        const rnd = (a, b) => a + Math.random() * (b - a);
        const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
        const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
        const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

        function esc(s) {
          return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }

        /* Números grandes viram 12,3K / 4,5M para caber na tela */
        function fmt(n) {
          n = Math.floor(Number(n) || 0);
          const abs = Math.abs(n);
          if (abs < 10000) return n.toLocaleString('pt-BR');
          const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];
          let v = abs, i = -1;
          while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
          const s = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
          return (n < 0 ? '-' : '') + String(+s).replace('.', ',') + units[i];
        }

        function fmtTime(sec) {
          sec = Math.max(0, Math.ceil(sec));
          const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
          if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'min';
          return m + ':' + String(s).padStart(2, '0');
        }

        function dayKey(ts) {
          const d = new Date(ts === undefined ? Date.now() : ts);
          return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        }

        /* Só escreve no DOM quando o valor muda (evita redesenho e toques perdidos) */
        function setText(id, text) {
          const el = typeof id === 'string' ? $(id) : id;
          if (!el) return;
          text = String(text);
          if (el._t !== text) { el._t = text; el.textContent = text; }
        }
        function setHTML(id, html) {
          const el = typeof id === 'string' ? $(id) : id;
          if (!el) return;
          if (el._h !== html) { el._h = html; el.innerHTML = html; }
        }

        /* =====================================================================
           2. EFEITOS SONOROS (Web Audio sintetizado) + VIBRAÇÃO
           ===================================================================== */
        const SFX = {
          ctx: null,
          enabled: true,
          vibrate: true,
          unlocked: false,
          tone(freq, type, dur, vol, endFreq, delay) {
            if (!this.enabled || !this.unlocked) return;
            try {
              if (!this.ctx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (AC) this.ctx = new AC();
              }
              if (!this.ctx) return;
              if (this.ctx.state === 'suspended') this.ctx.resume();
              const t0 = this.ctx.currentTime + (delay || 0);
              const osc = this.ctx.createOscillator();
              const gain = this.ctx.createGain();
              osc.type = type || 'sine';
              osc.frequency.setValueAtTime(freq, t0);
              if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
              gain.gain.setValueAtTime(vol || 0.08, t0);
              gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
              osc.connect(gain);
              gain.connect(this.ctx.destination);
              osc.start(t0);
              osc.stop(t0 + dur);
            } catch (e) {}
          },
          buzz(ms) {
            if (!this.vibrate || !this.unlocked) return;
            try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
          },
          hit(crit) {
            if (crit) {
              this.tone(540, 'sawtooth', 0.14, 0.12, 130);
              this.tone(860, 'triangle', 0.15, 0.1, 440, 0.035);
              this.buzz(18);
            } else {
              this.tone(300, 'triangle', 0.1, 0.08, 110);
            }
          },
          chestShake() {
            this.tone(170, 'square', 0.07, 0.06, 120);
            this.tone(210, 'square', 0.07, 0.06, 150, 0.11);
            this.tone(250, 'square', 0.08, 0.07, 170, 0.22);
          },
          chestOpen() {
            this.tone(523, 'triangle', 0.2, 0.1, 784);
            this.tone(659, 'triangle', 0.25, 0.11, 1046, 0.08);
            this.buzz(30);
          },
          coin() { this.tone(987, 'sine', 0.08, 0.08, 1318); },
          aether() { this.tone(240, 'sawtooth', 0.35, 0.11, 900); this.buzz(40); },
          levelUp() {
            [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 'triangle', 0.18, 0.1, f * 1.02, i * 0.09));
            this.buzz([30, 40, 60]);
          },
          legendary() {
            [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 'triangle', 0.22, 0.1, f * 1.01, i * 0.08));
            this.buzz([40, 30, 80]);
          },
          warn() { this.tone(220, 'square', 0.12, 0.09, 180); this.tone(220, 'square', 0.12, 0.09, 180, 0.16); this.buzz(40); },
          win() {
            [523, 659, 784].forEach((f, i) => this.tone(f, 'triangle', 0.16, 0.09, f, i * 0.07));
          },
          lose() { this.tone(145, 'sawtooth', 0.4, 0.14, 65); this.buzz([80, 40, 80]); },
          error() { this.tone(140, 'square', 0.14, 0.09, 100); }
        };

        ['pointerdown', 'touchstart', 'keydown'].forEach((ev) => {
          document.addEventListener(ev, () => { SFX.unlocked = true; }, { capture: true, passive: true });
        });

        /* =====================================================================
           3. MUNDOS, RARIDADES, MASCOTES E ARTE VETORIAL
           ===================================================================== */
        const WORLDS = [
          { name: 'FLORESTA DOS SUSSURROS', theme: 'goblin', sky1: '#629373', sky2: '#93bc91', ground: '#9bc082', path1: '#dfd2b4', path2: '#c9b68e',
            mobs: ['Goblin Explorador', 'Goblin Lanceiro', 'Goblin Batedor'], boss: 'Rei Goblin', amb: 'leaf', sub: 'Derrote os guardas da trilha!' },
          { name: 'REFÚGIO ENLUARADO', theme: 'skeleton', sky1: '#2e2b59', sky2: '#56508f', ground: '#4a4e69', path1: '#b8b8d1', path2: '#8d8da8',
            mobs: ['Esqueleto Guarda', 'Espectro Noturno', 'Arqueiro Ósseo'], boss: 'Lorde Necromante', amb: 'star', sub: 'Os mortos não descansam aqui...' },
          { name: 'FORJA VULCÂNICA', theme: 'magma', sky1: '#591c1c', sky2: '#9a3412', ground: '#451a03', path1: '#78350f', path2: '#451a03',
            mobs: ['Diabrete de Brasa', 'Golem de Magma', 'Salamandra Ígnea'], boss: 'Senhor das Cinzas', amb: 'ember', sub: 'O calor aqui é de derreter armaduras!' },
          { name: 'CIDADELA ETÉREA', theme: 'ethereal', sky1: '#164e63', sky2: '#0284c7', ground: '#1e3a8a', path1: '#bae6fd', path2: '#7dd3fc',
            mobs: ['Sentinela Arcano', 'Cavaleiro Sombrio', 'Orbe Celestial'], boss: 'Dragão do Éter', amb: 'orb', sub: 'Guardiões antigos protegem os céus.' },
          { name: 'PÂNTANO PODRE', theme: 'swamp', sky1: '#2f4a2a', sky2: '#7a8f3f', ground: '#3d4a24', path1: '#8a7a4a', path2: '#5e5232',
            mobs: ['Lodo Vivo', 'Sapo Venenoso', 'Cogumelo Tóxico'], boss: 'Hidra do Brejo', amb: 'spore', sub: 'Cuidado onde pisa: tudo aqui é venenoso.' },
          { name: 'PICOS GELADOS', theme: 'frost', sky1: '#4a6a8a', sky2: '#bcd6ea', ground: '#dfeaf3', path1: '#f4f8fb', path2: '#c3d4e2',
            mobs: ['Lobo de Gelo', 'Golem Glacial', 'Espectro Gélido'], boss: 'Rainha do Inverno', amb: 'snow', sub: 'O frio eterno guarda o último tesouro.' }
        ];

        function worldInfo(n) {
          const base = WORLDS[(n - 1) % WORLDS.length];
          const cycle = Math.floor((n - 1) / WORLDS.length);
          return Object.assign({}, base, { n: n, cycle: cycle, name: base.name + (cycle > 0 ? ' ' + (ROMAN[cycle + 1] || ('x' + (cycle + 1))) : '') });
        }

        const RARITIES = {
          common:    { label: 'COMUM',    mult: 1.0,  bg: '#e5e7eb', text: '#374151', border: '#9ca3af', ray: 'rgba(209,213,219,.45)', ess: 1 },
          uncommon:  { label: 'INCOMUM',  mult: 1.35, bg: '#dcfce7', text: '#166534', border: '#22c55e', ray: 'rgba(134,239,172,.5)',  ess: 2 },
          rare:      { label: 'RARO',     mult: 1.85, bg: '#dbeafe', text: '#1e40af', border: '#3b82f6', ray: 'rgba(147,197,253,.55)', ess: 3 },
          epic:      { label: 'ÉPICO',    mult: 2.5,  bg: '#f3e8ff', text: '#6b21a8', border: '#9333ea', ray: 'rgba(216,180,254,.6)',  ess: 5 },
          legendary: { label: 'LENDÁRIO', mult: 3.45, bg: '#fef3c7', text: '#92400e', border: '#f59e0b', ray: 'rgba(255,224,102,.65)', ess: 8 },
          mythic:    { label: 'MÍTICO',   mult: 4.8,  bg: '#fee2e2', text: '#991b1b', border: '#dc2626', ray: 'rgba(252,165,165,.7)',  ess: 14 }
        };
        const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

        const GEAR_LABELS = {
          weapon: 'Arma', armor: 'Armadura', gloves: 'Luvas', ring: 'Anel',
          helmet: 'Elmo', amulet: 'Amuleto', boots: 'Botas', shield: 'Escudo',
          cape: 'Capa', belt: 'Cinto', legs: 'Grevas', relic: 'Relíquia'
        };

        /* Bônus especiais que alguns equipamentos (Incomum ou melhor) trazem.
           cap = limite da soma de todas as peças; w = peso na comparação de poder. */
        const TRAITS = {
          crit:  { icon: '🎯', label: 'Crítico',             cap: 20,  w: 1.0 },
          aspd:  { icon: '⚡', label: 'Vel. de ataque',      cap: 30,  w: 1.2 },
          ls:    { icon: '🩸', label: 'Roubo de vida',       cap: 12,  w: 1.0 },
          skill: { icon: '✨', label: 'Dano de habilidade',  cap: 50,  w: 0.5 },
          gold:  { icon: '🪙', label: 'Ouro',                cap: 60, w: 0.3 },
          xp:    { icon: '📖', label: 'Experiência',         cap: 60, w: 0.3 },
          defp:  { icon: '🛡️', label: 'Defesa',              cap: 40,  w: 0.4 }
        };

        /* 12 espaços de equipamento, cada um com várias peças diferentes.
           a/h = peso de ataque/vida do espaço; cada variação ajusta isso e pode trazer um bônus [tipo, valor base]. */
        const GEAR_DEFS = {
          weapon: { a: 1.4, h: 0.75, variants: [
            { id: 'sword',  name: 'Espada',  a: 1.0,  h: 1.0 },
            { id: 'axe',    name: 'Machado', a: 1.18, h: 0.85, t: ['crit', 2] },
            { id: 'spear',  name: 'Lança',   a: 1.0,  h: 0.95, t: ['aspd', 3] },
            { id: 'staff',  name: 'Cajado',  a: 1.05, h: 0.9,  t: ['skill', 4] }] },
          armor: { a: 0.75, h: 1.4, variants: [
            { id: 'mail',   name: 'Cota de Malha',  a: 1.0, h: 1.0 },
            { id: 'plate',  name: 'Couraça',        a: 0.8, h: 1.15, t: ['defp', 4] },
            { id: 'robe',   name: 'Veste Rúnica',   a: 1.2, h: 0.9,  t: ['skill', 4] }] },
          gloves: { a: 0.75, h: 0.75, variants: [
            { id: 'gloves', name: 'Luvas',              a: 1.0,  h: 1.0 },
            { id: 'gaunt',  name: 'Manoplas',           a: 0.9,  h: 1.15, t: ['defp', 4] },
            { id: 'archer', name: 'Luvas de Arqueiro',  a: 1.15, h: 0.9,  t: ['aspd', 3] }] },
          ring: { a: 1.4, h: 0.75, variants: [
            { id: 'ring',   name: 'Anel',            a: 1.0,  h: 1.0 },
            { id: 'vamp',   name: 'Anel Vampírico',  a: 0.95, h: 1.0, t: ['ls', 1.5] },
            { id: 'luck',   name: 'Anel da Fortuna', a: 0.95, h: 1.0, t: ['gold', 5] }] },
          helmet: { a: 0.75, h: 1.4, variants: [
            { id: 'helm',   name: 'Elmo',         a: 1.0,  h: 1.0 },
            { id: 'hood',   name: 'Capuz',        a: 1.15, h: 0.9, t: ['crit', 2] },
            { id: 'crown',  name: 'Coroa Sábia',  a: 1.0,  h: 1.0, t: ['xp', 5] }] },
          amulet: { a: 0.75, h: 0.75, variants: [
            { id: 'amulet', name: 'Amuleto',            a: 1.0,  h: 1.0 },
            { id: 'talis',  name: 'Talismã Arcano',     a: 1.1,  h: 0.95, t: ['skill', 4] },
            { id: 'charm',  name: 'Amuleto da Sorte',   a: 1.0,  h: 1.0,  t: ['gold', 5] }] },
          boots: { a: 0.75, h: 0.75, variants: [
            { id: 'boots',  name: 'Botas',          a: 1.0, h: 1.0 },
            { id: 'swift',  name: 'Botas Velozes',  a: 1.0, h: 0.95, t: ['aspd', 3] },
            { id: 'iron',   name: 'Botas de Ferro', a: 0.9, h: 1.15, t: ['defp', 4] }] },
          shield: { a: 0.75, h: 1.4, variants: [
            { id: 'shield', name: 'Escudo',        a: 1.0, h: 1.0 },
            { id: 'buckler',name: 'Broquel',       a: 1.2, h: 0.85, t: ['crit', 2] },
            { id: 'tower',  name: 'Escudo Torre',  a: 0.8, h: 1.2,  t: ['defp', 4] }] },
          cape: { a: 0.45, h: 0.45, variants: [
            { id: 'cape',   name: 'Capa',            a: 1.0,  h: 1.0 },
            { id: 'shadow', name: 'Capa Sombria',    a: 1.15, h: 0.9, t: ['crit', 2] },
            { id: 'sage',   name: 'Manto do Sábio',  a: 1.0,  h: 1.0, t: ['xp', 5] }] },
          belt: { a: 0.45, h: 0.5, variants: [
            { id: 'belt',   name: 'Cinto',               a: 1.0,  h: 1.0 },
            { id: 'champ',  name: 'Cinto de Campeão',    a: 1.1,  h: 1.0, t: ['ls', 1.5] },
            { id: 'trove',  name: 'Cinturão do Tesouro', a: 0.95, h: 1.0, t: ['gold', 5] }] },
          legs: { a: 0.4, h: 0.85, variants: [
            { id: 'legs',   name: 'Grevas',             a: 1.0, h: 1.0 },
            { id: 'hunter', name: 'Calças de Caçador',  a: 1.1, h: 0.9,  t: ['aspd', 3] },
            { id: 'warden', name: 'Grevas Reforçadas',  a: 0.85,h: 1.15, t: ['defp', 4] }] },
          relic: { a: 0.8, h: 0.35, variants: [
            { id: 'tome',   name: 'Tomo Antigo',   a: 1.0, h: 1.0, t: ['xp', 5] },
            { id: 'orb',    name: 'Orbe Arcano',   a: 1.1, h: 0.9, t: ['skill', 4] },
            { id: 'idol',   name: 'Ídolo Sombrio', a: 1.0, h: 1.0, t: ['ls', 1.5] }] }
        };
        /* com 12 espaços em vez de 8, cada peça vale menos — o total de poder fica no mesmo patamar */
        const GEAR_SCALE = 0.7;
        const variantOf = (slot, id) => ((GEAR_DEFS[slot] || {}).variants || []).find((v) => v.id === id) || null;

        /* ---- Baú: evolução muito difícil ---- */
        const MAX_CHEST = 20;
        const CHEST_BONUS = 3.4;                       // pontos de sorte por nível do baú
        const chestBonus = (lvl) => (Math.max(1, lvl) - 1) * CHEST_BONUS;
        const RARITY_CUT = [['mythic', 128], ['legendary', 99], ['epic', 83], ['rare', 60], ['uncommon', 32]];
        function rollRarity(lvl) {
          const roll = Math.random() * 100 + chestBonus(lvl);
          for (let i = 0; i < RARITY_CUT.length; i++) if (roll > RARITY_CUT[i][1]) return RARITY_CUT[i][0];
          return 'common';
        }
        /* chance (0–100) de cada raridade para um nível de baú */
        function chestOdds(lvl) {
          const b = chestBonus(lvl), P = (c) => Math.min(1, Math.max(0, (100 + b - c) / 100));
          const out = {}; let above = 0;
          RARITY_CUT.forEach((r) => { const p = P(r[1]); out[r[0]] = (p - above) * 100; above = p; });
          out.common = (1 - above) * 100;
          return out;
        }
        /* o que custa subir do nível lvl para lvl+1 */
        const chestReq = (lvl) => ({
          gold: Math.round(1000 * Math.pow(1.7, lvl - 1)),
          ess: 8 + Math.round(lvl * lvl * 3),
          hero: 6 + lvl * 3
        });

        const PET_CATALOG = {
          wolf:    { id: 'wolf',    name: 'Lobo Etéreo',         bonusText: '+12% Crítico', color: '#38bdf8', eye: '#fef08a' },
          phoenix: { id: 'phoenix', name: 'Fênix Brasa',         bonusText: '+18% Ataque',  color: '#f97316', eye: '#fef08a' },
          turtle:  { id: 'turtle',  name: 'Tartaruga Rúnica',    bonusText: '+24% Vida',    color: '#22c55e', eye: '#ffffff' },
          dragon:  { id: 'dragon',  name: 'Dragãozinho Dourado', bonusText: '+28% Ouro',    color: '#eab308', eye: '#dc2626' },
          owl:     { id: 'owl',     name: 'Coruja Sábia',        bonusText: '+20% XP',      color: '#a78bfa', eye: '#fef9c3' }
        };

        function getPetSVG(petId, size) {
          const p = PET_CATALOG[petId] || PET_CATALOG.wolf;
          const sz = size || 38;
          const ink = '#1e293b';
          let extra = '';
          if (petId === 'phoenix') extra = '<path d="M12 36 Q2 28 6 16 Q12 26 18 30Z" fill="#fde047" stroke="' + ink + '" stroke-width="2"/><path d="M48 36 Q58 28 54 16 Q48 26 42 30Z" fill="#fde047" stroke="' + ink + '" stroke-width="2"/>';
          if (petId === 'turtle') extra = '<path d="M14 36 Q30 14 46 36Z" fill="#15803d" stroke="' + ink + '" stroke-width="2.2"/><path d="M30 20 L30 36 M22 26 L22 36 M38 26 L38 36" stroke="' + ink + '" stroke-width="1.6" fill="none"/>';
          if (petId === 'dragon') extra = '<polygon points="22,16 20,5 27,13" fill="#fef3c7" stroke="' + ink + '" stroke-width="2"/><polygon points="38,16 40,5 33,13" fill="#fef3c7" stroke="' + ink + '" stroke-width="2"/><path d="M46 38 Q58 34 56 46 Q50 42 46 44Z" fill="' + p.color + '" stroke="' + ink + '" stroke-width="2"/>';
          if (petId === 'owl') extra = '<circle cx="24" cy="30" r="7" fill="#fff" stroke="' + ink + '" stroke-width="1.8"/><circle cx="36" cy="30" r="7" fill="#fff" stroke="' + ink + '" stroke-width="1.8"/><polygon points="30,34 27,40 33,40" fill="#f59e0b" stroke="' + ink + '" stroke-width="1.6"/>';
          const ears = (petId === 'wolf' || petId === 'phoenix' || petId === 'owl')
            ? '<polygon points="16,20 12,8 24,16" fill="' + p.color + '" stroke="' + ink + '" stroke-width="2.2"/><polygon points="44,20 48,8 36,16" fill="' + p.color + '" stroke="' + ink + '" stroke-width="2.2"/>' : '';
          const face = (petId === 'owl')
            ? '<circle cx="24" cy="30" r="2.6" fill="#1f2937"/><circle cx="36" cy="30" r="2.6" fill="#1f2937"/>'
            : '<circle cx="24" cy="30" r="2.8" fill="' + p.eye + '"/><circle cx="36" cy="30" r="2.8" fill="' + p.eye + '"/><path d="M26 38 Q30 42 34 38" fill="none" stroke="' + ink + '" stroke-width="2.2" stroke-linecap="round"/>';
          return '<svg viewBox="0 0 60 60" width="' + sz + '" height="' + sz + '" class="anim-pet">' +
            (petId === 'phoenix' || petId === 'dragon' ? extra : '') +
            '<circle cx="30" cy="32" r="18" fill="' + p.color + '" stroke="' + ink + '" stroke-width="2.5"/>' +
            ears +
            (petId === 'turtle' || petId === 'owl' ? extra : '') +
            face +
          '</svg>';
        }

        function getGearSVG(type, rarity, variant) {
          const accent = RARITIES[rarity] ? RARITIES[rarity].border : '#9ca3af';
          const S = (inner) => '<svg viewBox="0 0 48 48" width="38" height="38">' + inner + '</svg>';
          const K = '#1e293b';
          const icons = {
            weapon: S('<path d="M36 8 L40 12 L20 32 L16 28 Z" fill="#e2e8f0" stroke="' + K + '" stroke-width="2.2"/><path d="M13 26 L22 35 L19 38 L10 29 Z" fill="' + accent + '" stroke="' + K + '" stroke-width="2"/><rect x="9" y="34" width="6" height="6" rx="1.5" fill="#78350f" stroke="' + K + '" stroke-width="2"/>'),
            axe:    S('<g transform="rotate(38 24 24)"><rect x="22" y="6" width="4.4" height="38" rx="1.6" fill="#78350f" stroke="' + K + '" stroke-width="2"/><path d="M26 8 C40 5 45 18 40 27 C36 22 31 21 26 22 Z" fill="#e2e8f0" stroke="' + K + '" stroke-width="2.2"/><rect x="20.5" y="34" width="7.4" height="4" rx="1.2" fill="' + accent + '" stroke="' + K + '" stroke-width="1.6"/></g>'),
            spear:  S('<g transform="rotate(45 24 24)"><rect x="22" y="13" width="4.2" height="33" rx="1.6" fill="#78350f" stroke="' + K + '" stroke-width="2"/><polygon points="24,1 30,15 18,15" fill="#e2e8f0" stroke="' + K + '" stroke-width="2.2"/><rect x="19.5" y="15" width="9.2" height="3.4" rx="1.2" fill="' + accent + '" stroke="' + K + '" stroke-width="1.6"/></g>'),
            staff:  S('<g transform="rotate(40 24 24)"><rect x="22" y="14" width="4.2" height="32" rx="1.6" fill="#78350f" stroke="' + K + '" stroke-width="2"/><circle cx="24" cy="9" r="7" fill="' + accent + '" stroke="' + K + '" stroke-width="2.2"/><circle cx="21.6" cy="6.6" r="2" fill="#fff" opacity=".75"/><rect x="19.5" y="15" width="9.2" height="3" rx="1.2" fill="#eab308" stroke="' + K + '" stroke-width="1.5"/></g>'),
            armor:  S('<path d="M14 11 L20 8 L28 8 L34 11 L38 19 L32 23 L32 39 L16 39 L16 23 L10 19 Z" fill="#64748b" stroke="' + K + '" stroke-width="2.2"/><path d="M20 14 L28 14 L26 28 L22 28 Z" fill="' + accent + '"/>'),
            gloves: S('<rect x="14" y="13" width="20" height="22" rx="6" fill="#92400e" stroke="' + K + '" stroke-width="2.2"/><rect x="13" y="29" width="22" height="7" rx="2" fill="' + accent + '" stroke="' + K + '" stroke-width="2"/>'),
            ring:   S('<circle cx="24" cy="27" r="11" fill="none" stroke="#eab308" stroke-width="4.5"/><circle cx="24" cy="27" r="11" fill="none" stroke="' + K + '" stroke-width="1.5"/><polygon points="24,9 30,15 24,20 18,15" fill="' + accent + '" stroke="' + K + '" stroke-width="2"/>'),
            helmet: S('<path d="M12 28 C12 14 36 14 36 28 L38 35 L10 35 Z" fill="#2d6a4f" stroke="' + K + '" stroke-width="2.2"/><path d="M10 33 Q24 39 38 33" fill="none" stroke="' + accent + '" stroke-width="3.5" stroke-linecap="round"/>'),
            amulet: S('<path d="M14 10 Q24 22 34 10" fill="none" stroke="#eab308" stroke-width="2.5"/><polygon points="24,18 33,28 24,39 15,28" fill="' + accent + '" stroke="' + K + '" stroke-width="2.2"/><circle cx="24" cy="28" r="3.5" fill="#fef08a"/>'),
            boots:  S('<path d="M16 11 L27 11 L27 29 L36 31 L36 38 L15 38 Z" fill="#78350f" stroke="' + K + '" stroke-width="2.2"/><rect x="15" y="11" width="13" height="5" fill="' + accent + '" stroke="' + K + '" stroke-width="1.8"/>'),
            shield: S('<path d="M12 10 L36 10 L36 24 C36 33 24 40 24 40 C24 40 12 33 12 24 Z" fill="#475569" stroke="' + K + '" stroke-width="2.3"/><path d="M16 14 L32 14 L32 23 C32 30 24 35 24 35 C24 35 16 30 16 23 Z" fill="' + accent + '"/>'),
            cape:   S('<path d="M15 7 L33 7 L41 41 Q24 34 7 41 Z" fill="#9f1239" stroke="' + K + '" stroke-width="2.2"/><path d="M24 12 L24 35" stroke="rgba(0,0,0,.25)" stroke-width="2"/><rect x="14" y="5" width="20" height="7" rx="3" fill="' + accent + '" stroke="' + K + '" stroke-width="2"/><circle cx="24" cy="8.5" r="2.4" fill="#fef08a"/>'),
            belt:   S('<rect x="5" y="19" width="38" height="12" rx="3" fill="#92400e" stroke="' + K + '" stroke-width="2.2"/><rect x="17" y="15" width="14" height="20" rx="3" fill="' + accent + '" stroke="' + K + '" stroke-width="2.2"/><rect x="21" y="20" width="6" height="10" rx="1.6" fill="#fef08a" stroke="' + K + '" stroke-width="1.6"/>'),
            legs:   S('<path d="M13 8 L35 8 L38 41 L27 41 L24 23 L21 41 L10 41 Z" fill="#475569" stroke="' + K + '" stroke-width="2.2"/><rect x="13" y="8" width="22" height="7" fill="' + accent + '" stroke="' + K + '" stroke-width="1.8"/>'),
            relic:  S('<rect x="10" y="7" width="28" height="34" rx="3.5" fill="#5b21b6" stroke="' + K + '" stroke-width="2.2"/><rect x="10" y="7" width="7" height="34" rx="3" fill="#4c1d95" stroke="' + K + '" stroke-width="2"/><polygon points="28,17 34,24 28,31 22,24" fill="' + accent + '" stroke="' + K + '" stroke-width="1.8"/><circle cx="28" cy="24" r="2" fill="#fff" opacity=".8"/>')
          };
          if (type === 'weapon' && icons[variant]) return icons[variant];
          return icons[type] || icons.weapon;
        }

        /* ---------- Inimigos: 6 temas x 3 variações + chefe ---------- */
        function buildEnemySVG(theme, kind, isBoss) {
          const size = isBoss ? 78 : 58;
          const ink = '#291d18';
          const shadow = '<ellipse cx="38" cy="70" rx="' + (isBoss ? 20 : 16) + '" ry="4" fill="rgba(0,0,0,0.3)"/>';
          const crownAt = (dy) => isBoss ? '<g transform="translate(0,' + dy + ')"><polygon points="24,14 30,4 38,12 46,4 52,14" fill="#facc15" stroke="' + ink + '" stroke-width="2"/></g>' : '';
          const eyes = (c, y, r) => '<circle cx="31" cy="' + y + '" r="' + (r || 3) + '" fill="' + c + '"/><circle cx="45" cy="' + y + '" r="' + (r || 3) + '" fill="' + c + '"/>';
          let body = '', crownY = 0;

          if (theme === 'skeleton') {
            if (kind === 1) { // espectro
              crownY = 2;
              body = '<path d="M20 66 L20 32 C20 12 56 12 56 32 L56 66 L50 60 L44 68 L38 60 L32 68 L26 60 Z" fill="#c7d2fe" fill-opacity="0.88" stroke="#4338ca" stroke-width="2.4"/>' + eyes('#1e1b4b', 30, 3.6) + '<ellipse cx="38" cy="42" rx="5" ry="4" fill="#1e1b4b"/>';
            } else if (kind === 2) { // arqueiro
              body = '<rect x="28" y="38" width="20" height="22" rx="4" fill="#312e81" stroke="#1e1b4b" stroke-width="2.2"/><rect x="22" y="14" width="32" height="26" rx="9" fill="#e2e8f0" stroke="#1e293b" stroke-width="2.4"/>' + eyes('#0f172a', 27, 3) +
                '<path d="M62 18 Q76 38 62 62" fill="none" stroke="#a16207" stroke-width="3.4" stroke-linecap="round"/><line x1="62" y1="18" x2="62" y2="62" stroke="#e5e7eb" stroke-width="1.4"/>';
            } else { // guarda
              body = '<rect x="27" y="38" width="22" height="20" rx="4" fill="#312e81" stroke="#1e1b4b" stroke-width="2.2"/><rect x="22" y="14" width="32" height="26" rx="9" fill="#e2e8f0" stroke="#1e293b" stroke-width="2.4"/>' + eyes('#0f172a', 27, 3) + '<circle cx="31" cy="27" r="1.3" fill="#38bdf8"/><circle cx="45" cy="27" r="1.3" fill="#38bdf8"/>' +
                '<path d="M12 40 L24 40 L24 54 C24 60 18 63 18 63 C18 63 12 60 12 54 Z" fill="#64748b" stroke="#1e293b" stroke-width="2.2"/>';
            }
            if (isBoss) body += '<path d="M10 20 L10 66" stroke="#7c3aed" stroke-width="4" stroke-linecap="round"/><circle cx="10" cy="16" r="6" fill="#a78bfa" stroke="#312e81" stroke-width="2"/>';
          } else if (theme === 'magma') {
            if (kind === 1) { // golem
              crownY = 2;
              body = '<rect x="20" y="34" width="36" height="28" rx="6" fill="#57534e" stroke="#292524" stroke-width="2.6"/><rect x="22" y="12" width="32" height="26" rx="8" fill="#78716c" stroke="#292524" stroke-width="2.6"/>' + eyes('#fb923c', 25, 3.2) +
                '<path d="M26 40 L32 48 L28 56 M48 38 L44 48 L50 58" stroke="#f97316" stroke-width="2.6" fill="none" stroke-linecap="round"/>';
            } else if (kind === 2) { // salamandra
              crownY = 12;
              body = '<path d="M8 58 Q14 44 30 46 Q46 44 52 54 Q62 52 68 60" fill="none" stroke="#ea580c" stroke-width="12" stroke-linecap="round"/><path d="M8 58 Q14 44 30 46 Q46 44 52 54 Q62 52 68 60" fill="none" stroke="#fdba74" stroke-width="3.4" stroke-linecap="round" stroke-dasharray="2 8"/><circle cx="14" cy="50" r="9" fill="#c2410c" stroke="#431407" stroke-width="2.4"/>' + '<circle cx="11" cy="48" r="2.4" fill="#fef08a"/><circle cx="17" cy="48" r="2.4" fill="#fef08a"/>';
            } else { // diabrete
              body = '<path d="M50 56 Q64 56 62 44" fill="none" stroke="#b91c1c" stroke-width="4" stroke-linecap="round"/><rect x="27" y="38" width="22" height="22" rx="6" fill="#b91c1c" stroke="#450a0a" stroke-width="2.4"/><rect x="22" y="14" width="32" height="26" rx="10" fill="#dc2626" stroke="#450a0a" stroke-width="2.4"/>' +
                '<polygon points="26,18 22,4 33,14" fill="#fecaca" stroke="#450a0a" stroke-width="2"/><polygon points="50,18 54,4 43,14" fill="#fecaca" stroke="#450a0a" stroke-width="2"/>' + eyes('#fef08a', 27, 3) + '<path d="M32 34 Q38 38 44 34" fill="none" stroke="#450a0a" stroke-width="2"/>';
            }
          } else if (theme === 'ethereal') {
            if (kind === 1) { // cavaleiro
              body = '<path d="M24 38 L52 38 L56 64 L20 64 Z" fill="#312e81" stroke="#a78bfa" stroke-width="2.2"/><path d="M22 36 L22 18 C22 8 54 8 54 18 L54 36 Z" fill="#1e1b4b" stroke="#a78bfa" stroke-width="2.4"/><rect x="26" y="22" width="24" height="6" rx="2" fill="#0f172a"/><rect x="26" y="23.5" width="24" height="2.4" fill="#a78bfa"/>' +
                '<g transform="translate(60,52) rotate(18)"><rect x="-2.5" y="-28" width="5" height="28" rx="2" fill="#c4b5fd" stroke="#1e1b4b" stroke-width="2"/></g>';
            } else if (kind === 2) { // orbe
              crownY = -2;
              body = '<g transform="translate(0,-6)"><circle cx="38" cy="38" r="20" fill="#0ea5e9" fill-opacity="0.85" stroke="#e0f2fe" stroke-width="2.4"/><circle cx="38" cy="38" r="12" fill="#bae6fd"/><circle cx="38" cy="38" r="5.5" fill="#0c4a6e"/><ellipse cx="38" cy="38" rx="28" ry="7" fill="none" stroke="#e0f2fe" stroke-width="2.2" stroke-dasharray="4 4"/></g>';
            } else { // sentinela
              body = '<path d="M24 38 L52 38 L58 64 L18 64 Z" fill="#1e3a8a" stroke="#38bdf8" stroke-width="2.2"/><polygon points="38,6 54,26 38,42 22,26" fill="#38bdf8" stroke="#0c4a6e" stroke-width="2.4"/><polygon points="38,12 47,26 38,36 29,26" fill="#e0f2fe"/>';
            }
            if (isBoss) body = '<path d="M6 30 L24 36 L22 52 Z" fill="#0ea5e9" stroke="#0c4a6e" stroke-width="2.2"/><path d="M70 30 L52 36 L54 52 Z" fill="#0ea5e9" stroke="#0c4a6e" stroke-width="2.2"/>' + body;
          } else if (theme === 'swamp') {
            if (kind === 1) { // sapo
              crownY = 8;
              body = '<ellipse cx="38" cy="52" rx="24" ry="16" fill="#4d7c0f" stroke="#1a2e05" stroke-width="2.6"/><circle cx="26" cy="36" r="8" fill="#65a30d" stroke="#1a2e05" stroke-width="2.4"/><circle cx="50" cy="36" r="8" fill="#65a30d" stroke="#1a2e05" stroke-width="2.4"/><circle cx="26" cy="36" r="3.4" fill="#fef08a"/><circle cx="50" cy="36" r="3.4" fill="#fef08a"/><circle cx="26" cy="36" r="1.4" fill="#111"/><circle cx="50" cy="36" r="1.4" fill="#111"/><path d="M26 54 Q38 62 50 54" fill="none" stroke="#1a2e05" stroke-width="2.4"/><circle cx="30" cy="48" r="2" fill="#a3e635"/><circle cx="46" cy="50" r="2" fill="#a3e635"/>';
            } else if (kind === 2) { // cogumelo
              crownY = -2;
              body = '<rect x="30" y="38" width="16" height="26" rx="6" fill="#fde68a" stroke="#292524" stroke-width="2.4"/><path d="M12 40 C12 14 64 14 64 40 Z" fill="#7e22ce" stroke="#2e1065" stroke-width="2.6"/><circle cx="26" cy="28" r="4" fill="#e9d5ff"/><circle cx="44" cy="24" r="5" fill="#e9d5ff"/><circle cx="53" cy="34" r="3" fill="#e9d5ff"/><circle cx="34" cy="50" r="1.6" fill="#111"/><circle cx="42" cy="50" r="1.6" fill="#111"/>';
            } else { // lodo
              crownY = 12;
              body = '<path d="M10 66 C8 46 22 30 38 30 C54 30 68 46 66 66 Z" fill="#84cc16" fill-opacity="0.9" stroke="#365314" stroke-width="2.6"/><ellipse cx="28" cy="44" rx="5" ry="3" fill="#d9f99d" fill-opacity=".7"/>' + eyes('#1a2e05', 50, 3.4) + '<circle cx="32" cy="49" r="1.3" fill="#fff"/><circle cx="46" cy="49" r="1.3" fill="#fff"/><path d="M32 58 Q38 62 44 58" fill="none" stroke="#365314" stroke-width="2.2"/>';
            }
            if (isBoss) body += '<path d="M20 36 Q10 14 20 6" fill="none" stroke="#3f6212" stroke-width="7" stroke-linecap="round"/><circle cx="20" cy="6" r="6" fill="#65a30d" stroke="#1a2e05" stroke-width="2"/><path d="M56 36 Q66 14 56 6" fill="none" stroke="#3f6212" stroke-width="7" stroke-linecap="round"/><circle cx="56" cy="6" r="6" fill="#65a30d" stroke="#1a2e05" stroke-width="2"/>';
          } else if (theme === 'frost') {
            if (kind === 1) { // golem de gelo
              crownY = 2;
              body = '<polygon points="20,62 22,36 38,30 54,36 56,62" fill="#bae6fd" stroke="#0369a1" stroke-width="2.6"/><polygon points="24,34 26,12 38,8 50,12 52,34 38,38" fill="#e0f2fe" stroke="#0369a1" stroke-width="2.6"/>' + eyes('#0369a1', 22, 3) + '<path d="M30 44 L36 52 M46 42 L42 54" stroke="#7dd3fc" stroke-width="2.4" stroke-linecap="round"/>';
            } else if (kind === 2) { // espectro gélido
              crownY = 0;
              body = '<path d="M18 66 L22 30 C24 10 52 10 54 30 L58 66 L50 58 L44 66 L38 58 L32 66 L26 58 Z" fill="#e0f2fe" fill-opacity=".9" stroke="#7dd3fc" stroke-width="2.4"/><ellipse cx="38" cy="30" rx="11" ry="12" fill="#0f172a"/><circle cx="33" cy="29" r="2.4" fill="#67e8f9"/><circle cx="43" cy="29" r="2.4" fill="#67e8f9"/>';
            } else { // lobo
              crownY = 14;
              body = '<ellipse cx="34" cy="54" rx="26" ry="12" fill="#cbd5e1" stroke="#334155" stroke-width="2.6"/><rect x="18" y="58" width="6" height="10" rx="2" fill="#94a3b8" stroke="#334155" stroke-width="2"/><rect x="42" y="58" width="6" height="10" rx="2" fill="#94a3b8" stroke="#334155" stroke-width="2"/><circle cx="58" cy="42" r="12" fill="#e2e8f0" stroke="#334155" stroke-width="2.6"/><polygon points="52,34 52,22 60,32" fill="#cbd5e1" stroke="#334155" stroke-width="2"/><polygon points="64,34 68,22 70,36" fill="#cbd5e1" stroke="#334155" stroke-width="2"/><circle cx="60" cy="40" r="2.4" fill="#0ea5e9"/><circle cx="68" cy="46" r="3" fill="#334155"/><path d="M6 50 Q-2 44 4 38" fill="none" stroke="#cbd5e1" stroke-width="6" stroke-linecap="round"/>';
            }
            if (isBoss) body += '<path d="M24 66 L20 44 M52 66 L56 44" stroke="#bae6fd" stroke-width="3" stroke-linecap="round"/><polygon points="38,0 42,8 34,8" fill="#e0f2fe" stroke="#0369a1" stroke-width="1.6"/>';
          } else { // goblin
            const skin = isBoss ? '#4d7c0f' : (kind === 1 ? '#4f7d24' : kind === 2 ? '#65a30d' : '#5b8c2a');
            const cloth = isBoss ? '#7f1d1d' : (kind === 1 ? '#475569' : '#78350f');
            const weapon = kind === 1
              ? '<g transform="translate(58,50) rotate(14)"><rect x="-1.6" y="-32" width="3.2" height="40" rx="1.5" fill="#92400e" stroke="' + ink + '" stroke-width="1.8"/><polygon points="0,-40 -4,-30 4,-30" fill="#e2e8f0" stroke="' + ink + '" stroke-width="1.8"/></g>'
              : kind === 2
                ? '<g transform="translate(58,48) rotate(30)"><polygon points="0,-20 -3,0 3,0" fill="#e2e8f0" stroke="' + ink + '" stroke-width="1.8"/><rect x="-4" y="0" width="8" height="3" fill="#78350f"/></g>'
                : '<g transform="translate(56, 44) rotate(24)"><rect x="-3" y="-20" width="7" height="22" rx="3.5" fill="#92400e" stroke="' + ink + '" stroke-width="2.2"/></g>';
            body = '<rect x="29" y="56" width="6" height="11" rx="2" fill="' + skin + '" stroke="' + ink + '" stroke-width="2.2"/><rect x="41" y="56" width="6" height="11" rx="2" fill="' + skin + '" stroke="' + ink + '" stroke-width="2.2"/>' +
              '<rect x="26" y="38" width="24" height="20" rx="4" fill="' + cloth + '" stroke="' + ink + '" stroke-width="2.3"/>' +
              '<polygon points="22,25 ' + (kind === 2 ? 6 : 10) + ',21 21,32" fill="' + skin + '" stroke="' + ink + '" stroke-width="2.2"/><polygon points="54,25 ' + (kind === 2 ? 70 : 66) + ',21 55,32" fill="' + skin + '" stroke="' + ink + '" stroke-width="2.2"/>' +
              '<rect x="21" y="14" width="34" height="26" rx="9" fill="' + skin + '" stroke="' + ink + '" stroke-width="2.4"/>' +
              (kind === 1 && !isBoss ? '<path d="M21 22 C21 8 55 8 55 22 Z" fill="#94a3b8" stroke="' + ink + '" stroke-width="2.2"/>' : '') +
              (kind === 2 && !isBoss ? '<rect x="21" y="16" width="34" height="5" fill="#dc2626" stroke="' + ink + '" stroke-width="1.6"/>' : '') +
              '<circle cx="31" cy="27" r="2.6" fill="#fef08a"/><circle cx="31" cy="27" r="1.2" fill="#1c1917"/><circle cx="45" cy="27" r="2.6" fill="#fef08a"/><circle cx="45" cy="27" r="1.2" fill="#1c1917"/>' +
              '<path d="M32 35 L35 32 L38 35 L41 32 L44 35" fill="none" stroke="' + ink + '" stroke-width="1.6"/>' + weapon;
          }
          return '<svg viewBox="0 0 76 76" width="' + size + '" height="' + size + '" class="anim-idle" style="overflow:visible;">' + shadow + body + crownAt(crownY) + '</svg>';
        }

        /* ---------- Cenários em camadas (tile de 230px que se repete sem emenda) ---------- */
        const SC = {
          pine(x, h, c1, c2, cap) {
            const top = 112 - h;
            return '<rect x="' + (x - 4) + '" y="' + (112 - h * 0.22) + '" width="8" height="' + (h * 0.22) + '" fill="#4a3320"/>' +
              '<polygon points="' + x + ',' + top + ' ' + (x - 19) + ',' + (112 - h * 0.28) + ' ' + (x + 19) + ',' + (112 - h * 0.28) + '" fill="' + c1 + '"/>' +
              '<polygon points="' + x + ',' + (top + h * 0.22) + ' ' + (x - 25) + ',' + (112 - h * 0.04) + ' ' + (x + 25) + ',' + (112 - h * 0.04) + '" fill="' + c2 + '"/>' +
              (cap ? '<polygon points="' + x + ',' + top + ' ' + (x - 8) + ',' + (top + h * 0.2) + ' ' + (x + 8) + ',' + (top + h * 0.2) + '" fill="#f8fafc"/>' : '');
          },
          dead(x, h, c) {
            const t = 112 - h;
            return '<path d="M' + x + ',112 L' + x + ',' + t + '" stroke="' + c + '" stroke-width="7" stroke-linecap="round"/>' +
              '<path d="M' + x + ',' + (t + h * 0.35) + ' L' + (x - 22) + ',' + (t + h * 0.12) + ' M' + x + ',' + (t + h * 0.5) + ' L' + (x + 24) + ',' + (t + h * 0.25) + ' M' + (x - 22) + ',' + (t + h * 0.12) + ' L' + (x - 28) + ',' + (t - 2) + '" stroke="' + c + '" stroke-width="4" fill="none" stroke-linecap="round"/>';
          },
          tomb(x, c) {
            return '<path d="M' + (x - 11) + ',112 L' + (x - 11) + ',92 Q' + x + ',78 ' + (x + 11) + ',92 L' + (x + 11) + ',112 Z" fill="' + c + '"/><path d="M' + x + ',88 L' + x + ',100 M' + (x - 5) + ',93 L' + (x + 5) + ',93" stroke="rgba(0,0,0,.35)" stroke-width="2.4"/>';
          },
          spire(x, h, w, c, glow) {
            return '<polygon points="' + (x - w / 2) + ',112 ' + x + ',' + (112 - h) + ' ' + (x + w / 2) + ',112" fill="' + c + '"/>' +
              (glow ? '<polyline points="' + (x - w * 0.18) + ',112 ' + x + ',' + (112 - h * 0.7) + ' ' + (x + w * 0.2) + ',112" fill="none" stroke="' + glow + '" stroke-width="2.4" opacity=".75"/>' : '');
          },
          volcano(x, w, h) {
            return '<polygon points="' + (x - w / 2) + ',112 ' + (x - w * 0.12) + ',' + (112 - h) + ' ' + (x + w * 0.12) + ',' + (112 - h) + ' ' + (x + w / 2) + ',112" fill="#3f1d0d"/>' +
              '<ellipse cx="' + x + '" cy="' + (112 - h) + '" rx="' + (w * 0.12) + '" ry="3.5" fill="#fb923c"/>' +
              '<path d="M' + x + ',' + (112 - h) + ' L' + (x - 3) + ',' + (112 - h * 0.45) + ' L' + (x + 4) + ',112" fill="none" stroke="#f97316" stroke-width="2.6" opacity=".85"/>' +
              '<circle cx="' + (x + 4) + '" cy="' + (112 - h - 12) + '" r="7" fill="rgba(60,40,40,.45)"/><circle cx="' + (x - 3) + '" cy="' + (112 - h - 22) + '" r="9" fill="rgba(60,40,40,.3)"/>';
          },
          crystal(x, h, c1, c2) {
            return '<polygon points="' + x + ',' + (112 - h) + ' ' + (x - 11) + ',' + (112 - h * 0.55) + ' ' + (x - 8) + ',112 ' + (x + 8) + ',112 ' + (x + 11) + ',' + (112 - h * 0.55) + '" fill="' + c1 + '"/>' +
              '<polygon points="' + x + ',' + (112 - h) + ' ' + (x + 11) + ',' + (112 - h * 0.55) + ' ' + (x + 8) + ',112 ' + x + ',112" fill="' + c2 + '"/>';
          },
          island(x, y, w, c) {
            return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + w + '" ry="6" fill="' + c + '"/><polygon points="' + (x - w * 0.9) + ',' + (y + 2) + ' ' + x + ',' + (y + w * 0.7) + ' ' + (x + w * 0.9) + ',' + (y + 2) + '" fill="#475569"/>' +
              '<polygon points="' + x + ',' + (y - 20) + ' ' + (x - 7) + ',' + (y - 2) + ' ' + (x + 7) + ',' + (y - 2) + '" fill="#7dd3fc"/>';
          },
          willow(x, h, c1, c2) {
            const t = 112 - h;
            let s = '<rect x="' + (x - 5) + '" y="' + (t + 10) + '" width="10" height="' + (h - 10) + '" fill="#3b2f1c"/><ellipse cx="' + x + '" cy="' + (t + 8) + '" rx="30" ry="16" fill="' + c1 + '"/>';
            for (let i = -24; i <= 24; i += 8) s += '<path d="M' + (x + i) + ',' + (t + 10) + ' q2,16 -1,' + (22 + (i % 5 + 5)) + '" stroke="' + c2 + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>';
            return s;
          },
          shroom(x, h, cap, dot) {
            return '<rect x="' + (x - 4) + '" y="' + (112 - h * 0.55) + '" width="8" height="' + (h * 0.55) + '" fill="#e7e5e4"/><ellipse cx="' + x + '" cy="' + (112 - h * 0.55) + '" rx="' + (h * 0.45) + '" ry="' + (h * 0.3) + '" fill="' + cap + '"/><circle cx="' + (x - h * 0.15) + '" cy="' + (112 - h * 0.6) + '" r="2.6" fill="' + dot + '"/><circle cx="' + (x + h * 0.14) + '" cy="' + (112 - h * 0.66) + '" r="2" fill="' + dot + '"/>';
          },
          ice(x, h, c) {
            return '<polygon points="' + (x - 9) + ',112 ' + (x - 2) + ',' + (112 - h) + ' ' + (x + 11) + ',112" fill="' + c + '"/><polygon points="' + (x + 6) + ',112 ' + (x + 14) + ',' + (112 - h * 0.6) + ' ' + (x + 22) + ',112" fill="' + c + '" opacity=".8"/>';
          },
          hills(c) {
            return '<path d="M0,112 L0,84 Q30,56 70,80 Q110,50 150,78 Q190,56 230,84 L230,112 Z" fill="' + c + '"/>';
          }
        };

        function sceneTile(theme) {
          switch (theme) {
            case 'skeleton':
              return SC.dead(36, 74, '#241f3d') + SC.tomb(88, '#3b3760') + SC.dead(150, 90, '#241f3d') + SC.tomb(204, '#3b3760') + SC.tomb(122, '#312d52');
            case 'magma':
              return SC.spire(32, 78, 38, '#2a120a', '#f97316') + SC.volcano(120, 92, 82) + SC.spire(200, 58, 34, '#2a120a', '#f97316');
            case 'ethereal':
              return SC.crystal(30, 70, '#38bdf8', '#0ea5e9') + SC.island(112, 46, 28, '#86efac') + SC.crystal(190, 88, '#7dd3fc', '#0284c7') + SC.crystal(214, 46, '#bae6fd', '#38bdf8');
            case 'swamp':
              return SC.willow(40, 84, '#365314', '#4d7c0f') + SC.shroom(100, 28, '#7e22ce', '#e9d5ff') + SC.willow(160, 96, '#3f6212', '#65a30d') + SC.shroom(210, 22, '#be123c', '#fecdd3');
            case 'frost':
              return SC.pine(34, 88, '#9fb8cc', '#6f8da6', true) + SC.ice(94, 52, '#cfe8f7') + SC.pine(156, 100, '#9fb8cc', '#6f8da6', true) + SC.ice(204, 40, '#cfe8f7');
            default:
              return SC.pine(30, 92, '#4e7a5d', '#467155') + SC.pine(108, 106, '#3f6b4e', '#376148') + SC.pine(190, 86, '#4e7a5d', '#467155');
          }
        }
        function sceneRepeat(inner, w, copies) {
          let s = '';
          for (let k = 0; k < copies; k++) s += '<g transform="translate(' + (k * w) + ',0)">' + inner + '</g>';
          return s;
        }
        function skyDecoFor(theme) {
          if (theme === 'skeleton') return '<circle cx="360" cy="40" r="26" fill="#fef9c3"/><circle cx="350" cy="34" r="22" fill="#e9e6b0" opacity=".5"/>';
          if (theme === 'magma') return '<circle cx="90" cy="46" r="34" fill="#fb923c" opacity=".35"/><circle cx="90" cy="46" r="20" fill="#fdba74" opacity=".55"/>';
          if (theme === 'ethereal') return '<ellipse cx="90" cy="46" rx="42" ry="9" fill="#fff" opacity=".7"/><ellipse cx="350" cy="36" rx="34" ry="8" fill="#fff" opacity=".6"/>';
          if (theme === 'frost') return '<circle cx="360" cy="38" r="20" fill="#fff" opacity=".85"/><ellipse cx="100" cy="42" rx="40" ry="8" fill="#fff" opacity=".6"/>';
          if (theme === 'swamp') return '<ellipse cx="120" cy="34" rx="50" ry="9" fill="#d9f99d" opacity=".25"/><ellipse cx="340" cy="48" rx="46" ry="8" fill="#d9f99d" opacity=".2"/>';
          return '<circle cx="372" cy="36" r="22" fill="#fef9c3" opacity=".9"/><ellipse cx="110" cy="40" rx="40" ry="8" fill="#fff" opacity=".45"/>';
        }

        /* =====================================================================
           4. ESTADO DO JOGO, VALIDAÇÃO E MIGRAÇÃO DO SAVE
           ===================================================================== */
        const STORAGE_KEY = 'guardioes_do_bau_v4';   // mesma chave: saves antigos continuam funcionando
        const SAVE_VERSION = 5;
        const ARENA_MAX_TICKETS = 5;
        const ARENA_TICKET_MS = 4 * 60 * 1000;
        const MAX_ENHANCE = 15;

        function createFreshState() {
          return {
            version: SAVE_VERSION,
            gold: 350, gems: 20, keys: 6, essences: 10, petFood: 5, trophies: 1000,
            chestLevel: 1, heroLevel: 1, heroXp: 0, talentPoints: 1,
            stars: 0, totalStars: 0, runBest: 0, rebirthHint: false, skin: '', deliveredIds: [],
            starUp: { power: 0, wealth: 0, wisdom: 0, legacy: 0 },
            talents: { fury: 0, bastion: 0, fortune: 0, vampire: 0, arcane: 0 },
            world: 1, maxWorldUnlocked: 1, stage: 1,
            bestStage: { 1: 1 },
            bossCleared: {},
            autoAdvance: true,
            autoSkills: false,
            speed: 1,
            trainAtk: 1, trainHp: 1,
            dailyDate: '', dailyStreak: 0,
            sfxEnabled: true, vibEnabled: true,
            activePet: 'wolf',
            pets: {
              wolf: { unlocked: true, level: 1 }, phoenix: { unlocked: false, level: 1 },
              turtle: { unlocked: false, level: 1 }, dragon: { unlocked: false, level: 1 },
              owl: { unlocked: false, level: 1 }
            },
            slotEnhance: { weapon: 0, armor: 0, gloves: 0, ring: 0, helmet: 0, amulet: 0, boots: 0, shield: 0, cape: 0, belt: 0, legs: 0, relic: 0 },
            stats: { battlesWon: 0, chestsOpened: 0, arenaWins: 0, goblinsDefeated: 0, upgradesDone: 0, bestIdx: 0, rareFound: 0, expeditions: 0, deaths: 0, rebirths: 0, bestChest: 1 },
            questTier: {},
            claimedQuests: [],
            daily: { date: '', base: {}, claimed: {}, bonus: false },
            expeditions: {},
            arenaTickets: ARENA_MAX_TICKETS,
            arenaTicketAt: Date.now(),
            leagueRewarded: 0,
            lastSeen: Date.now(),
            equipment: {
              weapon: { type: 'weapon', name: 'Espada Enferrujada', level: 1, rarity: 'common', atk: 12, hp: 10 },
              armor:  { type: 'armor',  name: 'Túnica de Trilha',   level: 1, rarity: 'common', atk: 3,  hp: 36 },
              gloves: { type: 'gloves', name: 'Luvas de Couro',     level: 1, rarity: 'common', atk: 5,  hp: 10 },
              ring:   { type: 'ring',   name: 'Anel de Cobre',      level: 1, rarity: 'common', atk: 6,  hp: 12 },
              helmet: { type: 'helmet', name: 'Capuz Simples',      level: 1, rarity: 'common', atk: 2,  hp: 22 },
              amulet: { type: 'amulet', name: 'Amuleto de Pinho',   level: 1, rarity: 'common', atk: 6,  hp: 16 },
              boots:  { type: 'boots',  name: 'Botas Gastas',       level: 1, rarity: 'common', atk: 3,  hp: 16 },
              shield: { type: 'shield', name: 'Broquel de Madeira', level: 1, rarity: 'common', atk: 3,  hp: 32 },
              cape:   { type: 'cape',   name: 'Capa Surrada',       level: 1, rarity: 'common', atk: 1,  hp: 8 },
              belt:   { type: 'belt',   name: 'Cinto de Corda',     level: 1, rarity: 'common', atk: 1,  hp: 8 },
              legs:   { type: 'legs',   name: 'Calças Remendadas',  level: 1, rarity: 'common', atk: 1,  hp: 10 },
              relic:  { type: 'relic',  name: 'Relíquia Opaca',     level: 1, rarity: 'common', atk: 2,  hp: 4 }
            }
          };
        }

        /* Aceita save v4 (antigo) ou v5 e devolve um estado sempre válido */
        function migrateState(p) {
          const fresh = createFreshState();
          if (!p || typeof p !== 'object') return fresh;
          const s = Object.assign({}, fresh, p);
          const intKeys = ['gold', 'gems', 'keys', 'essences', 'petFood', 'trophies', 'chestLevel', 'heroLevel', 'heroXp', 'talentPoints',
            'world', 'maxWorldUnlocked', 'stage', 'trainAtk', 'trainHp', 'dailyStreak', 'arenaTickets', 'leagueRewarded', 'stars', 'totalStars'];
          intKeys.forEach((k) => { s[k] = Math.max(0, Math.floor(num(p[k], fresh[k]))); });
          s.chestLevel = clamp(s.chestLevel, 1, MAX_CHEST); s.heroLevel = Math.max(1, s.heroLevel);
          s.trainAtk = Math.max(1, s.trainAtk); s.trainHp = Math.max(1, s.trainHp);
          s.world = clamp(s.world || 1, 1, 99); s.stage = clamp(s.stage || 1, 1, 10);
          s.maxWorldUnlocked = Math.max(s.world, s.maxWorldUnlocked || 1);
          s.arenaTickets = Math.min(ARENA_MAX_TICKETS + 10, s.arenaTickets);
          s.arenaTicketAt = num(p.arenaTicketAt, Date.now());
          s.lastSeen = num(p.lastSeen, Date.now());
          s.speed = [1, 2, 3].includes(p.speed) ? p.speed : 1;
          s.autoAdvance = p.autoAdvance !== false;
          s.autoSkills = p.autoSkills === true;
          s.sfxEnabled = p.sfxEnabled !== false;
          s.vibEnabled = p.vibEnabled !== false;
          s.dailyDate = typeof p.dailyDate === 'string' ? p.dailyDate : '';
          s.talents = Object.assign({}, fresh.talents, p.talents || {});
          Object.keys(fresh.talents).forEach((k) => { s.talents[k] = clamp(Math.floor(num(s.talents[k], 0)), 0, 10); });
          s.pets = Object.assign({}, fresh.pets, p.pets || {});
          Object.keys(fresh.pets).forEach((k) => {
            const pp = s.pets[k] || {};
            s.pets[k] = { unlocked: pp.unlocked === true || k === 'wolf' && pp.unlocked !== false, level: Math.max(1, Math.floor(num(pp.level, 1))) };
          });
          if (!PET_CATALOG[s.activePet] || !s.pets[s.activePet].unlocked) s.activePet = 'wolf';
          s.slotEnhance = Object.assign({}, fresh.slotEnhance, p.slotEnhance || {});
          Object.keys(fresh.slotEnhance).forEach((k) => { s.slotEnhance[k] = clamp(Math.floor(num(s.slotEnhance[k], 0)), 0, MAX_ENHANCE); });
          s.stats = Object.assign({}, fresh.stats, p.stats || {});
          Object.keys(fresh.stats).forEach((k) => { s.stats[k] = Math.max(0, Math.floor(num(s.stats[k], 0))); });
          s.equipment = {};
          Object.keys(GEAR_LABELS).forEach((k) => {
            const it = (p.equipment || {})[k];
            if (it && typeof it === 'object' && RARITIES[it.rarity]) {
              s.equipment[k] = {
                type: k, name: String(it.name || fresh.equipment[k].name).slice(0, 40),
                level: Math.max(1, Math.floor(num(it.level, 1))), rarity: it.rarity,
                atk: Math.max(0, Math.floor(num(it.atk, 1))), hp: Math.max(0, Math.floor(num(it.hp, 1))),
                v: variantOf(k, it.v) ? it.v : '',
                tr: (TRAITS[it.tr] && num(it.tv, 0) > 0) ? it.tr : '',
                tv: (TRAITS[it.tr] && num(it.tv, 0) > 0) ? clamp(Math.floor(num(it.tv, 0)), 1, 60) : 0
              };
            } else {
              s.equipment[k] = fresh.equipment[k];
            }
          });
          s.stats.bestChest = Math.max(1, s.stats.bestChest, s.chestLevel);
          s.starUp = Object.assign({}, fresh.starUp, p.starUp || {});
          Object.keys(fresh.starUp).forEach((k) => { s.starUp[k] = clamp(Math.floor(num(s.starUp[k], 0)), 0, 99); });
          s.runBest = Math.max(0, Math.floor(num(p.runBest, s.stats.bestIdx)));
          s.rebirthHint = p.rebirthHint === true;
          s.skin = typeof p.skin === 'string' ? p.skin.slice(0, 20) : '';
          s.deliveredIds = Array.isArray(p.deliveredIds) ? p.deliveredIds.filter((x) => typeof x === 'string').slice(-60) : [];
          s.claimedQuests = Array.isArray(p.claimedQuests) ? p.claimedQuests.filter((x) => typeof x === 'string') : [];
          s.questTier = Object.assign({}, p.questTier || {});
          s.bestStage = Object.assign({}, p.bestStage || {});
          s.bossCleared = Object.assign({}, p.bossCleared || {});
          s.expeditions = (p.expeditions && typeof p.expeditions === 'object') ? p.expeditions : {};
          s.daily = Object.assign({}, fresh.daily, p.daily || {});
          s.daily.base = s.daily.base || {}; s.daily.claimed = s.daily.claimed || {};

          if (!p.version || p.version < 5) {
            // Migração v4 → v5
            s.claimedQuests.forEach((id) => { s.questTier[id] = Math.max(s.questTier[id] || 0, 1); });
            for (let w = 1; w < s.world; w++) { s.bestStage[w] = 10; s.bossCleared[w] = true; }
            s.bestStage[s.world] = Math.max(s.bestStage[s.world] || 1, s.stage);
            for (let w = 1; w < s.maxWorldUnlocked; w++) s.bossCleared[w] = true;
            s.stats.bestIdx = Math.max(s.stats.bestIdx, (s.world - 1) * 10 + s.stage - 1);
            s.dailyDate = '';
            s.arenaTickets = ARENA_MAX_TICKETS;
            s.arenaTicketAt = Date.now();
            s.leagueRewarded = leagueIndex(s.trophies);
          }
          if (!s.bestStage[s.world]) s.bestStage[s.world] = s.stage;
          s.version = SAVE_VERSION;
          return s;
        }

        function leagueIndex(pts) {
          return pts >= 2000 ? 4 : pts >= 1650 ? 3 : pts >= 1350 ? 2 : pts >= 1150 ? 1 : 0;
        }

        function loadValidatedState() {
          try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return createFreshState();
            return migrateState(JSON.parse(raw));
          } catch (e) {
            return createFreshState();
          }
        }

        let state = loadValidatedState();
        SFX.enabled = state.sfxEnabled;
        SFX.vibrate = state.vibEnabled;

        function saveGame() {
          try {
            state.lastSeen = Date.now();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          } catch (e) {}
        }

        /* =====================================================================
           5. FÓRMULAS: PROGRESSÃO, ATRIBUTOS DO HERÓI, ECONOMIA
           ===================================================================== */
        const curIdx = () => (state.world - 1) * 10 + (state.stage - 1);
        const BAL = { hp: 1.19, atk: 1.165, gold: 1.12, train: 1.15 };
        const stageGold = (idx) => Math.round(18 * Math.pow(BAL.gold, idx) + idx * 2);
        const xpPerKill = (idx) => Math.round(6 + idx * 1.8);
        const xpReq = (lvl) => Math.round(30 * Math.pow(lvl, 1.35));
        const trainCost = (lvl) => Math.round(100 * Math.pow(BAL.train, lvl - 1));
        const chestEvolveCost = (lvl) => chestReq(lvl).gold;
        const forgeGoldCost = (enh) => Math.round((100 + enh * 120) * (1 + enh * 0.25));
        const forgeEssCost = (enh) => 3 + enh * 4;
        const enhMult = (slotKey) => 1 + (state.slotEnhance[slotKey] || 0) * 0.14;

        /* ---- Renascimento: Estrelas e melhorias permanentes ---- */
        const STAR_UPS = {
          power:  { icon: '⚔️', name: 'Poder Ancestral',    max: 40, desc: '×1,08 de ataque e de vida por nível',   cost: (l) => 2 + Math.floor(l * 1.5) },
          wealth: { icon: '🪙', name: 'Riqueza Eterna',     max: 30, desc: '+10% de ouro por nível',                cost: (l) => 1 + Math.floor(l * 0.9) },
          wisdom: { icon: '📖', name: 'Sabedoria Antiga',   max: 20, desc: '+10% de experiência por nível',         cost: (l) => 1 + Math.floor(l * 0.9) },
          legacy: { icon: '🎁', name: 'Herança do Guardião', max: 10, desc: 'Cada jornada começa com +4 🔑 e +400 🪙 por nível', cost: (l) => 2 + l }
        };
        const REBIRTH_MIN = 20;   // fases concluídas na jornada
        const rebirthGain = () => (state.runBest >= REBIRTH_MIN ? Math.floor(Math.pow(state.runBest - 14, 1.35) / 2.5) : 0);
        const starUpCost = (k) => STAR_UPS[k].cost(state.starUp[k] || 0);

        function getHeroStats() {
          const t = state.talents;
          let atk = 25 + state.heroLevel * 6;
          let hp = 150 + state.heroLevel * 36 + 58;
          let def = 6 + state.heroLevel * 2;
          let crit = 15 + Math.min(30, state.equipment.gloves.level * 2) + t.fury * 3;

          const tt = { crit: 0, aspd: 0, ls: 0, skill: 0, gold: 0, xp: 0, defp: 0 };
          Object.keys(state.equipment).forEach((k) => {
            const it = state.equipment[k];
            if (!it) return;
            const m = enhMult(k);
            atk += Math.round((it.atk || 0) * m);
            hp += Math.round((it.hp || 0) * m);
            def += Math.round((it.hp || 0) * 0.08 * m);
            if (it.tr && tt[it.tr] !== undefined) tt[it.tr] += it.tv || 0;
          });
          Object.keys(tt).forEach((k) => { tt[k] = Math.min(TRAITS[k].cap, tt[k]); });
          crit += tt.crit;
          def = Math.round(def * (1 + tt.defp / 100));

          atk = Math.round(atk * (1 + (state.trainAtk - 1) * 0.05));
          hp = Math.round(hp * (1 + (state.trainHp - 1) * 0.05) * (1 + t.bastion * 0.08));
          const starPow = Math.pow(1.08, state.starUp.power);
          atk = Math.round(atk * starPow); hp = Math.round(hp * starPow);

          const vipB = (typeof isVip === 'function' && isVip()) ? 0.25 : 0;
          let goldMult = 1 + t.fortune * 0.12 + state.starUp.wealth * 0.10 + vipB + tt.gold / 100;
          let xpMult = 1 + state.starUp.wisdom * 0.10 + vipB + tt.xp / 100;
          const pet = state.activePet && state.pets[state.activePet];
          if (pet) {
            const scale = 1 + ((pet.level || 1) - 1) * 0.15;
            if (state.activePet === 'wolf') crit += Math.round(12 * scale);
            if (state.activePet === 'phoenix') atk = Math.round(atk * (1 + 0.18 * scale));
            if (state.activePet === 'turtle') hp = Math.round(hp * (1 + 0.24 * scale));
            if (state.activePet === 'dragon') goldMult += 0.28 * scale;
            if (state.activePet === 'owl') xpMult += 0.20 * scale;
          }
          crit = Math.min(75, crit);

          return {
            atk, hp, def, crit,
            critMult: 1.85,
            atkSpeedMult: 1 + t.fury * 0.05 + tt.aspd / 100,
            goldMult, xpMult,
            lifesteal: t.vampire * 0.02 + tt.ls / 100,
            skillMult: 1 + t.arcane * 0.06 + tt.skill / 100,
            cdr: Math.min(0.4, t.arcane * 0.04),
            extraKeyChance: 0.16 + t.fortune * 0.03,
            regenPct: 0.28 + t.bastion * 0.04,
            power: Math.round(atk * 5.2 + hp * 0.85 + def * 3),
            traits: tt
          };
        }

        /* Poder de um item, considerando a forja do slot onde ele ficaria */
        function itemPower(it, slotKey) {
          if (!it) return 0;
          const m = enhMult(slotKey || it.type);
          const base = Math.round(it.atk * m) * 5.2 + Math.round(it.hp * m) * 0.85;
          const bonus = (it.tr && TRAITS[it.tr]) ? 1 + (it.tv || 0) * TRAITS[it.tr].w * 0.015 : 1;
          return Math.round(base * bonus);
        }
