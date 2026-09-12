'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function bootGame(touch = false) {
  const listeners = {};
  const cvListeners = {};
  const ui = {};

  const context = new Proxy({}, {
    get: () => () => {},
    set: () => true
  });

  const element = id => ({
    style: {},
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    classList: {
      toggle(name, on) { ui[name] = on; },
      add(name) { ui[name] = true; },
      remove(name) { ui[name] = false; },
      contains(name) { return !!ui[name]; }
    },
    addEventListener(name, fn) {
      if (id === 'game') cvListeners[name] = fn;
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    getContext: () => context
  });

  class MockAudioContext {
    constructor() {
      this.sampleRate = 8000;
      this.currentTime = 0;
      this.state = 'running';
      this.destination = {};
    }
    createGain() {
      return { gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
    }
    createOscillator() {
      return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} };
    }
    createBufferSource() {
      return { connect() {}, start() {} };
    }
    createBiquadFilter() {
      return { frequency: { value: 0 }, connect() {} };
    }
    createBuffer(ch, len) {
      return { getChannelData: () => new Float32Array(len) };
    }
    resume() { return Promise.resolve(); }
  }

  const document = {
    getElementById: id => element(id),
    createElement: id => element(id),
    body: element('body')
  };

  const window = {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    location: { search: touch ? '?touch=1' : '' },
    AudioContext: MockAudioContext,
    matchMedia: () => ({ matches: touch }),
    addEventListener: (name, fn) => { listeners[name] = fn; },
    visualViewport: { width: 1280, height: 720, addEventListener() {} }
  };

  const storage = {};
  const localStorage = {
    getItem: k => Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null,
    setItem: (k, v) => { storage[k] = String(v); }
  };

  const navigator = {
    maxTouchPoints: touch ? 5 : 0,
    getGamepads: () => []
  };

  const sandbox = {
    window,
    document,
    navigator,
    localStorage,
    URLSearchParams,
    Uint8ClampedArray,
    requestAnimationFrame() {},
    setTimeout() {},
    clearTimeout() {},
    fetch: async () => ({ ok: true, json: async () => ({ session: 'mock-session' }) }),
    console
  };

  const code = fs.readFileSync(require.resolve('./game.js'), 'utf8');
  vm.runInNewContext(code, sandbox);

  const game = window.__game;
  return {
    game,
    keyDown: code => listeners.keydown && listeners.keydown({ code, preventDefault() {} }),
    keyUp: code => listeners.keyup && listeners.keyup({ code, preventDefault() {} }),
    pointerDown: (x, y, id = 1) => cvListeners.pointerdown && cvListeners.pointerdown({ clientX: x, clientY: y, pointerId: id, preventDefault() {} }),
    pointerUp: id => cvListeners.pointerup && cvListeners.pointerup({ pointerId: id })
  };
}

test('inicializa o jogo e entidades no estado correto', () => {
  const env = bootGame();
  assert.ok(env.game);
  assert.equal(env.game.getState(), 'title');

  env.game.setState('play');
  env.game.resetGame();

  const p = env.game.getPlayer();
  assert.equal(p.floor, 1);
  assert.equal(p.onGround, true);
  assert.equal(p.isDucking, false);
  assert.ok(p.x > 0);

  const t = env.game.getThief();
  assert.equal(t.floor, 1);
  assert.ok(t.x > p.x); // Ladrão inicia na frente do policial

  const e = env.game.getElevator();
  assert.equal(e.currentFloor, 1);
});

test('jogador corre para a direita ao pressionar tecla', () => {
  const env = bootGame();
  env.game.setState('play');
  env.game.resetGame();

  const initialX = env.game.getPlayer().x;
  env.game.setKey('ArrowRight', true);

  // Simular 10 frames de física
  for (let i = 0; i < 10; i++) env.game.step(0.016);

  const newX = env.game.getPlayer().x;
  assert.ok(newX > initialX, 'Jogador deve se mover para a direita');
});

test('jogador agacha ao pressionar ArrowDown', () => {
  const env = bootGame();
  env.game.setState('play');
  env.game.resetGame();

  env.game.setKey('ArrowDown', true);
  env.game.step(0.016);

  const p = env.game.getPlayer();
  assert.equal(p.isDucking, true);
  assert.equal(p.h, 32); // Altura reduzida para desviar de aviões
});

