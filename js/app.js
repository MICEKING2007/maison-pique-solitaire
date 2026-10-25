import {
  applyMove,
  canPlaceOnFoundation,
  canPlaceOnTableau,
  cardLabel,
  cloneState,
  DIFFICULTIES,
  draw,
  foundationIndexForCard,
  getAutoFinishPlan,
  getHints,
  getMovableRun,
  getSourceCards,
  hiddenCardCount,
  isWon,
  newGame,
  normalizeDifficulty,
  parseCard,
  RANK_LABELS,
  serializeState,
  shortCardLabel,
  SUIT_META,
  topCard,
  validateState,
  FOUNDATION_SUITS,
} from './engine.js?v=1.5.0';

const SAVE_KEY = 'maison-pique.game.v1';
const STATS_KEY = 'maison-pique.stats.v1';
const SETTINGS_KEY = 'maison-pique.settings.v1';
const HISTORY_LIMIT = 100;
const DEFAULT_STATUS = '点按纸牌选中，再点目标位置 · 也可以直接拖动';
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

const SUIT_WORD = { S: 'spade', H: 'heart', C: 'club', D: 'diamond' };
const FOUNDATION_NAMES = { S: '黑桃', H: '红桃', C: '梅花', D: '方块' };
const PIPS = {
  2: [
    [50, 19],
    [50, 81],
  ],
  3: [
    [50, 19],
    [50, 50],
    [50, 81],
  ],
  4: [
    [32, 19],
    [68, 19],
    [32, 81],
    [68, 81],
  ],
  5: [
    [32, 19],
    [68, 19],
    [50, 50],
    [32, 81],
    [68, 81],
  ],
  6: [
    [32, 19],
    [68, 19],
    [32, 50],
    [68, 50],
    [32, 81],
    [68, 81],
  ],
  7: [
    [32, 18],
    [68, 18],
    [32, 47],
    [68, 47],
    [32, 76],
    [68, 76],
    [50, 33],
  ],
  8: [
    [32, 18],
    [68, 18],
    [32, 47],
    [68, 47],
    [32, 76],
    [68, 76],
    [50, 33],
    [50, 62],
  ],
  9: [
    [32, 18],
    [68, 18],
    [32, 39],
    [68, 39],
    [50, 50],
    [32, 61],
    [68, 61],
    [32, 82],
    [68, 82],
  ],
  10: [
    [32, 18],
    [68, 18],
    [32, 39],
    [68, 39],
    [50, 29],
    [32, 61],
    [68, 61],
    [32, 82],
    [68, 82],
    [50, 71],
  ],
};

const CROWNS = {
  11: '<path d="M18 28C21 14 31 5 49 3c-4 11-13 19-25 24"/><path d="M9 31h45"/><path d="M25 29c7-5 13-10 18-16"/><circle cx="50" cy="5" r="2"/>',
  12: '<path d="M8 28 14 10l9 8L32 3l9 15 9-8 6 18Z"/><path d="M13 32h38"/><circle cx="14" cy="7.5" r="2.2"/><circle cx="32" cy="1.8" r="2.2"/><circle cx="50" cy="7.5" r="2.2"/>',
  13: '<path d="M7 27 4 8l14 9L32 3l14 14 14-9-3 19Z"/><path d="M9 31h46"/><circle cx="4" cy="5.5" r="2.3"/><circle cx="32" cy="1.6" r="2.3"/><circle cx="60" cy="5.5" r="2.3"/>',
};

const COURT_NAMES = { 11: 'VALET', 12: 'DAME', 13: 'ROI' };

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const els = {
  app: $('#app'),
  board: $('#board'),
  stock: $('#stock'),
  waste: $('#waste'),
  tableau: $('#tableau'),
  foundations: $$('.foundation'),
  statTime: $('#stat-time'),
  statMoves: $('#stat-moves'),
  statScore: $('#stat-score'),
  undo: $('#undo-btn'),
  hint: $('#hint-btn'),
  menu: $('#menu-btn'),
  newGame: $('#new-game-btn'),
  autoFinish: $('#auto-finish'),
  status: $('#status-text'),
  drawChip: $('#draw-mode-chip'),
  difficultyHint: $('#difficulty-hint'),
  saveIndicator: $('#save-indicator'),
  toast: $('#toast'),
  dragLayer: $('#drag-layer'),
  newDialog: $('#new-dialog'),
  newForm: $('#new-form'),
  menuDialog: $('#menu-dialog'),
  rulesDialog: $('#rules-dialog'),
  rulesButton: $('#rules-btn'),
  soundToggle: $('#sound-toggle'),
  installButton: $('#install-btn'),
  bestWins: $('#best-wins'),
  bestTime: $('#best-time'),
  bestScore: $('#best-score'),
  gameSeed: $('#game-seed'),
  resetRecord: $('#reset-record-btn'),
  winDialog: $('#win-dialog'),
  winTime: $('#win-time'),
  winMoves: $('#win-moves'),
  winScore: $('#win-score'),
  winRecord: $('#win-record'),
  winNewGame: $('#win-new-game'),
  confetti: $('#confetti'),
  brand: $('.brand'),
};

const settings = {
  sound: true,
  drawMode: 1,
  skin: 'salon',
  soundPack: 'classic',
  difficulty: 'easy',
};

const DIFFICULTY_META = {
  easy: { label: '初级', hint: '起手更顺，尽量先露出不同花色' },
  normal: { label: '中级', hint: '保留一点挑战，但不会一上来就没牌可走' },
  hard: { label: '高级', hint: '少一些顺手牌，更值得想一步' },
};

const defaultStats = () => ({
  played: 0,
  wins: 0,
  bestTime: null,
  bestScore: 0,
  bestMoves: null,
});

let stats = defaultStats();
let state = null;
let selection = null;
let history = [];
let hint = null;
let hintCursor = 0;
let autoPlan = null;
let isAutoPlaying = false;
let gameWon = false;
let elapsedMs = 0;
let hasTimerStarted = false;
let timerRunning = false;
let lastTick = 0;
let timerHandle = null;
let lastTimerSave = 0;
let metrics = { cardW: 92, cardH: 131, gap: 12 };
let drag = null;
let suppressClicksUntil = 0;
let lastTap = { key: null, time: 0 };
let installPrompt = null;
let resetArmed = false;
let resetRecordTimer = null;
let saveFlashTimer = null;
let resizeTimer = null;
let layoutDeferred = false;
let winRevealTimer = null;
let autoFinishTimer = null;
let dragZonesTimer = null;
let confettiFrame = null;
let confettiParticles = [];
let confettiStartedAt = 0;

/* --------------------------------------------------------------------------
   Small utilities
   -------------------------------------------------------------------------- */

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (total % 60).toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

function formatSeed(seed) {
  return String(seed).padStart(6, '0').slice(-6);
}

function randomSeed() {
  if (window.crypto?.getRandomValues) {
    return window.crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;
  }
  return Math.floor(Math.random() * 2 ** 31);
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, REDUCED_MOTION.matches ? 0 : ms));
}

function readJSON(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function suitSvg(suit, className = '') {
  return `<svg${className ? ` class="${className}"` : ''} aria-hidden="true" viewBox="0 0 24 24"><use href="#suit-${SUIT_WORD[suit]}"></use></svg>`;
}

function showToast(message, duration = 2100) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.add('is-visible');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.classList.remove('is-visible');
  }, duration);
}

function setStatus(message, accent = false) {
  els.status.textContent = message;
  els.status.classList.toggle('is-accent', Boolean(accent));
}

function flashSaveIndicator() {
  if (!els.saveIndicator) return;
  els.saveIndicator.classList.add('is-saving');
  window.clearTimeout(saveFlashTimer);
  saveFlashTimer = window.setTimeout(() => {
    els.saveIndicator.classList.remove('is-saving');
  }, 460);
}

/* --------------------------------------------------------------------------
   Sound and haptics
   -------------------------------------------------------------------------- */

const AUDIO_VERSION = '1.5.0';
const HAKIMI_TRACKS = [1, 2, 3, 4, 5].map(
  (index) => `audio/hakimi/phrase-0${index}.mp3?v=${AUDIO_VERSION}`,
);
const HAKIMI_ASSETS = HAKIMI_TRACKS;

