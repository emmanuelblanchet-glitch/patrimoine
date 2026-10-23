// Seam S-L2-3 : plus-value et TRI, sur des exemples à réponse connue.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plusValue, tri, reculJours } from '../lib/performance.mjs';

test('plus-value : euros et points de base du coût ; sans coût, rien', () => {
  assert.deepEqual(plusValue({ valeurCentimes: 11_000, coutCentimes: 10_000 }), { centimes: 1_000, pb: 1000 });
  assert.deepEqual(plusValue({ valeurCentimes: 9_500, coutCentimes: 10_000 }), { centimes: -500, pb: -500 });
  assert.equal(plusValue({ valeurCentimes: 100, coutCentimes: 0 }), null);
  assert.equal(plusValue({ valeurCentimes: null, coutCentimes: 100 }), null);
});

test('TRI : 1 000 placés, 1 100 un an plus tard = 10 %', () => {
  const r = tri([{ date: '2025-01-01', centimes: -100_000 }, { date: '2026-01-01', centimes: 110_000 }]);
  assert.ok(Math.abs(r - 1000) <= 1, `${r} pb`);
});

test('TRI : deux versements, valeur finale connue (exemple classique de XIRR)', () => {
  // 1 000 le 1er janvier, 1 000 le 1er juillet, 2 150 le 1er janvier suivant → ≈ 10,3 % annualisés
  const r = tri([{ date: '2025-01-01', centimes: -100_000 }, { date: '2025-07-01', centimes: -100_000 }, { date: '2026-01-01', centimes: 215_000 }]);
  assert.ok(r > 1000 && r < 1100, `${r} pb`);
});

test('TRI : versements mensuels sans aucun gain = 0 %, avec perte = négatif', () => {
  const flux = [];
  for (let m = 0; m < 12; m++) flux.push({ date: `2025-${String(m + 1).padStart(2, '0')}-01`, centimes: -50_000 });
  assert.ok(Math.abs(tri([...flux, { date: '2026-01-01', centimes: 600_000 }])) <= 1);
  assert.ok(tri([...flux, { date: '2026-01-01', centimes: 540_000 }]) < -1500);
});

test('TRI : refus sans flux, sans signe opposé, ou tout le même jour', () => {
  assert.equal(tri([]), null);
  assert.equal(tri([{ date: '2025-01-01', centimes: -1 }]), null);
  assert.equal(tri([{ date: '2025-01-01', centimes: -1 }, { date: '2026-01-01', centimes: -1 }]), null);
  assert.equal(tri([{ date: '2025-01-01', centimes: -1 }, { date: '2025-01-01', centimes: 2 }]), null);
});

test('recul : jours depuis le premier flux', () => {
  assert.equal(reculJours([{ date: '2026-09-23' }, { date: '2026-10-01' }], '2026-10-23'), 30);
  assert.equal(reculJours([], '2026-10-23'), 0);
});
