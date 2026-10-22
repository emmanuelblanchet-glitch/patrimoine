// Seam S2 (quote-part) et règles du bilan, sur des jeux synthétiques purs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculerBilan, AGE_ALERTE_JOURS } from '../lib/bilan.mjs';
import { fraction, multiplier, egales } from '../lib/fraction.mjs';

let prochainId = 1;
const val = (cible, date, valeurCentimes, statut = 'fait', source = 'test') =>
  ({ id: prochainId++, cible, date, valeurCentimes, source, statut });

/** Un bien de 300 000,00 € financé par un crédit dont il reste 120 000,01 €. */
function etatUnBien(quotePart, { statutBien = 'fait', statutCredit = 'fait' } = {}) {
  return {
    enveloppes: [{ id: 1, type: 'immobilier_direct', libelle: 'Bien', quotePart }],
    actifs: [{ id: 10, enveloppeId: 1, nature: 'bien', libelle: 'Bien' }],
    passifs: [{ id: 100, actifId: 10, libelle: 'Prêt' }],
    valorisations: [
      val({ actifId: 10 }, '2026-09-01', 30_000_000, statutBien),
      val({ passifId: 100 }, '2026-09-30', 12_000_001, statutCredit),
    ],
  };
}

test('S2 — à 1/2, la valeur ET la dette sont divisées ensemble', () => {
  const b = calculerBilan(etatUnBien({ num: 1, den: 2 }), '2026-10-22');
  const bien = b.enveloppes[0].biens[0];
  assert.equal(bien.valeur.centimes, 15_000_000);
  assert.equal(bien.dette.centimes, 6_000_001, '120 000,01 / 2 = 60 000,005 → arrondi demi éloigné de zéro');
  assert.deepEqual(bien.dette.exact, fraction(12_000_001, 2));
  assert.deepEqual(bien.net.exact, fraction(30_000_000 - 12_000_001, 2));
  // 179 999,99 / 2 = 89 999,995 : arrondi une seule fois, sur le net exact.
  assert.equal(b.global.net.centimes, 9_000_000);
});

test('S2 — à 1/3, le net est EXACTEMENT le tiers du net à 100 %', () => {
  const a100 = calculerBilan(etatUnBien({ num: 1, den: 1 }), '2026-10-22');
  const a13 = calculerBilan(etatUnBien({ num: 1, den: 3 }), '2026-10-22');
  const attendu = multiplier(a100.global.net.exact, fraction(1, 3));
  assert.ok(egales(a13.global.net.exact, attendu), `${JSON.stringify(a13.global.net.exact)} ≠ ${JSON.stringify(attendu)}`);
  assert.ok(egales(a13.enveloppes[0].net.exact, attendu));
});

test('S2 — trois copropriétaires à 1/3 retrouvent le net entier au centime près', () => {
  const tiers = calculerBilan(etatUnBien({ num: 1, den: 3 }), '2026-10-22').global.net.exact;
  const somme = multiplier(tiers, fraction(3));
  assert.deepEqual(somme, fraction(30_000_000 - 12_000_001));
});

test('S2 — la quote-part ne s\'applique jamais à un seul des deux côtés', () => {
  const b = calculerBilan(etatUnBien({ num: 1, den: 2 }), '2026-10-22');
  const bien = b.enveloppes[0].biens[0];
  assert.equal(bien.valeur.centimesA100, 30_000_000, 'le stock reste à 100 %');
  assert.equal(bien.dettes[0].crd.centimesA100, 12_000_001);
  assert.deepEqual(multiplier(bien.net.exact, fraction(2)), fraction(30_000_000 - 12_000_001));
});

test('la dernière valorisation à la date fait foi ; une valeur future est ignorée', () => {
  const etat = etatUnBien({ num: 1, den: 1 });
  etat.valorisations.push(val({ actifId: 10 }, '2026-10-15', 31_000_000), val({ actifId: 10 }, '2026-12-01', 99_000_000));
  assert.equal(calculerBilan(etat, '2026-10-22').global.valeur.centimes, 31_000_000);
  assert.equal(calculerBilan(etat, '2026-10-01').global.valeur.centimes, 30_000_000);
});

test('à date égale, c\'est la valorisation saisie en dernier qui compte', () => {
  const etat = etatUnBien({ num: 1, den: 1 });
  etat.valorisations.push(val({ actifId: 10 }, '2026-09-01', 29_000_000));
  assert.equal(calculerBilan(etat, '2026-10-22').global.valeur.centimes, 29_000_000);
});

