(() => {
'use strict';

// ============================================================================
// CONSTANTES & CONFIGURAÇÕES MATEMÁTICAS
// ============================================================================
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rectOverlap = (a, b) => (
  a.x < b.x + b.w && b.x < a.x + a.w &&
  a.y < b.y + b.h && b.y < a.y + a.h
);

// Resolução virtual estável em proporção clássica 4:3 / 16:9 compatível
const VH = 720;
const ROOM_WIDTH = 960;
const TOTAL_ROOMS = 3;
const LEVEL_WIDTH = ROOM_WIDTH * TOTAL_ROOMS; // 2880px no total (3 quadros)

let VW = 960;
let S = 1;
let DPR = 1, CW = 0, CH = 0;
let US = 1, UW = 960, UH = 720;
let PORTRAIT = false;
let TOUCH_MODE = false;
const TOUCH_OVERRIDE = typeof window !== 'undefined' && window.location ? new URLSearchParams(window.location.search).get('touch') === '1' : false;

// ============================================================================
// TEMAS VISUAIS E ESTRUTURAIS POR FASE (ROTAÇÃO RETRÔ ACTIVISION ATARI)
// ============================================================================
const PHASE_THEMES = [
  {
    round: 1,
    name: 'CATEDRAL CLÁSSICA',
    subname: 'Lojas Tradicionais · Harry no 1º Andar',
    hint: 'USE A ESCADA ROLANTE OU O ELEVADOR CENTRAL PARA SUBIR!',
    wallColor: '#1b4332',
    roofColor: '#525252',
    beamColor: '#d4af37',
    beamHighlight: '#fef08a',
    beamShadow: '#854d0e',
    storeColor: '#1d4ed8',
    storeHighlight: '#93c5fd',
    storeShadow: '#1e3a8a',
    sunsetColors: ['#4c1d95', '#86198f', '#be185d', '#e11d48', '#ea580c', '#eab308'],
    itemType: 'money',
    itemName: 'Maletas de Dinheiro'
  },
  {
    round: 2,
    name: 'GALERIA IMPERIAL',
    subname: 'Harry Escapou para o 2º Andar!',
    hint: 'CORTE CAMINHO PELO ELEVADOR NO CENTRO DA LOJA!',
    wallColor: '#0f172a',
    roofColor: '#334155',
    beamColor: '#38bdf8',
    beamHighlight: '#bae6fd',
    beamShadow: '#0369a1',
    storeColor: '#334155',
    storeHighlight: '#94a3b8',
    storeShadow: '#1e293b',
    sunsetColors: ['#0284c7', '#0369a1', '#075985', '#0c4a6e', '#1e293b', '#38bdf8'],
    itemType: 'gold',
    itemName: 'Barras de Ouro 999'
  },
  {
    round: 3,
    name: 'PALÁCIO CARMESIM',
    subname: 'Harry Rumo à Escada do 3º Andar!',
    hint: 'CUIDADO: NOVAS FOGUEIRAS E CARRINHOS EM ALTA VELOCIDADE!',
    wallColor: '#450a0a',
    roofColor: '#57534e',
    beamColor: '#f59e0b',
    beamHighlight: '#fde68a',
    beamShadow: '#92400e',
    storeColor: '#831843',
    storeHighlight: '#f472b6',
    storeShadow: '#500724',
    sunsetColors: ['#881337', '#9f1239', '#be123c', '#e11d48', '#fb7185', '#fda4af'],
    itemType: 'diamond',
    itemName: 'Diamantes Lapidados'
  },
  {
    round: 4,
    name: 'TORRE ESMERALDA',
    subname: 'Harry Invadiu o 3º Andar!',
    hint: 'INTERCEPTAÇÃO CRÍTICA ANTES QUE ELE ALCANCE O TELHADO!',
    wallColor: '#064e3b',
    roofColor: '#3f3f46',
    beamColor: '#e2e8f0',
    beamHighlight: '#ffffff',
    beamShadow: '#64748b',
    storeColor: '#065f46',
    storeHighlight: '#34d399',
    storeShadow: '#022c22',
    sunsetColors: ['#064e3b', '#047857', '#059669', '#10b981', '#34d399', '#6ee7b7'],
    itemType: 'crown',
    itemName: 'Coroas Imperiais'
  },
  {
    round: 5,
    name: 'PRAÇA OBSIDIANA',
    subname: 'Alerta Máximo: Harry Próximo ao Telhado!',
    hint: 'BIPLANOS RASANTES NO TELHADO E VELOCIDADE MÁXIMA!',
    wallColor: '#18181b',
    roofColor: '#262626',
    beamColor: '#e11d48',
    beamHighlight: '#fecdd3',
    beamShadow: '#881337',
    storeColor: '#27272a',
    storeHighlight: '#fbbf24',
    storeShadow: '#09090b',
    sunsetColors: ['#3b0764', '#581c87', '#7e22ce', '#a855f7', '#d8b4fe', '#fdf4ff'],
    itemType: 'trophy',
    itemName: 'Troféus de Ouro Puro'
  }
];

function getCurrentTheme() {
  const idx = (Math.max(1, ROUND) - 1) % PHASE_THEMES.length;
  return PHASE_THEMES[idx];
}

// 4 ANDARES FIXOS NA TELA (PADRÃO AUTÊNTICO ATARI KEYSTONE KAPERS)
// Telhado no topo, 3 andares comerciais abaixo, e radar no rodapé
const FLOORS = [
  { id: 1, name: '1º ANDAR', floorY: 610, ceilingY: 492, color: '#1b4332' },
  { id: 2, name: '2º ANDAR', floorY: 480, ceilingY: 362, color: '#1b4332' },
  { id: 3, name: '3º ANDAR', floorY: 350, ceilingY: 232, color: '#1b4332' },
  { id: 4, name: 'TELHADO',  floorY: 220, ceilingY: 105, color: '#525252' }
];

// ============================================================================
// SÍNTESE DE ÁUDIO PROCEDURAL (CHIP TIA ATARI 2600)
// ============================================================================
let AC = null;
let masterGain = null;
let MUTED = false;
let STEP_FOOT = 0;

function initAudio() {
  if (AC) {
    if (AC.state === 'suspended') AC.resume().catch(() => {});
    return;
  }
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;
  AC = new Ctor();
  masterGain = AC.createGain();
  masterGain.gain.value = MUTED ? 0 : 0.75;
  masterGain.connect(AC.destination);
  if (AC.state === 'suspended') AC.resume().catch(() => {});
}

function tone(freq, dur, type = 'square', vol = 0.15, freqTo = null) {
  if (!AC || MUTED) return;
  try {
    const t = AC.currentTime;
    const osc = AC.createOscillator();
    const g = AC.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch (e) {}
}

let noiseBuffer = null;
function noiseHit(dur, freq = 600, vol = 0.12) {
  if (!AC || MUTED) return;
  try {
    if (!noiseBuffer) {
      const len = Math.max(1, Math.floor(AC.sampleRate * 0.5));
      noiseBuffer = AC.createBuffer(1, len, AC.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }

    const t = AC.currentTime;
    const src = AC.createBufferSource();
    src.buffer = noiseBuffer;
    const flt = AC.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = freq;
    const g = AC.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(masterGain);
    src.start(t);
    if (typeof src.stop === 'function') src.stop(t + dur + 0.01);
  } catch (e) {}
}

const SFX = {
  jump() { tone(140, 0.14, 'square', 0.16, 360); },
  duck() { tone(180, 0.07, 'sawtooth', 0.09, 90); },
  step() {
    if (!AC || MUTED) return;
    try {
      const t = AC.currentTime;
      // Tom único clássico retrô estilo chip TIA (Atari 2600 Keystone Kapers):
      // Clique percussivo oco e uniforme ("toc") em tom único em todos os passos
      const osc = AC.createOscillator();
      const g = AC.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(500, t);
      osc.frequency.exponentialRampToValueAtTime(185, t + 0.024);

      g.gain.setValueAtTime(0.28, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.026);

      osc.connect(g);
      g.connect(masterGain);
      osc.start(t);
      osc.stop(t + 0.028);

      // Micro estalo percussivo de solado no chão
      noiseHit(0.006, 2400, 0.11);
    } catch (e) {}
  },
  ballBounce() {
    tone(170, 0.05, 'triangle', 0.22, 75);
    noiseHit(0.04, 380, 0.12);
  },
  ding() { tone(1046.5, 0.35, 'sine', 0.24, 1046.5); },
  whistle() {
    tone(1200, 0.12, 'square', 0.2, 1600);
    setTimeout(() => tone(1500, 0.16, 'square', 0.22, 1100), 120);
  },
  trip() {
    tone(190, 0.28, 'sawtooth', 0.24, 45);
    noiseHit(0.2, 280, 0.2);
  },
  fire() {
    tone(220, 0.22, 'sawtooth', 0.22, 60);
    noiseHit(0.24, 700, 0.22);
  },
  plane() { tone(110, 0.09, 'sawtooth', 0.06, 125); },
  collect() {
    tone(523, 0.08, 'sine', 0.18);
    setTimeout(() => tone(659, 0.08, 'sine', 0.18), 70);
    setTimeout(() => tone(784, 0.12, 'sine', 0.22), 140);
  },
  triumph() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => {
      setTimeout(() => tone(n, 0.22, 'square', 0.2), i * 110);
    });
  },
  tick() { tone(880, 0.03, 'triangle', 0.1); },
  urgentTick() { tone(960, 0.07, 'square', 0.22, 480); },
  escaped() {
    tone(260, 0.2, 'sawtooth', 0.25, 130);
    setTimeout(() => tone(180, 0.35, 'sawtooth', 0.25, 65), 180);
  },
  flip() {
    tone(400, 0.04, 'square', 0.08, 200);
  },
  phaseFanfare() {
    const notes = [330, 440, 554.37, 659.25];
    notes.forEach((n, i) => {
      setTimeout(() => tone(n, 0.14, 'square', 0.18), i * 90);
    });
  }
};

// ============================================================================
// ELEMENTOS DO DOM & REDIMENSIONAMENTO RESPONSIVO
// ============================================================================
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const crtOverlay = document.getElementById('crt-overlay');
const scoreModal = document.getElementById('score-modal');
const scoreDisplay = document.getElementById('score-display');
const statsDisplay = document.getElementById('stats-display');
const playerNameInput = document.getElementById('player-name');
const btnSaveScore = document.getElementById('btn-save-score');
const btnViewRanking = document.getElementById('btn-view-ranking');
const btnRestart = document.getElementById('btn-restart');
const rankingContainer = document.getElementById('ranking-container');
const rankingBody = document.getElementById('ranking-body');
const modalFeedback = document.getElementById('modal-feedback');

let CRT_ENABLED = true;

function isFullscreen() {
  if (typeof document === 'undefined') return false;
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );
}

function toggleFullscreen() {
  if (typeof document === 'undefined') return;
  const doc = document;
  const el = doc.documentElement || doc.body;
  if (!el) return;
  const request = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
  const exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;

  if (!isFullscreen()) {
    if (request) {
      try {
        const p = request.call(el);
        if (p && p.catch) p.catch(() => {});
      } catch (e) {}
    }
  } else {
    if (exit) {
      try {
        const p = exit.call(doc);
        if (p && p.catch) p.catch(() => {});
      } catch (e) {}
    }
  }
}

function detectTouch() {
  return (
    TOUCH_OVERRIDE ||
    (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 && window.matchMedia && window.matchMedia('(hover: none)').matches)
  );
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  const vp = window.visualViewport;
  CW = Math.round(vp ? vp.width : window.innerWidth);
  CH = Math.round(vp ? vp.height : window.innerHeight);

  cv.style.width = CW + 'px';
  cv.style.height = CH + 'px';
  cv.width = Math.floor(CW * DPR);
  cv.height = Math.floor(CH * DPR);

  TOUCH_MODE = detectTouch();
  PORTRAIT = TOUCH_MODE && CH > CW;
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.toggle('portrait', PORTRAIT);
    document.body.classList.toggle('touch-device', TOUCH_MODE);
  }

  // Escala mantendo o quadro exatamente no padrão 960x720
  S = Math.min(CW / ROOM_WIDTH, CH / VH);
  VW = ROOM_WIDTH;

  // Escala de tela cheia para controles virtuais e HUD móvel
  US = Math.max(S, 0.72);
  UW = CW / US;
  UH = CH / US;

  if (PORTRAIT) {
    releaseTouches();
  }
}

window.addEventListener('resize', () => requestAnimationFrame(resize));
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => requestAnimationFrame(resize));
window.addEventListener('orientationchange', () => {
  setTimeout(resize, 150);
  setTimeout(resize, 400);
});
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('fullscreenchange', () => setTimeout(resize, 100));
  document.addEventListener('webkitfullscreenchange', () => setTimeout(resize, 100));
}

// ============================================================================
// ENTRADAS (TECLADO, GAMEPAD & TOUCHSCREEN)
// ============================================================================
const KEYS = Object.create(null);
const PREV_KEYS = Object.create(null);
const TOUCHES = new Map();

function keyPressed(code) {
  return !PREV_KEYS[code] && !!KEYS[code];
}

window.addEventListener('keydown', e => {
  initAudio();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
  }
  KEYS[e.code] = true;

  if (e.code === 'KeyC') {
    CRT_ENABLED = !CRT_ENABLED;
    if (crtOverlay) crtOverlay.classList.toggle('disabled', !CRT_ENABLED);
  }
  if (e.code === 'KeyM') {
    MUTED = !MUTED;
    if (masterGain) masterGain.gain.value = MUTED ? 0 : 0.75;
  }
  if (e.code === 'KeyF') {
    toggleFullscreen();
  }
});

window.addEventListener('keyup', e => {
  KEYS[e.code] = false;
});

function getTouchZones() {
  const W = UW;
  const H = UH;
  return [
    // Controles direcionais (Polegar Esquerdo)
    { id: 'left', code: 'ArrowLeft', x: 80, y: H - 90, vr: 34, r: 52, label: '◄', sublabel: 'ESQ' },
    { id: 'right', code: 'ArrowRight', x: 190, y: H - 90, vr: 34, r: 52, label: '►', sublabel: 'DIR' },
    { id: 'duck', code: 'ArrowDown', x: 135, y: H - 35, vr: 26, r: 42, label: '▼', sublabel: 'ABAIXAR' },

    // Botões de Ação (Polegar Direito)
    { id: 'jump', code: 'Space', x: W - 85, y: H - 100, vr: 42, r: 58, label: 'PULO', sublabel: '▲' },
    { id: 'action', code: 'KeyE', x: W - 195, y: H - 88, vr: 34, r: 48, label: 'ELEV', sublabel: 'E' },

    // Botões Utilitários no Topo
    { id: 'fullscreen', code: 'Fullscreen', x: W - 155, y: 38, vr: 22, r: 32, label: '⛶', sublabel: 'TELA' },
    { id: 'crt', code: 'KeyC', x: W - 100, y: 38, vr: 22, r: 30, label: 'CRT', sublabel: 'FILTRO' },
    { id: 'mute', code: 'KeyM', x: W - 45, y: 38, vr: 22, r: 30, label: MUTED ? '🔇' : '🔊', sublabel: 'SOM' }
  ];
}

