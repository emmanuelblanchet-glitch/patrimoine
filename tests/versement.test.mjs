// Un versement : transaction immuable + valorisation facultative, en une transaction SQL.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appliquerMigrations } from '../lib/schema.mjs';
import { creerEnveloppe, creerActif, enregistrerVersement, lireVersements, lireEtat, validerVersement, ErreurSaisie } from '../lib/referentiel.mjs';
import { baseJetable } from './aide.mjs';

test('versement avec nouvelle valeur : une transaction et une valorisation ; sans : la transaction seule', () => {
  const { base, nettoyer } = baseJetable();
  try {
    appliquerMigrations(base);
    const env = creerEnveloppe(base, { type: 'pea', libelle: 'PEA' });
    const id = creerActif(base, { enveloppeId: env, nature: 'etf', libelle: 'ETF' });
    enregistrerVersement(base, { actifId: id, date: '2026-10-23', montantCentimes: 500_00, nouvelleValeurCentimes: 500_00, source: 'ordre' });
    enregistrerVersement(base, { actifId: id, date: '2026-11-23', montantCentimes: 500_00 });
    assert.equal(lireVersements(base).length, 2);
    assert.equal(lireVersements(base, { depuis: '2026-11-01' }).length, 1);
    assert.equal(lireEtat(base).valorisations.length, 1);
    assert.throws(() => base.prepare('DELETE FROM transactions').run(), /immuable/);
  } finally {
    nettoyer();
  }
});

test('un versement invalide a ses motifs, et une ligne inconnue est refusée sans rien écrire', () => {
  assert.ok(validerVersement({ actifId: 1, date: '2026-13-01', montantCentimes: 0, nouvelleValeurCentimes: -1 }).length >= 3);
  const { base, nettoyer } = baseJetable();
  try {
    appliquerMigrations(base);
    assert.throws(() => enregistrerVersement(base, { actifId: 999, date: '2026-10-23', montantCentimes: 1 }), ErreurSaisie);
    assert.equal(lireVersements(base).length, 0);
  } finally {
    nettoyer();
  }
});