test('le statut « estimation » se propage du bien à l\'enveloppe et au global', () => {
  const b = calculerBilan(etatUnBien({ num: 1, den: 1 }, { statutBien: 'estimation' }), '2026-10-22');
  assert.equal(b.enveloppes[0].biens[0].statut, 'estimation');
  assert.equal(b.enveloppes[0].statut, 'estimation');
  assert.equal(b.global.statut, 'estimation');
  const tousFaits = calculerBilan(etatUnBien({ num: 1, den: 1 }), '2026-10-22');
  assert.equal(tousFaits.global.statut, 'fait');
});

test('un actif non valorisé est signalé et exclu de la valeur ; sa dette reste comptée', () => {
  const etat = etatUnBien({ num: 1, den: 1 });
  etat.valorisations = etat.valorisations.filter((v) => v.cible.actifId == null);
  const b = calculerBilan(etat, '2026-10-22');
  const bien = b.enveloppes[0].biens[0];
  assert.equal(bien.valeur, null);
  assert.equal(bien.net, null);
  assert.equal(b.global.valeur.centimes, 0);
  assert.equal(b.global.dette.centimes, 12_000_001, 'une dette ne se masque jamais');
  assert.equal(b.global.complet, false);
  assert.deepEqual(b.avertissements.map((a) => a.code), ['actif_non_valorise']);
});

test('un crédit sans capital restant dû saisi rend le bilan incomplet et le signale', () => {
  const etat = etatUnBien({ num: 1, den: 1 });
  etat.valorisations = etat.valorisations.filter((v) => v.cible.passifId == null);
  const b = calculerBilan(etat, '2026-10-22');
  assert.equal(b.global.complet, false);
  assert.deepEqual(b.avertissements.map((a) => a.code), ['passif_non_valorise']);
});

test('l\'âge de chaque valorisation est rendu, et au-delà d\'un an il est signalé', () => {
  const b = calculerBilan(etatUnBien({ num: 1, den: 1 }), '2026-10-22');
  assert.equal(b.enveloppes[0].biens[0].valeur.ageJours, 51);
  assert.equal(b.avertissements.length, 0);
  const tard = calculerBilan(etatUnBien({ num: 1, den: 1 }), '2027-12-31');
  assert.ok(tard.enveloppes[0].biens[0].valeur.ageJours > AGE_ALERTE_JOURS);
  assert.deepEqual(tard.avertissements.map((a) => a.code), ['valorisation_ancienne', 'valorisation_ancienne']);
});

test('un actif acquis après la date du bilan ou clôturé avant n\'y figure pas', () => {
  const etat = etatUnBien({ num: 1, den: 1 });
  etat.actifs[0].dateAcquisition = '2027-01-01';
  assert.equal(calculerBilan(etat, '2026-10-22').enveloppes[0].biens.length, 0);
  etat.actifs[0].dateAcquisition = '2020-01-01';
  etat.actifs[0].dateCloture = '2026-10-01';
  assert.equal(calculerBilan(etat, '2026-10-22').enveloppes[0].biens.length, 0);
});

test('bilan global sur plusieurs enveloppes de quotes-parts différentes', () => {
  const etat = {
    enveloppes: [
      { id: 1, type: 'immobilier_direct', libelle: 'Indivision', quotePart: { num: 1, den: 2 } },
      { id: 2, type: 'livret', libelle: 'Réserve', quotePart: { num: 1, den: 1 } },
      { id: 3, type: 'pee', libelle: 'PEE', quotePart: { num: 1, den: 1 } },
    ],
    actifs: [
      { id: 10, enveloppeId: 1, nature: 'bien', libelle: 'Maison' },
      { id: 20, enveloppeId: 2, nature: 'liquidites', libelle: 'Livret' },
      { id: 30, enveloppeId: 3, nature: 'fcpe', libelle: 'PEE global' },
    ],
    passifs: [{ id: 100, actifId: 10, libelle: 'Prêt maison' }],
    valorisations: [
      val({ actifId: 10 }, '2026-06-01', 40_000_001, 'estimation'),
      val({ passifId: 100 }, '2026-10-01', 10_000_000),
      val({ actifId: 20 }, '2026-10-20', 2_500_000),
      val({ actifId: 30 }, '2026-09-30', 1_800_000),
    ],
  };
  const b = calculerBilan(etat, '2026-10-22');
  // (40 000 001 − 10 000 000) / 2 + 2 500 000 + 1 800 000 = 19 300 000,5 → 19 300 001
  assert.deepEqual(b.global.net.exact, fraction(2 * 4_300_000 + 30_000_001, 2));
  assert.equal(b.global.net.centimes, 19_300_001);
  assert.equal(b.global.statut, 'estimation');
  assert.equal(b.global.complet, true);
  assert.deepEqual(b.enveloppes.map((e) => e.net.centimes), [15_000_001, 2_500_000, 1_800_000]);
});