const soundEngine = {
  ctx: null,
  noiseBuffer: null,
  hakimiBuffers: new Map(),
  hakimiLoading: null,
  hakimiBag: [],
  hakimiLast: '',
  hakimiVoice: null,
  ensure() {
    if (!settings.sound) return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!this.ctx) this.ctx = new AudioContextClass();
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  },
  getNoise() {
    const ctx = this.ensure();
    if (!ctx) return null;
    if (!this.noiseBuffer) {
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.18), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
      }
      this.noiseBuffer = buffer;
    }
    return this.noiseBuffer;
  },
  noise({ duration = 0.055, frequency = 1900, q = 1.4, gain = 0.014, delay = 0 } = {}) {
    const ctx = this.ensure();
    const buffer = this.getNoise();
    if (!ctx || !buffer) return;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = q;
    amp.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
    amp.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + delay + 0.004);
    amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration);
    source.connect(filter).connect(amp).connect(ctx.destination);
    source.start(ctx.currentTime + delay);
    source.stop(ctx.currentTime + delay + duration + 0.01);
  },
  tone(frequency, { duration = 0.18, type = 'sine', gain = 0.025, delay = 0, slide = 0 } = {}) {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const start = ctx.currentTime + delay;
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + slide), start + duration);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  },
  preloadHakimi() {
    if (!settings.sound) return Promise.resolve();
    if (this.hakimiLoading) return this.hakimiLoading;
    const ctx = this.ensure();
    if (!ctx) return Promise.resolve();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const missing = HAKIMI_ASSETS.filter((url) => !this.hakimiBuffers.has(url));
    if (missing.length === 0) return Promise.resolve();

    this.hakimiLoading = Promise.all(
      missing.map(async (url) => {
        const response = await fetch(url, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`Unable to load ${url}`);
        const data = await response.arrayBuffer();
        const buffer = await ctx.decodeAudioData(data);
        this.hakimiBuffers.set(url, buffer);
      }),
    )
      .catch(() => {
        // If a clip cannot load, the existing synth sounds remain a fallback.
      })
      .finally(() => {
        this.hakimiLoading = null;
      });
    return this.hakimiLoading;
  },
  nextHakimiUrl() {
    let bag = this.hakimiBag;
    if (!Array.isArray(bag) || bag.length === 0) {
      bag = [...HAKIMI_TRACKS];
      for (let i = bag.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (bag.length > 1 && bag[bag.length - 1] === this.hakimiLast) {
        [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      }
      this.hakimiBag = bag;
    }
    const url = bag.pop();
    this.hakimiLast = url;
    return url;
  },
  stopHakimiVoice(ctx) {
    if (!this.hakimiVoice) return;
    const previous = this.hakimiVoice;
    this.hakimiVoice = null;
    try {
      previous.gain.gain.cancelScheduledValues(ctx.currentTime);
      previous.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.018);
      previous.source.stop(ctx.currentTime + 0.07);
    } catch {
      // The source may already have ended.
    }
  },
  playHakimi(kind = 'click') {
    if (!settings.sound || settings.soundPack !== 'hakimi') return false;
    // Let a full phrase finish when the player is just selecting cards.
    // A real placement can take over with a new phrase.
    if (this.hakimiVoice && kind === 'click') return true;
    const url = this.nextHakimiUrl();
    const buffer = this.hakimiBuffers.get(url);
    if (!buffer) {
      this.preloadHakimi();
      return false;
    }
    const ctx = this.ensure();
    if (!ctx) return false;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    this.stopHakimiVoice(ctx);
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = 1;
    gain.gain.value = kind === 'click' ? 0.42 : 0.46;
    source.connect(gain).connect(ctx.destination);
    const voice = { source, gain };
    this.hakimiVoice = voice;
    source.onended = () => {
      if (this.hakimiVoice === voice) this.hakimiVoice = null;
    };
    source.start();
    return true;
  },
  play(name) {
    if (!settings.sound) return;
    try {
      if (settings.soundPack === 'hakimi') {
        if ((name === 'select' || name === 'pick') && this.playHakimi('click')) return;
      }
      if (name === 'hakimi-drop') {
        if (settings.soundPack === 'hakimi' && this.playHakimi('drop')) return;
        name = 'place';
      }
      this.ensure();
      switch (name) {
        case 'select':
          this.tone(880, { duration: 0.035, type: 'triangle', gain: 0.012 });
          break;
        case 'pick':
          this.noise({ duration: 0.04, frequency: 2700, gain: 0.009 });
          break;
        case 'draw':
          this.noise({ duration: 0.075, frequency: 2300, gain: 0.019 });
          this.tone(190, { duration: 0.06, gain: 0.011, slide: -30 });
          break;
        case 'place':
          this.noise({ duration: 0.045, frequency: 1500, gain: 0.013 });
          this.tone(145, { duration: 0.08, type: 'sine', gain: 0.018, slide: -25 });
          break;
        case 'flip':
          this.noise({ duration: 0.055, frequency: 3200, q: 0.9, gain: 0.013 });
          break;
        case 'foundation':
          this.tone(587.33, { duration: 0.16, gain: 0.017 });
          this.tone(880, { duration: 0.24, gain: 0.015, delay: 0.055 });
          break;
        case 'collect':
          this.tone(659.25, { duration: 0.11, gain: 0.009 });
          this.tone(987.77, { duration: 0.16, gain: 0.008, delay: 0.05 });
          break;
        case 'shuffle':
          this.noise({ duration: 0.06, frequency: 1700, gain: 0.013, delay: 0 });
          this.noise({ duration: 0.06, frequency: 2100, gain: 0.012, delay: 0.07 });
          this.noise({ duration: 0.065, frequency: 2500, gain: 0.011, delay: 0.14 });
          break;
        case 'undo':
          this.tone(392, { duration: 0.1, type: 'triangle', gain: 0.012 });
          this.tone(261.63, { duration: 0.14, type: 'triangle', gain: 0.011, delay: 0.065 });
          break;
        case 'hint':
          this.tone(1046.5, { duration: 0.16, gain: 0.009 });
          this.tone(1318.5, { duration: 0.2, gain: 0.007, delay: 0.08 });
          break;
        case 'invalid':
          this.tone(120, { duration: 0.12, type: 'triangle', gain: 0.015, slide: -20 });
          break;
        case 'win':
          [392, 523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => {
            this.tone(freq, {
              duration: 0.5,
              type: 'sine',
              gain: 0.018,
              delay: index * 0.12,
            });
          });
          this.noise({ duration: 0.4, frequency: 3400, gain: 0.006, delay: 0.27 });
          break;
        default:
          break;
      }
    } catch {
      // Sound is a garnish, never a blocker.
    }
  },
};

function haptic(pattern = 7) {
  if (!settings.sound) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Ignore unsupported devices.
  }
}

/* --------------------------------------------------------------------------
   Settings and saved games
   -------------------------------------------------------------------------- */

function loadSettings() {
  const stored = readJSON(SETTINGS_KEY);
  if (!stored || typeof stored !== 'object') return;
  settings.sound = stored.sound !== false;
  settings.drawMode = [1, 3].includes(Number(stored.drawMode)) ? Number(stored.drawMode) : 1;
  settings.skin = stored.skin === 'lumen' ? 'lumen' : 'salon';
  settings.soundPack = stored.soundPack === 'hakimi' ? 'hakimi' : 'classic';
  settings.difficulty = DIFFICULTIES.includes(stored.difficulty) ? stored.difficulty : 'easy';
}

function saveSettings() {
  writeJSON(SETTINGS_KEY, settings);
}

function loadStats() {
  const stored = readJSON(STATS_KEY);
  if (!stored || typeof stored !== 'object') return defaultStats();
  return {
    played: Number.isFinite(stored.played) ? Math.max(0, Number(stored.played)) : 0,
    wins: Number.isFinite(stored.wins) ? Math.max(0, Number(stored.wins)) : 0,
    bestTime: Number.isFinite(stored.bestTime) && stored.bestTime > 0 ? stored.bestTime : null,
    bestScore: Number.isFinite(stored.bestScore) ? Math.max(0, Number(stored.bestScore)) : 0,
    bestMoves: Number.isFinite(stored.bestMoves) && stored.bestMoves > 0 ? stored.bestMoves : null,
  };
}

function saveStats() {
  writeJSON(STATS_KEY, stats);
  updateMenuStats();
}

function loadSavedGame() {
  const saved = readJSON(SAVE_KEY);
  if (!saved || saved.v !== 1 || !saved.state || saved.won) return null;
  if (!validateState(saved.state)) return null;
  if (isWon(saved.state)) return null;
  return {
    state: saved.state,
    elapsedMs: Number.isFinite(saved.elapsedMs) ? Math.max(0, Number(saved.elapsedMs)) : 0,
    hasTimerStarted: Boolean(saved.hasTimerStarted),
  };
}

function saveGame({ quiet = false } = {}) {
  if (!state) return;
  const succeeded = writeJSON(SAVE_KEY, {
    v: 1,
    state: serializeState(state),
    elapsedMs: Math.round(elapsedMs),
    hasTimerStarted,
    won: gameWon,
    savedAt: Date.now(),
  });
  if (!quiet && succeeded) flashSaveIndicator();
  const label = els.saveIndicator?.querySelector('span');
  if (label) label.textContent = succeeded ? '已保存' : '未保存';
  if (!succeeded) els.saveIndicator?.classList.remove('is-saving');
}

/* --------------------------------------------------------------------------
   Timer
   -------------------------------------------------------------------------- */

function timerTick() {
  if (!timerRunning) return;
  const now = performance.now();
  elapsedMs += now - lastTick;
  lastTick = now;
  updateTimeDisplay();
  if (now - lastTimerSave > 14000) {
    lastTimerSave = now;
    saveGame({ quiet: true });
  }
}

function startTimer() {
  if (gameWon || document.hidden) return;
  if (!hasTimerStarted) hasTimerStarted = true;
  if (timerRunning) return;
  lastTick = performance.now();
  timerRunning = true;
  window.clearInterval(timerHandle);
  timerHandle = window.setInterval(timerTick, 500);
}

function pauseTimer() {
  if (timerRunning) {
    elapsedMs += performance.now() - lastTick;
    timerRunning = false;
  }
  window.clearInterval(timerHandle);
  timerHandle = null;
  updateTimeDisplay();
}

function resetTimer() {
  window.clearInterval(timerHandle);
  timerHandle = null;
  timerRunning = false;
  hasTimerStarted = false;
  elapsedMs = 0;
  lastTick = 0;
  updateTimeDisplay();
}

function ensureTimer() {
  if (gameWon) return;
  startTimer();
}

function updateTimeDisplay() {
  if (els.statTime) els.statTime.textContent = formatDuration(elapsedMs);
}

/* --------------------------------------------------------------------------
   Layout metrics
   -------------------------------------------------------------------------- */

function updateMetrics() {
  const styles = window.getComputedStyle(els.app);
  const padLeft = Number.parseFloat(styles.paddingLeft) || 0;
  const padRight = Number.parseFloat(styles.paddingRight) || 0;
  const availableWidth = Math.max(250, els.app.clientWidth - padLeft - padRight);
  const viewportH = window.visualViewport?.height || window.innerHeight;
  const gap = Math.max(4, Math.min(18, Math.round(window.innerWidth * 0.012)));
  const widthFit = (availableWidth - gap * 6) / 7;
  const heightFit = viewportH * 0.172;
  const cardW = Math.max(33, Math.floor(Math.min(134, widthFit, heightFit)));
  const cardH = Math.round(cardW * 1.42);
  metrics = { cardW, cardH, gap };

  const root = document.documentElement;
  root.style.setProperty('--card-w', `${cardW}px`);
  root.style.setProperty('--card-h', `${cardH}px`);
  root.style.setProperty('--gap', `${gap}px`);
  root.style.setProperty('--card-radius', `${Math.max(4, Math.min(7, cardW * 0.054))}px`);
}

function scheduleLayout() {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    resizeTimer = null;
    // Mobile URL bars and on-screen chrome can fire visualViewport resize
    // events mid-gesture. Never destroy a drag (or force a board re-render)
    // for that; apply the new dimensions after the card has landed.
    if (drag) {
      layoutDeferred = true;
      // The mobile URL bar can change the visual viewport mid-drag. Keep the
      // cached drop zones aligned with the cards without cancelling the drag.
      window.clearTimeout(dragZonesTimer);
      dragZonesTimer = window.setTimeout(() => {
        dragZonesTimer = null;
        if (!drag?.active) return;
        const { zones, tableauTop, topRowTop, topRowBottom } = buildDropZones(drag.source);
        drag.zones = zones;
        drag.zonesTop = tableauTop;
        drag.topRowTop = topRowTop;
        drag.topRowBottom = topRowBottom;
        drag.validCount = zones.length;
        renderDragFrame();
      }, 50);
      return;
    }
    updateMetrics();
    if (state) render({ preserveFocus: true });
  }, 90);
}

/* --------------------------------------------------------------------------
   Card markup
   -------------------------------------------------------------------------- */