function getTitleButtons() {
  const w = 260;
  return {
    play: { x: UW / 2 - w / 2, y: UH * 0.65, w: w, h: 54 },
    fullscreen: { x: UW / 2 - w / 2, y: UH * 0.75, w: w, h: 44 },
    touchToggle: { x: UW / 2 - w / 2, y: UH * 0.84, w: w, h: 38 }
  };
}

function canvasPoint(e) {
  const rect = cv.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / US,
    y: (e.clientY - rect.top) / US
  };
}

function pointInZone(p, z) {
  const dx = p.x - z.x;
  const dy = p.y - z.y;
  return dx * dx + dy * dy <= z.r * z.r;
}

function pointInRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function releaseTouch(id) {
  const code = TOUCHES.get(id);
  TOUCHES.delete(id);
  if (code && !Array.from(TOUCHES.values()).includes(code)) {
    KEYS[code] = false;
  }
}

function releaseTouches() {
  for (const code of TOUCHES.values()) {
    if (code) KEYS[code] = false;
  }
  TOUCHES.clear();
}

function updateTouch(id, code) {
  const old = TOUCHES.get(id) || '';
  if (TOUCHES.has(id) && old === code) return;
  TOUCHES.set(id, code);
  if (old && old !== code) {
    if (!Array.from(TOUCHES.values()).includes(old)) {
      KEYS[old] = false;
    }
  }
  if (code) {
    KEYS[code] = true;
  }
}

function handlePointerDown(e) {
  initAudio();
  if (e.pointerType === 'touch') {
    TOUCH_MODE = true;
  }
  if (PORTRAIT) return;

  const p = canvasPoint(e);

  if (STATE === 'title') {
    const btns = getTitleButtons();
    if (pointInRect(p, btns.fullscreen)) {
      toggleFullscreen();
      SFX.ding();
      return;
    }
    if (pointInRect(p, btns.touchToggle)) {
      TOUCH_MODE = !TOUCH_MODE;
      SFX.click();
      return;
    }
    // Tocar em JOGAR ou em qualquer outro ponto da tela inicia a partida
    STATE = 'play';
    resetGame();
    releaseTouches();
    return;
  }

  // Checar botões utilitários no topo
  const zones = getTouchZones();
  const utilityZone = zones.find(z => ['fullscreen', 'crt', 'mute'].includes(z.id) && pointInZone(p, z));
  if (utilityZone) {
    if (utilityZone.id === 'fullscreen') {
      toggleFullscreen();
      SFX.ding();
    } else if (utilityZone.id === 'crt') {
      CRT_ENABLED = !CRT_ENABLED;
      if (crtOverlay) crtOverlay.classList.toggle('disabled', !CRT_ENABLED);
      SFX.click();
    } else if (utilityZone.id === 'mute') {
      MUTED = !MUTED;
      if (masterGain) masterGain.gain.value = MUTED ? 0 : 0.75;
      SFX.click();
    }
    return;
  }

  if (STATE === 'caught') {
    ROUND++;
    STATE = 'play';
    initRound();
    releaseTouches();
    return;
  }

  if (STATE === 'escaped') {
    if (LIVES > 0) {
      STATE = 'play';
      initRound();
    }
    releaseTouches();
    return;
  }

  // Controles virtuais durante o gameplay
  const gameZone = zones.find(z => !['fullscreen', 'crt', 'mute'].includes(z.id) && pointInZone(p, z));
  if (gameZone) {
    updateTouch(e.pointerId, gameZone.code);
  }
}

function handlePointerMove(e) {
  if (!TOUCHES.has(e.pointerId)) return;
  const p = canvasPoint(e);
  const zones = getTouchZones();
  const gameZone = zones.find(z => !['fullscreen', 'crt', 'mute'].includes(z.id) && pointInZone(p, z));
  updateTouch(e.pointerId, gameZone ? gameZone.code : '');
}

function handlePointerUp(e) {
  releaseTouch(e.pointerId);
}

cv.addEventListener('pointerdown', e => { if (e.cancelable) e.preventDefault(); handlePointerDown(e); }, { passive: false });
cv.addEventListener('pointermove', e => { handlePointerMove(e); }, { passive: false });
cv.addEventListener('pointerup', e => { handlePointerUp(e); });
cv.addEventListener('pointercancel', e => { handlePointerUp(e); });

function pollGamepad() {
  const gp = navigator.getGamepads ? navigator.getGamepads()[0] : null;
  if (!gp) return;
  KEYS['ArrowLeft'] = KEYS['ArrowLeft'] || gp.axes[0] < -0.3 || (gp.buttons[14] && gp.buttons[14].pressed);
  KEYS['ArrowRight'] = KEYS['ArrowRight'] || gp.axes[0] > 0.3 || (gp.buttons[15] && gp.buttons[15].pressed);
  KEYS['ArrowDown'] = KEYS['ArrowDown'] || gp.axes[1] > 0.4 || (gp.buttons[13] && gp.buttons[13].pressed) || (gp.buttons[1] && gp.buttons[1].pressed);
  KEYS['Space'] = KEYS['Space'] || (gp.buttons[0] && gp.buttons[0].pressed);
  KEYS['KeyE'] = KEYS['KeyE'] || (gp.buttons[2] && gp.buttons[2].pressed) || (gp.buttons[3] && gp.buttons[3].pressed);
}

// ============================================================================
// MODELAGEM E ENTIDADES DO JOGO
// ============================================================================
let STATE = 'title'; // 'title' | 'play' | 'caught' | 'escaped' | 'gameover'
let ROUND = 1;
let SCORE = 0;
let HIGH_SCORE = Number(localStorage.getItem('pega_ladrao_highscore') || 0);
let LIVES = 3;
let TIMER = 50.0;
let STATE_TIME = 0;
let GAME_TIME = 0;
let CURRENT_SESSION = null;

// Gestor do Quadro Atual (0: Esquerda, 1: Centro, 2: Direita)
let CURRENT_ROOM = 0;

// Efeitos Visuais & Banners de Fase
let ROUND_BANNER_TIMER = 0;
let SCORE_POPUPS = [];

// Policial Keystone Kelly
const PLAYER = {
  x: 120,
  y: 610,
  floor: 1,
  vx: 0,
  vy: 0,
  w: 36,
  h: 56,
  facing: 1,
  onGround: true,
  isDucking: false,
  inElevator: false,
  elevCooldown: 0,
  enteredWithKey: null,
  onEscalator: false,
  stunnedTime: 0,
  invincibleTime: 0,
  stepAnim: 0,
  stepDist: 0
};

// Ladrão Harry Hooligan
const THIEF = {
  x: 750,
  y: 610,
  floor: 1,
  vx: 0,
  vy: 0,
  w: 34,
  h: 54,
  facing: 1,
  stepAnim: 0
};

// Elevador Central (Localizado no Quadro 1 - Centro da loja: x = 1440)
const ELEVATOR = {
  x: 1400,
  w: 110,
  h: 75,
  currentFloor: 1,
  targetFloor: 2,
  y: 610 - 70,
  state: 'open', // 'open' | 'closing' | 'moving' | 'opening'
  doorOpen: 1.0,
  timer: 3.0,
  direction: 1
};

// Escadas Rolantes posicionadas nos quadros das pontas
const ESCALATORS = [
  // Do 1º para o 2º Andar: no Quadro 2 (Direita: x de 2620 a 2820)
  { fromFloor: 1, toFloor: 2, x1: 2620, x2: 2830, y1: 610, y2: 480, dir: 1, speed: 90 },
  // Do 2º para o 3º Andar: no Quadro 0 (Esquerda: x de 260 a 50)
  { fromFloor: 2, toFloor: 3, x1: 260, x2: 50, y1: 480, y2: 350, dir: -1, speed: 90 },
  // Do 3º para o Telhado (4): no Quadro 2 (Direita: x de 2620 a 2830)
  { fromFloor: 3, toFloor: 4, x1: 2620, x2: 2830, y1: 350, y2: 220, dir: 1, speed: 90 }
];

// ============================================================================
// VITRINES E LOJAS 2.5D DA CATHEDRAL DEPARTMENT STORE (KEYSTONE KAPERS)
// Cada andar e quadro possui uma distribuição assimétrica e lojas únicas!
// ============================================================================
const STOREFRONTS = [
  // ==================== QUADRO 0 (ESQUERDA: x = 0 a 960) ====================
  // 1º Andar: 3 lojas (iniciando em x=135 bem em frente a onde Kelly começa)
  { floor: 1, x: 135, w: 86, h: 44, label: 'CHAPÉUS', tagColor: '#38bdf8' },
  { floor: 1, x: 510, w: 90, h: 44, label: 'JOIAS',   tagColor: '#facc15' },
  { floor: 1, x: 770, w: 86, h: 44, label: 'MODA',    tagColor: '#f472b6' },

  // 2º Andar: 3 lojas após a escada rolante (área x de 50 a 260 é escada)
  { floor: 2, x: 420, w: 88, h: 44, label: 'LIVROS',  tagColor: '#4ade80' },
  { floor: 2, x: 640, w: 90, h: 44, label: 'DISCOS',  tagColor: '#a78bfa' },
  { floor: 2, x: 830, w: 84, h: 44, label: 'CÂMERAS', tagColor: '#fb923c' },

  // 3º Andar: 2 lojas espaçadas (amplo vão central, idêntico ao original Atari!)
  { floor: 3, x: 340, w: 92, h: 44, label: 'BRINQUEDOS', tagColor: '#facc15' },
  { floor: 3, x: 750, w: 88, h: 44, label: 'RELÓGIOS',   tagColor: '#38bdf8' },

  // ==================== QUADRO 1 (CENTRO: x = 960 a 1920) ====================
  // Elevador central fica em x = 1400 a 1510 (x_rel = 440 a 550)
  // 1º Andar: 2 lojas laterais
  { floor: 1, x: 1180, w: 88, h: 44, label: 'TERNOS',    tagColor: '#93c5fd' },
  { floor: 1, x: 1660, w: 90, h: 44, label: 'SAPATOS',   tagColor: '#fb923c' },

  // 2º Andar: 3 lojas (duas à esquerda do elevador e uma à direita)
  { floor: 2, x: 1060, w: 86, h: 44, label: 'ÓTICA',     tagColor: '#38bdf8' },
  { floor: 2, x: 1240, w: 86, h: 44, label: 'PERFUMES',  tagColor: '#f472b6' },
  { floor: 2, x: 1740, w: 88, h: 44, label: 'ESPORTES',  tagColor: '#4ade80' },

  // 3º Andar: 2 lojas clássicas Atari ao lado do poço do elevador
  { floor: 3, x: 1100, w: 92, h: 44, label: 'SOM RETRÔ', tagColor: '#a78bfa' },
  { floor: 3, x: 1720, w: 90, h: 44, label: 'ELETRÔNICA', tagColor: '#facc15' },

  // ==================== QUADRO 2 (DIREITA: x = 1920 a 2880) ==================
  // Escadas rolantes nos andares 1 e 3 ficam em x = 2620 a 2830 (x_rel = 700 a 910)
  // 1º Andar: 2 lojas antes da subida da escada
  { floor: 1, x: 2140, w: 88, h: 44, label: 'BOLSAS',    tagColor: '#f472b6' },
  { floor: 1, x: 2380, w: 90, h: 44, label: 'DOCES',     tagColor: '#fb923c' },

  // 2º Andar: 3 lojas antes do desembarque da escada
  { floor: 2, x: 2020, w: 86, h: 44, label: 'GAMES',     tagColor: '#facc15' },
  { floor: 2, x: 2240, w: 88, h: 44, label: 'REVISTAS',  tagColor: '#38bdf8' },
  { floor: 2, x: 2460, w: 86, h: 44, label: 'PRESENTES', tagColor: '#4ade80' },

  // 3º Andar: 2 lojas antes da escada do telhado
  { floor: 3, x: 2060, w: 90, h: 44, label: 'QUADROS',   tagColor: '#a78bfa' },
  { floor: 3, x: 2420, w: 88, h: 44, label: 'MALAS',     tagColor: '#93c5fd' }
];

// Obstáculos & Coletáveis Dinâmicos
let CARTS = [];
let BALLS = [];
let PLANES = [];
let FIRES = [];
let COLLECTIBLES = [];

function resetGame() {
  ROUND = 1;
  SCORE = 0;
  LIVES = 3;
  initRound();
}

