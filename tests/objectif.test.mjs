// Seam S-L1-2 : le point de départ se valide, s'enregistre, se relit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appliquerMigrations } from '../lib/schema.mjs';
import { validerObjectif, enregistrerObjectif, lireObjectif, lireCible, classerLigne } from '../lib/objectif.mjs';
import { creerEnveloppe, creerActif, lireEtat, ErreurSaisie } from '../lib/referentiel.mjs';
import { baseJetable } from './aide.mjs';

const SAIN = {
  reserveCentimes: 25_000_00, matelasCentimes: 15_000_00, epargneMensuelleCentimes: 500_00,
  horizonAnnees: 10, perteMaxPb: 3000, immobilierNetCentimes: 300_000_00,
  immobilierDate: '2026-10-01', immobilierSource: 'estimation à la louche',
};

test('un point de départ complet est valide, sans avertissement', () => {
  assert.deepEqual(validerObjectif(SAIN), { motifs: [], avertissements: [] });
});

test('chaque réponse manquante ou hors bornes a son motif en français', () => {
  const { motifs } = validerObjectif({ ...SAIN, reserveCentimes: undefined, horizonAnnees: 0, perteMaxPb: 12000, immobilierDate: '2026-02-30', immobilierSource: ' ' });
  assert.ok(motifs.some((m) => m.startsWith('de côté')));
  assert.ok(motifs.some((m) => m.startsWith('horizon')));
  assert.ok(motifs.some((m) => m.startsWith('perte maximale')));
  assert.ok(motifs.some((m) => m.includes('date de l\'estimation')));
  assert.ok(motifs.some((m) => m.includes('d\'où vient')));
  assert.equal(motifs.length, 5);
});

test('un plancher de perte plus serré que la cible avertit sans bloquer', () => {
  const { motifs, avertissements } = validerObjectif({ ...SAIN, perteMaxPb: 2000 });
  assert.deepEqual(motifs, []);
  assert.equal(avertissements.length, 1);
  assert.match(avertissements[0], /chute de moitié.*30 %/);
});

test('enregistrer puis relire ; l\'allocation cible par défaut naît avec le premier enregistrement', () => {
  const { base, nettoyer } = baseJetable();
  try {
    appliquerMigrations(base);
    assert.equal(lireObjectif(base), null);
    const avert = enregistrerObjectif(base, SAIN, { maintenant: () => '2026-10-23T10:00:00Z' });
    assert.deepEqual(avert, []);
    const o = lireObjectif(base);
    assert.equal(o.reserveCentimes, 25_000_00);
    assert.equal(o.rendementEstimePb, 500);
    assert.equal(o.misAJourLe, '2026-10-23T10:00:00Z');
    assert.deepEqual(lireCible(base), { actions_monde: 6000, sans_risque: 4000 });
    enregistrerObjectif(base, { ...SAIN, epargneMensuelleCentimes: 700_00 });
    assert.equal(lireObjectif(base).epargneMensuelleCentimes, 700_00, 'une seule ligne, mise à jour');
  } finally {
    nettoyer();
  }
});

test('un point de départ invalide n\'écrit rien', () => {
  const { base, nettoyer } = baseJetable();
  try {
    appliquerMigrations(base);
    assert.throws(() => enregistrerObjectif(base, { ...SAIN, horizonAnnees: 99 }), ErreurSaisie);
    assert.equal(lireObjectif(base), null);
  } finally {
    nettoyer();
  }
});

test('classer une ligne : classe connue, part actions exigée pour « mixte », ligne inconnue refusée', () => {
  const { base, nettoyer } = baseJetable();
  try {
    appliquerMigrations(base);
    const env = creerEnveloppe(base, { type: 'pee', libelle: 'PEE' });
    const id = creerActif(base, { enveloppeId: env, nature: 'fcpe', libelle: 'PEE global' });
    classerLigne(base, id, 'mixte', 5000);
    const a = lireEtat(base).actifs.find((x) => x.id === id);
    assert.equal(a.classePoche, 'mixte');
    assert.equal(a.partActionsPb, 5000);
    classerLigne(base, id, 'sans_risque');
    assert.equal(lireEtat(base).actifs.find((x) => x.id === id).partActionsPb, null);
    assert.throws(() => classerLigne(base, id, 'mixte'), /part actions/);
    assert.throws(() => classerLigne(base, id, 'crypto'), /classe inconnue/);
    assert.throws(() => classerLigne(base, 999, 'sans_risque'), /ligne inconnue/);
  } finally {
    nettoyer();
  }
});