function cornerMarkup(card, position) {
  return `
    <span class="card__corner card__corner--${position}">
      <span class="card__rank">${RANK_LABELS[card.rank]}</span>
      ${suitSvg(card.suit, 'card__suit')}
    </span>`;
}

function pipsMarkup(card) {
  const layout = PIPS[card.rank] || [];
  return `<div class="card__pips">${layout
    .map(
      ([x, y]) => `
      <span class="card__pip" style="left:${x}%;top:${y}%;--pip-rotate:${y > 54 ? 180 : 0}deg">
        ${suitSvg(card.suit)}
      </span>`,
    )
    .join('')}</div>`;
}

function aceMarkup(card) {
  return `
    <div class="ace">
      <span class="ace__rays" aria-hidden="true"></span>
      <span class="ace__ring" aria-hidden="true"></span>
      ${suitSvg(card.suit, 'ace__glyph')}
      <span class="ace__name">MAISON PIQUE</span>
    </div>`;
}

function courtMarkup(card) {
  return `
    <div class="court">
      <span class="court__kicker">${COURT_NAMES[card.rank]}</span>
      <svg class="court__crown" viewBox="0 0 64 34" aria-hidden="true">${CROWNS[card.rank]}</svg>
      <span class="court__letter">${RANK_LABELS[card.rank]}</span>
      <span class="court__rule">
        <i aria-hidden="true"></i>
        ${suitSvg(card.suit)}
        <i aria-hidden="true"></i>
      </span>
    </div>`;
}

function faceContents(card) {
  let art;
  let variant = 'card--number';
  if (card.rank === 1) {
    art = aceMarkup(card);
    variant = 'card--ace';
  } else if (card.rank >= 11) {
    art = courtMarkup(card);
    variant = 'card--court';
  } else {
    art = pipsMarkup(card);
  }
  const color = SUIT_META[card.suit].color === 'red' ? 'card--red' : 'card--ink';
  return {
    variant,
    color,
    html: `
      <div class="card__paper">
        ${cornerMarkup(card, 'tl')}
        <div class="card__art">${art}</div>
        ${cornerMarkup(card, 'br')}
      </div>`,
  };
}

function sourceAria(source) {
  if (!source) return '';
  if (source.type === 'tableau') return `，第 ${source.pile + 1} 列第 ${source.index + 1} 张`;
  if (source.type === 'waste') return '，弃牌堆顶牌';
  if (source.type === 'foundation') return `，${FOUNDATION_NAMES[FOUNDATION_SUITS[source.pile]]}基础牌堆顶牌`;
  return '';
}

function faceCardMarkup(id, options = {}) {
  const {
    source = null,
    interactive = false,
    extraClass = '',
    style = '',
    zIndex = 1,
    decorative = false,
  } = options;
  const card = parseCard(id);
  const face = faceContents(card);
  const classes = ['card', face.color, face.variant, extraClass];
  if (interactive) classes.push('is-interactive');
  let attrs = `data-card-id="${id}"`;
  if (interactive) {
    attrs += ' role="button" tabindex="0" aria-pressed="false"';
    attrs += ` aria-label="${cardLabel(id)}${sourceAria(source)}，可点选或拖动"`;
  } else {
    attrs += ' aria-hidden="true"';
  }
  if (source) {
    attrs += ` data-src-type="${source.type}" data-src-pile="${source.pile}"`;
    if (source.index !== null && source.index !== undefined) attrs += ` data-src-index="${source.index}"`;
  }
  if (decorative) attrs += ' aria-hidden="true"';
  return `<div class="${classes.join(' ')}" ${attrs} style="z-index:${zIndex};${style}">${face.html}</div>`;
}

function cardBackMarkup(options = {}) {
  const { id = null, extraClass = '', style = '', zIndex = 1 } = options;
  const idAttr = id ? ` data-card-id="${id}"` : '';
  return `
    <div class="card card--down ${extraClass}"${idAttr} aria-hidden="true" style="z-index:${zIndex};${style}">
      <div class="card__back">
        <span class="card__back-corners" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <span class="card__back-medallion" aria-hidden="true">
          <span class="card__back-seal">
            <svg viewBox="0 0 24 24"><use href="#suit-spade"></use></svg>
          </span>
        </span>
      </div>
    </div>`;
}

/* --------------------------------------------------------------------------
   Rendering
   -------------------------------------------------------------------------- */

function sourcesKey(source) {
  if (!source) return '';
  return `${source.type}:${source.pile ?? ''}:${source.index ?? ''}`;
}

function sameSource(a, b) {
  return Boolean(a && b && sourcesKey(a) === sourcesKey(b));
}

function isLocked() {
  return gameWon || isAutoPlaying;
}

function updateControls() {
  const noStock = !state || (state.stock.length === 0 && state.waste.length === 0);
  if (els.stock) els.stock.disabled = isLocked() || noStock;
  if (els.undo) els.undo.disabled = isLocked() || history.length === 0;
  if (els.hint) els.hint.disabled = isLocked();
  if (els.menu) els.menu.disabled = isAutoPlaying;
  if (els.newGame) els.newGame.disabled = isAutoPlaying;
  els.app?.classList.toggle('is-busy', isAutoPlaying);
}

function updateStatsDom() {
  if (!state) return;
  els.statMoves.textContent = String(state.moves);
  els.statScore.textContent = String(state.score);
  const difficulty = DIFFICULTY_META[normalizeDifficulty(state.difficulty)] || DIFFICULTY_META.normal;
  const drawLabel = state.drawMode === 3 ? '三张' : '单张';
  els.drawChip.textContent = `${difficulty.label} · ${drawLabel}`;
  els.drawChip.setAttribute('aria-label', `难度${difficulty.label}，${drawLabel}发牌`);
  updateTimeDisplay();
}

function renderStock() {
  const remaining = state.stock.length;
  const recyclable = state.waste.length;
  let inner = '<span class="stock-pile__well" aria-hidden="true"></span>';

  if (remaining > 0) {
    const layerCount = remaining > 2 ? 2 : remaining > 1 ? 1 : 0;
    for (let i = layerCount; i >= 1; i -= 1) {
      inner += cardBackMarkup({
        extraClass: 'stock-layer',
        style: `left:${-i * 3}px;top:${-i * 3}px;`,
        zIndex: 2,
      });
    }
    inner += cardBackMarkup({
      extraClass: 'stock-layer stock-layer--top',
      style: 'left:0;top:0;',
      zIndex: 3,
    });
    inner += `<span class="stock-badge" aria-hidden="true">${remaining}</span>`;
    els.stock.setAttribute(
      'aria-label',
      `牌堆，剩余 ${remaining} 张。点击翻开${state.drawMode === 3 ? '三张' : '一张'}牌`,
    );
  } else if (recyclable > 0) {
    inner += `
      <span class="stock-empty">
        <svg aria-hidden="true"><use href="#icon-recycle"></use></svg>
        <span>重洗</span>
      </span>`;
    els.stock.setAttribute('aria-label', `牌堆已空，弃牌堆有 ${recyclable} 张。点击重新发牌`);
  } else {
    inner += `<span class="stock-empty"><span>空</span></span>`;
    els.stock.setAttribute('aria-label', '牌堆与弃牌堆均已空');
  }

  els.stock.innerHTML = inner;
  els.stock.disabled = isLocked() || (remaining === 0 && recyclable === 0);
  els.stock.classList.toggle('is-recyclable', remaining === 0 && recyclable > 0);
}

function renderWaste() {
  const visibleCount = state.drawMode === 3 ? 3 : 1;
  const visible = state.waste.slice(-visibleCount);
  if (visible.length === 0) {
    els.waste.innerHTML = '<span class="waste-empty" aria-hidden="true"><span>弃牌</span></span>';
    els.waste.setAttribute('aria-label', '弃牌堆为空');
    return;
  }

  const offset = Math.max(2, Math.round(metrics.cardW * 0.085));
  const locked = isLocked();
  els.waste.innerHTML = visible
    .map((id, index) => {
      const isTop = index === visible.length - 1;
      return faceCardMarkup(id, {
        source: { type: 'waste' },
        interactive: isTop && !locked,
        extraClass: isTop ? 'waste-card waste-card--top' : 'waste-card card--buried',
        style: `left:${index * offset}px;top:0;pointer-events:${isTop ? 'auto' : 'none'};`,
        zIndex: index + 2,
      });
    })
    .join('');
  els.waste.insertAdjacentHTML(
    'beforeend',
    `<span class="waste-badge" aria-hidden="true"><small>弃牌</small><b>${state.waste.length}</b></span>`,
  );
  const top = topCard(state.waste);
  els.waste.setAttribute('aria-label', `弃牌堆，${state.waste.length} 张，顶牌为 ${cardLabel(top)}`);
}

function renderFoundations() {
  const locked = isLocked();
  els.foundations.forEach((slot, index) => {
    const pile = state.foundations[index];
    $$('.card, .foundation__count', slot).forEach((node) => node.remove());
    slot.classList.toggle('has-card', pile.length > 0);
    const cardId = topCard(pile);
    if (cardId) {
      slot.insertAdjacentHTML(
        'beforeend',
        faceCardMarkup(cardId, {
          source: { type: 'foundation', pile: index },
          interactive: !locked,
          style: 'left:0;top:0;',
          zIndex: 2,
        }),
      );
      const topRank = parseCard(cardId).rank;
      const range = topRank === 1 ? 'A' : `A–${RANK_LABELS[topRank]}`;
      slot.insertAdjacentHTML(
        'beforeend',
        `<span class="foundation__count" aria-hidden="true">${range}</span>`,
      );
    }
    slot.tabIndex = pile.length === 0 ? 0 : -1;
    slot.setAttribute('role', pile.length === 0 ? 'button' : 'group');
    const suit = FOUNDATION_SUITS[index];
    slot.setAttribute(
      'aria-label',
      cardId
        ? pile.length === 1
          ? `${FOUNDATION_NAMES[suit]}基础牌堆，已收入 A，共 1 张`
          : `${FOUNDATION_NAMES[suit]}基础牌堆，已收入 A 到 ${RANK_LABELS[parseCard(cardId).rank]}，共 ${pile.length} 张`
        : `${FOUNDATION_NAMES[suit]}基础牌堆，空，可放置 ${FOUNDATION_NAMES[suit]} A`,
    );
  });
}

function tableauColumnLabel(pile, index) {
  const up = pile.filter((entry) => entry.up).length;
  const down = pile.length - up;
  if (pile.length === 0) return `第 ${index + 1} 列，空牌列，仅可放置 K`;
  return `第 ${index + 1} 列，${pile.length} 张牌，${up} 张明牌，${down} 张暗牌`;
}

