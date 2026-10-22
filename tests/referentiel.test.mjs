// Seam S6 : une valorisation sans source ni statut est refusée — par le
// référentiel avec le motif, et par la base si on contourne le code.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appliquerMigrations } from '../lib/schema.mjs';
import {
  creerEnveloppe, creerActif, creerPassif, ajouterValorisation, lireEtat,
  ErreurSaisie, TYPES_ENVELOPPE, NATURES_ACTIF, TYPES_PASSIF, STATUTS,
} from '../lib/referentiel.mjs';
import { baseJetable } from './aide.mjs';

function avecBase(fn) {
  const { base, nettoyer } = baseJetable();
  try {
    appliquerMigrations(base);
    return fn(base);
  } finally {
    nettoyer();
  }
}

function bienAvecCredit(base) {
  const enveloppeId = creerEnveloppe(base, { type: 'immobilier_direct', libelle: 'Appartement A', quotePart: { num: 1, den: 2 } });
  const actifId = creerActif(base, { enveloppeId, nature: 'bien', libelle: 'Appartement A' });
  const passifId = creerPassif(base, { actifId, libelle: 'Prêt A', tauxPb: 150, dureeMois: 240 });
  return { enveloppeId, actifId, passifId };
}

function motifsDe(fn) {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof ErreurSaisie, `ErreurSaisie attendue, reçu ${e.name} : ${e.message}`);
    return e.motifs;
  }
  assert.fail('une ErreurSaisie était attendue');
}

test('S6 — sans source : refusée par le référentiel, motif explicite', () => avecBase((base) => {
  const { actifId } = bienAvecCredit(base);
  for (const source of [undefined, '', '   ']) {
    const motifs = motifsDe(() => ajouterValorisation(base, { cible: { actifId }, date: '2026-10-01', valeurCentimes: 100, source, statut: 'fait' }));
    assert.ok(motifs.some((m) => m.startsWith('source obligatoire')), JSON.stringify(motifs));
  }
  assert.equal(lireEtat(base).valorisations.length, 0);
}));

test('S6 — sans statut ou avec un statut inconnu : refusée', () => avecBase((base) => {
  const { actifId } = bienAvecCredit(base);
  for (const statut of [undefined, '', 'probable']) {
    const motifs = motifsDe(() => ajouterValorisation(base, { cible: { actifId }, date: '2026-10-01', valeurCentimes: 100, source: 'acte', statut }));
    assert.ok(motifs.some((m) => m.startsWith('statut obligatoire')), JSON.stringify(motifs));
  }
}));

test('S6 — la base refuse aussi une valorisation sans source ou sans statut écrite en SQL brut', () => avecBase((base) => {
  const { actifId } = bienAvecCredit(base);
  const inserer = (source, statut) =>
    base.prepare('INSERT INTO valorisation (actif_id, date, valeur_centimes, source, statut) VALUES (?, ?, ?, ?, ?)')
      .run(actifId, '2026-10-01', 100, source, statut);
  assert.throws(() => inserer(null, 'fait'), /NOT NULL/);
  assert.throws(() => inserer('  ', 'fait'), /CHECK/);
  assert.throws(() => inserer('acte', null), /NOT NULL/);
  assert.throws(() => inserer('acte', 'probable'), /CHECK/);
  assert.equal(base.prepare('SELECT COUNT(*) AS n FROM valorisation').get().n, 0);
}));

test('une valorisation valide s\'écrit et se relit avec sa source et son statut', () => avecBase((base) => {
  const { actifId, passifId } = bienAvecCredit(base);
  ajouterValorisation(base, { cible: { actifId }, date: '2026-10-01', valeurCentimes: 30_000_000, source: 'estimation agence', statut: 'estimation' });
  ajouterValorisation(base, { cible: { passifId }, date: '2026-10-05', valeurCentimes: 12_345_678, source: 'relevé de prêt', statut: 'fait' });
  const { valorisations } = lireEtat(base);
  assert.deepEqual(valorisations.map((v) => [v.cible, v.valeurCentimes, v.source, v.statut]), [
    [{ actifId }, 30_000_000, 'estimation agence', 'estimation'],
    [{ passifId }, 12_345_678, 'relevé de prêt', 'fait'],
  ]);
}));

