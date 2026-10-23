// Seam S-L2-2 : cours idempotents, valorisation parts × cours, et sa place dans le bilan.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appliquerMigrations } from '../lib/schema.mjs';
import { creerEnveloppe, creerActif, enregistrerAchat, annulerAchat, lireAchats, lireFlux, lirePositions, lireEtat, definirSymbole, creerLigneCotee, coutAchat, ErreurSaisie, ajouterValorisation } from '../lib/referentiel.mjs';
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
    const sansCours = creerActif(base, { enveloppeId: 1, nature: 'etf', libelle: 'fonds euros' });
    assert.throws(() => enregistrerAchat(base, { actifId: sansCours, date: '2026-10-01', partsMillioniemes: 1_000_000, prixCentimes: 1 }), /ligne cotée/);
    assert.equal(coutAchat({ partsMillioniemes: 333_333, prixCentimes: 300 }), 100, '0,333333 × 3 € = 0,999999 → 1,00, en fraction exacte');
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
  assert.equal(v[0].id, null);
  assert.equal(v[0].origine, 'cours');
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

test('annuler un achat : contre-écriture négative, position et flux retombent, l\'achat disparaît de la liste, pas deux fois', () => {
  const { base, nettoyer } = baseJetable();
  try {
    const id = ligneCotee(base);
    enregistrerAchat(base, { actifId: id, date: '2026-10-01', partsMillioniemes: 10_000_000, prixCentimes: 700, fraisCentimes: 99 });
    enregistrerAchat(base, { actifId: id, date: '2026-10-02', partsMillioniemes: 1_000_000, prixCentimes: 700 });
    const [dernier] = lireAchats(base);
    assert.equal(dernier.date, '2026-10-02');
    annulerAchat(base, dernier.id, { date: '2026-10-03' });
    assert.deepEqual(lirePositions(base)[id], { partsMillioniemes: 10_000_000, coutCentimes: 7_099 });
    assert.equal(lireAchats(base).length, 1);
    const flux = lireFlux(base);
    assert.equal(flux.length, 3);
    assert.equal(flux.at(-1).centimes, -700);
    assert.throws(() => annulerAchat(base, dernier.id, { date: '2026-10-03' }), /déjà annulé/);
    assert.throws(() => annulerAchat(base, 999, { date: '2026-10-03' }), /achat inconnu/);
    annulerAchat(base, lireAchats(base)[0].id, { date: '2026-10-03' });
    assert.equal(lirePositions(base)[id], undefined, 'plus rien en position');
  } finally {
    nettoyer();
  }
});

test('le symbole est contraint en base : forme, et unicité par enveloppe', () => {
  const { base, nettoyer } = baseJetable();
  try {
    const id = ligneCotee(base);
    assert.throws(() => definirSymbole(base, id, 'wpea.pa'), ErreurSaisie);
    assert.throws(() => base.prepare('UPDATE actif SET symbole_cours = ? WHERE id = ?').run('../x', id), /CHECK/);
    assert.throws(() => creerLigneCotee(base, { symbole: 'WPEA.PA', nom: 'bis', nature: 'etf', enveloppeId: 1, classe: 'actions_monde' }), /déjà une ligne/);
    assert.throws(() => base.prepare("INSERT INTO actif (enveloppe_id, nature, libelle, symbole_cours) VALUES (1, 'etf', 'bis', 'WPEA.PA')").run(), /UNIQUE/);
    const autre = creerEnveloppe(base, { type: 'cto', libelle: 'CTO' });
    const cto = creerLigneCotee(base, { symbole: 'WPEA.PA', nom: 'même ETF au CTO', nature: 'etf', enveloppeId: autre, classe: 'actions_monde' });
    assert.equal(lireEtat(base).actifs.find((a) => a.id === cto).classePoche, 'actions_monde', 'une autre enveloppe peut porter le même symbole');
    assert.throws(() => creerLigneCotee(base, { symbole: 'X', nom: 'x', nature: 'etf', enveloppeId: autre, classe: 'mixte' }), /classe inconnue/);
  } finally {
    nettoyer();
  }
});