function renderTableau() {
  const locked = isLocked();
  els.tableau.innerHTML = state.tableau
    .map((pile, columnIndex) => {
      const cards = pile
        .map((entry, index) => {
          if (!entry.up) {
            return cardBackMarkup({
              id: entry.id,
              style: 'top:0;left:0;',
              zIndex: index + 1,
            });
          }
          const run = getMovableRun(state, columnIndex, index);
          return faceCardMarkup(entry.id, {
            source: { type: 'tableau', pile: columnIndex, index },
            interactive: !locked && run.length > 0,
            style: 'top:0;left:0;',
            zIndex: index + 1,
          });
        })
        .join('');
      return `
        <div class="tableau-col${pile.length === 0 ? ' is-empty' : ''}"
          data-tableau="${columnIndex}"
          data-drop="tableau"
          role="${pile.length === 0 ? 'button' : 'group'}"
          ${pile.length === 0 ? 'tabindex="0"' : 'tabindex="-1"'}
          aria-label="${tableauColumnLabel(pile, columnIndex)}">
          <div class="pile-base" aria-hidden="true"><span class="pile-base__mark"></span></div>
          ${cards}
        </div>`;
    })
    .join('');
  layoutTableauCards();
}

function layoutTableauCards() {
  const available = Math.max(metrics.cardH, els.tableau.clientHeight);
  const naturalUp = Math.max(16, metrics.cardH * 0.24);
  const naturalDown = Math.max(8, metrics.cardH * 0.155);

  state.tableau.forEach((pile, columnIndex) => {
    const column = els.tableau.querySelector(`[data-tableau="${columnIndex}"]`);
    if (!column) return;
    const cards = $$('.card', column);
    if (cards.length === 0) return;

    let naturalSpace = 0;
    for (let i = 0; i < pile.length - 1; i += 1) {
      naturalSpace += pile[i].up ? naturalUp : naturalDown;
    }
    const fitSpace = Math.max(0, available - metrics.cardH - 1);
    const scale = naturalSpace > fitSpace && naturalSpace > 0 ? fitSpace / naturalSpace : 1;
    let top = 0;
    cards.forEach((cardEl, index) => {
      cardEl.style.top = `${top}px`;
      cardEl.style.zIndex = String(index + 1);
      if (index < pile.length - 1) {
        top += (pile[index].up ? naturalUp : naturalDown) * scale;
      }
    });
  });
}

function clearTargetClasses() {
  $$('.is-valid-target').forEach((el) => el.classList.remove('is-valid-target'));
  $$('.is-drop-target').forEach((el) => el.classList.remove('is-drop-target'));
}

function getValidDestinations(source = selection) {
  const result = { foundations: [], tableau: [] };
  if (!source) return result;
  const cards = getSourceCards(state, source);
  if (cards.length === 0) return result;
  if (source.type !== 'foundation' && cards.length === 1) {
    for (let index = 0; index < 4; index += 1) {
      if (canPlaceOnFoundation(state, cards[0], index)) result.foundations.push(index);
    }
  }
  for (let index = 0; index < 7; index += 1) {
    if (source.type === 'tableau' && source.pile === index) continue;
    if (canPlaceOnTableau(state, cards, index)) result.tableau.push(index);
  }
  return result;
}

function syncSelectionUI() {
  $$('.card.is-selected').forEach((el) => {
    el.classList.remove('is-selected');
    el.setAttribute('aria-pressed', 'false');
  });
  clearTargetClasses();

  if (!selection) {
    els.app.classList.remove('has-selection');
    return;
  }

  const cards = getSourceCards(state, selection);
  if (cards.length === 0) {
    selection = null;
    els.app.classList.remove('has-selection');
    return;
  }

  els.app.classList.add('has-selection');
  cards.forEach((id) => {
    const cardEl = document.querySelector(`.card[data-card-id="${id}"]`);
    if (cardEl) {
      cardEl.classList.add('is-selected');
      cardEl.setAttribute('aria-pressed', 'true');
    }
  });

  const destinations = getValidDestinations(selection);
  destinations.foundations.forEach((index) => {
    const slot = els.foundations[index];
    slot.classList.add('is-valid-target');
    const card = $('.card', slot);
    if (card) card.classList.add('is-drop-target');
  });
  destinations.tableau.forEach((index) => {
    const column = esColumn(index);
    if (!column) return;
    column.classList.add('is-valid-target');
    const pile = state.tableau[index];
    if (pile.length > 0) {
      const top = $('.card:last-child', column);
      if (top) top.classList.add('is-drop-target');
    }
  });
}

function esColumn(index) {
  return els.tableau.querySelector(`[data-tableau="${index}"]`);
}

function clearHintClasses() {
  $$('.is-hint-source').forEach((el) => el.classList.remove('is-hint-source'));
  $$('.is-hint-target').forEach((el) => el.classList.remove('is-hint-target'));
}

function applyHintUI(currentHint) {
  clearHintClasses();
  if (!currentHint) return;
  if (currentHint.from) {
    const ids = getSourceCards(state, currentHint.from);
    ids.forEach((id) => {
      const card = document.querySelector(`.card[data-card-id="${id}"]`);
      if (card) card.classList.add('is-hint-source');
    });
  }
  if (currentHint.to?.type === 'foundation') {
    const slot = els.foundations[currentHint.to.pile];
    slot?.classList.add('is-hint-target');
    const card = slot && $('.card', slot);
    if (card) card.classList.add('is-hint-target');
  } else if (currentHint.to?.type === 'tableau') {
    const column = esColumn(currentHint.to.pile);
    column?.classList.add('is-hint-target');
    const pile = state.tableau[currentHint.to.pile];
    if (pile?.length) {
      const card = $('.card:last-child', column);
      if (card) card.classList.add('is-hint-target');
    }
  } else if (currentHint.kind === 'draw' || currentHint.kind === 'recycle') {
    els.stock.classList.add('is-hint-target');
  }
}

function clearHint({ silent = true } = {}) {
  clearHintClasses();
  hint = null;
  if (!silent) setStatus(DEFAULT_STATUS);
}

function render({ deal = false, animateFrom = null, movedIds = [], flipped = null } = {}) {
  if (!state) return;

  let focusCardId = null;
  let focusColumn = null;
  const active = document.activeElement;
  if (active?.closest) {
    const focusedCard = active.closest('.card[data-card-id]');
    if (focusedCard) focusCardId = focusedCard.dataset.cardId;
    else focusColumn = active.closest('[data-tableau]')?.dataset.tableau;
  }

  renderStock();
  renderWaste();
  renderFoundations();
  renderTableau();
  updateStatsDom();
  updateControls();

  syncSelectionUI();
  if (hint) applyHintUI(hint);

  if (deal) {
    let index = 0;
    $$('.card', els.board).forEach((card) => {
      const delay = Math.min(600, index * 23 + Number(card.closest('[data-tableau]')?.dataset.tableau || 0) * 18);
      card.style.setProperty('--deal-delay', `${delay}ms`);
      card.classList.add('is-dealing');
      index += 1;
    });
  }

  if (animateFrom && movedIds.length) {
    animateCardsFrom(animateFrom, movedIds);
  }

  if (flipped) {
    const cardEl = document.querySelector(`.card[data-card-id="${flipped}"]`);
    if (cardEl) {
      cardEl.classList.add('is-flipping');
      window.setTimeout(() => cardEl.classList.remove('is-flipping'), 500);
    }
  }

  if (focusCardId) {
    requestAnimationFrame(() => {
      const target = document.querySelector(`.card[data-card-id="${focusCardId}"]`);
      target?.focus({ preventScroll: true });
    });
  } else if (focusColumn !== null && focusColumn !== undefined) {
    requestAnimationFrame(() => {
      esColumn(focusColumn)?.focus({ preventScroll: true });
    });
  }
}

function animateCardsFrom(rects, ids) {
  if (REDUCED_MOTION.matches) return;
  ids.forEach((id, index) => {
    const cardEl = document.querySelector(`.card[data-card-id="${id}"]`);
    const from = rects.get(id);
    if (!cardEl || !from) return;
    const to = cardEl.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    const previousZ = cardEl.style.zIndex;
    cardEl.style.zIndex = String(120 + index);
    const animation = cardEl.animate(
      [
        { transform: `translate3d(${dx}px, ${dy}px, 0)`, opacity: 0.96 },
        { transform: 'translate3d(0, 0, 0)', opacity: 1 },
      ],
      {
        duration: 300 + index * 24,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        fill: 'both',
      },
    );
    animation.onfinish = () => {
      cardEl.style.zIndex = previousZ;
      animation.cancel();
    };
  });
}

function captureCardRects(ids) {
  const rects = new Map();
  ids.forEach((id) => {
    const cardEl = document.querySelector(`.card[data-card-id="${id}"]`);
    if (cardEl) rects.set(id, cardEl.getBoundingClientRect());
  });
  return rects;
}

/* --------------------------------------------------------------------------
   Game actions
   -------------------------------------------------------------------------- */

function pushHistory() {
  history.push(cloneState(state));
  if (history.length > HISTORY_LIMIT) history.shift();
}

function beginNewGame({
  drawMode = settings.drawMode,
  difficulty = state?.difficulty || settings.difficulty,
  countPlayed = true,
} = {}) {
  clearAutoFinishTimer();
  const mode = [1, 3].includes(Number(drawMode)) ? Number(drawMode) : 1;
  const level = normalizeDifficulty(difficulty);
  resetTimer();
  window.clearTimeout(winRevealTimer);
  stopConfetti();
  state = newGame({ drawMode: mode, difficulty: level, seed: randomSeed() });
  selection = null;
  hint = null;
  hintCursor = 0;
  history = [];
  gameWon = false;
  autoPlan = null;
  isAutoPlaying = false;
  lastTap = { key: null, time: 0 };
  cancelDrag(false);
  closeAllDialogs();
  clearHintClasses();
  clearTargetClasses();
  els.app.classList.remove('is-won');
  settings.drawMode = mode;
  settings.difficulty = level;
  saveSettings();
  if (countPlayed) {
    stats.played += 1;
    saveStats();
  }
  render({ deal: true });
  updateMenuStats();
  refreshAutoFinish();
  setStatus(DEFAULT_STATUS);
  saveGame();
}

