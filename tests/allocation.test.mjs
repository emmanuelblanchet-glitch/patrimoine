// Seam S-L1-1 : la règle d'allocation, pure.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exposition, ecarts, bandePb, repartirVersement, trajectoire, perteTheoriquePb, CIBLE_PAR_DEFAUT } from '../lib/allocation.mjs';

const L = (classe, valeurCentimes, partActionsPb) => ({ classe, valeurCentimes, partActionsPb });

test('exposition : actions, sans risque, et mixte selon sa part actions', () => {
  const e = exposition([L('actions_monde', 60_000_00), L('sans_risque', 30_000_00), L('mixte', 10_000_00, 5000)]);
  assert.equal(e.totalCentimes, 100_000_00);
  assert.equal(e.parClasse.actions_monde.centimes, 65_000_00);
  assert.equal(e.parClasse.sans_risque.centimes, 35_000_00);
  assert.equal(e.parClasse.actions_monde.poidsPb, 6500);
  assert.equal(e.parClasse.sans_risque.poidsPb, 3500);
});

test('exposition : une ligne non valorisée (0) ou négative ne compte pas ; poche vide = 0 partout', () => {
  const e = exposition([L('actions_monde', 0), L('sans_risque', -5)]);
  assert.equal(e.totalCentimes, 0);
  assert.equal(e.parClasse.actions_monde.poidsPb, 0);
});

test('bande 5/25 : 5 points pour 60 % et 40 %, 2,5 points pour 10 %', () => {
  assert.equal(bandePb(6000), 500);
  assert.equal(bandePb(4000), 500);
  assert.equal(bandePb(1000), 250);
});

test('écarts : signe et appartenance à la bande', () => {
  const e = ecarts(exposition([L('actions_monde', 50_00), L('sans_risque', 50_00)]));
  assert.deepEqual(e.map((x) => [x.classe, x.ecartPb, x.dansLaBande]), [['actions_monde', 1000, false], ['sans_risque', -1000, false]]);
  const ok = ecarts(exposition([L('actions_monde', 58_00), L('sans_risque', 42_00)]));
  assert.ok(ok.every((x) => x.dansLaBande));
});

test('option A : tout le versement va à la classe la plus en retard', () => {
  const expo = exposition([L('actions_monde', 5_000_00), L('sans_risque', 5_000_00)]);
  const r = repartirVersement(500_00, expo);
  assert.equal(r.regle, 'rattrapage');
  assert.equal(r.classeRattrapee, 'actions_monde');
  assert.deepEqual(r.parts, [{ classe: 'actions_monde', centimes: 500_00 }, { classe: 'sans_risque', centimes: 0 }]);
});

test('option A : dans la bande, prorata des cibles, somme exacte au centime', () => {
  const expo = exposition([L('actions_monde', 59_00), L('sans_risque', 41_00)]);
  for (const v of [500_00, 333_33, 1, 0, 999_99]) {
    const r = repartirVersement(v, expo);
    assert.equal(r.regle, 'prorata', String(v));
    assert.equal(r.parts.reduce((s, p) => s + p.centimes, 0), v);
    assert.ok(r.parts.every((p) => p.centimes >= 0));
  }
  assert.deepEqual(repartirVersement(500_00, expo).parts, [{ classe: 'actions_monde', centimes: 300_00 }, { classe: 'sans_risque', centimes: 200_00 }]);
});

test('poche vide : le premier versement part au prorata', () => {
  const r = repartirVersement(500_00, exposition([]));
  assert.equal(r.regle, 'prorata');
  assert.deepEqual(r.parts.map((p) => p.centimes), [300_00, 200_00]);
});

test('quand le sans risque est en retard, c\'est lui qui reçoit', () => {
  const r = repartirVersement(100_00, exposition([L('actions_monde', 80_00), L('sans_risque', 20_00)]));
  assert.equal(r.classeRattrapee, 'sans_risque');
});

test('un versement négatif ou non entier est refusé', () => {
  assert.throws(() => repartirVersement(-1, exposition([])), RangeError);
  assert.throws(() => repartirVersement(1.5, exposition([])), RangeError);
});

test('trajectoire : capitalisation mensuelle, part financière qui monte, estimation arrondie', () => {
  const t = trajectoire({ pocheCentimes: 0, epargneMensuelleCentimes: 500_00, rendementPb: 0, immobilierCentimes: 100_000_00, annees: 2 });
  assert.equal(t.length, 3);
  assert.equal(t[2].pocheCentimes, 12_000_00);
  assert.equal(t[2].partFinancierePb, Math.round((12_000_00 * 10000) / 112_000_00));
  const avec = trajectoire({ pocheCentimes: 10_000_00, epargneMensuelleCentimes: 0, rendementPb: 1200, immobilierCentimes: 0, annees: 1 });
  assert.ok(avec[1].pocheCentimes > 11_200_00 && avec[1].pocheCentimes < 11_300_00, '12 % annuel composé mensuellement ≈ 12,68 %');
  assert.equal(avec[1].partFinancierePb, 10000);
});

test('perte théorique de la cible : 60 % d\'actions qui perdent la moitié = 30 %', () => {
  assert.equal(perteTheoriquePb(CIBLE_PAR_DEFAUT), 3000);
  assert.equal(perteTheoriquePb({ actions_monde: 7000, sans_risque: 3000 }), 3500);
});