test('capturar o ladrão avança o estado para caught', () => {
  const env = bootGame();
  env.game.setState('play');
  env.game.resetGame();

  assert.equal(env.game.getState(), 'play');
  env.game.catchThief();
  assert.equal(env.game.getState(), 'caught');
});

test('tropeçar em obstáculo atordoa o jogador temporariamente', () => {
  const env = bootGame();
  env.game.setState('play');
  env.game.resetGame();

  env.game.tripPlayer();
  const p = env.game.getPlayer();
  assert.ok(p.stunnedTime > 0, 'Jogador deve ficar com tempo de atordoamento');
});

test('elevador opera e atualiza posição no tempo', () => {
  const env = bootGame();
  env.game.setState('play');
  env.game.resetGame();

  const initialElev = env.game.getElevator();
  assert.equal(initialElev.currentFloor, 1);

  // Avançar alguns segundos para fechar e mover
  for (let i = 0; i < 200; i++) env.game.step(0.02);

  const updatedElev = env.game.getElevator();
  assert.ok(updatedElev.state === 'moving' || updatedElev.state === 'opening' || updatedElev.currentFloor > 1);
});

test('troca de quadro (flip-screen) quando o jogador alcança a borda da tela', () => {
  const env = bootGame();
  env.game.setState('play');
  env.game.resetGame();

  assert.equal(env.game.getRoom(), 0);

  // Simular corrida até atravessar a borda do Quadro 0 (960px)
  env.game.setKey('ArrowRight', true);
  for (let i = 0; i < 200; i++) env.game.step(0.03);

  assert.ok(env.game.getRoom() >= 1, 'Deve avançar para o próximo quadro');
});

test('início da rodada tem apenas 1 obstáculo no Quadro 0 com distância segura do policial', () => {
  const env = bootGame();
  env.game.setState('play');
  env.game.resetGame();

  const p = env.game.getPlayer();
  const obs = env.game.getObstacles();

  // Filtrar obstáculos no 1º andar dentro do Quadro 0 (x < 960)
  const floor1Room0Carts = obs.carts.filter(c => c.floor === 1 && c.x < 960);
  const floor1Room0Balls = obs.balls.filter(b => b.floor === 1 && b.x < 960);
  const floor1Room0Fires = obs.fires.filter(f => f.floor === 1 && f.x < 960);

  const totalObstaclesInRoom0 = floor1Room0Carts.length + floor1Room0Balls.length + floor1Room0Fires.length;
  assert.equal(totalObstaclesInRoom0, 1, 'Deve haver exatamente 1 obstáculo no Quadro 0 no início');
  assert.equal(floor1Room0Balls.length, 0, 'Não deve haver bolas no Quadro 0 no início');

  const firstObstacle = floor1Room0Carts[0];
  const distance = firstObstacle.x - p.x;
  assert.ok(distance >= 600, `Distância inicial deve ser segura (atual: ${distance}px)`);
});

test('garante espaçamento seguro após wrap-around dos obstáculos no 1º andar', () => {
  const env = bootGame();
  env.game.setState('play');
  env.game.resetGame();

  // Simular 30 segundos de movimentação de obstáculos
  for (let i = 0; i < 900; i++) {
    env.game.step(0.033);
    const obs = env.game.getObstacles();
    const floor1Obs = [
      ...obs.carts.filter(c => c.floor === 1),
      ...obs.balls.filter(b => b.floor === 1)
    ].sort((a, b) => a.x - b.x);

    // Checar se quaisquer dois obstáculos no 1º andar ficam perigosamente colados (< 200px)
    for (let j = 0; j < floor1Obs.length - 1; j++) {
      const dist = floor1Obs[j + 1].x - floor1Obs[j].x;
      assert.ok(dist >= 200, `Obstáculos no 1º andar não devem se aglomerar (distância: ${dist}px)`);
    }
  }
});