function selectSource(source) {
  if (isLocked()) return;
  clearAutoFinishTimer();
  const cards = getSourceCards(state, source);
  if (cards.length === 0) return;
  // Keep the suggested destination glowing while the player follows a hint.
  if (!hint?.from || !sameSource(hint.from, source)) clearHint();
  selection = source;
  hintCursor = 0;
  syncSelectionUI();
  const destinations = getValidDestinations();
  const targetCount = destinations.foundations.length + destinations.tableau.length;
  if (targetCount > 0) {
    const more = cards.length > 1 ? `，共 ${cards.length} 张` : '';
    setStatus(`已选 ${cardLabel(cards[0])}${more} · 点按发光的落点`, true);
  } else {
    setStatus(`已选 ${cardLabel(cards[0])} · 暂时没有可放置的位置`);
  }
  soundEngine.play('select');
  haptic(4);
}

function clearSelection({ silent = false } = {}) {
  selection = null;
  syncSelectionUI();
  if (!silent) setStatus(DEFAULT_STATUS);
}

function shakeElement(element) {
  if (!element || REDUCED_MOTION.matches) return;
  element.classList.remove('is-invalid-shake');
  void element.offsetWidth;
  element.classList.add('is-invalid-shake');
  window.setTimeout(() => element.classList.remove('is-invalid-shake'), 350);
}

function foundationTargetForSource(source) {
  if (!source || source.type === 'foundation') return -1;
  const cards = getSourceCards(state, source);
  if (cards.length !== 1) return -1;
  if (source.type === 'tableau') {
    const pile = state.tableau[source.pile];
    if (!pile || source.index !== pile.length - 1) return -1;
  }
  const target = foundationIndexForCard(state, cards[0]);
  return canPlaceOnFoundation(state, cards[0], target) ? target : -1;
}

function executeMove(from, to, { animateFrom = null, fromDrag = false } = {}) {
  clearAutoFinishTimer();
  if (isLocked() || !from || !to) return false;
  const cards = getSourceCards(state, from);
  if (cards.length === 0) return false;
  const rects = animateFrom || captureCardRects(cards);

  pushHistory();
  const result = applyMove(state, { from, to });
  if (!result.ok) {
    history.pop();
    soundEngine.play('invalid');
    return false;
  }

  ensureTimer();
  clearHint();
  selection = null;
  lastTap = { key: null, time: 0 };
  hintCursor = 0;
  state = result.state;
  gameWon = false;
  render({ animateFrom: rects, movedIds: result.cards, flipped: result.flipped });
  if (settings.soundPack === 'hakimi') soundEngine.play('hakimi-drop');

  if (result.toFoundation) {
    soundEngine.play('foundation');
    setStatus(`${shortCardLabel(result.cards[0])} 已归位 · +${result.scoreDelta} 分`, true);
  } else if (result.flipped) {
    soundEngine.play('flip');
    setStatus(`挪开一组牌，翻开了一张暗牌 · +${result.scoreDelta} 分`, true);
  } else {
    if (settings.soundPack !== 'hakimi') soundEngine.play('place');
    const description = result.cards.length > 1 ? `${result.cards.length} 张连续牌` : shortCardLabel(result.cards[0]);
    setStatus(`已移动 ${description}${fromDrag ? '' : ' · 稳稳落桌'}`);
  }
  haptic(result.toFoundation ? [8, 24, 10] : 7);
  saveGame();
  if (checkForWin()) return true;
  refreshAutoFinish();
  return true;
}

function drawStock() {
  if (isLocked()) return;
  clearAutoFinishTimer();
  if (state.stock.length === 0 && state.waste.length === 0) {
    soundEngine.play('invalid');
    setStatus('牌堆已经空了 · 可以撤销一步，或开一局新的');
    return;
  }
  if (state.stock.length === 0 && state.waste.length > 0) {
    pushHistory();
    ensureTimer();
    clearHint();
    selection = null;
    lastTap = { key: null, time: 0 };
    const result = draw(state);
    if (!result.ok) {
      history.pop();
      return;
    }
    state = result.state;
    render();
    soundEngine.play('shuffle');
    haptic(6);
    setStatus(`弃牌已重新洗好 · 继续从牌堆寻找机会`, true);
    els.stock.classList.remove('is-recycling');
    void els.stock.offsetWidth;
    els.stock.classList.add('is-recycling');
    window.setTimeout(() => els.stock.classList.remove('is-recycling'), 520);
    saveGame();
    refreshAutoFinish();
    return;
  }

  const stockRect = els.stock.getBoundingClientRect();
  pushHistory();
  ensureTimer();
  clearHint();
  selection = null;
  lastTap = { key: null, time: 0 };
  hintCursor = 0;
  const result = draw(state);
  if (!result.ok) {
    history.pop();
    return;
  }
  state = result.state;
  render();
  const animationRects = new Map();
  result.cards.forEach((id) => animationRects.set(id, stockRect));
  animateCardsFrom(animationRects, result.cards);
  soundEngine.play('draw');
  haptic(5);
  const count = result.cards.length;
  setStatus(count === 3 ? '翻开三张牌 · 只有最上面一张能动' : '翻开了一张牌', true);
  saveGame();
  refreshAutoFinish();
}

function attemptTargetMove(type, pile, targetEl) {
  if (isLocked()) return;
  if (!selection) {
    if (type === 'foundation') {
      setStatus('先点选一张 A，再把它放在这里');
    } else {
      setStatus('先点选一张明牌，再点要放置的位置');
    }
    return;
  }
  const destinations = getValidDestinations();
  const valid = type === 'foundation' ? destinations.foundations.includes(pile) : destinations.tableau.includes(pile);
  if (!valid) {
    soundEngine.play('invalid');
    haptic([5, 35, 5]);
    shakeElement(targetEl || (type === 'foundation' ? els.foundations[pile] : esColumn(pile)));
    setStatus('这里放不下这组牌 · 换一个落点看看');
    return;
  }
  const from = selection;
  executeMove(from, { type, pile });
}

function handleCardTap(cardEl) {
  if (isLocked() || !cardEl) return;
  const source = {
    type: cardEl.dataset.srcType,
    pile: cardEl.dataset.srcPile === undefined ? null : Number(cardEl.dataset.srcPile),
    index: cardEl.dataset.srcIndex === undefined ? null : Number(cardEl.dataset.srcIndex),
  };
  if (!source.type) return;
  const cards = getSourceCards(state, source);
  if (cards.length === 0) return;

  const now = performance.now();
  const cardId = cardEl.dataset.cardId;
  const isDouble = lastTap.key === cardId && now - lastTap.time < 340;
  lastTap = { key: cardId, time: now };

  if (isDouble) {
    const foundation = foundationTargetForSource(source);
    if (foundation !== -1) {
      executeMove(source, { type: 'foundation', pile: foundation });
      return;
    }
  }

  const isHintSource = Boolean(hint?.from && sameSource(hint.from, source));
  if (!isHintSource) clearHint();

  if (selection) {
    const destinations = getValidDestinations();
    if (source.type === 'tableau' && destinations.tableau.includes(source.pile)) {
      executeMove(selection, { type: 'tableau', pile: source.pile });
      return;
    }
    if (source.type === 'foundation' && destinations.foundations.includes(source.pile)) {
      executeMove(selection, { type: 'foundation', pile: source.pile });
      return;
    }
    if (sameSource(selection, source)) {
      clearSelection();
      return;
    }
    selectSource(source);
    return;
  }

  selectSource(source);
}

function updateMenuStats() {
  if (!els.bestWins) return;
  els.bestWins.textContent = String(stats.wins);
  els.bestTime.textContent = stats.bestTime ? formatDuration(stats.bestTime) : '—';
  els.bestScore.textContent = String(stats.bestScore);
  els.gameSeed.textContent = state ? formatSeed(state.seed) : '—';
}

function setHintStatus(currentHint) {
  if (!currentHint) {
    setStatus('暂时没有可移动的牌 · 点击牌堆继续发牌');
    return;
  }
  const label = currentHint.cardId ? shortCardLabel(currentHint.cardId) : '';
  switch (currentHint.kind) {
    case 'foundation':
      setStatus(`提示 · 把 ${label} 收入基础牌堆`, true);
      break;
    case 'reveal':
      setStatus(`提示 · 挪开 ${label}，就能翻出一张暗牌`, true);
      break;
    case 'setup':
      setStatus(`提示 · 先移动 ${label}，为下一步打开局面`, true);
      break;
    case 'shuffle':
      setStatus(`提示 · 把 ${label} 移开，腾出一个空牌列`, true);
      break;
    case 'draw':
      setStatus('提示 · 点击左上角牌堆继续发牌', true);
      break;
    case 'recycle':
      setStatus('提示 · 牌堆已尽，点击左上角重洗弃牌', true);
      break;
    default: {
      const targetPile = currentHint.to?.type === 'tableau' ? state.tableau[currentHint.to.pile] : [];
      const targetTop = topCard(targetPile);
      setStatus(
        targetTop
          ? `提示 · 把 ${label} 移到 ${shortCardLabel(targetTop)} 上`
          : `提示 · 把 ${label} 移到空牌列`,
        true,
      );
    }
  }
}

function showHint() {
  if (isLocked()) return;
  clearAutoFinishTimer();
  if (selection) clearSelection({ silent: true });
  const hints = getHints(state);
  if (hints.length === 0) {
    clearHint();
    setStatus('暂时没有更进一步的走法 · 可以撤销一步，或开一局新的');
    soundEngine.play('invalid');
    shakeElement(els.stock);
    return;
  }
  const chosen = hints[hintCursor % hints.length];
  hintCursor = (hintCursor + 1) % hints.length;
  hint = chosen;

  // Make the suggested move immediately actionable. Selecting a whole run by
  // tapping one of its often-thin exposed strips is the least reliable part of
  // an otherwise simple hint; let the hint button do it for the player.
  if (chosen.from) {
    selection = chosen.from;
    syncSelectionUI();
  }
  applyHintUI(chosen);
  setHintStatus(chosen);
  soundEngine.play('hint');
  haptic(4);
}

function undo() {
  if (isLocked() || history.length === 0) return;
  clearAutoFinishTimer();
  const previous = history.pop();
  state = previous;
  selection = null;
  hint = null;
  hintCursor = 0;
  gameWon = false;
  autoPlan = null;
  els.app.classList.remove('is-won');
  render();
  clearHintClasses();
  soundEngine.play('undo');
  setStatus('已撤销上一步 · 时间仍在继续');
  saveGame();
  refreshAutoFinish();
}

function clearAutoFinishTimer() {
  window.clearTimeout(autoFinishTimer);
  autoFinishTimer = null;
}

function autoFinishReady() {
  return Boolean(
    state &&
      autoPlan &&
      autoPlan.length > 0 &&
      !isLocked() &&
      state.stock.length === 0 &&
      hiddenCardCount(state) === 0,
  );
}

