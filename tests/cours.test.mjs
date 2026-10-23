// Seam S-L2-2 : cours idempotents, valorisation parts × cours, et sa place dans le bilan.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appliquerMigrations } from '../lib/schema.mjs';
import { creerEnveloppe, creerActif, enregistrerAchat, lirePositions, lireEtat, definirSymbole, coutAchat, ErreurSaisie, ajouterValorisation } from '../lib/referentiel.mjs';
import { enregistrerCours, lireDerniersCours, valorisationsDepuisCours } from '../lib/cours.mjs';
import { calculerBilan } from '../lib/bilan.mjs';
import { baseJetable } from './aide.mjs';

function ligneCotee(base) {
  appliquerMigrations(base);
  const env = creerEnveloppe(base, { type: 'pea', libelle: 'PEA' });
  const id = creerActif(base, { enveloppeId: env, nature: 'etf', libelle: 'ETF monde' });
  definirSymbole(base, id, 'WPEA.PA');
  return id;
}

test('les cours s\'enregistrent sans doublon ; une valeur nulle est ignorée ; le dernier cours est le plus récent', () => {
  const { base, nettoyer } = baseJetable();
  try {
    const id = ligneCotee(base);
    const lot = [{ date: '2026-10-20', centimes: 700 }, { date: '2026-10-21', centimes: 719 }, { date: '2026-10-22', centimes: 0 }];
    assert.equal(enregistrerCours(base, id, lot, { source: 'test' }), 2);
    assert.equal(enregistrerCours(base, id, lot, { source: 'test' }), 0, 'rejeu : rien');
    assert.equal(enregistrerCours(base, id, [{ date: '2026-10-21', centimes: 999 }], { source: 'test' }), 0, 'même jour : la première valeur reste');
    const d = lireDerniersCours(base)[id];
    assert.equal(d.date, '2026-10-21');
    assert.equal(d.centimes, 719);
  } finally {
    nettoyer();
  }
});

test('un achat en parts : coût = parts × prix + frais, immuable ; les positions s\'additionnent', () => {
  const { base, nettoyer } = baseJetable();
  try {
    const id = ligneCotee(base);
    assert.equal(coutAchat({ partsMillioniemes: 12_000_000, prixCentimes: 4130, fraisCentimes: 99 }), 49_659);
    enregistrerAchat(base, { actifId: id, date: '2026-10-01', partsMillioniemes: 12_000_000, prixCentimes: 4130, fraisCentimes: 99 });
    enregistrerAchat(base, { actifId: id, date: '2026-11-01', partsMillioniemes: 500_000, prixCentimes: 4200 });
    const p = lirePositions(base)[id];
    assert.equal(p.partsMillioniemes, 12_500_000);
    assert.equal(p.coutCentimes, 49_659 + 2_100);
    assert.throws(() => base.prepare('DELETE FROM transactions').run(), /immuable/);
    assert.throws(() => enregistrerAchat(base, { actifId: id, date: '2026-10-01', partsMillioniemes: 0, prixCentimes: 1 }), ErreurSaisie);
    assert.throws(() => enregistrerAchat(base, { actifId: 999, date: '2026-10-01', partsMillioniemes: 1_000_000, prixCentimes: 1 }), /ligne inconnue/);
  } finally {
    nettoyer();
  }
});

test('S-L2-2 — valeur = parts × dernier cours, un seul arrondi ; sans cours ou sans parts : rien', () => {
  const actifs = [{ id: 1, symboleCours: 'X' }, { id: 2, symboleCours: 'Y' }, { id: 3, symboleCours: null }];
  const positions = { 1: { partsMillioniemes: 12_500_000 }, 3: { partsMillioniemes: 1_000_000 } };
  const cours = { 1: { date: '2026-10-21', centimes: 719, source: 'test' }, 2: { date: '2026-10-21', centimes: 100, source: 'test' }, 3: { date: '2026-10-21', centimes: 100, source: 'test' } };
  const v = valorisationsDepuisCours(actifs, positions, cours);
  assert.equal(v.length, 1, 'la 2 n\'a pas de parts, la 3 n\'a pas de symbole');
  assert.equal(v[0].valeurCentimes, 8_988, '12,5 parts × 7,19 € = 89,875 → 89,88');
  assert.equal(v[0].statut, 'fait');
  assert.ok(v[0].id < 0);
});

test('dans le bilan, le cours du jour l\'emporte sur une valeur saisie le même jour, et une ligne cotée sans cours reste non valorisée', () => {
  const { base, nettoyer } = baseJetable();
  try {
    const id = ligneCotee(base);
    enregistrerAchat(base, { actifId: id, date: '2026-10-01', partsMillioniemes: 10_000_000, prixCentimes: 700 });
    let b = calculerBilan(lireEtat(base), '2026-10-22');
    assert.equal(b.enveloppes[0].biens[0].valeur, null, 'parts mais pas de cours');
    ajouterValorisation(base, { cible: { actifId: id }, date: '2026-10-21', valeurCentimes: 1, source: 'saisie du matin', statut: 'estimation' });
    enregistrerCours(base, id, [{ date: '2026-10-21', centimes: 719 }], { source: 'Yahoo Finance' });
    b = calculerBilan(lireEtat(base), '2026-10-22');
    const bien = b.enveloppes[0].biens[0];
    assert.equal(bien.valeur.centimes, 7_190);
    assert.match(bien.valeur.source, /Yahoo Finance \(10 parts\)/);
    assert.equal(bien.statut, 'fait');
  } finally {
    nettoyer();
  }
});