test('vitrines azuis 2.5D têm distribuições assimétricas por andar e não colidem com escadas ou elevador', () => {
  const env = bootGame();
  const sfs = env.game.getStorefronts();
  assert.ok(Array.isArray(sfs) && sfs.length > 0, 'Deve possuir vitrines cadastradas');

  // Separar vitrines por andar no Quadro 0 (x < 960)
  const room0F1 = sfs.filter(s => s.floor === 1 && s.x < 960);
  const room0F2 = sfs.filter(s => s.floor === 2 && s.x < 960);
  const room0F3 = sfs.filter(s => s.floor === 3 && s.x < 960);

  // Não podem ter a mesma quantidade e posições idênticas
  const posF1 = room0F1.map(s => s.x).join(',');
  const posF2 = room0F2.map(s => s.x).join(',');
  const posF3 = room0F3.map(s => s.x).join(',');

  assert.notEqual(posF1, posF2, '1º e 2º andar não podem ter vitrines nas mesmas posições');
  assert.notEqual(posF2, posF3, '2º e 3º andar não podem ter vitrines nas mesmas posições');
  assert.notEqual(posF1, posF3, '1º e 3º andar não podem ter vitrines nas mesmas posições');

  // No 3º andar do Quadro 0, deve ter exatamente 2 lojas com centro livre (estilo Atari)
  assert.equal(room0F3.length, 2, '3º andar deve ter 2 vitrines espaçadas');

  // Nenhuma vitrine deve sobrepor a escada rolante do Quadro 0 (x entre 40 e 280) nos andares 2 e 3
  for (const s of sfs) {
    if ((s.floor === 2 || s.floor === 3) && s.x < 960) {
      assert.ok(s.x > 280 || s.x + s.w < 40, `Vitrine em x=${s.x} colide com escada rolante do Quadro 0`);
    }
    // Nenhuma vitrine deve sobrepor o poço do elevador (x entre 1380 e 1520)
    if (s.x > 960 && s.x < 1920) {
      assert.ok(s.x > 1520 || s.x + s.w < 1380, `Vitrine em x=${s.x} colide com elevador`);
    }
  }
});

test('jogador entra no elevador ao caminhar para dentro ou pressionar tecla de ação', () => {
  const env = bootGame();
  env.game.setState('play');
  env.game.resetGame();

  // Posicionar jogador no Quadro 1 exatamente na porta do elevador (x=1440, floor 1)
  env.game.setPlayerPos(1440, 610, 1);
  env.game.step(0.016);

  // O jogador deve entrar automaticamente ao estar dentro da cabine aberta
  const p = env.game.getPlayer();
  assert.equal(p.inElevator, true, 'Jogador deve entrar no elevador aberto');

  // Ao pressionar Seta para a Esquerda com portas abertas, deve sair da cabine
  env.game.setKey('ArrowLeft', true);
  env.game.step(0.016);
  env.game.setKey('ArrowLeft', false);

  const pAfterExit = env.game.getPlayer();
  assert.equal(pAfterExit.inElevator, false, 'Jogador deve sair ao caminhar para fora com portas abertas');
});

test('policial dentro do elevador não recebe dano de obstáculos nem perde vidas', () => {
  const env = bootGame();
  env.game.setState('play');
  env.game.resetGame();

  // Posicionar jogador na porta do elevador para entrar
  env.game.setPlayerPos(1440, 610, 1);
  env.game.step(0.016);

  const p = env.game.getPlayer();
  assert.equal(p.inElevator, true, 'Jogador deve estar no elevador');

  const initialLives = env.game.getLives();
  const initialTimer = env.game.getTimer();

  // Tentativa de causar dano por tropeço ou morte direta dentro do elevador
  env.game.tripPlayer();
  assert.equal(env.game.getPlayer().stunnedTime, 0, 'Jogador não deve ser atordoado dentro do elevador');
  assert.equal(env.game.getTimer(), initialTimer, 'Timer não deve ser reduzido por dano dentro do elevador');

  env.game.killPlayer();
  assert.equal(env.game.getLives(), initialLives, 'Vidas não devem ser reduzidas dentro do elevador');
  assert.equal(env.game.getPlayer().stunnedTime, 0);

  // Simular múltiplos passos com obstáculos no mesmo andar
  for (let i = 0; i < 60; i++) env.game.step(0.016);
  assert.equal(env.game.getLives(), initialLives);
  assert.equal(env.game.getPlayer().stunnedTime, 0);
});