function refreshAutoFinish({ auto = true } = {}) {
  clearAutoFinishTimer();
  if (!state || isLocked()) {
    els.autoFinish.hidden = true;
    autoPlan = null;
    return;
  }
  const plan = getAutoFinishPlan(state);
  autoPlan = plan && plan.length > 0 ? plan : null;
  els.autoFinish.hidden = !autoPlan;

  if (auto && autoFinishReady()) {
    setStatus('牌面已全部翻开 · 稍候自动收牌', true);
    autoFinishTimer = window.setTimeout(() => {
      autoFinishTimer = null;
      if (!autoFinishReady() || drag || document.hidden) return;
      if (document.querySelector('dialog[open]')) return;
      runAutoFinish({ automatic: true });
    }, 900);
  }
}

async function runAutoFinish({ automatic = false } = {}) {
  if (!autoPlan || isLocked() || autoPlan.length === 0) return;
  const plan = autoPlan;
  clearAutoFinishTimer();
  pushHistory();
  clearHint();
  selection = null;
  isAutoPlaying = true;
  autoPlan = null;
  els.autoFinish.hidden = true;
  updateControls();
  ensureTimer();
  els.app.classList.add('is-auto-collecting');
  setStatus(automatic ? '牌面已全部翻开 · 正在自动收牌' : '正在把余牌收入牌盒 · 稍候片刻', true);
  soundEngine.play('foundation');
  const delay = Math.max(55, Math.min(150, 4800 / plan.length));

  for (const move of plan) {
    if (!state) break;
    const cards = getSourceCards(state, move.from);
    if (cards.length === 0) break;
    const rects = captureCardRects(cards);
    const result = applyMove(state, { from: move.from, to: move.to });
    if (!result.ok) break;
    state = result.state;
    render({ animateFrom: rects, movedIds: result.cards });
    soundEngine.play(plan.indexOf(move) % 3 === 0 ? 'collect' : 'place');
    await wait(delay);
  }

  isAutoPlaying = false;
  els.app.classList.remove('is-auto-collecting');
  updateControls();
  saveGame();
  if (checkForWin()) return;
  render();
  refreshAutoFinish({ auto: false });
  setStatus('自动收牌停下了 · 再找一找其他落点');
}

/* --------------------------------------------------------------------------
   Victory
   -------------------------------------------------------------------------- */

function updateWinDialog(finalElapsed) {
  els.winTime.textContent = formatDuration(finalElapsed);
  els.winMoves.textContent = String(state.moves);
  els.winScore.textContent = String(state.score);
}

function checkForWin() {
  if (gameWon || !isWon(state)) return false;
  gameWon = true;
  pauseTimer();
  const finalElapsed = Math.round(elapsedMs);
  clearHint();
  clearSelection({ silent: true });
  const previousBestTime = stats.bestTime;
  const previousBestScore = stats.bestScore;
  const isNewRecord =
    (finalElapsed > 0 && (!previousBestTime || finalElapsed < previousBestTime)) ||
    state.score > previousBestScore;

  stats.wins += 1;
  if (finalElapsed > 0 && (!stats.bestTime || finalElapsed < stats.bestTime)) stats.bestTime = finalElapsed;
  if (state.score > stats.bestScore) stats.bestScore = state.score;
  if (!stats.bestMoves || state.moves < stats.bestMoves) stats.bestMoves = state.moves;

  gameWon = true;
  clearAutoFinishTimer();
  els.app.classList.remove('is-auto-collecting');
  autoPlan = null;
  els.autoFinish.hidden = true;
  render();
  els.app.classList.add('is-won');
  updateControls();
  updateWinDialog(finalElapsed);
  els.winRecord.hidden = !isNewRecord;
  if (isNewRecord) els.winRecord.textContent = '新的沙龙纪录';
  updateMenuStats();
  saveStats();
  saveGame();
  setStatus('四门花色，全部归位 · 这一局完成了', true);
  window.clearTimeout(winRevealTimer);
  winRevealTimer = window.setTimeout(() => {
    if (!els.winDialog.open) {
      closeAllDialogs();
      els.winDialog.showModal();
      startConfetti();
      soundEngine.play('win');
    }
  }, 560);
  return true;
}

function stopConfetti() {
  if (confettiFrame) cancelAnimationFrame(confettiFrame);
  confettiFrame = null;
  const ctx = els.confetti.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, els.confetti.width, els.confetti.height);
}

function startConfetti() {
  if (REDUCED_MOTION.matches) return;
  stopConfetti();
  const canvas = els.confetti;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const colors =
    settings.skin === 'lumen'
      ? ['#6f8cff', '#c3a6ff', '#ffc2ad', '#9fe8d8', '#ffffff', '#1d1d1f']
      : ['#d5b77b', '#f1e5c9', '#a33d2e', '#7d9b80', '#e8d198'];
  confettiParticles = Array.from({ length: 110 }, (_, index) => ({
    x: Math.random() * window.innerWidth,
    y: -20 - Math.random() * window.innerHeight * 0.45,
    vx: -0.3 + Math.random() * 0.6,
    vy: 1.1 + Math.random() * 2.6,
    w: index % 5 === 0 ? 2.5 : 4 + Math.random() * 5,
    h: index % 5 === 0 ? 8 + Math.random() * 8 : 4 + Math.random() * 7,
    rotation: Math.random() * Math.PI,
    spin: -0.055 + Math.random() * 0.11,
    color: colors[index % colors.length],
    alpha: 0.45 + Math.random() * 0.55,
    sway: Math.random() * Math.PI * 2,
  }));
  confettiStartedAt = performance.now();

  const draw = (now) => {
    const age = now - confettiStartedAt;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    confettiParticles.forEach((particle) => {
      particle.sway += 0.015;
      particle.x += particle.vx + Math.sin(particle.sway) * 0.35;
      particle.y += particle.vy;
      particle.rotation += particle.spin;
      if (particle.y > window.innerHeight + 30) {
        particle.y = -20;
        particle.x = Math.random() * window.innerWidth;
      }
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation);
      ctx.globalAlpha = particle.alpha * Math.max(0, Math.min(1, (5200 - age) / 1200));
      ctx.fillStyle = particle.color;
      ctx.fillRect(-particle.w / 2, -particle.h / 2, particle.w, particle.h);
      ctx.restore();
    });
    if (age < 5600 && els.winDialog.open) {
      confettiFrame = requestAnimationFrame(draw);
    } else {
      confettiFrame = null;
    }
  };
  confettiFrame = requestAnimationFrame(draw);
}

/* --------------------------------------------------------------------------
   Dialogs
   -------------------------------------------------------------------------- */

function closeAllDialogs() {
  $$('dialog[open]').forEach((dialog) => dialog.close());
}

function updateDifficultyHint(level) {
  const meta = DIFFICULTY_META[normalizeDifficulty(level)];
  if (els.difficultyHint) els.difficultyHint.textContent = meta.hint;
}

function openNewGameDialog() {
  if (isAutoPlaying) return;
  clearAutoFinishTimer();
  const current = state?.drawMode || settings.drawMode;
  const input = els.newForm.querySelector(`input[name="draw-mode"][value="${current}"]`);
  if (input) input.checked = true;
  const currentDifficulty = normalizeDifficulty(settings.difficulty);
  const difficultyInput = els.newForm.querySelector(
    `input[name="difficulty"][value="${currentDifficulty}"]`,
  );
  if (difficultyInput) difficultyInput.checked = true;
  updateDifficultyHint(currentDifficulty);
  els.newDialog.showModal();
}

function openMenu() {
  if (isAutoPlaying) return;
  clearAutoFinishTimer();
  updateMenuStats();
  els.menuDialog.showModal();
}

function applySkin(skin, { announce = false } = {}) {
  const next = skin === 'lumen' ? 'lumen' : 'salon';
  settings.skin = next;
  document.documentElement.dataset.skin = next;

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute('content', next === 'lumen' ? '#f5f5f7' : '#071b14');
  const statusStyle = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (statusStyle) {
    statusStyle.setAttribute('content', next === 'lumen' ? 'default' : 'black-translucent');
  }
  const manifestLink = document.getElementById('manifest-link');
  if (manifestLink) {
    manifestLink.setAttribute(
      'href',
      next === 'lumen'
        ? 'manifest-lumen.webmanifest?v=1.5.0'
        : 'manifest.webmanifest?v=1.5.0',
    );
  }

  $$('input[name="skin"]').forEach((input) => {
    input.checked = input.value === next;
  });

  if (announce) {
    showToast(next === 'lumen' ? '已切换到「流光」皮肤' : '已切换到「翡翠沙龙」皮肤');
    soundEngine.play('select');
    haptic(5);
  }
}

function applySoundPack(pack, { preview = false } = {}) {
  const next = pack === 'hakimi' ? 'hakimi' : 'classic';
  settings.soundPack = next;
  $$('input[name="sound-pack"]').forEach((input) => {
    input.checked = input.value === next;
  });

  if (next === 'hakimi' && settings.sound) {
    soundEngine.preloadHakimi();
  }

  if (!preview || !settings.sound) return;
  if (next === 'hakimi') {
    soundEngine.preloadHakimi().then(() => soundEngine.playHakimi('click'));
  } else {
    soundEngine.play('select');
  }
}

function updateSoundToggle() {
  els.soundToggle.setAttribute('aria-checked', settings.sound ? 'true' : 'false');
}

/* --------------------------------------------------------------------------
   Drag and drop
   -------------------------------------------------------------------------- */

function readSourceFromCard(cardEl) {
  if (!cardEl?.dataset?.srcType) return null;
  return {
    type: cardEl.dataset.srcType,
    pile: cardEl.dataset.srcPile === undefined ? null : Number(cardEl.dataset.srcPile),
    index: cardEl.dataset.srcIndex === undefined ? null : Number(cardEl.dataset.srcIndex),
  };
}

function dragSnapTolerance() {
  return Math.min(28, Math.max(14, metrics.cardW * 0.22));
}