function initRound() {
  TIMER = Math.max(35, 52 - ROUND * 2);
  STATE_TIME = 0;
  CURRENT_ROOM = 0;
  ROUND_BANNER_TIMER = 2.4;
  SCORE_POPUPS = [];

  const theme = getCurrentTheme();

  // Atualiza paleta dos andares dinamicamente pelo tema da fase
  FLOORS[0].color = theme.wallColor;
  FLOORS[1].color = theme.wallColor;
  FLOORS[2].color = theme.wallColor;
  FLOORS[3].color = theme.roofColor;

  // Reposiciona Policial no início do 1º Andar
  PLAYER.x = 120;
  PLAYER.floor = 1;
  PLAYER.y = 610;
  PLAYER.vx = 0;
  PLAYER.vy = 0;
  PLAYER.facing = 1;
  PLAYER.inElevator = false;
  PLAYER.elevCooldown = 0;
  PLAYER.enteredWithKey = null;
  PLAYER.onEscalator = false;
  PLAYER.isDucking = false;
  PLAYER.stunnedTime = 0;
  PLAYER.invincibleTime = 0;
  PLAYER.stepDist = 0;

  // Reposiciona Ladrão com base na progressão da Fase (Harry ganha vantagem crescente!)
  if (ROUND === 1) {
    // Fase 1: Harry começa no 1º Andar, Quadro 1 à frente
    THIEF.floor = 1;
    THIEF.x = 1100;
    THIEF.y = 610;
    THIEF.facing = 1;
  } else if (ROUND === 2) {
    // Fase 2: Harry já subiu para o 2º Andar, Quadro 1, correndo para a escada do 3º andar à esquerda
    THIEF.floor = 2;
    THIEF.x = 1200;
    THIEF.y = 480;
    THIEF.facing = -1;
  } else if (ROUND === 3) {
    // Fase 3: Harry já está no 2º Andar perto da escada para o 3º Andar (Quadro 0: x=650)
    THIEF.floor = 2;
    THIEF.x = 650;
    THIEF.y = 480;
    THIEF.facing = -1;
  } else if (ROUND === 4) {
    // Fase 4: Harry já invadiu o 3º Andar (Quadro 1: x=1100), correndo para a escada do telhado
    THIEF.floor = 3;
    THIEF.x = 1100;
    THIEF.y = 350;
    THIEF.facing = 1;
  } else {
    // Fase 5+: Harry começa avançado no 3º Andar próximo ao telhado
    THIEF.floor = 3;
    THIEF.x = 2100;
    THIEF.y = 350;
    THIEF.facing = 1;
  }
  THIEF.vx = 0;

  // Elevador no Quadro 1 (Centro)
  ELEVATOR.currentFloor = 1;
  ELEVATOR.y = 610 - 70;
  ELEVATOR.state = 'open';
  ELEVATOR.doorOpen = 1.0;
  ELEVATOR.timer = 2.5;
  ELEVATOR.direction = 1;

  // Carrinhos de compras com velocidade e posições escalonadas por fase
  const baseCartSpeed = -110 - ROUND * 12;
  CARTS = [
    // 1º Andar: Sempre 1 carrinho distante em x=860 (Quadro 0) e 1 no Quadro 2 (x=2600)
    // Mantém o início da rodada 100% seguro contra atropelamento imediato
    { x: 860, floor: 1, speed: baseCartSpeed, w: 44, h: 36, wheelRot: 0 },
    { x: 2600, floor: 1, speed: baseCartSpeed - 10, w: 44, h: 36, wheelRot: 0 },

    // 2º Andar: 1 carrinho no Quadro 0 e 1 no Quadro 2
    { x: 700, floor: 2, speed: baseCartSpeed - 15, w: 44, h: 36, wheelRot: 0 },
    { x: 2450, floor: 2, speed: baseCartSpeed - 20, w: 44, h: 36, wheelRot: 0 },

    // 3º Andar: 1 carrinho no Quadro 1
    { x: 1600, floor: 3, speed: baseCartSpeed - 25, w: 44, h: 36, wheelRot: 0 }
  ];

  if (ROUND >= 3) {
    // A partir da Fase 3: Adiciona mais um carrinho no 3º Andar
    CARTS.push({ x: 2350, floor: 3, speed: baseCartSpeed - 25, w: 44, h: 36, wheelRot: 0 });
  }

  // Bolas saltitantes com alturas e velocidades que aumentam por fase
  const ballPeak = 65 + Math.min(28, (ROUND - 1) * 7);
  const ballSpeed = -100 - (ROUND - 1) * 12;
  BALLS = [
    // 1º Andar: NENHUMA bola no Quadro 0 no início! Apenas no Quadro 1 (x=1750)
    { x: 1750, floor: 1, vx: ballSpeed, r: 18, peakH: ballPeak, bounceT: 0 },

    // 2º Andar: 1 bola no Quadro 1 (x=1650)
    { x: 1650, floor: 2, vx: ballSpeed - 10, r: 18, peakH: ballPeak + 10, bounceT: 0.5 },

    // 3º Andar: 1 bola no Quadro 0 (x=780)
    { x: 780, floor: 3, vx: ballSpeed - 20, r: 18, peakH: ballPeak + 15, bounceT: 0.2 }
  ];

  if (ROUND >= 4) {
    // Fase 4+: Bola adicional no 2º Andar no Quadro 2
    BALLS.push({ x: 2500, floor: 2, vx: ballSpeed - 15, r: 18, peakH: ballPeak + 12, bounceT: 0.8 });
  }

  // Fogueiras distribuídas com novos focos a cada fase (hitbox balanceada para salto justo)
  FIRES = [
    { x: 1200, floor: 2, w: 26, h: 26, anim: 0 },
    { x: 2350, floor: 3, w: 26, h: 26, anim: 0.5 },
    { x: 1500, floor: 4, w: 26, h: 26, anim: 0.2 }
  ];

  if (ROUND >= 2) {
    // Fase 2+: Nova fogueira no 1º Andar (Quadro 2: x=2100)
    FIRES.push({ x: 2100, floor: 1, w: 26, h: 26, anim: 0.3 });
  }
  if (ROUND >= 3) {
    // Fase 3+: Fogueira extra no 3º Andar
    FIRES.push({ x: 1750, floor: 3, w: 26, h: 26, anim: 0.7 });
  }

  // Aviões no telhado: 2 aviões na fase 1-2, 3 aviões a partir da fase 3
  const planeSpeed = -185 - ROUND * 20;
  PLANES = [
    { x: 2200, floor: 4, y: 220 - 45, speed: planeSpeed, w: 54, h: 26, propAngle: 0 },
    { x: 3400, floor: 4, y: 220 - 45, speed: planeSpeed - 15, w: 54, h: 26, propAngle: 0 }
  ];
  if (ROUND >= 3) {
    PLANES.push({ x: 4600, floor: 4, y: 220 - 45, speed: planeSpeed - 25, w: 54, h: 26, propAngle: 0 });
  }

  // Coletáveis temáticos exclusivos com valores progressivos
  const itemType = theme.itemType; // 'money' | 'gold' | 'diamond' | 'crown' | 'trophy'
  const mult = ROUND;
  const clockBonus = Math.min(10, 5 + Math.floor((ROUND - 1) / 2));

  COLLECTIBLES = [
    { type: itemType, x: 450, floor: 1, y: 610 - 24, w: 26, h: 20, collected: false, val: 300 * mult, tier: ROUND },
    { type: 'clock', x: 1700, floor: 1, y: 610 - 24, w: 22, h: 22, collected: false, val: clockBonus, tier: ROUND },
    { type: itemType, x: 750, floor: 2, y: 480 - 24, w: 26, h: 20, collected: false, val: 400 * mult, tier: ROUND },
    { type: 'clock', x: 1400, floor: 2, y: 480 - 24, w: 22, h: 22, collected: false, val: clockBonus, tier: ROUND },
    { type: itemType, x: 850, floor: 3, y: 350 - 24, w: 26, h: 20, collected: false, val: 500 * mult, tier: ROUND },
    { type: itemType, x: 1850, floor: 4, y: 220 - 24, w: 26, h: 20, collected: false, val: 800 * mult, tier: ROUND }
  ];

  SFX.whistle();
  SFX.phaseFanfare();
}

function updateTimer(dt) {
  if (STATE !== 'play') return;
  TIMER -= dt;
  if (TIMER <= 0) {
    TIMER = 0;
    triggerThiefEscape();
  } else if (TIMER <= 10 && Math.floor(TIMER) !== Math.floor(TIMER + dt)) {
    SFX.urgentTick();
  } else if (TIMER <= 15 && Math.floor(TIMER) !== Math.floor(TIMER + dt)) {
    SFX.tick();
  }
}

function updateElevator(dt) {
  if (ELEVATOR.state === 'open') {
    ELEVATOR.doorOpen = 1.0;
    ELEVATOR.timer -= dt;
    if (ELEVATOR.timer <= 0) {
      ELEVATOR.state = 'closing';
      ELEVATOR.timer = 0.6;
    }
  } else if (ELEVATOR.state === 'closing') {
    ELEVATOR.doorOpen = Math.max(0, ELEVATOR.timer / 0.6);
    ELEVATOR.timer -= dt;
    if (ELEVATOR.timer <= 0) {
      ELEVATOR.state = 'moving';
      if (ELEVATOR.currentFloor === 1) ELEVATOR.direction = 1;
      else if (ELEVATOR.currentFloor === 3) ELEVATOR.direction = -1;
      ELEVATOR.targetFloor = ELEVATOR.currentFloor + ELEVATOR.direction;
    }
  } else if (ELEVATOR.state === 'moving') {
    const destFloor = FLOORS.find(f => f.id === ELEVATOR.targetFloor);
    const destY = destFloor.floorY - 70;
    const dir = Math.sign(destY - ELEVATOR.y);
    const speed = 95;
    ELEVATOR.y += dir * speed * dt;

    if (PLAYER.inElevator) {
      PLAYER.y = ELEVATOR.y + 70;
      PLAYER.floor = ELEVATOR.currentFloor;
    }

    if (Math.abs(destY - ELEVATOR.y) < 5) {
      ELEVATOR.y = destY;
      ELEVATOR.currentFloor = ELEVATOR.targetFloor;
      ELEVATOR.state = 'opening';
      ELEVATOR.timer = 0.6;
      SFX.ding();
      if (PLAYER.inElevator) {
        PLAYER.floor = ELEVATOR.currentFloor;
        PLAYER.y = destFloor.floorY;
      }
    }
  } else if (ELEVATOR.state === 'opening') {
    ELEVATOR.doorOpen = 1.0 - Math.max(0, ELEVATOR.timer / 0.6);
    ELEVATOR.timer -= dt;
    if (ELEVATOR.timer <= 0) {
      ELEVATOR.doorOpen = 1.0;
      ELEVATOR.state = 'open';
      ELEVATOR.timer = 3.0;
    }
  }
}

function updateThief(dt) {
  const thiefBaseSpeed = 135 + ROUND * 18;
  const esc = ESCALATORS.find(e => e.fromFloor === THIEF.floor);

  if (THIEF.floor === 4) {
    THIEF.facing = -1;
    THIEF.vx = -thiefBaseSpeed * 1.1;
    THIEF.x += THIEF.vx * dt;

    if (THIEF.x <= 80) {
      triggerThiefEscape();
      return;
    }
  } else if (esc) {
    const escTargetX = esc.x1;
    const distToEsc = escTargetX - THIEF.x;

    if (Math.abs(distToEsc) > 20) {
      THIEF.facing = Math.sign(distToEsc) || 1;
      THIEF.vx = THIEF.facing * thiefBaseSpeed;
      THIEF.x += THIEF.vx * dt;
    } else {
      THIEF.floor = esc.toFloor;
      const nextFloor = FLOORS.find(f => f.id === THIEF.floor);
      THIEF.y = nextFloor.floorY;
      THIEF.x = esc.x2 + (esc.dir > 0 ? 50 : -50);
    }
  }

  THIEF.stepAnim += dt * 10;
}