test('policial corre para dentro do elevador mantendo a tecla e permanece seguro sem ejeção acidental', () => {
  const env = bootGame();
  env.game.setState('play');
  env.game.resetGame();

  // Posiciona o policial perto do elevador correndo para a direita
  env.game.setPlayerPos(1390, 610, 1);
  env.game.setKey('ArrowRight', true);

  // Avança até entrar no elevador
  for (let i = 0; i < 10; i++) env.game.step(0.0166);

  const pInside = env.game.getPlayer();
  assert.equal(pInside.inElevator, true, 'Policial deve permanecer no elevador após correr para dentro dele');
  assert.equal(pInside.x, 1455, 'Policial deve estar centralizado na cabine do elevador');

  const initialLives = env.game.getLives();

  // Forçar colisão de carrinho passando pelo centro do elevador
  const obs = env.game.getObstacles();
  if (obs.carts.length > 0) {
    obs.carts[0].x = 1455;
    obs.carts[0].floor = 1;
  }

  // Avança vários passos enquanto o policial está dentro
  for (let i = 0; i < 20; i++) env.game.step(0.0166);

  assert.equal(env.game.getLives(), initialLives, 'Policial não deve perder vidas para obstáculos passando pelo elevador');
  assert.equal(env.game.getPlayer().stunnedTime, 0, 'Policial não deve ser atordoado dentro do elevador');
});

test('movimento das pernas correndo é cadenciado e ritmado no estilo clássico', () => {
  const env = bootGame();
  env.game.setState('play');
  env.game.resetGame();

  // Pressionar tecla para correr para a direita
  env.game.setKey('ArrowRight', true);

  // Em 0.5 segundos de corrida
  for (let i = 0; i < 30; i++) env.game.step(0.0166);

  const p = env.game.getPlayer();
  assert.ok(p.stepAnim > 5, 'Animação de pernas deve avançar ritmada durante a corrida');
  assert.ok(p.vx > 100, 'Jogador deve estar se movendo com boa velocidade');
});

test('contagem regressiva abaixo de 10 segundos funciona e aciona escape do ladrão ao zerar', () => {
  const env = bootGame();
  env.game.setState('play');
  env.game.resetGame();

  env.game.setTimer(10.0);
  assert.equal(env.game.getTimer(), 10.0);

  // Avançar 9.5 segundos
  for (let i = 0; i < 95; i++) env.game.step(0.1);
  assert.ok(env.game.getTimer() <= 0.6, 'Tempo deve decair até os segundos finais');

  // Zerar o tempo (1 segundo adicional)
  for (let i = 0; i < 20; i++) env.game.step(0.1);
  assert.equal(env.game.getTimer(), 0);
  assert.equal(env.game.getState(), 'escaped', 'Ladrão deve escapar quando o tempo zerar');
});

test('altura do pulo é suficiente para desviar de carrinhos mas não ultrapassa o teto', () => {
  const env = bootGame();
  env.game.setState('play');
  env.game.resetGame();

  const initialY = env.game.getPlayer().y; // 610
  env.game.setKey('Space', true);
  env.game.step(0.016);
  env.game.setKey('Space', false);

  let minY = initialY;
  for (let i = 0; i < 60; i++) {
    env.game.step(0.016);
    const p = env.game.getPlayer();
    if (p.y < minY) minY = p.y;
  }

  const jumpApexHeight = initialY - minY;
  // Deve pular no mínimo 42px (para desviar de carrinho de 36px)
  assert.ok(jumpApexHeight >= 42, `Pulo deve ser alto o suficiente para saltar carrinho (altura: ${jumpApexHeight}px)`);

  // A cabeça (y - 56) no topo do pulo nunca pode ultrapassar o teto do 1º andar (ceilingY = 492)
  const headTopApex = minY - 56;
  assert.ok(headTopApex >= 492, `Cabeça não pode ultrapassar o teto/viga do andar superior (topo da cabeça: ${headTopApex}px vs teto: 492px)`);
});

