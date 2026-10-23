// Lot 2 de bout en bout, avec un faux Yahoo : chercher par ISIN, ajouter la
// ligne, acheter des parts, voir le cours, la plus-value et le rendement.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { readFileSync } from 'node:fs';

import { demarrerServeur } from '../serveur/application.mjs';
import { HOTE } from '../serveur/config.mjs';
import { appliquerMigrations } from '../lib/schema.mjs';
import { lireEtat, lirePositions } from '../lib/referentiel.mjs';
import { lireDerniersCours } from '../lib/cours.mjs';
import { baseJetable, normaliser } from './aide.mjs';

const fixture = (nom) => JSON.parse(readFileSync(new URL(`./fixtures/${nom}`, import.meta.url), 'utf8'));
let jetable;
let serveur;
let port;
const appelsYahoo = [];
let panne = false;

const fauxYahoo = async (url) => {
  appelsYahoo.push(url);
  if (panne) return { ok: false, status: 503 };
  if (url.includes('/finance/search')) return { ok: true, json: async () => fixture('yahoo-recherche-isin.json') };
  if (url.includes('/chart/WPEA.PA')) return { ok: true, json: async () => fixture('yahoo-cours-wpea.json') };
  if (url.includes('/chart/SWDA.L')) return { ok: true, json: async () => { const j = fixture('yahoo-cours-wpea.json'); j.chart.result[0].meta.symbol = 'SWDA.L'; j.chart.result[0].meta.currency = 'GBp'; return j; } };
  return { ok: false, status: 404 };
};

before(async () => {
  jetable = baseJetable();
  appliquerMigrations(jetable.base);
  serveur = await demarrerServeur({ base: jetable.base, port: 0, aujourdhui: () => '2026-10-23', cleClaude: () => '', fetchCours: fauxYahoo });
  port = serveur.address().port;
});
after(async () => { await new Promise((r) => serveur.close(r)); jetable.nettoyer(); });

function requete({ methode = 'GET', chemin = '/', entetes = {}, corps } = {}) {
  const hote = `${HOTE}:${port}`;
  const tous = { Host: hote, ...entetes };
  if (corps !== undefined) { tous['Content-Type'] = 'application/x-www-form-urlencoded'; tous['Content-Length'] = Buffer.byteLength(corps); }
  return new Promise((resoudre, rejeter) => {
    const req = request({ host: HOTE, port, method: methode, path: chemin, headers: tous }, (res) => {
      const morceaux = [];
      res.on('data', (m) => morceaux.push(m));
      res.on('end', () => resoudre({ statut: res.statusCode, entetes: res.headers, corps: Buffer.concat(morceaux).toString('utf8') }));
    });
    req.on('error', rejeter);
    if (corps !== undefined) req.write(corps);
    req.end();
  });
}
const post = (chemin, champs) => requete({ methode: 'POST', chemin, entetes: { Origin: `http://${HOTE}:${port}` }, corps: new URLSearchParams(champs).toString() });
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

test('point de départ avec un PEA daté : la date des cinq ans s\'affiche', async () => {
  const r = await post('/depart', {
    reserve: '25 000', matelas: '15 000', epargne_mensuelle: '500', horizon: '10', perte_max: '30',
    immobilier: '300 000', immobilier_date: '2026-10-01', immobilier_source: 'à la louche', a_pea: 'oui', pea_date: '2026-10-20',
  });
  assert.equal(r.statut, 303);
  const alloc = await requete({ chemin: '/allocation' });
  assert.match(alloc.corps, /Avantages fiscaux acquis le 20 octobre 2031/);
  assert.match((await requete({ chemin: '/lignes' })).corps, /PEA : avantages fiscaux acquis le 20 octobre 2031/);
});