function updatePlayer(dt) {
  const currentFloor = FLOORS.find(f => f.id === PLAYER.floor);
  const floorBaseY = currentFloor ? currentFloor.floorY : 610;

  if (PLAYER.invincibleTime > 0) {
    PLAYER.invincibleTime -= dt;
  }

  if (PLAYER.stunnedTime > 0) {
    PLAYER.stunnedTime -= dt;
    PLAYER.vx = lerp(PLAYER.vx, 0, 0.15);
    PLAYER.x += PLAYER.vx * dt;
    PLAYER.x = clamp(PLAYER.x, 30, LEVEL_WIDTH - 30);

    // Gravidade física e pouso no solo durante o atordoamento para o policial não flutuar no ar ao colidir no pulo
    if (!PLAYER.onGround && !PLAYER.onEscalator && !PLAYER.inElevator) {
      PLAYER.vy += 1280 * dt;
      PLAYER.y += PLAYER.vy * dt;
      if (PLAYER.y >= floorBaseY) {
        PLAYER.y = floorBaseY;
        PLAYER.vy = 0;
        PLAYER.onGround = true;
        SFX.step();
      }
    } else if (!PLAYER.onEscalator && !PLAYER.inElevator) {
      PLAYER.y = floorBaseY;
      PLAYER.vy = 0;
      PLAYER.onGround = true;
    }

    // Sincroniza imediatamente o quadro exibido (flip-screen) para a câmera nunca perder o policial de vista
    const prevRoom = CURRENT_ROOM;
    CURRENT_ROOM = clamp(Math.floor(PLAYER.x / ROOM_WIDTH), 0, TOTAL_ROOMS - 1);
    if (CURRENT_ROOM !== prevRoom) {
      SFX.flip();
    }

    return;
  }

  // Interação com Elevador (localizado no Quadro 1: x = 1400 a 1510)
  const elevCenterX = ELEVATOR.x + ELEVATOR.w / 2;
  const distToElev = Math.abs(PLAYER.x - elevCenterX);
  const isAtElevFloor = PLAYER.floor === ELEVATOR.currentFloor;
  const isElevOpen = ELEVATOR.state === 'open' || ELEVATOR.doorOpen > 0.25;

  if (PLAYER.elevCooldown > 0) {
    PLAYER.elevCooldown -= dt;
  }

  // 1. Entrada no Elevador:
  // - Entrada suave e acolhedora ao caminhar para dentro da cabine aberta
  // - Ou pressionar botão de ação (KeyE, W, Enter, ArrowUp) quando próximo
  const actionKey = keyPressed('KeyE') || keyPressed('Enter') || keyPressed('ArrowUp') || keyPressed('KeyW');
  const insideElevShaft = isAtElevFloor && (PLAYER.x >= ELEVATOR.x + 6 && PLAYER.x <= ELEVATOR.x + ELEVATOR.w - 6);
  const walkedInside = isAtElevFloor && isElevOpen && insideElevShaft;
  const manualEntry = isAtElevFloor && isElevOpen && distToElev < 75 && actionKey;

  if (!PLAYER.inElevator && (walkedInside || manualEntry) && (!PLAYER.elevCooldown || PLAYER.elevCooldown <= 0)) {
    PLAYER.inElevator = true;
    PLAYER.x = elevCenterX;
    PLAYER.vx = 0;
    PLAYER.onGround = true;
    PLAYER.stunnedTime = 0;
    PLAYER.elevCooldown = 0.35; // Previne ejeção acidental pela mesma tecla de corrida
    PLAYER.enteredWithKey = (KEYS['ArrowRight'] || KEYS['KeyD']) ? 'right' : (KEYS['ArrowLeft'] || KEYS['KeyA']) ? 'left' : null;
  } else if (!PLAYER.inElevator && distToElev < 75 && !isAtElevFloor && actionKey) {
    // Chamar elevador para o andar atual caso esteja em outro andar!
    if (ELEVATOR.state === 'open' || ELEVATOR.state === 'closing') {
      ELEVATOR.targetFloor = PLAYER.floor;
      ELEVATOR.state = 'closing';
      ELEVATOR.timer = 0.25;
      SFX.ding();
    }
  }

  // 2. Ações do jogador DENTRO do elevador:
  if (PLAYER.inElevator) {
    PLAYER.x = elevCenterX;
    PLAYER.y = ELEVATOR.y + 70;
    PLAYER.floor = ELEVATOR.currentFloor;
    PLAYER.onGround = true;
    PLAYER.vy = 0;

    // Se o jogador soltou a tecla usada para entrar, limpa a flag para permitir nova saída:
    if (PLAYER.enteredWithKey === 'right' && !KEYS['ArrowRight'] && !KEYS['KeyD']) {
      PLAYER.enteredWithKey = null;
    } else if (PLAYER.enteredWithKey === 'left' && !KEYS['ArrowLeft'] && !KEYS['KeyA']) {
      PLAYER.enteredWithKey = null;
    }

    // Se as portas estiverem abertas, pode sair caminhando para os lados:
    // Apenas permite sair se o jogador não estiver apenas segurando a mesma tecla de entrada:
    if (ELEVATOR.state === 'open') {
      const canExitLeft = PLAYER.enteredWithKey !== 'left' || PLAYER.elevCooldown <= 0;
      const canExitRight = PLAYER.enteredWithKey !== 'right' || PLAYER.elevCooldown <= 0;

      const exitLeft = (KEYS['ArrowLeft'] || KEYS['KeyA']) && canExitLeft;
      const exitRight = (KEYS['ArrowRight'] || KEYS['KeyD']) && canExitRight;

      if (exitLeft) {
        PLAYER.inElevator = false;
        PLAYER.x = ELEVATOR.x - 14;
        PLAYER.vx = -140;
        PLAYER.facing = -1;
        PLAYER.elevCooldown = 0.4;
        PLAYER.enteredWithKey = null;
        return;
      }
      if (exitRight) {
        PLAYER.inElevator = false;
        PLAYER.x = ELEVATOR.x + ELEVATOR.w + 14;
        PLAYER.vx = 140;
        PLAYER.facing = 1;
        PLAYER.elevCooldown = 0.4;
        PLAYER.enteredWithKey = null;
        return;
      }

      // Controle manual de subida e descida dentro do elevador aberto:
      if ((keyPressed('ArrowUp') || keyPressed('KeyW')) && ELEVATOR.currentFloor < 3) {
        ELEVATOR.targetFloor = ELEVATOR.currentFloor + 1;
        ELEVATOR.state = 'closing';
        ELEVATOR.timer = 0.25;
      } else if ((keyPressed('ArrowDown') || keyPressed('KeyS')) && ELEVATOR.currentFloor > 1) {
        ELEVATOR.targetFloor = ELEVATOR.currentFloor - 1;
        ELEVATOR.state = 'closing';
        ELEVATOR.timer = 0.25;
      }
    }

    // Enquanto o policial estiver dentro do elevador, ele permanece 100% seguro lá dentro
    return;
  }

  // Movimento Horizontal
  let moveDir = 0;
  if (KEYS['ArrowLeft'] || KEYS['KeyA']) moveDir -= 1;
  if (KEYS['ArrowRight'] || KEYS['KeyD']) moveDir += 1;

  // Ducking / Abaixar
  PLAYER.isDucking = (KEYS['ArrowDown'] || KEYS['KeyS']) && PLAYER.onGround;
  PLAYER.h = PLAYER.isDucking ? 32 : 56;

  let maxSpeed = PLAYER.isDucking ? 75 : 240;

  // Checar Escadas Rolantes
  PLAYER.onEscalator = false;
  for (const esc of ESCALATORS) {
    if (PLAYER.floor === esc.fromFloor) {
      const minX = Math.min(esc.x1, esc.x2);
      const maxX = Math.max(esc.x1, esc.x2);
      if (PLAYER.x >= minX && PLAYER.x <= maxX) {
        PLAYER.onEscalator = true;
        if (moveDir === esc.dir) {
          maxSpeed += 70;
        } else if (moveDir === -esc.dir) {
          maxSpeed = Math.max(50, maxSpeed - 90);
        }

        const progress = (PLAYER.x - esc.x1) / (esc.x2 - esc.x1);
        PLAYER.y = lerp(esc.y1, esc.y2, clamp(progress, 0, 1));

        if (progress >= 0.95) {
          PLAYER.floor = esc.toFloor;
          PLAYER.y = esc.y2;
        }
        break;
      }
    }
  }

  if (moveDir !== 0) {
    PLAYER.facing = moveDir;
    PLAYER.vx = lerp(PLAYER.vx, moveDir * maxSpeed, 0.28);
    if (PLAYER.onGround && !PLAYER.onEscalator && !PLAYER.inElevator) {
      const speed = Math.abs(PLAYER.vx);
      // Movimento cadenciado retrô das pernas e passos em tom único na velocidade clássica Atari
      PLAYER.stepAnim += Math.max(dt * 18, speed * dt * 0.09);
      PLAYER.stepDist += speed * dt;
      if (PLAYER.stepDist >= 38) {
        PLAYER.stepDist = 0;
        SFX.step();
      }
    }
  } else {
    PLAYER.vx = lerp(PLAYER.vx, 0, 0.35);
    PLAYER.stepDist = 28;
    if (Math.abs(PLAYER.vx) < 5) {
      PLAYER.stepAnim = 0;
    }
  }

  // Pulo
  const jumpKey = keyPressed('Space') || keyPressed('ArrowUp') || keyPressed('KeyW');
  if (jumpKey && PLAYER.onGround && !PLAYER.isDucking && !PLAYER.onEscalator && !PLAYER.inElevator) {
    PLAYER.vy = -380;
    PLAYER.onGround = false;
    SFX.jump();
  }

  // Gravidade
  if (!PLAYER.onGround && !PLAYER.onEscalator && !PLAYER.inElevator) {
    PLAYER.vy += 1280 * dt;
    PLAYER.y += PLAYER.vy * dt;

    // Limite de teto: a cabeça nunca pode passar para o nível de cima
    const ceilingLimit = currentFloor ? currentFloor.ceilingY : 0;
    if (PLAYER.y - PLAYER.h < ceilingLimit) {
      PLAYER.y = ceilingLimit + PLAYER.h;
      PLAYER.vy = Math.max(0, PLAYER.vy);
    }

    if (PLAYER.y >= floorBaseY) {
      PLAYER.y = floorBaseY;
      PLAYER.vy = 0;
      PLAYER.onGround = true;
      SFX.step();
    }
  } else if (!PLAYER.onEscalator && !PLAYER.inElevator) {
    PLAYER.y = floorBaseY;
    PLAYER.onGround = true;
  }

  PLAYER.x += PLAYER.vx * dt;
  PLAYER.x = clamp(PLAYER.x, 30, LEVEL_WIDTH - 30);

  // SISTEMA DE QUADRO A QUADRO (FLIP-SCREEN DO ATARI ORIGINAL):
  // Quando chega ao final da tela, transiciona instantaneamente para o próximo quadro!
  const prevRoom = CURRENT_ROOM;
  CURRENT_ROOM = clamp(Math.floor(PLAYER.x / ROOM_WIDTH), 0, TOTAL_ROOMS - 1);
  if (CURRENT_ROOM !== prevRoom) {
    SFX.flip();
  }
}

function getSafeRespawnX(floor, minSpacing = 650) {
  let candidateX = LEVEL_WIDTH + 80;
  const obstaclesOnFloor = [
    ...CARTS.filter(c => c.floor === floor),
    ...BALLS.filter(b => b.floor === floor),
    ...FIRES.filter(f => f.floor === floor)
  ].sort((a, b) => a.x - b.x);

  for (const obs of obstaclesOnFloor) {
    if (obs.x > candidateX - minSpacing) {
      candidateX = obs.x + minSpacing;
    }
  }
  return candidateX;
}

function updateObstacles(dt) {
  for (const c of CARTS) {
    c.x += c.speed * dt;
    c.wheelRot += dt * 12;
    if (c.x < 30) {
      c.x = getSafeRespawnX(c.floor, 650);
    }
  }

  for (const b of BALLS) {
    b.x += b.vx * dt;
    b.bounceT += dt * 3.2;
    const floorObj = FLOORS.find(f => f.id === b.floor);
    const floorY = floorObj ? floorObj.floorY : 610;
    const bounceHeight = Math.abs(Math.sin(b.bounceT)) * b.peakH;
    b.y = floorY - b.r - bounceHeight;

    if (Math.abs(Math.sin(b.bounceT)) < 0.08) {
      const ballRoom = Math.floor(b.x / ROOM_WIDTH);
      if (ballRoom === CURRENT_ROOM) SFX.ballBounce();
    }
    if (b.x < 30) {
      b.x = getSafeRespawnX(b.floor, 650);
    }
  }

  for (const p of PLANES) {
    p.x += p.speed * dt;
    p.propAngle += dt * 35;
    const planeRoom = Math.floor(p.x / ROOM_WIDTH);
    if (planeRoom === CURRENT_ROOM && Math.random() < 0.04) {
      SFX.plane();
    }
    if (p.x < 30) {
      const otherPlanes = PLANES.filter(o => o !== p);
      const maxOtherX = otherPlanes.length > 0 ? Math.max(...otherPlanes.map(o => o.x)) : LEVEL_WIDTH;
      p.x = Math.max(LEVEL_WIDTH + 150, maxOtherX + 900);
    }
  }

  for (const f of FIRES) {
    f.anim = (f.anim + dt * 6) % 1;
  }
}

function isPlayerInElevatorSafe() {
  if (PLAYER.inElevator) return true;

  // Proteção completa se o policial estiver dentro dos limites do poço/cabine do elevador
  const inElevX = PLAYER.x >= ELEVATOR.x - 12 && PLAYER.x <= ELEVATOR.x + ELEVATOR.w + 12;
  const currentFloorObj = FLOORS.find(f => f.id === PLAYER.floor);
  const floorBaseY = currentFloorObj ? currentFloorObj.floorY : 610;
  const atElevY = Math.abs(PLAYER.y - (ELEVATOR.y + 70)) < 45 || Math.abs(PLAYER.y - floorBaseY) < 45;
  const isElevAtFloor = PLAYER.floor === ELEVATOR.currentFloor || Math.abs(PLAYER.y - (ELEVATOR.y + 70)) < 45;

  return inElevX && atElevY && isElevAtFloor;
}

function checkCollisions() {
  if (PLAYER.stunnedTime > 0 || PLAYER.invincibleTime > 0 || STATE !== 'play') return;

  const pBox = {
    x: PLAYER.x - PLAYER.w / 2,
    y: PLAYER.y - PLAYER.h,
    w: PLAYER.w,
    h: PLAYER.h
  };

  if (PLAYER.floor === THIEF.floor) {
    const tBox = {
      x: THIEF.x - THIEF.w / 2,
      y: THIEF.y - THIEF.h,
      w: THIEF.w,
      h: THIEF.h
    };
    if (rectOverlap(pBox, tBox)) {
      triggerCaught();
      return;
    }
  }

  // Se o policial está dentro do elevador ou em sua cabine, ele fica 100% protegido contra danos de obstáculos
  if (!isPlayerInElevatorSafe()) {
    for (const c of CARTS) {
      if (c.floor === PLAYER.floor) {
        const cBox = { x: c.x - c.w / 2, y: FLOORS.find(f => f.id === c.floor).floorY - c.h, w: c.w, h: c.h };
        if (rectOverlap(pBox, cBox)) {
          tripPlayer();
          break;
        }
      }
    }

    for (const b of BALLS) {
      if (b.floor === PLAYER.floor) {
        const bBox = { x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 };
        if (rectOverlap(pBox, bBox)) {
          tripPlayer();
          break;
        }
      }
    }

    for (const f of FIRES) {
      if (f.floor === PLAYER.floor) {
        const floorY = FLOORS.find(fl => fl.id === f.floor).floorY;
        const fBox = { x: f.x - f.w / 2, y: floorY - f.h, w: f.w, h: f.h };
        if (rectOverlap(pBox, fBox)) {
          hitFire(f);
          break;
        }
      }
    }

    if (PLAYER.floor === 4) {
      for (const p of PLANES) {
        const plBox = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
        if (rectOverlap(pBox, plBox)) {
          if (!PLAYER.isDucking) {
            killPlayer();
            break;
          }
        }
      }
    }
  }

  for (const it of COLLECTIBLES) {
    if (!it.collected && it.floor === PLAYER.floor) {
      const itBox = { x: it.x - it.w / 2, y: it.y - it.h, w: it.w, h: it.h };
      if (rectOverlap(pBox, itBox)) {
        it.collected = true;
        SFX.collect();
        if (it.type === 'clock') {
          TIMER += it.val;
          SCORE_POPUPS.push({ text: `+${it.val}s`, x: it.x, y: it.y - 12, life: 1.0, color: '#38bdf8' });
        } else {
          SCORE += it.val;
          SCORE_POPUPS.push({ text: `+${it.val}`, x: it.x, y: it.y - 12, life: 1.0, color: '#facc15' });
        }
      }
    }
  }
}

function hitFire(f) {
  if (isPlayerInElevatorSafe() || PLAYER.stunnedTime > 0 || PLAYER.invincibleTime > 0) return;

  // Direção de avanço natural no andar (Andares 1 e 3: direita +1; Andares 2 e 4: esquerda -1)
  const forwardDir = PLAYER.facing !== 0 ? PLAYER.facing : (PLAYER.floor % 2 === 1 ? 1 : -1);

  // Aparece do outro lado do fogo (ultrapassa a fogueira) para não ficar preso no obstáculo
  const targetX = f.x + forwardDir * (f.w / 2 + 32);
  PLAYER.x = clamp(targetX, 40, LEVEL_WIDTH - 40);

  // Pousa firme no piso do andar atual
  const curFloor = FLOORS.find(fl => fl.id === PLAYER.floor);
  if (curFloor) {
    PLAYER.y = curFloor.floorY;
    PLAYER.vy = 0;
    PLAYER.onGround = true;
  }

  PLAYER.facing = forwardDir;
  PLAYER.vx = forwardDir * 60; // Mantém impulso na direção da corrida
  PLAYER.stunnedTime = 0.28;   // Recuperação rápida: não fica demorando para continuar!
  PLAYER.invincibleTime = 1.2; // Pisca invulnerável por 1.2s permitindo já correr e pular

  TIMER = Math.max(0, TIMER - 9);

  SCORE_POPUPS.push({
    text: '-9s',
    x: PLAYER.x,
    y: PLAYER.y - PLAYER.h - 10,
    life: 1.0,
    color: '#f97316'
  });

  SFX.fire();

  // Atualiza imediatamente o quadro (flip-screen) para a câmera nunca perder o policial
  const prevRoom = CURRENT_ROOM;
  CURRENT_ROOM = clamp(Math.floor(PLAYER.x / ROOM_WIDTH), 0, TOTAL_ROOMS - 1);
  if (CURRENT_ROOM !== prevRoom) {
    SFX.flip();
  }
}

function tripPlayer() {
  if (isPlayerInElevatorSafe() || PLAYER.stunnedTime > 0 || PLAYER.invincibleTime > 0) return;
  PLAYER.stunnedTime = 0.32; // Retoma o controle rápido!
  PLAYER.invincibleTime = 1.1; // Pisca invulnerável por 1.1s

  // Knockback suave e natural contra a direção para onde o policial estava olhando/correndo
  const knockDir = PLAYER.facing !== 0 ? -PLAYER.facing : -1;
  PLAYER.vx = knockDir * 75;
  TIMER = Math.max(0, TIMER - 9);

  SCORE_POPUPS.push({
    text: '-9s',
    x: PLAYER.x,
    y: PLAYER.y - PLAYER.h - 10,
    life: 1.0,
    color: '#ef4444'
  });

  SFX.trip();
}