test('fases possuem paletas visuais distintas e rotação temática autêntica', () => {
  const env = bootGame();
  env.game.setState('play');

  // Fase 1: Catedral Clássica (Verde / Dourado)
  env.game.setRound(1);
  const theme1 = env.game.getCurrentTheme();
  assert.equal(theme1.name, 'CATEDRAL CLÁSSICA');
  assert.equal(theme1.wallColor, '#1b4332');
  assert.equal(theme1.beamColor, '#d4af37');

  // Fase 2: Galeria Imperial (Azul Marinho / Cromo)
  env.game.setRound(2);
  const theme2 = env.game.getCurrentTheme();
  assert.equal(theme2.name, 'GALERIA IMPERIAL');
  assert.equal(theme2.wallColor, '#0f172a');
  assert.equal(theme2.beamColor, '#38bdf8');
  assert.notEqual(theme1.wallColor, theme2.wallColor, 'Paredes devem ter cores diferentes entre fases');

  // Fase 3: Palácio Carmesim (Vinho / Âmbar)
  env.game.setRound(3);
  const theme3 = env.game.getCurrentTheme();
  assert.equal(theme3.name, 'PALÁCIO CARMESIM');
  assert.equal(theme3.wallColor, '#450a0a');
  assert.notEqual(theme2.wallColor, theme3.wallColor);

  // Fase 4: Torre Esmeralda
  env.game.setRound(4);
  const theme4 = env.game.getCurrentTheme();
  assert.equal(theme4.name, 'TORRE ESMERALDA');
  assert.equal(theme4.wallColor, '#064e3b');

  // Fase 5: Praça Obsidiana
  env.game.setRound(5);
  const theme5 = env.game.getCurrentTheme();
  assert.equal(theme5.name, 'PRAÇA OBSIDIANA');
  assert.equal(theme5.wallColor, '#18181b');
});

test('vantagem inicial do ladrão e perigos escalonam com o avanço das fases', () => {
  const env = bootGame();
  env.game.setState('play');

  // Fase 1: Harry começa no 1º Andar
  env.game.setRound(1);
  const t1 = env.game.getThief();
  assert.equal(t1.floor, 1, 'Na Fase 1, Harry começa no 1º Andar');
  assert.equal(t1.x, 1100);
  const obs1 = env.game.getObstacles();
  assert.equal(obs1.planes.length, 2, 'Fase 1 possui 2 aviões');
  assert.equal(obs1.fires.length, 3, 'Fase 1 possui 3 fogueiras');

  // Fase 2: Harry ganha vantagem e começa já no 2º Andar!
  env.game.setRound(2);
  const t2 = env.game.getThief();
  assert.equal(t2.floor, 2, 'Na Fase 2, Harry começa já no 2º Andar');
  assert.equal(t2.facing, -1, 'Na Fase 2, Harry corre para a esquerda rumo à escada do 3º andar');
  const obs2 = env.game.getObstacles();
  assert.equal(obs2.fires.length, 4, 'Fase 2 adiciona nova fogueira');

  // Fase 3: Harry começa no 2º Andar já próximo da escada para o 3º Andar
  env.game.setRound(3);
  const t3 = env.game.getThief();
  assert.equal(t3.floor, 2);
  assert.equal(t3.x, 650, 'Na Fase 3, Harry começa em fuga veloz próximo da escada');
  const obs3 = env.game.getObstacles();
  assert.equal(obs3.planes.length, 3, 'Fase 3 possui 3 aviões rasantes no telhado');

  // Fase 4: Harry começa já no 3º Andar!
  env.game.setRound(4);
  const t4 = env.game.getThief();
  assert.equal(t4.floor, 3, 'Na Fase 4, Harry começa no 3º Andar');
});

test('coletáveis e tesouros mudam de tipo e aumentam de valor a cada fase', () => {
  const env = bootGame();
  env.game.setState('play');

  // Fase 1: Maletas de dinheiro
  env.game.setRound(1);
  const col1 = env.game.getCollectibles();
  const moneyItems = col1.filter(c => c.type === 'money');
  assert.ok(moneyItems.length > 0, 'Fase 1 possui maletas de dinheiro');
  assert.equal(moneyItems[0].val, 300);

  // Fase 2: Barras de ouro com pontuação duplicada
  env.game.setRound(2);
  const col2 = env.game.getCollectibles();
  const goldItems = col2.filter(c => c.type === 'gold');
  assert.ok(goldItems.length > 0, 'Fase 2 possui barras de ouro');
  assert.equal(goldItems[0].val, 600, 'Barras de ouro valem mais pontos que maletas');

  // Fase 3: Diamantes lapidados
  env.game.setRound(3);
  const col3 = env.game.getCollectibles();
  const diamondItems = col3.filter(c => c.type === 'diamond');
  assert.ok(diamondItems.length > 0, 'Fase 3 possui diamantes lapidados');
  assert.equal(diamondItems[0].val, 900);

  // Fase 4: Coroas imperiais
  env.game.setRound(4);
  const col4 = env.game.getCollectibles();
  const crownItems = col4.filter(c => c.type === 'crown');
  assert.ok(crownItems.length > 0, 'Fase 4 possui coroas imperiais');
  assert.equal(crownItems[0].val, 1200);

  // Banner da rodada inicia com temporizador ativo
  assert.ok(env.game.getBannerTimer() > 2.0, 'Banner da fase deve exibir intro de rodada');
});