function buildDropZones(source) {
  const destinations = getValidDestinations(source);
  const zones = [];
  const snapPad = Math.max(14, Math.min(30, metrics.cardW * 0.22));
  const foundationPad = snapPad;

  destinations.foundations.forEach((pile) => {
    const element = els.foundations[pile];
    if (!element) return;
    const rect = element.getBoundingClientRect();
    zones.push({
      type: 'foundation',
      pile,
      element,
      left: rect.left - foundationPad,
      right: rect.right + foundationPad,
      top: rect.top - foundationPad,
      bottom: rect.bottom + foundationPad,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      targetLeft: rect.left,
    });
  });

  const tableRect = els.tableau.getBoundingClientRect();
  const topRect = document.querySelector('.top-row')?.getBoundingClientRect();
  const tableauPad = snapPad;
  const topLimit = tableRect.top - Math.max(6, metrics.gap);
  const bottomLimit = tableRect.bottom + Math.max(10, metrics.cardH * 0.2);
  destinations.tableau.forEach((pile) => {
    const element = esColumn(pile);
    if (!element) return;
    const rect = element.getBoundingClientRect();
    zones.push({
      type: 'tableau',
      pile,
      element,
      left: rect.left - tableauPad,
      right: rect.right + tableauPad,
      top: topLimit,
      bottom: bottomLimit,
      centerX: rect.left + rect.width / 2,
      targetLeft: rect.left,
    });
  });

  return {
    zones,
    destinations,
    tableauTop: tableRect.top,
    topRowTop: topRect?.top ?? 0,
    topRowBottom: topRect?.bottom ?? 0,
  };
}

function nearestZone(zones, x, y) {
  let best = null;
  let bestDistance = Infinity;
  for (const zone of zones) {
    const distance =
      zone.type === 'foundation'
        ? Math.hypot(zone.centerX - x, zone.centerY - y)
        : Math.abs(zone.centerX - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = zone;
    }
  }
  return best;
}

function findDropZone(x, y) {
  if (!drag?.zones?.length) return null;

  const allFoundations = drag.zones.filter((zone) => zone.type === 'foundation');
  if (allFoundations.length > 0) {
    // A single valid foundation is a huge, forgiving drop target: anywhere in
    // the whole top row should magnetise to it. This is what makes an Ace drop
    // work without first pressing the hint button.
    const bandPad = Math.max(10, metrics.cardH * 0.09);
    if (y >= drag.topRowTop - bandPad && y <= drag.topRowBottom + bandPad) {
      return nearestZone(allFoundations, x, y);
    }
  }

  const hits = [];
  for (const zone of drag.zones) {
    if (x < zone.left || x > zone.right || y < zone.top || y > zone.bottom) continue;
    hits.push(zone);
  }
  if (hits.length === 0) return null;

  const foundations = hits.filter((zone) => zone.type === 'foundation');
  const tableaus = hits.filter((zone) => zone.type === 'tableau');

  // The top row and tableau are separated by a small gap. Prefer a foundation
  // above the board edge and a tableau target below it.
  if (foundations.length > 0 && (tableaus.length === 0 || y < drag.zonesTop)) {
    return nearestZone(foundations, x, y);
  }
  if (tableaus.length > 0) return nearestZone(tableaus, x, y);
  return nearestZone(foundations, x, y);
}

function findDropZoneFromPoint(x, y) {
  if (!drag || typeof document.elementsFromPoint !== 'function') return null;
  const destinations = getValidDestinations(drag.source);
  const stack = document.elementsFromPoint(x, y);

  for (const element of stack) {
    if (!element?.closest) continue;
    const foundation = element.closest('.foundation');
    if (foundation) {
      const pile = Number(foundation.dataset.foundation);
      if (destinations.foundations.includes(pile)) {
        return (
          drag.zones.find((zone) => zone.type === 'foundation' && zone.pile === pile) || {
            type: 'foundation',
            pile,
            element: foundation,
          }
        );
      }
    }
    const column = element.closest('.tableau-col');
    if (column) {
      const pile = Number(column.dataset.tableau);
      if (destinations.tableau.includes(pile)) {
        return (
          drag.zones.find((zone) => zone.type === 'tableau' && zone.pile === pile) || {
            type: 'tableau',
            pile,
            element: column,
          }
        );
      }
    }
  }
  return null;
}

function distanceToZone(zone, x, y) {
  const dx = x < zone.left ? zone.left - x : x > zone.right ? x - zone.right : 0;
  const dy = y < zone.top ? zone.top - y : y > zone.bottom ? y - zone.bottom : 0;
  return Math.hypot(dx, dy);
}

function zoneTopCard(zone) {
  if (!zone) return null;
  if (zone.type === 'foundation') {
    return els.foundations[zone.pile].querySelector('.card') || null;
  }
  const column = esColumn(zone.pile);
  return column ? column.querySelector('.card:last-child') : null;
}

function setDragZone(zone) {
  if (!drag || drag.hoverZone === zone) return;
  if (drag.hoverEl) {
    drag.hoverEl.classList.remove('is-drag-over');
    drag.hoverCard?.classList.remove('is-drag-hover');
  }
  drag.hoverEl = null;
  drag.hoverCard = null;
  drag.hoverZone = null;
  if (!zone) {
    drag.ghost?.classList.remove('is-snapped');
    if (drag.validCount > 0) {
      setStatus('拖到金色发光位置 · 松手自动吸附');
    }
    return;
  }
  drag.hoverZone = zone;
  drag.lastValidZone = zone;
  drag.hoverEl = zone.element;
  drag.hoverCard = zoneTopCard(zone);
  zone.element.classList.add('is-drag-over');
  drag.hoverCard?.classList.add('is-drag-hover');
  drag.ghost?.classList.add('is-snapped');
  const target =
    zone.type === 'foundation'
      ? `${FOUNDATION_NAMES[FOUNDATION_SUITS[zone.pile]]}基础牌堆`
      : `第 ${zone.pile + 1} 列`;
  setStatus(`吸附 · 松手放入${target}`, true);
  haptic(3);
}

function scheduleDragFrame() {
  if (!drag?.active || drag.rafId) return;
  drag.rafId = requestAnimationFrame(() => {
    if (!drag?.active) return;
    drag.rafId = null;
    renderDragFrame();
  });
}

function renderDragFrame() {
  if (!drag?.active || !drag.ghost) return;
  const zone = findDropZone(drag.currentX, drag.currentY);
  // Magnetise the card horizontally over a valid column/ foundation. The
  // player still controls the vertical position, but the card visibly clicks
  // into the column before release.
  const left = zone ? zone.targetLeft : drag.currentX - drag.grabX;
  const top = drag.currentY - drag.grabY;
  const rotation = zone ? 0 : 0.7;
  drag.ghost.style.transform = `translate3d(${left}px, ${top}px, 0) rotate(${rotation}deg)`;
  setDragZone(zone);
}

function beginDrag(event, cardEl) {
  const source = readSourceFromCard(cardEl);
  if (!source || isLocked()) return;
  const cards = getSourceCards(state, source);
  if (cards.length === 0) return;

  selection = source;
  clearHint();
  syncSelectionUI();
  const rect = cardEl.getBoundingClientRect();
  const step = Math.min(
    Math.max(13, metrics.cardH * 0.2),
    cards.length > 1 ? (window.innerHeight * 0.62 - metrics.cardH) / (cards.length - 1) : 0,
  );
  const ghost = document.createElement('div');
  ghost.className = 'drag-stack';
  ghost.style.width = `${metrics.cardW}px`;
  ghost.style.height = `${metrics.cardH + Math.max(0, step) * (cards.length - 1)}px`;
  ghost.innerHTML = cards
    .map((id, index) =>
      faceCardMarkup(id, {
        source: null,
        interactive: false,
        extraClass: 'drag-card',
        style: `left:0;top:${index * step}px;`,
        zIndex: index + 1,
        decorative: true,
      }),
    )
    .join('');
  if (cards.length > 1) {
    const badge = document.createElement('span');
    badge.className = 'drag-stack__count';
    badge.textContent = String(cards.length);
    ghost.append(badge);
  }
  els.dragLayer.append(ghost);
  const sourceElements = cards
    .map((id) => document.querySelector(`.card[data-card-id="${id}"]`))
    .filter(Boolean);
  sourceElements.forEach((el) => el.classList.add('is-dragging-source'));

  const { zones, tableauTop, topRowTop, topRowBottom } = buildDropZones(source);
  drag = {
    pointerId: event.pointerId,
    source,
    cards,
    ghost,
    grabX: event.clientX - rect.left,
    grabY: event.clientY - rect.top,
    startX: event.clientX,
    startY: event.clientY,
    currentX: event.clientX,
    currentY: event.clientY,
    startRect: rect,
    zones,
    zonesTop: tableauTop,
    topRowTop,
    topRowBottom,
    validCount: zones.length,
    hoverZone: null,
    hoverEl: null,
    hoverCard: null,
    lastValidZone: null,
    rafId: null,
    active: true,
  };
  document.body.classList.add('is-dragging');
  setStatus(
    zones.length > 0
      ? '拖到金色发光位置 · 松手自动吸附'
      : '这张牌现在没有可放的位置',
    true,
  );
  renderDragFrame();
  soundEngine.play('pick');
  haptic(5);
}

function cleanupDrag({ restoreSelection = true } = {}) {
  if (drag?.rafId) cancelAnimationFrame(drag.rafId);
  window.clearTimeout(dragZonesTimer);
  dragZonesTimer = null;
  if (drag) setDragZone(null);
  if (drag?.ghost) drag.ghost.remove();
  $$('.is-dragging-source').forEach((el) => el.classList.remove('is-dragging-source'));
  document.body.classList.remove('is-dragging');
  drag = null;
  if (!restoreSelection) selection = null;
  syncSelectionUI();
  if (layoutDeferred) {
    layoutDeferred = false;
    scheduleLayout();
  }
}

function finishDrag(zone = null) {
  if (!drag) return;
  const { source, ghost } = drag;
  const targetZone = zone || drag.hoverZone;
  const ghostRects = new Map();
  if (ghost) {
    $$('.card[data-card-id]', ghost).forEach((el) => {
      ghostRects.set(el.dataset.cardId, el.getBoundingClientRect());
    });
  }
  suppressClicksUntil = performance.now() + 260;

  if (targetZone) {
    cleanupDrag({ restoreSelection: false });
    executeMove(
      source,
      { type: targetZone.type, pile: targetZone.pile },
      { animateFrom: ghostRects, fromDrag: true },
    );
    return;
  }

  const hadTargets = drag.validCount > 0;
  cleanupDrag({ restoreSelection: true });
  soundEngine.play('pick');
  setStatus(
    hadTargets
      ? '没有落在这里 · 拖到金色发光位置，或点选后点落点'
      : '这张牌现在没有可放的位置 · 换一张试试',
  );
  haptic(5);
}

function cancelDrag(announce = true) {
  if (!drag) return;
  cleanupDrag({ restoreSelection: true });
  suppressClicksUntil = performance.now() + 300;
  if (announce) setStatus('已放回原处');
}

