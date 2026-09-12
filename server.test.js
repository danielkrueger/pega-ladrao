'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createServer, normalizeRankingPeriod, publicScore, validateScore } = require('./server');

test('valida e normaliza pontuação válida do jogador', () => {
  const input = {
    name: '  policial kelly ',
    score: 4250,
    time: 34.82,
    round: 2,
    lives: 3,
    complete: true
  };
  const result = validateScore(input);
  assert.deepEqual(result, {
    name: 'POLICIAL KELLY',
    score: 4250,
    time: 34.8,
    round: 2,
    lives: 3,
    complete: true
  });
});

test('recusa valores adulterados ou maliciosos', () => {
  assert.equal(validateScore({ name: '', score: 100, time: 10, round: 1, lives: 3 }), null);
  assert.equal(validateScore({ name: '<script>alert(1)</script>', score: 100, time: 10, round: 1, lives: 3 }), null);
  assert.equal(validateScore({ name: 'HACKER', score: -100, time: 10, round: 1, lives: 3 }), null);
  assert.equal(validateScore({ name: 'HACKER', score: 999999999, time: 10, round: 1, lives: 3 }), null);
  assert.equal(validateScore({ name: 'HACKER', score: 100, time: -5, round: 1, lives: 3 }), null);
  assert.equal(validateScore({ name: 'HACKER', score: 100, time: 10, round: 0, lives: 3 }), null);
  assert.equal(validateScore({ name: 'HACKER', score: 100, time: 10, round: 1, lives: 99 }), null);
});

test('converte linha de ranking para modelo público', () => {
  const row = {
    id: '42',
    player_name: 'KELLY',
    score: '12500',
    time_seconds: '28.4',
    round: '4',
    lives: '2',
    completed: true
  };
  assert.deepEqual(publicScore(row), {
    id: 42,
    name: 'KELLY',
    score: 12500,
    time: 28.4,
    round: 4,
    lives: 2,
    complete: true
  });
});

test('normaliza períodos de ranking válidos', () => {
  assert.equal(normalizeRankingPeriod('daily'), 'daily');
  assert.equal(normalizeRankingPeriod('weekly'), 'weekly');
  assert.equal(normalizeRankingPeriod('all'), 'all');
  assert.equal(normalizeRankingPeriod('invalid'), 'all');
});

test('valida manifesto PWA e ícones essenciais', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'landscape');
  assert.deepEqual(manifest.icons.map(i => i.sizes), ['192x192', '512x512']);

  for (const [file, size] of [['icons/icon-192.png', 192], ['icons/icon-512.png', 512], ['icons/apple-touch-icon.png', 180]]) {
    const buf = fs.readFileSync(file);
    assert.equal(buf.subarray(1, 4).toString(), 'PNG');
    assert.equal(buf.readUInt32BE(16), size);
    assert.equal(buf.readUInt32BE(20), size);
  }
});

test('ciclo completo de sessão e ranking com servidor HTTP', async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;

    // 1. Obter sessão
    const sessRes = await fetch(`${base}/api/session`, { method: 'POST' });
    assert.equal(sessRes.status, 201);
    const { session } = await sessRes.json();
    assert.equal(typeof session, 'string');

    // 2. Enviar pontuação com sessão válida
    const scoreData = {
      session,
      name: 'AGENTE 2600',
      score: 5600,
      time: 25.3,
      round: 1,
      lives: 3,
      complete: true
    };
    const postRes = await fetch(`${base}/api/ranking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scoreData)
    });
    assert.equal(postRes.status, 201);
    const { score } = await postRes.json();
    assert.equal(score.name, 'AGENTE 2600');
    assert.equal(score.score, 5600);

    // 3. Reusar a mesma sessão deve falhar (uso único)
    const reuseRes = await fetch(`${base}/api/ranking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scoreData)
    });
    assert.equal(reuseRes.status, 401);

    // 4. Consultar ranking
    const getRes = await fetch(`${base}/api/ranking?period=all`);
    assert.equal(getRes.status, 200);
    const { ranking } = await getRes.json();
    assert.ok(Array.isArray(ranking));
    assert.ok(ranking.some(r => r.name === 'AGENTE 2600' && r.score === 5600));
  } finally {
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});