test('une valorisation porte sur un actif OU un crédit, jamais les deux ni aucun', () => avecBase((base) => {
  const { actifId, passifId } = bienAvecCredit(base);
  const base0 = { date: '2026-10-01', valeurCentimes: 1, source: 'x', statut: 'fait' };
  assert.ok(motifsDe(() => ajouterValorisation(base, { ...base0, cible: {} })).some((m) => m.includes('OU')));
  assert.ok(motifsDe(() => ajouterValorisation(base, { ...base0, cible: { actifId, passifId } })).some((m) => m.includes('OU')));
}));

test('un capital restant dû négatif est refusé', () => avecBase((base) => {
  const { passifId } = bienAvecCredit(base);
  const motifs = motifsDe(() => ajouterValorisation(base, { cible: { passifId }, date: '2026-10-01', valeurCentimes: -1, source: 'relevé', statut: 'fait' }));
  assert.ok(motifs.some((m) => m.includes('négatif')));
}));

test('une référence vers une enveloppe, un bien ou un crédit inexistant est refusée', () => avecBase((base) => {
  assert.ok(motifsDe(() => creerActif(base, { enveloppeId: 999, nature: 'bien', libelle: 'X' })).includes('enveloppe inconnue'));
  assert.ok(motifsDe(() => creerPassif(base, { actifId: 999, libelle: 'X' })).includes('bien financé inconnu'));
  assert.ok(motifsDe(() => ajouterValorisation(base, { cible: { passifId: 999 }, date: '2026-10-01', valeurCentimes: 1, source: 'x', statut: 'fait' })).includes('crédit inconnu'));
}));

test('une quote-part hors bornes est refusée', () => avecBase((base) => {
  for (const quotePart of [{ num: 0, den: 2 }, { num: 3, den: 2 }, { num: 1, den: 0 }, { num: 0.5, den: 1 }]) {
    const motifs = motifsDe(() => creerEnveloppe(base, { type: 'livret', libelle: 'X', quotePart }));
    assert.ok(motifs.some((m) => m.startsWith('quote-part')), JSON.stringify(quotePart));
  }
}));

test('chaque type d\'enveloppe et chaque nature d\'actif du code est accepté par la base', () => avecBase((base) => {
  for (const type of TYPES_ENVELOPPE) {
    const enveloppeId = creerEnveloppe(base, { type, libelle: type });
    for (const nature of NATURES_ACTIF) creerActif(base, { enveloppeId, nature, libelle: nature });
  }
  const { enveloppes, actifs } = lireEtat(base);
  assert.equal(enveloppes.length, TYPES_ENVELOPPE.length);
  assert.equal(actifs.length, TYPES_ENVELOPPE.length * NATURES_ACTIF.length);
}));

test('chaque type de crédit et chaque statut du code est accepté par la base', () => avecBase((base) => {
  const { actifId } = bienAvecCredit(base);
  for (const type of TYPES_PASSIF) {
    const passifId = creerPassif(base, { actifId, libelle: type, type });
    for (const statut of STATUTS) {
      ajouterValorisation(base, { cible: { passifId }, date: '2026-10-01', valeurCentimes: 1, source: 'test', statut });
    }
  }
  assert.equal(lireEtat(base).valorisations.length, TYPES_PASSIF.length * STATUTS.length);
}));

test('une date qui n\'existe pas au calendrier est refusée par le référentiel', () => avecBase((base) => {
  const { actifId } = bienAvecCredit(base);
  const motifs = motifsDe(() => ajouterValorisation(base, { cible: { actifId }, date: '2026-02-30', valeurCentimes: 1, source: 'x', statut: 'fait' }));
  assert.ok(motifs.some((m) => m.startsWith('date obligatoire')), JSON.stringify(motifs));
  const motifsActif = motifsDe(() => creerActif(base, { enveloppeId: 1, nature: 'bien', libelle: 'X', dateAcquisition: '2025-13-01' }));
  assert.ok(motifsActif.some((m) => m.startsWith('date d\'acquisition')), JSON.stringify(motifsActif));
}));

test('garde-fou 8 : une transaction ne se modifie ni ne se supprime, par aucun chemin', () => avecBase((base) => {
  const { actifId } = bienAvecCredit(base);
  base.prepare("INSERT INTO transactions (date, actif_id, type, montant_centimes) VALUES ('2026-10-01', ?, 'loyer', 50000)").run(actifId);
  assert.throws(() => base.prepare('UPDATE transactions SET montant_centimes = 1').run(), /transaction immuable/);
  assert.throws(() => base.prepare('DELETE FROM transactions').run(), /transaction immuable/);
  assert.equal(base.prepare('SELECT montant_centimes AS m FROM transactions').get().m, 50000);
}));