function killPlayer() {
  if (isPlayerInElevatorSafe() || PLAYER.invincibleTime > 0) return;
  LIVES--;
  SFX.trip();
  if (LIVES <= 0) {
    triggerGameOver();
  } else {
    // Recuo seguro na direção oposta ao movimento sem teletransporte cego
    const knockDir = PLAYER.facing !== 0 ? -PLAYER.facing : -1;
    PLAYER.vx = knockDir * 80;
    PLAYER.stunnedTime = 0.45;
    PLAYER.invincibleTime = 1.5;

    // Garante que o policial está firme no piso do andar atual
    const curFloor = FLOORS.find(f => f.id === PLAYER.floor);
    if (curFloor) {
      PLAYER.y = curFloor.floorY;
      PLAYER.vy = 0;
      PLAYER.onGround = true;
    }

    SCORE_POPUPS.push({
      text: '-1 VIDA',
      x: PLAYER.x,
      y: PLAYER.y - PLAYER.h - 12,
      life: 1.2,
      color: '#ef4444'
    });

    const prevRoom = CURRENT_ROOM;
    CURRENT_ROOM = clamp(Math.floor(PLAYER.x / ROOM_WIDTH), 0, TOTAL_ROOMS - 1);
    if (CURRENT_ROOM !== prevRoom) {
      SFX.flip();
    }
  }
}

function triggerCaught() {
  STATE = 'caught';
  STATE_TIME = 0;
  const timeBonus = Math.floor(TIMER) * 100;
  SCORE += 1000 + timeBonus;
  if (SCORE > HIGH_SCORE) {
    HIGH_SCORE = SCORE;
    localStorage.setItem('pega_ladrao_highscore', HIGH_SCORE);
  }
  SFX.triumph();
}

function triggerThiefEscape() {
  STATE = 'escaped';
  STATE_TIME = 0;
  LIVES--;
  SFX.escaped();
  if (LIVES <= 0) {
    setTimeout(triggerGameOver, 2000);
  }
}

function triggerGameOver() {
  STATE = 'gameover';
  STATE_TIME = 0;
  showScoreDialog();
}

// ============================================================================
// RENDERIZAÇÃO NO PADRÃO ORIGINAL ATARI (UM QUADRO POR VEZ)
// ============================================================================
function draw2DWorld(dt = 0) {
  // A câmera fixa no quadro atual (sem rolagem contínua!)
  const roomOffsetX = CURRENT_ROOM * ROOM_WIDTH;

  ctx.save();
  // Clip estrito para o viewport virtual de 960x720
  ctx.beginPath();
  ctx.rect(0, 0, ROOM_WIDTH, VH);
  ctx.clip();

  ctx.translate(-roomOffsetX, 0);

  // 1. Desenhar Paredes dos 4 Andares
  for (const fl of FLOORS) {
    const yTop = fl.ceilingY;
    const yBottom = fl.floorY;
    const h = yBottom - yTop;

    ctx.fillStyle = fl.color;
    ctx.fillRect(roomOffsetX, yTop, ROOM_WIDTH, h);

    if (fl.id === 4) {
      // Telhado: Tijolos cinzas e mureta
      drawRoofWall(roomOffsetX, yTop, yBottom);
    }

    // Viga / Chão Dourado Atari
    drawAtariFloorBeam(fl, roomOffsetX);
  }

  // Vitrines 2.5D Clássicas da Activision (específicas, não-espelhadas e únicas em cada andar!)
  for (const sf of STOREFRONTS) {
    if (sf.x + sf.w >= roomOffsetX - 30 && sf.x <= roomOffsetX + ROOM_WIDTH + 30) {
      drawStorefrontBlock(sf);
    }
  }

  // 2. Escadas Rolantes 2.5D (aparecem apenas no quadro correspondente)
  for (const esc of ESCALATORS) {
    const minX = Math.min(esc.x1, esc.x2);
    const maxX = Math.max(esc.x1, esc.x2);
    if (maxX >= roomOffsetX - 30 && minX <= roomOffsetX + ROOM_WIDTH + 30) {
      drawEscalator(esc);
    }
  }

  // 3. Elevador Central (no Quadro 1: Centro da loja)
  if (CURRENT_ROOM === 1) {
    drawElevatorShaft();
    drawElevatorCar();
  }

  // 4. Coletáveis no quadro atual
  for (const it of COLLECTIBLES) {
    if (!it.collected && it.x >= roomOffsetX - 30 && it.x <= roomOffsetX + ROOM_WIDTH + 30) {
      drawCollectible(it);
    }
  }

  // 4.5. Popups flutuantes de pontuação/tempo
  for (let i = SCORE_POPUPS.length - 1; i >= 0; i--) {
    const pop = SCORE_POPUPS[i];
    pop.y -= 26 * dt;
    pop.life -= dt;
    if (pop.life <= 0) {
      SCORE_POPUPS.splice(i, 1);
      continue;
    }
    if (pop.x >= roomOffsetX - 30 && pop.x <= roomOffsetX + ROOM_WIDTH + 30) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, pop.life * 2.2);
      ctx.font = '900 15px monospace';
      ctx.fillStyle = pop.color;
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      ctx.fillText(pop.text, pop.x, pop.y);
      ctx.restore();
    }
  }

  // 5. Obstáculos visíveis no quadro atual
  for (const c of CARTS) {
    if (c.x >= roomOffsetX - 60 && c.x <= roomOffsetX + ROOM_WIDTH + 60) drawCart(c);
  }
  for (const b of BALLS) {
    if (b.x >= roomOffsetX - 60 && b.x <= roomOffsetX + ROOM_WIDTH + 60) drawBall(b);
  }
  for (const f of FIRES) {
    if (f.x >= roomOffsetX - 60 && f.x <= roomOffsetX + ROOM_WIDTH + 60) drawFire(f);
  }
  for (const p of PLANES) {
    if (p.x >= roomOffsetX - 80 && p.x <= roomOffsetX + ROOM_WIDTH + 80) drawPlane(p);
  }

  // 6. Personagens (desenhar apenas se estiverem visíveis no quadro)
  if (THIEF.x >= roomOffsetX - 60 && THIEF.x <= roomOffsetX + ROOM_WIDTH + 60) {
    drawThief();
  }
  if (PLAYER.x >= roomOffsetX - 60 && PLAYER.x <= roomOffsetX + ROOM_WIDTH + 60) {
    drawPlayer();
  }

  ctx.restore();
}

// Vitrines e Lojas 2.5D com profundidade, letreiros e vitrines temáticas por fase
function drawStorefrontBlock(sf) {
  const fl = FLOORS.find(f => f.id === sf.floor);
  if (!fl) return;
  const theme = getCurrentTheme();
  const y = fl.floorY;
  const bx = sf.x;
  const bw = sf.w || 86;
  const bh = sf.h || 44;
  const by = y - bh;

  ctx.save();

  // 1. Sombra suave da vitrine no chão
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(bx + 4, y - 2, bw - 2, 4);

  // 2. Caixa 2.5D com cor da loja da fase atual
  ctx.fillStyle = theme.storeColor;
  ctx.fillRect(bx, by, bw, bh);

  // 3. Chanfro 2.5D superior iluminado
  ctx.fillStyle = theme.storeHighlight;
  ctx.fillRect(bx, by, bw, 6);
  // Borda lateral direita chanfrada iluminada
  ctx.fillRect(bx + bw - 6, by, 6, bh);

  // 4. Borda chanfrada inferior e esquerda (sombra)
  ctx.fillStyle = theme.storeShadow;
  ctx.fillRect(bx, by, 5, bh);
  ctx.fillRect(bx, by + bh - 5, bw, 5);

  // 5. Plaquinha retrô do departamento no topo da vitrine
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(bx + 8, by + 8, bw - 16, 12);
  ctx.fillStyle = sf.tagColor || '#facc15';
  ctx.fillRect(bx + 8, by + 8, bw - 16, 2); // Linha de neon no topo do letreiro

  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = sf.tagColor || '#ffffff';
  ctx.fillText(sf.label, bx + bw / 2, by + 17);

  // 6. Vitrine de vidro escuro
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(bx + 8, by + 22, bw - 16, bh - 28);

  // Reflexos diagonais clássicos no vidro da vitrine
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(bx + 14, by + bh - 8);
  ctx.lineTo(bx + 26, by + 24);
  ctx.moveTo(bx + 24, by + bh - 8);
  ctx.lineTo(bx + 36, by + 24);
  ctx.stroke();

  // Mini mostruário de produtos em pixel art
  ctx.fillStyle = sf.tagColor || '#facc15';
  ctx.fillRect(bx + bw / 2 - 8, by + bh - 12, 6, 5);
  ctx.fillStyle = '#f87171';
  ctx.fillRect(bx + bw / 2 + 2, by + bh - 14, 7, 7);

  // 7. Contorno retro fino
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx, by, bw, bh);

  ctx.restore();
}

function drawRoofWall(roomOffsetX, yTop, yBottom) {
  const theme = getCurrentTheme();
  ctx.save();
  // Fundo com sutis blocos de alvenaria
  ctx.strokeStyle = theme.beamShadow || '#525252';
  ctx.lineWidth = 1.5;
  for (let y = yTop + 25; y < yBottom; y += 25) {
    ctx.beginPath();
    ctx.moveTo(roomOffsetX, y);
    ctx.lineTo(roomOffsetX + ROOM_WIDTH, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAtariFloorBeam(fl, roomOffsetX) {
  const fy = fl.floorY;
  const theme = getCurrentTheme();
  ctx.save();
  // Viga do andar sincronizada com a paleta da fase
  ctx.fillStyle = theme.beamColor;
  ctx.fillRect(roomOffsetX, fy, ROOM_WIDTH, 12);

  // Linha de luz superior 2.5D
  ctx.fillStyle = theme.beamHighlight;
  ctx.fillRect(roomOffsetX, fy, ROOM_WIDTH, 3);

  // Linha de sombra inferior
  ctx.fillStyle = theme.beamShadow;
  ctx.fillRect(roomOffsetX, fy + 9, ROOM_WIDTH, 3);
  ctx.restore();
}

function drawEscalator(esc) {
  ctx.save();
  const x1 = esc.x1, y1 = esc.y1, x2 = esc.x2, y2 = esc.y2;
  const steps = 18;

  // Base da escada
  ctx.strokeStyle = '#0a0f1d';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Corrimão 2.5D azul claro
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x1, y1 - 22);
  ctx.lineTo(x2, y2 - 22);
  ctx.stroke();

  // Degraus amarelos animados
  const stepOffset = (GAME_TIME * esc.speed * 0.05) % 1;
  ctx.fillStyle = '#facc15';
  for (let i = 0; i <= steps; i++) {
    const t = (i + stepOffset) / steps;
    if (t < 0 || t > 1) continue;
    const sx = lerp(x1, x2, t);
    const sy = lerp(y1, y2, t);
    ctx.fillRect(sx - 4, sy - 8, 8, 8);
  }

  ctx.restore();
}

function drawElevatorShaft() {
  ctx.save();
  const x = ELEVATOR.x;
  const w = ELEVATOR.w;
  const topY = FLOORS[2].ceilingY;
  const bottomY = FLOORS[0].floorY;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 10, topY); ctx.lineTo(x + 10, bottomY);
  ctx.moveTo(x + w - 10, topY); ctx.lineTo(x + w - 10, bottomY);
  ctx.stroke();

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, topY); ctx.lineTo(x + w / 2, ELEVATOR.y);
  ctx.stroke();

  ctx.restore();
}

function drawElevatorCar() {
  ctx.save();
  const x = ELEVATOR.x;
  const y = ELEVATOR.y;
  const w = ELEVATOR.w;
  const h = ELEVATOR.h;

  ctx.fillStyle = '#111827';
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);

  ctx.fillStyle = 'rgba(254, 240, 138, 0.25)';
  ctx.fillRect(x + 5, y + 5, w - 10, h - 10);

  const doorWidth = (w / 2 - 6) * (1 - ELEVATOR.doorOpen);
  ctx.fillStyle = '#475569';
  ctx.fillRect(x + 5, y + 5, doorWidth, h - 10);
  ctx.fillRect(x + w - 5 - doorWidth, y + 5, doorWidth, h - 10);

  ctx.fillStyle = '#000000';
  ctx.fillRect(x + w / 2 - 16, y - 18, 32, 14);
  ctx.fillStyle = '#ef4444';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`L${ELEVATOR.currentFloor}`, x + w / 2, y - 7);

  // Indicador visual de interação / comandos do elevador
  const elevCenterX = x + w / 2;
  const isNear = Math.abs(PLAYER.x - elevCenterX) < 75 && CURRENT_ROOM === 1;

  if (PLAYER.inElevator) {
    if (ELEVATOR.state === 'open') {
      const isBlink = Math.floor(GAME_TIME * 4) % 2 === 0;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(elevCenterX - 92, y - 44, 184, 22);
      ctx.strokeStyle = isBlink ? '#facc15' : '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(elevCenterX - 92, y - 44, 184, 22);

      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = isBlink ? '#fef08a' : '#ffffff';
      ctx.fillText('▲ [W/↑] SUBIR · [S/↓] DESCER ▼', elevCenterX, y - 30);
    } else if (ELEVATOR.state === 'moving') {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(elevCenterX - 65, y - 44, 130, 22);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(elevCenterX - 65, y - 44, 130, 22);

      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#38bdf8';
      const arrow = ELEVATOR.direction > 0 ? '▲ SUBINDO...' : '▼ DESCENDO...';
      ctx.fillText(arrow, elevCenterX, y - 30);
    }
  } else if (isNear && PLAYER.floor === ELEVATOR.currentFloor && ELEVATOR.state === 'open') {
    const isBlink = Math.floor(GAME_TIME * 4) % 2 === 0;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(elevCenterX - 95, y - 44, 190, 22);
    ctx.strokeStyle = isBlink ? '#4ade80' : '#22c55e';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(elevCenterX - 95, y - 44, 190, 22);

    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = isBlink ? '#4ade80' : '#ffffff';
    ctx.fillText('▲ ENTRE [ANDAR OU E/↑] ▲', elevCenterX, y - 30);
  } else if (isNear && PLAYER.floor !== ELEVATOR.currentFloor) {
    const currentFl = FLOORS.find(f => f.id === PLAYER.floor);
    const callY = currentFl ? currentFl.floorY - 55 : y;
    const isBlink = Math.floor(GAME_TIME * 4) % 2 === 0;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(elevCenterX - 85, callY, 170, 22);
    ctx.strokeStyle = isBlink ? '#facc15' : '#ca8a04';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(elevCenterX - 85, callY, 170, 22);

    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fef08a';
    ctx.fillText('[E / ↑] CHAMAR ELEVADOR', elevCenterX, callY + 14);
  }

  ctx.restore();
}