test('S-L2-4 — chercher par ISIN montre le résultat, l\'ajouter crée la ligne avec son symbole, et le doublon est refusé', async () => {
  const r = await requete({ chemin: '/lignes?q=IE0002XZSHO1' });
  assert.equal(r.statut, 200);
  assert.match(r.corps, /iShares MSCI World Swap PEA/);
  assert.match(r.corps, /name="symbole" value="WPEA.PA"/);
  assert.ok(appelsYahoo.at(-1).includes('q=IE0002XZSHO1'), 'seul le code part');

  const pea = lireEtat(jetable.base).enveloppes.find((e) => e.type === 'pea');
  const ajout = await post('/lignes/ajouter', { symbole: 'WPEA.PA', nom: 'iShares MSCI World Swap PEA UCITS ETF', nature: 'etf', enveloppe_id: String(pea.id), classe: 'actions_monde' });
  assert.equal(ajout.statut, 303);
  const ligne = lireEtat(jetable.base).actifs.find((a) => a.symboleCours === 'WPEA.PA');
  assert.ok(ligne);
  assert.equal(ligne.classePoche, 'actions_monde');
  await attendre(30);
  assert.ok(lireDerniersCours(jetable.base)[ligne.id], 'les cours sont arrivés en arrière-plan');
  // Avant le premier achat : la ligne n'a pas de valeur, mais elle a un cours, et la page doit le dire.
  const avantAchat = normaliser((await requete()).corps);
  assert.match(avantAchat, /cours 7,19 € le 21 octobre 2026, aucune part encore/);
  assert.doesNotMatch(avantAchat, /pas de cours/);

  const doublon = await post('/lignes/ajouter', { symbole: 'WPEA.PA', nom: 'x', nature: 'etf', enveloppe_id: String(pea.id), classe: 'actions_monde' });
  assert.equal(doublon.statut, 400);
  assert.match(doublon.corps, /déjà une ligne de cette enveloppe/);
  const illisible = await post('/lignes/ajouter', { symbole: '../x', nom: 'x', nature: 'etf', enveloppe_id: String(pea.id), classe: 'actions_monde' });
  assert.equal(illisible.statut, 400);
});

test('S-L2-2 et S-L2-3 — un achat en parts, puis l\'accueil montre la valeur au cours, la plus-value, et le rendement quand le recul suffit', async () => {
  const ligne = lireEtat(jetable.base).actifs.find((a) => a.symboleCours === 'WPEA.PA');
  const refus = await post('/achat', { parts: '', prix: '7', actif_id: String(ligne.id), date: '2026-10-01' });
  assert.equal(refus.statut, 400);
  assert.match(refus.corps, /Parts : nombre de parts obligatoire/);
  assert.equal((await post('/achat', { parts: '1e3', prix: '7', actif_id: String(ligne.id), date: '2026-10-01' })).statut, 400, 'les parts se lisent en chiffres, pas en flottant');

  const ok = await post('/achat', { parts: '100', prix: '7,00', actif_id: String(ligne.id), date: '2026-09-01', frais: '0,99' });
  assert.equal(ok.statut, 303);
  assert.equal(lirePositions(jetable.base)[ligne.id].coutCentimes, 70_099);

  const accueil = normaliser((await requete()).corps);
  assert.match(accueil, /719,00 €/, '100 parts × 7,19 € (dernière clôture de la fixture)');
  assert.match(accueil, /\+18,01 €/, 'plus-value : 719,00 − 700,99');
  assert.match(accueil, /Yahoo Finance \(100 parts\)/);
  assert.match(accueil, /Ce que ça rapporte/);
  assert.match(accueil, /\/ an/, 'le TRI s\'affiche : 52 jours de recul');
  assert.match(accueil, /estimation/);
  assert.match(accueil, /Actualiser les cours/);
});

test('les cours ne sont pas redemandés tant qu\'ils sont frais ; le bouton force ; une panne est dite sans casser la page', async () => {
  const avant = appelsYahoo.length;
  await requete();
  await attendre(20);
  assert.equal(appelsYahoo.length, avant, 'cours frais : aucun appel');
  const forcer = await post('/cours/actualiser', {});
  assert.equal(forcer.statut, 303);
  await attendre(20);
  assert.equal(appelsYahoo.length, avant + 1);

  panne = true;
  await post('/cours/actualiser', {});
  await attendre(20);
  const page = await requete();
  assert.equal(page.statut, 200);
  assert.match(page.corps, /mise à jour impossible : http_503/);
  assert.match(normaliser(page.corps), /719,00 €/, 'le dernier cours reste affiché');
  panne = false;
});