test('colisão com fogueira faz o jogador aparecer do outro lado do fogo sem ficar preso, desconta 9s e retoma controle ágil', () => {
  const env = bootGame();
  env.game.setState('play');
  env.game.resetGame();

  const initialLives = env.game.getLives();
  const initialTimer = env.game.getTimer();

  // Fogueira no 2º Andar está em x=1200, floor=2 (floorY=480)
  // Posiciona o jogador correndo para a esquerda (facing = -1) em direção ao fogo
  env.game.setPlayerPos(1200, 480, 2);
  env.game.setKey('ArrowLeft', true);
  env.game.step(0.016);

  const p = env.game.getPlayer();
  assert.equal(env.game.getLives(), initialLives, 'Colidir com fogo NÃO deve retirar vidas');
  assert.ok(p.stunnedTime > 0 && p.stunnedTime <= 0.35, 'Tempo de atordoamento deve ser ágil (<= 0.35s) para continuar sem demora');
  assert.ok(p.invincibleTime > 0, 'Jogador deve receber tempo de invulnerabilidade piscando');
  assert.ok(Math.abs(env.game.getTimer() - (initialTimer - 9 - 0.016)) < 0.01, 'Colidir com fogo deve descontar 9 segundos no timer');
  assert.ok(p.x < 1200, 'Policial deve aparecer do outro lado do fogo (à esquerda de 1200) para não ficar preso no obstáculo');
});

test('colisão com obstáculo durante o pulo mantém a gravidade ativa até o policial pousar no solo', () => {
  const env = bootGame();
  env.game.setState('play');
  env.game.resetGame();

  // Posiciona o jogador no ar (pulando) no 2º Andar (floorY=480)
  env.game.setPlayerPos(1000, 440, 2, false);
  // Simula estado no ar e atordoamento
  env.game.tripPlayer();

  const pAtordoado = env.game.getPlayer();
  assert.ok(pAtordoado.stunnedTime > 0, 'Jogador está atordoado');

  // Avança a simulação física com passos de tempo
  for (let i = 0; i < 40; i++) {
    env.game.step(0.016);
  }

  const pAposQueda = env.game.getPlayer();
  assert.equal(pAposQueda.y, 480, 'Jogador deve ter caído e pousado no piso (floorY=480), sem flutuar no ar');
  assert.equal(pAposQueda.onGround, true, 'Jogador deve estar com onGround verdadeiro após pousar');
});

test('pulo com timing correto sobre a fogueira permite ultrapassar sem sofrer colisão', () => {
  const env = bootGame();
  env.game.setState('play');
  env.game.resetGame();

  // Posiciona o jogador no topo do pulo sobre a fogueira (fogueira no 2º andar x=1200, topo da fogueira em y=480-26=454)
  // No ápice do pulo, o jogador está em y=480-56=424 (pés acima de 454) com onGround=false
  env.game.setPlayerPos(1200, 424, 2, false);
  env.game.step(0.016);

  const p = env.game.getPlayer();
  assert.equal(p.stunnedTime, 0, 'Jogador no ápice do pulo não deve colidir com a fogueira');
  assert.equal(env.game.getLives(), 3);
});

test('minimapa na parte inferior possui as 3 escadas conectando os andares e executa renderização', () => {
  const env = bootGame();
  env.game.setState('play');
  env.game.resetGame();

  const esc = env.game.getEscalators();
  assert.equal(esc.length, 3, 'Deve haver 3 escadas rolantes configuradas');
  assert.ok(esc.some(e => e.fromFloor === 1 && e.toFloor === 2), 'Escada do 1º para o 2º andar');
  assert.ok(esc.some(e => e.fromFloor === 2 && e.toFloor === 3), 'Escada do 2º para o 3º andar');
  assert.ok(esc.some(e => e.fromFloor === 3 && e.toFloor === 4), 'Escada do 3º para o Telhado');

  // Executa renderização do radar para garantir ausência de erros gráficos
  assert.doesNotThrow(() => {
    env.game.drawRadarHUD();
  }, 'Renderização do radar com escadas e elevador deve executar sem erros');
});