// Personagem Oficial Kelly fiel ao Atari da imagem
function drawPlayer() {
  ctx.save();
  const x = PLAYER.x;
  const y = PLAYER.y;
  const facing = PLAYER.facing;
  const isDucking = PLAYER.isDucking;
  const isStunned = PLAYER.stunnedTime > 0 || PLAYER.invincibleTime > 0;
  const inAir = !PLAYER.onGround && !PLAYER.onEscalator && !PLAYER.inElevator;

  // Sombra 2.5D projetada no piso
  const currentFloor = FLOORS.find(f => f.id === PLAYER.floor);
  const floorBaseY = currentFloor ? currentFloor.floorY : y;
  const jumpOffset = Math.max(0, floorBaseY - y);
  const shadowScale = clamp(1.0 - jumpOffset / 90, 0.35, 1.0);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(x, floorBaseY, (isDucking ? 20 : 15) * shadowScale, 5 * shadowScale, 0, 0, TAU);
  ctx.fill();

  if (isStunned && Math.floor(GAME_TIME * 15) % 2 === 0) {
    ctx.restore();
    return;
  }

  ctx.translate(x, y);
  ctx.scale(facing, 1);

  if (isDucking) {
    // Kelly Agachado
    ctx.fillStyle = '#254bca';
    ctx.fillRect(-12, -24, 24, 18);
    ctx.fillStyle = '#000000';
    ctx.fillRect(-10, -34, 20, 10); // Chapéu preto
    ctx.fillStyle = '#fcd34d';
    ctx.fillRect(2, -22, 8, 6);
  } else if (inAir) {
    // =========================================================================
    // POSE CLÁSSICA DO ATARI KEYSTONE KAPERS: PERNAS ABERTAS NO PULO (HURDLE JUMP)
    // =========================================================================
    // Casaco Azul Royal
    ctx.fillStyle = '#254bca';
    ctx.fillRect(-10, -38, 20, 22);

    // Cauda do casaco esvoaçando para trás
    ctx.fillRect(-14, -28, 6, 12);

    // PERNA DIANTEIRA ABERTA (esticada para frente)
    ctx.fillStyle = '#000000';
    ctx.fillRect(2, -20, 16, 6); // Perna horizontal para frente
    ctx.fillRect(14, -18, 6, 7);  // Bota/pé apontando para frente

    // PERNA TRASEIRA ABERTA (esticada para trás)
    ctx.fillRect(-18, -20, 16, 6); // Perna horizontal para trás
    ctx.fillRect(-22, -18, 6, 7);  // Bota/pé apontando para trás

    // Rosto com nariz saliente em perfil
    ctx.fillStyle = '#fed7aa';
    ctx.fillRect(-4, -48, 12, 10);
    ctx.fillRect(8, -45, 4, 4); // Nariz característico do Atari!

    // Chapéu Bobby Preto com aba
    ctx.fillStyle = '#000000';
    ctx.fillRect(-8, -58, 16, 10);
    ctx.fillRect(-11, -48, 22, 3); // Aba do chapéu

    // Braços abertos em salto
    ctx.fillStyle = '#1d40b0';
    ctx.fillRect(4, -36, 12, 5);  // Braço dianteiro
    ctx.fillStyle = '#fed7aa';
    ctx.fillRect(16, -37, 4, 4);   // Mão dianteira

    ctx.fillStyle = '#1a3799';
    ctx.fillRect(-14, -36, 10, 5); // Braço traseiro
    ctx.fillStyle = '#fed7aa';
    ctx.fillRect(-18, -37, 4, 4);  // Mão traseira
  } else {
    // Kelly em Pé / Correndo (estilo exato do sprite da imagem)
    const isRunning = Math.abs(PLAYER.vx) > 5 && PLAYER.onGround && !PLAYER.onEscalator && !PLAYER.inElevator;
    const legSwing = isRunning ? Math.sin(PLAYER.stepAnim) * 9 : 0;

    // Pernas / Botas pretas
    ctx.fillStyle = '#000000';
    ctx.fillRect(-7 + legSwing, -16, 6, 16);
    ctx.fillRect(1 - legSwing, -16, 6, 16);

    // Casaco Azul Royal Atari
    ctx.fillStyle = '#254bca';
    ctx.fillRect(-10, -38, 20, 22);

    // Rosto com nariz saliente em perfil
    ctx.fillStyle = '#fed7aa';
    ctx.fillRect(-4, -48, 12, 10);
    ctx.fillRect(8, -45, 4, 4); // Nariz característico do Atari!

    // Chapéu Bobby Preto com aba (exatamente como na imagem)
    ctx.fillStyle = '#000000';
    ctx.fillRect(-8, -58, 16, 10);
    ctx.fillRect(-11, -48, 22, 3); // Aba do chapéu

    // Braço com balanço atlético durante a corrida
    const armSwing = isRunning ? -Math.sin(PLAYER.stepAnim) * 4 : 0;
    ctx.fillStyle = '#1d40b0';
    ctx.fillRect(2 + armSwing, -34, 6, 12);
  }

  ctx.restore();
}

// Ladrão Harry Hooligan
function drawThief() {
  ctx.save();
  const x = THIEF.x;
  const y = THIEF.y;
  const facing = THIEF.facing;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(x, y, 16, 5, 0, 0, TAU);
  ctx.fill();

  ctx.translate(x, y);
  ctx.scale(facing, 1);

  const legSwing = Math.sin(THIEF.stepAnim) * 8;

  // Calça preta
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-7 + legSwing, -16, 5, 16);
  ctx.fillRect(1 - legSwing, -16, 5, 16);

  // Listras Preto e Branco
  for (let ly = -38; ly < -16; ly += 6) {
    ctx.fillStyle = ((ly / 6) % 2 === 0) ? '#ffffff' : '#000000';
    ctx.fillRect(-9, ly, 18, 6);
  }

  // Rosto e Gorro
  ctx.fillStyle = '#fed7aa';
  ctx.fillRect(-5, -46, 12, 8);
  ctx.fillStyle = '#000000';
  ctx.fillRect(-3, -44, 10, 3); // Máscara
  ctx.fillRect(-8, -54, 16, 8); // Gorro

  // Saco de Dinheiro
  ctx.fillStyle = '#78350f';
  ctx.beginPath();
  ctx.arc(-14, -28, 10, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#22c55e';
  ctx.font = 'bold 10px monospace';
  ctx.fillText('$', -17, -25);

  ctx.restore();
}

function drawCart(c) {
  ctx.save();
  const y = FLOORS.find(f => f.id === c.floor).floorY;
  ctx.translate(c.x, y);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 5, 0, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.strokeRect(-16, -28, 32, 18);

  for (let gx = -10; gx < 14; gx += 6) {
    ctx.beginPath(); ctx.moveTo(gx, -28); ctx.lineTo(gx, -10); ctx.stroke();
  }

  ctx.fillStyle = '#ef4444';
  ctx.fillRect(12, -30, 4, 8);

  ctx.fillStyle = '#000000';
  ctx.beginPath(); ctx.arc(-10, -5, 5, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(10, -5, 5, 0, TAU); ctx.fill();

  ctx.restore();
}

function drawBall(b) {
  drawBrick(b);
}

// Tijolo Cerâmico 2.5D Clássico (substitui a antiga bola com cores da Espanha)
function drawBrick(b) {
  ctx.save();
  const floorY = FLOORS.find(f => f.id === b.floor).floorY;
  const distFromGround = Math.max(0, floorY - b.y);
  const shadowScale = clamp(1.0 - distFromGround / 120, 0.25, 1.0);

  // 1. Sombra oval no chão (encolhe e fica mais suave conforme a altura do pulo)
  ctx.fillStyle = `rgba(0, 0, 0, ${0.45 * shadowScale})`;
  ctx.beginPath();
  ctx.ellipse(b.x, floorY, 18 * shadowScale, 5 * shadowScale, 0, 0, TAU);
  ctx.fill();

  // 2. Translação e Rotação do Tijolo ao quicar
  ctx.translate(b.x, b.y);

  // Rotação dinâmica: o tijolo tomba suavemente enquanto salta e voa
  const rotAngle = -(b.x * 0.08);
  ctx.rotate(rotAngle);

  const bw = 34;
  const bh = 20;
  const hbw = bw / 2;
  const hbh = bh / 2;

  // 3. Sombra inferior do próprio tijolo (para profundidade 2.5D)
  ctx.fillStyle = '#450a0a';
  ctx.fillRect(-hbw + 1, -hbh + 1, bw, bh);

  // 4. Corpo principal do tijolo cerâmico (Terracota avermelhado escuro de alvenaria)
  ctx.fillStyle = '#b91c1c';
  ctx.fillRect(-hbw, -hbh, bw, bh);

  // 5. Chanfro superior e lateral esquerdo iluminado (luz 2.5D alaranjada de cerâmica queimada)
  ctx.fillStyle = '#ea580c';
  ctx.fillRect(-hbw, -hbh, bw, 3);
  ctx.fillRect(-hbw, -hbh, 3, bh);

  // 6. Chanfro inferior e lateral direito sombreado (borda escura)
  ctx.fillStyle = '#7f1d1d';
  ctx.fillRect(-hbw, hbh - 3, bw, 3);
  ctx.fillRect(hbw - 3, -hbh, 3, bh);

  // 7. Os 3 furos clássicos do tijolo cerâmico de construção
  const holeW = 6;
  const holeH = 10;
  const holeY = -holeH / 2;
  const holeXs = [-10, 0, 10];

  for (const hx of holeXs) {
    // Fundo escuro profundo do furo
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(hx - holeW / 2, holeY, holeW, holeH);

    // Borda superior interna de sombra
    ctx.fillStyle = '#450a0a';
    ctx.fillRect(hx - holeW / 2, holeY, holeW, 2);

    // Borda inferior interna com sutil reflexo de luz
    ctx.fillStyle = '#991b1b';
    ctx.fillRect(hx - holeW / 2, holeY + holeH - 1.5, holeW, 1.5);
  }

  // 8. Ranhuras de alvenaria e porosidade do tijolo
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(-hbw + 4, -hbh + 4, 1.5, bh - 8);
  ctx.fillRect(hbw - 6, -hbh + 4, 1.5, bh - 8);

  // 9. Contorno externo nítido estilo Atari
  ctx.strokeStyle = '#450a0a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-hbw, -hbh, bw, bh);

  ctx.restore();
}

function drawFire(f) {
  ctx.save();
  const floorY = FLOORS.find(fl => fl.id === f.floor).floorY;
  ctx.translate(f.x, floorY);

  // Sombra suave sob a lixeira de fogo no chão 2.5D
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 15, 4, 0, 0, TAU);
  ctx.fill();

  // Brilho alaranjado suave no piso sob as chamas
  const pulse = Math.sin(f.anim * TAU);
  ctx.fillStyle = 'rgba(249, 115, 22, 0.18)';
  ctx.beginPath();
  ctx.ellipse(0, -2, 22 + pulse * 3, 5, 0, 0, TAU);
  ctx.fill();

  // Corpo metálico da lixeira
  ctx.fillStyle = '#334155';
  ctx.fillRect(-12, -18, 24, 18);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-14, -20, 28, 4);

  // Chamas animadas retrô
  const flameH = 16 + pulse * 5;
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.moveTo(-10, -20);
  ctx.lineTo(0, -20 - flameH);
  ctx.lineTo(10, -20);
  ctx.fill();

  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.moveTo(-6, -20);
  ctx.lineTo(0, -20 - flameH * 0.7);
  ctx.lineTo(6, -20);
  ctx.fill();

  // Fagulha subindo
  const sparkY = -20 - flameH - ((f.anim * 24) % 12);
  const sparkX = Math.sin(f.anim * TAU * 2) * 5;
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(sparkX, sparkY, 2, 2);

  ctx.restore();
}

function drawPlane(p) {
  ctx.save();
  ctx.translate(p.x, p.y);

  ctx.fillStyle = '#dc2626';
  ctx.fillRect(-22, -14, 44, 5);
  ctx.fillRect(-22, 8, 44, 5);
  ctx.fillStyle = '#b91c1c';
  ctx.fillRect(-18, -4, 38, 9);

  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.strokeRect(-16, -14, 32, 24);

  ctx.fillStyle = '#fed7aa';
  ctx.fillRect(-2, -9, 8, 6);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(-2, -9, 4, 3);

  ctx.fillStyle = '#ffffff';
  const propY = Math.sin(p.propAngle) * 14;
  ctx.fillRect(-22, -propY / 2, 3, propY);

  ctx.restore();
}

function drawCollectible(it) {
  ctx.save();
  ctx.translate(it.x, it.y);

  if (it.type === 'money') {
    // Maleta clássica marrom com fecho dourado e cifrão verde (Fase 1)
    ctx.fillStyle = '#b45309';
    ctx.fillRect(-12, -10, 24, 16);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(-10, -8, 20, 12);
    ctx.fillStyle = '#15803d';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('$', 0, 1);
  } else if (it.type === 'gold') {
    // Barras de Ouro 999 Maciço com reflexo metálico chanfrado (Fase 2)
    // Barra inferior
    ctx.fillStyle = '#b45309';
    ctx.fillRect(-12, -2, 24, 10);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(-11, -1, 22, 7);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(-10, -1, 20, 2);

    // Barra superior
    ctx.fillStyle = '#b45309';
    ctx.fillRect(-9, -9, 18, 9);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(-8, -8, 16, 6);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(-7, -8, 14, 2);

    // Brilho cintilante animado
    const glint = (Math.sin(GAME_TIME * 6) + 1) * 0.5;
    if (glint > 0.6) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(4, -9, 3, 3);
      ctx.fillRect(2, -8, 7, 1);
    }
  } else if (it.type === 'diamond') {
    // Diamantes Lapidados reluzentes estilo arcade (Fase 3)
    // Faceta superior plana (mesa)
    ctx.fillStyle = '#e0f2fe';
    ctx.beginPath();
    ctx.moveTo(-6, -9);
    ctx.lineTo(6, -9);
    ctx.lineTo(9, -4);
    ctx.lineTo(-9, -4);
    ctx.closePath();
    ctx.fill();

    // Pavilhão inferior apontando para baixo
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(-9, -4);
    ctx.lineTo(9, -4);
    ctx.lineTo(0, 9);
    ctx.closePath();
    ctx.fill();

    // Facetas com reflexo azul royal profundo
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.moveTo(-3, -4);
    ctx.lineTo(3, -4);
    ctx.lineTo(0, 9);
    ctx.closePath();
    ctx.fill();

    // Faísca branca de brilho
    const glint = (Math.sin(GAME_TIME * 7) + 1) * 0.5;
    if (glint > 0.5) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-2, -9, 4, 3);
    }
  } else if (it.type === 'crown') {
    // Coroa Imperial com joias preciosas (Fase 4)
    ctx.fillStyle = '#b45309';
    ctx.fillRect(-11, 2, 22, 6);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(-10, 3, 20, 4);

    // 3 Pontas da coroa
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(-10, 2);
    ctx.lineTo(-10, -6);
    ctx.lineTo(-5, -1);
    ctx.lineTo(0, -9);
    ctx.lineTo(5, -1);
    ctx.lineTo(10, -6);
    ctx.lineTo(10, 2);
    ctx.closePath();
    ctx.fill();

    // Pontas douradas polidas
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(-11, -8, 3, 3);
    ctx.fillRect(-1, -11, 3, 3);
    ctx.fillRect(8, -8, 3, 3);

    // Rubi central e esmeraldas nas laterais
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-1, 4, 3, 3);
    ctx.fillStyle = '#10b981';
    ctx.fillRect(-7, 4, 2, 2);
    ctx.fillRect(5, 4, 2, 2);
  } else if (it.type === 'trophy') {
    // Troféu Supremo / Cálice da Vitória em Ouro Puro (Fase 5+)
    ctx.fillStyle = '#18181b';
    ctx.fillRect(-7, 4, 14, 5); // Base
    ctx.fillStyle = '#facc15';
    ctx.fillRect(-5, 5, 10, 2); // Plaqueta

    // Haste e taça
    ctx.fillStyle = '#eab308';
    ctx.fillRect(-2, 0, 4, 4);
    ctx.beginPath();
    ctx.moveTo(-8, -8);
    ctx.lineTo(8, -8);
    ctx.lineTo(6, 0);
    ctx.lineTo(-6, 0);
    ctx.closePath();
    ctx.fill();

    // Alças do troféu
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    ctx.strokeRect(-11, -6, 3, 5);
    ctx.strokeRect(8, -6, 3, 5);

    // Brilho superior
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-4, -7, 4, 2);
  } else if (it.type === 'clock') {
    const isGoldClock = it.tier && it.tier >= 3;
    ctx.fillStyle = isGoldClock ? '#38bdf8' : '#facc15';
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill();

    // Campainhas de despertador retro
    ctx.fillStyle = isGoldClock ? '#38bdf8' : '#facc15';
    ctx.fillRect(-8, -11, 4, 3);
    ctx.fillRect(4, -11, 4, 3);

    // Ponteiros
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(0, -5);
    ctx.moveTo(0, 0); ctx.lineTo(4, 0);
    ctx.stroke();
  }

  ctx.restore();
}