test('la recherche en panne dit pourquoi, sans casser la page', async () => {
  panne = true;
  const r = await requete({ chemin: '/lignes?q=WPEA' });
  assert.equal(r.statut, 200);
  assert.match(r.corps, /recherche impossible : http_503/);
  panne = false;
});

test('une ligne cotée hors euro est refusée au rafraîchissement, et la page le dit', async () => {
  const pea = lireEtat(jetable.base).enveloppes.find((e) => e.type === 'pea');
  const ajout = await post('/lignes/ajouter', { symbole: 'SWDA.L', nom: 'iShares Core MSCI World (Londres)', nature: 'etf', enveloppe_id: String(pea.id), classe: 'actions_monde' });
  assert.equal(ajout.statut, 303);
  await attendre(30);
  const ligne = lireEtat(jetable.base).actifs.find((a) => a.symboleCours === 'SWDA.L');
  assert.equal(lireDerniersCours(jetable.base)[ligne.id], undefined, 'aucun cours en pence enregistré');
  assert.match((await requete()).corps, /mise à jour impossible : cotée en GBp/);
});

test('un achat erroné s\'annule par contre-écriture : la position revient, l\'achat reste en base, une seule annulation possible', async () => {
  const ligne = lireEtat(jetable.base).actifs.find((a) => a.symboleCours === 'WPEA.PA');
  const avant = lirePositions(jetable.base)[ligne.id];
  assert.equal((await post('/achat', { parts: '12,5', prix: '7', actif_id: String(ligne.id), date: '2026-10-22' })).statut, 303);
  assert.equal(lirePositions(jetable.base)[ligne.id].partsMillioniemes, avant.partsMillioniemes + 12_500_000, '12,5 parts lues à la virgule');
  const page = await requete({ chemin: '/versement' });
  assert.match(page.corps, /Mes achats/);
  const m = /name="achat_id" value="(\d+)"/.exec(page.corps);
  assert.ok(m, 'le bouton Annuler porte l\'identifiant de l\'achat');
  const annule = await post('/achat/annuler', { achat_id: m[1] });
  assert.equal(annule.statut, 303);
  assert.deepEqual(lirePositions(jetable.base)[ligne.id], avant, 'la position est revenue');
  assert.equal(jetable.base.prepare("SELECT COUNT(*) AS n FROM transactions WHERE type = 'annulation_achat'").get().n, 1);
  const deuxieme = await post('/achat/annuler', { achat_id: m[1] });
  assert.equal(deuxieme.statut, 400);
  assert.match(deuxieme.corps, /déjà annulé/);
  assert.equal((await post('/achat/annuler', { achat_id: '999999' })).statut, 400);
});

test('un PEA enregistré sans date reçoit sa date depuis le point de départ, sans créer de doublon', async () => {
  jetable.base.prepare("UPDATE enveloppe SET date_ouverture = NULL WHERE type = 'pea'").run();
  const depart = await requete({ chemin: '/depart' });
  assert.match(depart.corps, /Date d'ouverture de ton PEA/);
  const r = await post('/depart', {
    reserve: '25 000', matelas: '15 000', epargne_mensuelle: '500', horizon: '10', perte_max: '30',
    immobilier: '300 000', immobilier_date: '2026-10-01', immobilier_source: 'à la louche', a_pea: 'oui', pea_date: '2026-10-24',
  });
  assert.equal(r.statut, 303);
  const peas = lireEtat(jetable.base).enveloppes.filter((e) => e.type === 'pea');
  assert.equal(peas.length, 1);
  assert.equal(peas[0].dateOuverture, '2026-10-24');
  assert.doesNotMatch((await requete({ chemin: '/depart' })).corps, /Date d'ouverture/);
});