function onPointerDown(event) {
  if (drag || isLocked()) return;
  clearAutoFinishTimer();
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  const activeDialog = document.querySelector('dialog[open]');
  if (activeDialog) return;
  const cardEl = event.target.closest?.('.card.is-interactive');
  if (!cardEl) return;
  const source = readSourceFromCard(cardEl);
  if (!source) return;
  const cards = getSourceCards(state, source);
  if (cards.length === 0) return;
  drag = {
    pointerId: event.pointerId,
    source,
    cards,
    ghost: null,
    startX: event.clientX,
    startY: event.clientY,
    currentX: event.clientX,
    currentY: event.clientY,
    grabX: 0,
    grabY: 0,
    startRect: null,
    pending: true,
    active: false,
  };
  // Window-level pointer listeners track the gesture. We deliberately avoid
  // explicit pointer capture here: iOS Safari is more reliable when the native
  // tap/click path is left untouched, and the listeners work without capture.
}

function sourceCardForCandidate(candidate) {
  return (
    document.querySelector(`.card[data-card-id="${candidate.cards[0]}"].is-interactive`) ||
    document.querySelector(
      `.card[data-src-type="${candidate.source.type}"][data-src-pile="${candidate.source.pile}"]`,
    )
  );
}

function tryStartDragFromCandidate(event) {
  if (!drag?.pending) return false;
  const hasCoords = Number.isFinite(event.clientX) && Number.isFinite(event.clientY);
  const isBlankCoordinate = event.clientX === 0 && event.clientY === 0;
  const x = hasCoords && !isBlankCoordinate ? event.clientX : drag.startX;
  const y = hasCoords && !isBlankCoordinate ? event.clientY : drag.startY;
  if (Math.hypot(x - drag.startX, y - drag.startY) < 7) return false;

  const candidate = drag;
  const card = sourceCardForCandidate(candidate);
  if (!card) {
    drag = null;
    return false;
  }
  candidate.pending = false;
  drag = null;
  beginDrag(
    {
      pointerId: candidate.pointerId,
      clientX: candidate.startX,
      clientY: candidate.startY,
    },
    card,
  );
  if (!drag?.active) return false;
  drag.currentX = x;
  drag.currentY = y;
  return true;
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (drag.pending && !tryStartDragFromCandidate(event)) return;
  if (!drag?.active) return;
  event.preventDefault();
  drag.currentX = event.clientX;
  drag.currentY = event.clientY;
  scheduleDragFrame();
}

function onPointerUp(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (drag.pending) {
    if (!tryStartDragFromCandidate(event)) {
      drag = null;
      return;
    }
  }
  if (!drag?.active) {
    drag = null;
    return;
  }
  if (drag.rafId) {
    cancelAnimationFrame(drag.rafId);
    drag.rafId = null;
  }
  const hasEventCoords = Number.isFinite(event.clientX) && Number.isFinite(event.clientY);
  const isBlankCoordinate = event.clientX === 0 && event.clientY === 0 && (drag.currentX !== 0 || drag.currentY !== 0);
  if (hasEventCoords && !isBlankCoordinate) {
    drag.currentX = event.clientX;
    drag.currentY = event.clientY;
  }
  renderDragFrame();

  let zone = drag.hoverZone;
  if (!zone) zone = findDropZoneFromPoint(drag.currentX, drag.currentY);
  if (!zone && drag.lastValidZone) {
    const tolerance = dragSnapTolerance();
    if (distanceToZone(drag.lastValidZone, drag.currentX, drag.currentY) <= tolerance) {
      zone = drag.lastValidZone;
    }
  }
  finishDrag(zone);
}

function onPointerCancel(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (drag.active) cancelDrag(false);
  else drag = null;
}

/* --------------------------------------------------------------------------
   Public event bindings
   -------------------------------------------------------------------------- */

function setupEventListeners() {
  els.stock.addEventListener('click', () => {
    if (performance.now() < suppressClicksUntil) return;
    drawStock();
  });

  els.undo.addEventListener('click', undo);
  els.hint.addEventListener('click', showHint);
  els.menu.addEventListener('click', openMenu);
  els.newGame.addEventListener('click', openNewGameDialog);
  els.autoFinish.addEventListener('click', runAutoFinish);

  els.newForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(els.newForm);
    const drawMode = Number(data.get('draw-mode')) || 1;
    const difficulty = normalizeDifficulty(data.get('difficulty'));
    els.newDialog.close();
    beginNewGame({ drawMode, difficulty, countPlayed: true });
  });

  $$('input[name="difficulty"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) updateDifficultyHint(input.value);
    });
  });

  els.winNewGame.addEventListener('click', () => {
    const mode = state.drawMode;
    const difficulty = state.difficulty || settings.difficulty;
    els.winDialog.close();
    stopConfetti();
    beginNewGame({ drawMode: mode, difficulty, countPlayed: true });
  });

  $$('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => {
      button.closest('dialog')?.close();
    });
  });

  $$('dialog').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  els.menuDialog.addEventListener('close', () => {
    resetArmed = false;
    resetRecordTimer && window.clearTimeout(resetRecordTimer);
    els.resetRecord.textContent = '清除记录';
  });

  els.winDialog.addEventListener('close', stopConfetti);

  $$('input[name="skin"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      applySkin(input.value, { announce: true });
      saveSettings();
    });
  });

  $$('input[name="sound-pack"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      applySoundPack(input.value, { preview: true });
      saveSettings();
    });
  });

  els.soundToggle.addEventListener('click', () => {
    settings.sound = !settings.sound;
    updateSoundToggle();
    saveSettings();
    if (settings.sound) {
      if (settings.soundPack === 'hakimi') {
        soundEngine.preloadHakimi().then(() => soundEngine.playHakimi('click'));
      } else {
        soundEngine.play('foundation');
      }
      haptic(8);
    }
  });

  els.rulesButton.addEventListener('click', () => {
    els.menuDialog.close();
    window.setTimeout(() => {
      els.rulesDialog.showModal();
    }, 70);
  });

  els.installButton.addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    try {
      await installPrompt.userChoice;
    } catch {
      // User dismissed the browser prompt.
    }
    installPrompt = null;
    els.installButton.hidden = true;
  });

  els.resetRecord.addEventListener('click', () => {
    if (!resetArmed) {
      resetArmed = true;
      els.resetRecord.textContent = '再次点击确认';
      resetRecordTimer = window.setTimeout(() => {
        resetArmed = false;
        els.resetRecord.textContent = '清除记录';
      }, 3500);
      return;
    }
    stats = defaultStats();
    saveStats();
    resetArmed = false;
    window.clearTimeout(resetRecordTimer);
    els.resetRecord.textContent = '清除记录';
    updateMenuStats();
    showToast('牌局纪录已清除');
  });

  document.addEventListener('click', (event) => {
    if (performance.now() < suppressClicksUntil) return;
    if (document.querySelector('dialog[open]')) return;
    const card = event.target.closest?.('.card.is-interactive');
    if (card) {
      handleCardTap(card);
      return;
    }
    const foundation = event.target.closest?.('.foundation');
    if (foundation) {
      if (!event.target.closest('.card')) {
        attemptTargetMove('foundation', Number(foundation.dataset.foundation), foundation);
      }
      return;
    }
    const column = event.target.closest?.('.tableau-col');
    if (column) {
      if (!event.target.closest('.card')) {
        attemptTargetMove('tableau', Number(column.dataset.tableau), column);
      }
    }
  });

  document.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);

  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', scheduleLayout);
  window.visualViewport?.addEventListener('resize', scheduleLayout);
  window.addEventListener('orientationchange', () => window.setTimeout(scheduleLayout, 180));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearAutoFinishTimer();
      if (drag) cancelDrag(false);
      pauseTimer();
      saveGame({ quiet: true });
    } else if (hasTimerStarted && !gameWon) {
      startTimer();
    }
  });

  window.addEventListener('blur', () => {
    if (drag) cancelDrag(false);
  });

  window.addEventListener('pagehide', () => {
    pauseTimer();
    saveGame({ quiet: true });
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    els.installButton.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    els.installButton.hidden = true;
    showToast('已安装到主屏幕');
  });
}

function onKeyDown(event) {
  if (drag?.active && event.key === 'Escape') {
    event.preventDefault();
    cancelDrag(false);
    return;
  }
  if (document.querySelector('dialog[open]')) return;
  const target = event.target;
  const tagName = target?.tagName?.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target?.isContentEditable) return;

  const card = target?.closest?.('.card.is-interactive');
  if (card && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    handleCardTap(card);
    return;
  }

  const emptyTarget = target?.closest?.('[data-foundation], .tableau-col');
  if (emptyTarget && (event.key === 'Enter' || event.key === ' ')) {
    const foundation = emptyTarget.closest('.foundation');
    if (foundation) {
      event.preventDefault();
      attemptTargetMove('foundation', Number(foundation.dataset.foundation), foundation);
      return;
    }
    const column = emptyTarget.closest('.tableau-col');
    if (column) {
      event.preventDefault();
      attemptTargetMove('tableau', Number(column.dataset.tableau), column);
      return;
    }
  }

  if (target?.closest?.('button') && (event.key === ' ' || event.key === 'Enter')) return;

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    undo();
    return;
  }

  if (event.metaKey || event.ctrlKey || event.altKey) return;

  switch (event.key) {
    case ' ':
      event.preventDefault();
      drawStock();
      break;
    case 'Escape':
      if (selection) {
        clearSelection();
      } else if (hint) {
        clearHint({ silent: false });
      }
      break;
    case 'u':
    case 'U':
      undo();
      break;
    case 'h':
    case 'H':
      showHint();
      break;
    case 'n':
    case 'N':
      openNewGameDialog();
      break;
    default:
      break;
  }
}

/* --------------------------------------------------------------------------
   Service worker and boot
   -------------------------------------------------------------------------- */

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!/^https?:$/.test(window.location.protocol)) return;
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

function boot() {
  loadSettings();
  stats = loadStats();
  applySkin(settings.skin);
  applySoundPack(settings.soundPack);
  updateSoundToggle();

  const saved = loadSavedGame();
  setupEventListeners();
  updateMetrics();

  if (saved) {
    state = { ...saved.state, difficulty: normalizeDifficulty(saved.state.difficulty) };
    elapsedMs = saved.elapsedMs;
    hasTimerStarted = saved.hasTimerStarted;
    gameWon = false;
    render();
    setStatus('已恢复上次牌局 · 继续慢慢来');
    updateMenuStats();
    refreshAutoFinish();
    updateTimeDisplay();
    if (hasTimerStarted && state.moves > 0) {
      window.setTimeout(() => {
        if (!document.hidden) startTimer();
      }, 300);
    }
  } else {
    beginNewGame({
      drawMode: settings.drawMode,
      difficulty: settings.difficulty,
      countPlayed: true,
    });
    setStatus(DEFAULT_STATUS);
  }

  updateMenuStats();
  registerServiceWorker();

}

boot();
