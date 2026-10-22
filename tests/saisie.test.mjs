// Lecture des saisies : les montants deviennent des centimes exacts, les
// quotes-parts des fractions, et ce qui est illisible est refusé avec un motif.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lireMontant, lireMontantFacultatif, lireQuotePart, lireTauxPb, lireDate, lireEntier, lireTexte } from '../lib/saisie.mjs';
import { arrondir, fraction } from '../lib/fraction.mjs';

test('montants : formats français et anglais, espaces et symbole €', () => {
  const cas = {
    '123456,78': 12_345_678,
    '123 456,78': 12_345_678,
    '123 456,78 €': 12_345_678,
    '123 456,78': 12_345_678,
    '123456.78': 12_345_678,
    '1200': 120_000,
    '0,5': 50,
    '-50': -5000,
    '0,05': 5,
  };
  for (const [texte, centimes] of Object.entries(cas)) {
    assert.deepEqual(lireMontant(texte), { ok: true, valeur: centimes }, texte);
  }
});

test('montants : trois décimales, séparateurs de milliers ponctués, texte → refus avec motif', () => {
  for (const texte of ['12,345', '1.234,56', 'mille', '12,3,4', '', '€']) {
    const r = lireMontant(texte);
    assert.equal(r.ok, false, texte);
    assert.ok(r.motif.length > 0);
  }
  assert.deepEqual(lireMontantFacultatif(''), { ok: true, valeur: null });
});

test('quotes-parts : fraction, pourcentage, vide = 1', () => {
  assert.deepEqual(lireQuotePart('1/2').valeur, { num: 1, den: 2 });
  assert.deepEqual(lireQuotePart(' 1 / 3 ').valeur, { num: 1, den: 3 });
  assert.deepEqual(lireQuotePart('50 %').valeur, { num: 50, den: 100 });
  assert.deepEqual(lireQuotePart('').valeur, { num: 1, den: 1 });
  assert.deepEqual(lireQuotePart('1').valeur, { num: 1, den: 1 });
  for (const texte of ['0/2', '3/2', '1/0', '0,5', '150%', 'moitié']) {
    assert.equal(lireQuotePart(texte).ok, false, texte);
  }
});

test('taux en points de base', () => {
  assert.equal(lireTauxPb('3,25').valeur, 325);
  assert.equal(lireTauxPb('1.5 %').valeur, 150);
  assert.equal(lireTauxPb('').valeur, null);
  assert.equal(lireTauxPb('3,255').ok, false);
});

test('dates : format ISO et calendrier réel', () => {
  assert.equal(lireDate('2026-10-22').valeur, '2026-10-22');
  assert.equal(lireDate('2024-02-29').valeur, '2024-02-29');
  assert.equal(lireDate('2026-02-29').ok, false);
  assert.equal(lireDate('22/10/2026').ok, false);
  assert.equal(lireDate('').valeur, null);
});

test('entiers et textes', () => {
  assert.equal(lireEntier('240').valeur, 240);
  assert.equal(lireEntier('24,5').ok, false);
  assert.equal(lireTexte('  Prêt  '), 'Prêt');
  assert.equal(lireTexte('   '), null);
});

test('arrondi au centime : demi éloigné de zéro, dans les deux sens', () => {
  assert.equal(arrondir(fraction(1, 2)), 1);
  assert.equal(arrondir(fraction(-1, 2)), -1);
  assert.equal(arrondir(fraction(1, 3)), 0);
  assert.equal(arrondir(fraction(2, 3)), 1);
  assert.equal(arrondir(fraction(-5, 3)), -2);
});