// ============================================================================
// TOPO DA TELA (HUD & DEGRADÊ PÔR DO SOL ATARI 2600 DINÂMICO)
// ============================================================================
function drawTopHUD() {
  const theme = getCurrentTheme();
  ctx.save();
  // Fundo preto superior
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, VW, 80);

  // Vidas à esquerda: Três chapéus de policial pretos (🎩 🎩 🎩) exatamente como na imagem
  for (let i = 0; i < LIVES; i++) {
    const hx = 65 + i * 40;
    ctx.fillStyle = '#ffffff'; // Pequeno brilho
    ctx.fillRect(hx - 14, 55, 28, 4);
    ctx.fillStyle = '#000000';
    ctx.fillRect(hx - 12, 53, 24, 4); // Aba do chapéu
    ctx.fillRect(hx - 9, 36, 18, 18); // Copa do chapéu
    ctx.fillStyle = '#fcd34d';
    ctx.fillRect(hx - 2, 42, 4, 4);   // Emblema
  }

  // Cronômetro grande no centro
  ctx.textAlign = 'center';
  const timerSec = Math.max(0, Math.ceil(TIMER));
  const isUrgent = timerSec <= 10;
  const isBlink = isUrgent && Math.floor(GAME_TIME * 6) % 2 === 0;

  ctx.fillStyle = isUrgent ? (isBlink ? '#ef4444' : '#facc15') : '#ffffff';
  ctx.font = isUrgent ? '900 42px monospace' : '900 36px monospace';
  ctx.fillText(timerSec.toString().padStart(2, '0'), VW / 2, 40);

  // Pontuação logo abaixo do cronômetro
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 28px monospace';
  ctx.fillText(SCORE.toString(), VW / 2, 70);

  // Indicador de Fase e Tesouro Atual no topo direito
  ctx.textAlign = 'right';
  ctx.font = 'bold 15px monospace';
  ctx.fillStyle = '#facc15';
  ctx.fillText(`FASE ${ROUND}: ${theme.name}`, VW - 24, 38);
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`QUADRO ${CURRENT_ROOM + 1}/3 · ${theme.itemName}`, VW - 24, 58);

  // DEGRADÊ PÔR DO SOL ATARI (Faixa raster colorida com dentes/ameias da imagem)
  const sunsetColors = theme.sunsetColors;
  for (let i = 0; i < sunsetColors.length; i++) {
    const sy = 80 + i * 4;
    ctx.fillStyle = sunsetColors[i];
    ctx.fillRect(0, sy, VW, 4);
  }

  // Dentes/ameias na linha inferior do pôr do sol
  ctx.fillStyle = sunsetColors[sunsetColors.length - 1];
  for (let tx = 20; tx < VW; tx += 60) {
    ctx.fillRect(tx, 100, 36, 6);
  }

  ctx.restore();
}

// ============================================================================
// ALERTA DE CONTAGEM REGRESSIVA PISCANTE (ÚLTIMOS 10 SEGUNDOS)
// ============================================================================
function drawUrgentCountdown() {
  if (STATE !== 'play' || TIMER > 10.0 || TIMER <= 0) return;

  const timerSec = Math.max(0, Math.ceil(TIMER));
  const isBlink = Math.floor(GAME_TIME * 5) % 2 === 0;

  ctx.save();

  // 1. Bordas piscantes vermelhas de emergência em volta de toda a tela (vinheta)
  if (isBlink) {
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, VW - 10, VH - 10);
  }

  // 2. Banner de Alerta e Contagem Regressiva Piscante Centralizado
  const bannerW = 580;
  const bannerH = 42;
  const bannerX = (VW - bannerW) / 2;
  const bannerY = 114; // Posicionado com destaque logo abaixo do pôr do sol

  // Fundo pulsante vermelho/vinho
  ctx.fillStyle = isBlink ? '#dc2626' : '#991b1b';
  ctx.fillRect(bannerX, bannerY, bannerW, bannerH);

  // Borda neon amarela/dourada
  ctx.strokeStyle = isBlink ? '#fef08a' : '#facc15';
  ctx.lineWidth = 3;
  ctx.strokeRect(bannerX, bannerY, bannerW, bannerH);

  // Texto piscante com contagem regressiva em destaque
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 18px monospace';
  ctx.fillStyle = isBlink ? '#ffffff' : '#fef08a';
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 8;
  ctx.fillText(`⚠️ O LADRÃO ESCAPARÁ EM ${timerSec.toString().padStart(2, '0')}s! ⚠️`, VW / 2, bannerY + bannerH / 2);

  ctx.restore();
}

// ============================================================================
// BANNER RETRÔ DE APRESENTAÇÃO DA FASE (INTRO DE CADA RODADA)
// ============================================================================
function drawRoundBanner(dt) {
  if (ROUND_BANNER_TIMER <= 0) return;
  ROUND_BANNER_TIMER -= dt;

  const theme = getCurrentTheme();
  const alpha = clamp(ROUND_BANNER_TIMER > 0.4 ? 1 : ROUND_BANNER_TIMER / 0.4, 0, 1);

  ctx.save();
  ctx.globalAlpha = alpha;

  const bannerW = 660;
  const bannerH = 96;
  const bannerX = (VW - bannerW) / 2;
  const bannerY = 114;

  // Sombra profunda estilo arcade Atari
  ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
  ctx.fillRect(bannerX - 4, bannerY - 4, bannerW + 8, bannerH + 8);

  // Fundo com a cor da parede temática da fase
  ctx.fillStyle = theme.wallColor;
  ctx.fillRect(bannerX, bannerY, bannerW, bannerH);

  // Borda neon dupla dourada/feixe
  ctx.strokeStyle = theme.beamColor;
  ctx.lineWidth = 3.5;
  ctx.strokeRect(bannerX, bannerY, bannerW, bannerH);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(bannerX + 3, bannerY + 3, bannerW - 6, bannerH - 6);

  // Título principal da Fase
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 24px monospace';
  ctx.fillStyle = theme.beamHighlight || '#fef08a';
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 6;
  ctx.fillText(`★ FASE ${ROUND}: ${theme.name} ★`, VW / 2, bannerY + 26);

  // Subtítulo descritivo
  ctx.font = 'bold 15px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 4;
  ctx.fillText(theme.subname.toUpperCase(), VW / 2, bannerY + 54);

  // Dica / Situação tática
  ctx.font = '12px monospace';
  ctx.fillStyle = '#94a3b8';
  ctx.shadowBlur = 0;
  ctx.fillText(theme.hint, VW / 2, bannerY + 76);

  ctx.restore();
}

// ============================================================================
// RADAR SCANNER INFERIOR EXATAMENTE COMO NA IMAGEM
// ============================================================================
function drawRadarHUD() {
  const theme = getCurrentTheme();
  const radarH = 82;
  const radarY = VH - radarH - 6;
  const radarW = 540;
  const radarX = (VW - radarW) / 2;

  ctx.save();
  // Faixa de fundo cinza da base
  ctx.fillStyle = '#737373';
  ctx.fillRect(0, VH - radarH - 12, VW, radarH + 12);

  // Caixa do Radar (4 trilhos com bordas temáticas)
  ctx.fillStyle = '#1e3a1e';
  ctx.fillRect(radarX, radarY, radarW, radarH);
  ctx.strokeStyle = theme.beamColor;
  ctx.lineWidth = 3;
  ctx.strokeRect(radarX, radarY, radarW, radarH);

  const railH = radarH / 4;
  const toRadarX = wx => radarX + 16 + clamp(wx / LEVEL_WIDTH, 0, 1) * (radarW - 32);

  // 1. Trilhos dos 4 andares
  for (let i = 0; i < 4; i++) {
    const floorNum = 4 - i;
    const ry = radarY + i * railH;

    // Linha do andar sincronizada com a paleta temática da fase
    ctx.fillStyle = (floorNum === 4) ? theme.roofColor : theme.wallColor;
    ctx.fillRect(radarX + 4, ry + 2, radarW - 8, railH - 4);

    // Linha divisória entre andares
    ctx.strokeStyle = theme.beamColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(radarX + 4, ry + railH);
    ctx.lineTo(radarX + radarW - 4, ry + railH);
    ctx.stroke();
  }

  // 2. Poço vertical do Elevador no centro do radar (andares 1 a 3)
  const elevCenterX = toRadarX(ELEVATOR.x + ELEVATOR.w / 2);
  const elevShaftTop = radarY + 1 * railH + 2;      // Andar 3
  const elevShaftBottom = radarY + 4 * railH - 2;   // Andar 1

  ctx.save();
  ctx.strokeStyle = 'rgba(234, 179, 8, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(elevCenterX - 6, elevShaftTop);
  ctx.lineTo(elevCenterX - 6, elevShaftBottom);
  ctx.moveTo(elevCenterX + 6, elevShaftTop);
  ctx.lineTo(elevCenterX + 6, elevShaftBottom);
  ctx.stroke();

  // Cabine do elevador em amarelo retrô brilhante
  const elevFloorI = 4 - ELEVATOR.currentFloor;
  const elevRy = radarY + elevFloorI * railH;
  ctx.fillStyle = '#fef08a';
  ctx.fillRect(elevCenterX - 5, elevRy + 2, 10, railH - 4);
  ctx.strokeStyle = '#ca8a04';
  ctx.lineWidth = 1;
  ctx.strokeRect(elevCenterX - 5, elevRy + 2, 10, railH - 4);
  ctx.restore();

  // 3. Escadas Rolantes conectando os andares no Radar
  for (const esc of ESCALATORS) {
    const iFrom = 4 - esc.fromFloor;
    const iTo = 4 - esc.toFloor;
    const yFrom = radarY + iFrom * railH + railH * 0.5;
    const yTo = radarY + iTo * railH + railH * 0.5;
    const xFrom = toRadarX(esc.x1);
    const xTo = toRadarX(esc.x2);

    ctx.save();

    // Vão escuro da escada unindo os andares
    ctx.strokeStyle = '#050811';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(xFrom, yFrom);
    ctx.lineTo(xTo, yTo);
    ctx.stroke();

    // Trilho / Corrimão diagonal em ciano Atari
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(xFrom, yFrom);
    ctx.lineTo(xTo, yTo);
    ctx.stroke();

    // Degraus animados subindo a rampa
    const numSteps = 4;
    const animOffset = (GAME_TIME * 2.5) % 1;
    for (let s = 0; s < numSteps; s++) {
      const t = (s / numSteps + animOffset * (1 / numSteps)) % 1;
      const stepX = lerp(xFrom, xTo, t);
      const stepY = lerp(yFrom, yTo, t);

      ctx.fillStyle = (s % 2 === 0) ? '#fef08a' : '#ffffff';
      ctx.fillRect(stepX - 4, stepY - 1.5, 8, 3);
    }

    // Indicadores dourados nas plataformas de entrada e saída
    ctx.fillStyle = '#facc15';
    ctx.fillRect(xFrom - 3, yFrom - 3, 6, 6);
    ctx.fillRect(xTo - 3, yTo - 3, 6, 6);

    ctx.restore();
  }

  // 4. Posição dos personagens (Policial e Ladrão) no Radar
  for (let i = 0; i < 4; i++) {
    const floorNum = 4 - i;
    const ry = radarY + i * railH;

    // Policial Kelly (Ponto Verde brilhante com contorno branco)
    if (PLAYER.floor === floorNum) {
      const dotX = toRadarX(PLAYER.x);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(dotX - 4, ry + railH / 2 - 4, 8, 8);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(dotX - 4, ry + railH / 2 - 4, 8, 8);
    }

    // Ladrão Harry (Ponto Preto/Vermelho piscante com contorno)
    if (THIEF.floor === floorNum) {
      const dotX = toRadarX(THIEF.x);
      ctx.fillStyle = Math.floor(GAME_TIME * 8) % 2 === 0 ? '#ef4444' : '#000000';
      ctx.fillRect(dotX - 4, ry + railH / 2 - 4, 8, 8);
      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = 1;
      ctx.strokeRect(dotX - 4, ry + railH / 2 - 4, 8, 8);
    }
  }

  ctx.restore();
}

function drawTouchControls() {
  if (!TOUCH_MODE || PORTRAIT) return;
  const zones = getTouchZones();

  ctx.save();
  ctx.setTransform(DPR * US, 0, 0, DPR * US, 0, 0);

  // Na tela de título, desenha apenas botões utilitários no topo
  const activeZones = (STATE === 'title')
    ? zones.filter(z => ['fullscreen', 'crt', 'mute'].includes(z.id))
    : zones;

  for (const z of activeZones) {
    const isDown = z.code === 'Fullscreen'
      ? isFullscreen()
      : (z.code === 'KeyC' ? CRT_ENABLED : (z.code === 'KeyM' ? MUTED : !!KEYS[z.code]));
    const vr = z.vr || z.r;

    // Fundo em vidro fumê translúcido arcade com halo
    ctx.fillStyle = isDown ? 'rgba(234, 179, 8, 0.42)' : 'rgba(15, 23, 42, 0.52)';
    ctx.strokeStyle = isDown ? '#ffd700' : 'rgba(203, 213, 225, 0.35)';
    ctx.lineWidth = isDown ? 2.5 : 1.5;

    ctx.beginPath();
    ctx.arc(z.x, z.y, vr, 0, TAU);
    ctx.fill();
    ctx.stroke();

    if (isDown) {
      ctx.save();
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.7)';
      ctx.stroke();
      ctx.restore();
    }

    // Texto ou Ícone Central
    ctx.fillStyle = isDown ? '#ffffff' : (['fullscreen', 'crt', 'mute'].includes(z.id) ? '#cbd5e1' : '#f8fafc');
    const isSmall = z.label.length > 2 || vr < 30;
    ctx.font = isSmall ? 'bold 13px monospace' : 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(z.label, z.x, z.y + (isSmall ? 1 : 0));

    // Sublabel discreto para clareza
    if (z.sublabel && vr >= 30) {
      ctx.fillStyle = isDown ? '#fef08a' : 'rgba(148, 163, 184, 0.75)';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(z.sublabel, z.x, z.y + vr + 12);
    }
  }

  ctx.restore();
}

function drawTitleScreen() {
  ctx.fillStyle = '#060911';
  ctx.fillRect(0, 0, VW, VH);

  ctx.save();
  ctx.textAlign = 'center';

  ctx.fillStyle = '#ffd700';
  ctx.font = '900 48px monospace';
  ctx.shadowColor = '#b45309';
  ctx.shadowBlur = 15;
  ctx.fillText('PEGA LADRÃO 2.5D', VW / 2, VH * 0.23);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('KEYSTONE KAPERS CLÁSSICO ATARI', VW / 2, VH * 0.30);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '15px monospace';
  ctx.fillText('Capture o ladrão Harry antes que o tempo esgote!', VW / 2, VH * 0.40);
  ctx.fillText('Navegue pelos 3 quadros e 4 andares usando escadas e elevador.', VW / 2, VH * 0.45);
  ctx.fillText('Cuidado com carrinhos, bolas, fogueiras e aviões!', VW / 2, VH * 0.50);

  if (TOUCH_MODE) {
    // Botão JOGAR NO CELULAR
    ctx.fillStyle = '#15803d';
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(VW / 2 - 130, VH * 0.58, 260, 52, 10);
    else ctx.rect(VW / 2 - 130, VH * 0.58, 260, 52);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 18px monospace';
    ctx.fillText('▶ JOGAR NO CELULAR', VW / 2, VH * 0.58 + 26);

    // Botão TELA CHEIA
    const isFull = isFullscreen();
    ctx.fillStyle = isFull ? '#0369a1' : '#1e293b';
    ctx.strokeStyle = isFull ? '#38bdf8' : '#e5b824';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(VW / 2 - 130, VH * 0.69, 260, 44, 8);
    else ctx.rect(VW / 2 - 130, VH * 0.69, 260, 44);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isFull ? '#7dd3fc' : '#facc15';
    ctx.font = 'bold 15px monospace';
    ctx.fillText(isFull ? '✓ TELA CHEIA ATIVA' : '⛶ ATIVAR TELA CHEIA', VW / 2, VH * 0.69 + 22);

    // Dica de rotação/controles
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px monospace';
    ctx.fillText('Jogue na horizontal com botões virtuais', VW / 2, VH * 0.80);
  } else {
    ctx.fillStyle = '#facc15';
    ctx.font = '15px monospace';
    ctx.fillText('SETAS/WASD: Mover e Pular · ESPAÇO: Pulo · ELEVADOR: Entrar andando ou E / W', VW / 2, VH * 0.64);
    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('PRESSIONE ESPAÇO OU ENTER PARA COMEÇAR', VW / 2, VH * 0.72);

    ctx.fillStyle = '#64748b';
    ctx.font = '13px monospace';
    ctx.fillText('[F: Tela Cheia · Toque/Clique na tela para Controles de Celular]', VW / 2, VH * 0.80);
  }

  ctx.fillStyle = '#94a3b8';
  ctx.font = '13px monospace';
  ctx.fillText(`RECORDE ATUAL: ${HIGH_SCORE} PONTOS`, VW / 2, VH * 0.88);

  ctx.restore();
}

function drawCaughtScreen() {
  ctx.save();
  ctx.fillStyle = 'rgba(6, 9, 17, 0.78)';
  ctx.fillRect(0, 0, VW, VH);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#4ade80';
  ctx.font = '900 44px monospace';
  ctx.fillText('LADRÃO CAPTURADO!', VW / 2, VH * 0.36);

  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 22px monospace';
  ctx.fillText(`BÔNUS DE TEMPO: +${Math.floor(TIMER) * 100} PTS`, VW / 2, VH * 0.46);

  const nextRound = ROUND + 1;
  const nextTheme = PHASE_THEMES[(nextRound - 1) % PHASE_THEMES.length];
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 18px monospace';
  ctx.fillText(`PRÓXIMA: FASE ${nextRound} - ${nextTheme.name.toUpperCase()}`, VW / 2, VH * 0.55);

  ctx.fillStyle = '#ffffff';
  ctx.font = '16px monospace';
  ctx.fillText(TOUCH_MODE ? 'Toque para próxima fase' : 'Pressione ESPAÇO para próxima fase', VW / 2, VH * 0.65);

  ctx.restore();
}

function drawEscapedScreen() {
  ctx.save();
  ctx.fillStyle = 'rgba(6, 9, 17, 0.85)';
  ctx.fillRect(0, 0, VW, VH);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ef4444';
  ctx.font = '900 44px monospace';
  ctx.fillText('O LADRÃO ESCAPOU!', VW / 2, VH * 0.4);

  ctx.fillStyle = '#f87171';
  ctx.font = 'bold 20px monospace';
  ctx.fillText(`Você perdeu uma vida! Vidas restantes: ${LIVES}`, VW / 2, VH * 0.5);

  if (LIVES > 0) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px monospace';
    ctx.fillText(TOUCH_MODE ? 'Toque para tentar novamente' : 'Pressione ESPAÇO para tentar novamente', VW / 2, VH * 0.62);
  }

  ctx.restore();
}

// ============================================================================
// LOOP PRINCIPAL (REQUEST ANIMATION FRAME)
// ============================================================================
let lastTime = 0;

function mainLoop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const rawDt = (timestamp - lastTime) / 1000;
  const dt = Math.min(rawDt, 0.05);
  lastTime = timestamp;

  GAME_TIME += dt;
  pollGamepad();

  // Centraliza o viewport no padrão 960x720 mantendo aspect ratio
  const offsetX = (CW - ROOM_WIDTH * S) / 2;
  const offsetY = (CH - VH * S) / 2;

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, CW, CH);

  ctx.setTransform(DPR * S, 0, 0, DPR * S, offsetX * DPR, offsetY * DPR);

  // CLIPPING GLOBAL: nada pode ser renderizado fora do quadro virtual 960x720
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, ROOM_WIDTH, VH);
  ctx.clip();

  if (STATE === 'title') {
    drawTitleScreen();
    const startTrigger = (
      keyPressed('Space') || keyPressed('Enter') ||
      (TOUCH_MODE && TOUCHES.size > 0)
    );
    if (startTrigger) {
      STATE = 'play';
      resetGame();
    }
  } else if (STATE === 'play') {
    updateTimer(dt);
    updateElevator(dt);
    updatePlayer(dt);
    updateThief(dt);
    updateObstacles(dt);
    checkCollisions();

    draw2DWorld(dt);
    drawRadarHUD();
    drawTopHUD();
    drawUrgentCountdown();
    drawRoundBanner(dt);
  } else if (STATE === 'caught') {
    STATE_TIME += dt;
    draw2DWorld();
    drawRadarHUD();
    drawTopHUD();
    drawCaughtScreen();

    const nextTrigger = (
      STATE_TIME > 0.8 &&
      (keyPressed('Space') || keyPressed('Enter') || (TOUCH_MODE && TOUCHES.size > 0))
    );
    if (nextTrigger) {
      ROUND++;
      STATE = 'play';
      initRound();
    }
  } else if (STATE === 'escaped') {
    STATE_TIME += dt;
    draw2DWorld();
    drawRadarHUD();
    drawTopHUD();
    drawEscapedScreen();

    const retryTrigger = (
      STATE_TIME > 1.2 && LIVES > 0 &&
      (keyPressed('Space') || keyPressed('Enter') || (TOUCH_MODE && TOUCHES.size > 0))
    );
    if (retryTrigger) {
      STATE = 'play';
      initRound();
    }
  } else if (STATE === 'gameover') {
    draw2DWorld();
    drawRadarHUD();
    drawTopHUD();
  }

  ctx.restore();

  // Camada de Controles Móveis (em tela cheia, fora do clipping 4:3)
  if (TOUCH_MODE && !PORTRAIT) {
    drawTouchControls();
  }

  for (const k in KEYS) {
    PREV_KEYS[k] = KEYS[k];
  }

  requestAnimationFrame(mainLoop);
}

// ============================================================================
// DIÁLOGO DE SCORE & RANKING
// ============================================================================
async function obtainSession() {
  try {
    const res = await fetch('/api/session', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      CURRENT_SESSION = data.session;
    }
  } catch (e) {
    CURRENT_SESSION = null;
  }
}

function showScoreDialog() {
  document.body.classList.add('show-score');
  scoreDisplay.textContent = `${SCORE} PONTOS`;
  statsDisplay.textContent = `Fase alcançada: ${ROUND} · Recorde: ${HIGH_SCORE}`;
  modalFeedback.textContent = '';
  rankingContainer.classList.remove('active');
  obtainSession();
}

function hideScoreDialog() {
  document.body.classList.remove('show-score');
}

btnRestart.addEventListener('click', () => {
  hideScoreDialog();
  STATE = 'play';
  resetGame();
});

btnSaveScore.addEventListener('click', async () => {
  const name = playerNameInput.value.trim().toUpperCase();
  if (!name) {
    modalFeedback.textContent = 'Digite seu nome!';
    return;
  }
  btnSaveScore.disabled = true;
  modalFeedback.textContent = 'Enviando...';

  try {
    if (!CURRENT_SESSION) await obtainSession();
    const payload = {
      session: CURRENT_SESSION,
      name,
      score: SCORE,
      time: Math.floor(GAME_TIME),
      round: ROUND,
      lives: LIVES,
      complete: false
    };

    const res = await fetch('/api/ranking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      modalFeedback.style.color = '#4ade80';
      modalFeedback.textContent = 'Pontuação gravada com sucesso!';
      loadRanking();
    } else {
      modalFeedback.style.color = '#f87171';
      modalFeedback.textContent = 'Erro ao gravar pontuação.';
    }
  } catch (e) {
    modalFeedback.style.color = '#f87171';
    modalFeedback.textContent = 'Servidor indisponível.';
  } finally {
    btnSaveScore.disabled = false;
  }
});

btnViewRanking.addEventListener('click', () => {
  rankingContainer.classList.toggle('active');
  if (rankingContainer.classList.contains('active')) {
    loadRanking();
  }
});

async function loadRanking() {
  rankingBody.innerHTML = '<tr><td colspan="4" style="text-align:center">Carregando...</td></tr>';
  try {
    const res = await fetch('/api/ranking?period=all');
    if (res.ok) {
      const data = await res.json();
      if (!data.ranking || data.ranking.length === 0) {
        rankingBody.innerHTML = '<tr><td colspan="4" style="text-align:center">Nenhum recorde ainda!</td></tr>';
        return;
      }
      rankingBody.innerHTML = data.ranking.map((r, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${r.name}</td>
          <td>${r.score}</td>
          <td>${r.round}</td>
        </tr>
      `).join('');
    }
  } catch (e) {
    rankingBody.innerHTML = '<tr><td colspan="4" style="text-align:center">Ranking offline</td></tr>';
  }
}

// ============================================================================
// HOOK PARA TESTES AUTOMATIZADOS E DEPURAÇÃO
// ============================================================================
window.__game = {
  getState: () => STATE,
  setState: s => { STATE = s; },
  getRound: () => ROUND,
  setRound: r => { ROUND = r; initRound(); },
  getCurrentTheme: () => getCurrentTheme(),
  getBannerTimer: () => ROUND_BANNER_TIMER,
  getPlayer: () => ({ ...PLAYER }),
  getThief: () => ({ ...THIEF }),
  getElevator: () => ({ ...ELEVATOR }),
  getRoom: () => CURRENT_ROOM,
  setRoom: r => { CURRENT_ROOM = r; },
  catchThief: () => triggerCaught(),
  tripPlayer: () => tripPlayer(),
  killPlayer: () => killPlayer(),
  getLives: () => LIVES,
  setKey: (k, v) => { KEYS[k] = v; },
  resetGame,
  getObstacles: () => ({
    carts: CARTS.map(c => ({ ...c })),
    balls: BALLS.map(b => ({ ...b })),
    fires: FIRES.map(f => ({ ...f })),
    planes: PLANES.map(p => ({ ...p }))
  }),
  getCollectibles: () => COLLECTIBLES.map(c => ({ ...c })),
  getStorefronts: () => STOREFRONTS.map(s => ({ ...s })),
  getEscalators: () => ESCALATORS.map(e => ({ ...e })),
  drawRadarHUD: () => drawRadarHUD(),
  setPlayerPos: (x, y, floor, onGround) => {
    if (x !== undefined) PLAYER.x = x;
    if (y !== undefined) PLAYER.y = y;
    if (floor !== undefined) PLAYER.floor = floor;
    if (onGround !== undefined) {
      PLAYER.onGround = onGround;
    } else if (y !== undefined) {
      const fl = FLOORS.find(f => f.id === PLAYER.floor);
      PLAYER.onGround = fl ? (y >= fl.floorY) : true;
    }
  },
  getTimer: () => TIMER,
  setTimer: t => { TIMER = t; },
  isTouchMode: () => TOUCH_MODE,
  setTouchMode: v => { TOUCH_MODE = v; resize(); },
  isFullscreen: () => isFullscreen(),
  toggleFullscreen: () => toggleFullscreen(),
  getTouchZones: () => getTouchZones(),
  getTitleButtons: () => getTitleButtons(),
  handlePointerDown: (x, y, id = 1) => handlePointerDown({ clientX: x, clientY: y, pointerId: id, cancelable: false }),
  handlePointerUp: (id = 1) => handlePointerUp({ pointerId: id }),
  step: dt => {
    updateTimer(dt);
    updateElevator(dt);
    updatePlayer(dt);
    updateThief(dt);
    updateObstacles(dt);
    checkCollisions();
  }
};

resize();
requestAnimationFrame(mainLoop);

})();
