// Lot 1 de bout en bout : point de départ, accueil, versement, lignes,
// explication (repli puis rédigée par un faux Claude), polices servies.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';

import { demarrerServeur } from '../serveur/application.mjs';
import { HOTE } from '../serveur/config.mjs';
import { appliquerMigrations } from '../lib/schema.mjs';
import { lireEtat, lireVersements } from '../lib/referentiel.mjs';
import { lireObjectif } from '../lib/objectif.mjs';
import { baseJetable } from './aide.mjs';

let jetable;
let serveur;
let port;
let cle = '';
const appelsClaude = [];
let reponseClaude = { ok: true, texte: 'Texte rédigé par le faux Claude. Aide à la décision, pas un conseil réglementé.', modele: 'faux-modele' };

before(async () => {
  jetable = baseJetable();
  appliquerMigrations(jetable.base);
  serveur = await demarrerServeur({
    base: jetable.base,
    port: 0,
    aujourdhui: () => '2026-10-23',
    cleClaude: () => cle,
    rediger: async (charge, options) => { appelsClaude.push({ charge, options }); return reponseClaude; },
  });
  port = serveur.address().port;
});

after(async () => {
  await new Promise((r) => serveur.close(r));
  jetable.nettoyer();
});

function requete({ methode = 'GET', chemin = '/', entetes = {}, corps } = {}) {
  const hote = `${HOTE}:${port}`;
  const tous = { Host: hote, ...entetes };
  if (corps !== undefined) {
    tous['Content-Type'] = 'application/x-www-form-urlencoded';
    tous['Content-Length'] = Buffer.byteLength(corps);
  }
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
const normaliser = (s) => s.replace(/[  ]/g, ' ');

test('les polices sont servies depuis public/fonts avec le bon type, et la CSP les autorise', async () => {
  const r = await requete({ chemin: '/public/fonts/inter-tight-latin.woff2' });
  assert.equal(r.statut, 200);
  assert.equal(r.entetes['content-type'], 'font/woff2');
  assert.match(r.entetes['content-security-policy'], /font-src 'self'/);
  // Un sous-dossier autre que fonts/, ou un fichier absent, restent introuvables.
  assert.equal((await requete({ chemin: '/public/fonts/autre/x.woff2' })).statut, 404);
  assert.equal((await requete({ chemin: '/public/fonts/absente.woff2' })).statut, 404);
  assert.equal((await requete({ chemin: '/public/fonts/style.css' })).statut, 404);
});

test('sans point de départ : accueil en invitation, versement et lignes sans erreur', async () => {
  for (const chemin of ['/', '/depart', '/lignes', '/versement', '/reglages']) {
    const r = await requete({ chemin });
    assert.equal(r.statut, 200, chemin);
  }
  assert.match((await requete({ chemin: '/reglages' })).corps, /pas de clé/);
});

test('S-L1-2 — un point de départ illisible est refusé avec les motifs, rien n\'est écrit', async () => {
  const r = await post('/depart', { reserve: 'beaucoup', matelas: '', epargne_mensuelle: '500', horizon: '10', perte_max: '30', immobilier: '0', immobilier_date: '2026-10-01', immobilier_source: 'louche' });
  assert.equal(r.statut, 400);
  assert.match(r.corps, /De côté : montant illisible/);
  assert.match(r.corps, /matelas de précaution : montant obligatoire/);
  assert.equal(lireObjectif(jetable.base), null);
});

test('S-L1-2 — un point de départ complet s\'enregistre, crée les lignes, et l\'accueil dit quoi faire (texte de repli, sans clé)', async () => {
  const r = await post('/depart', {
    reserve: '25 000', matelas: '15 000', epargne_mensuelle: '500', pee: '18 000', pee_part_actions: '',
    horizon: '10', perte_max: '30', immobilier: '300 000', immobilier_date: '2026-10-01', immobilier_source: 'à la louche', a_pea: 'oui',
  });
  assert.equal(r.statut, 303);
  assert.equal(r.entetes.location, '/');
  const o = lireObjectif(jetable.base);
  assert.equal(o.reserveCentimes, 25_000_00);
  assert.equal(o.perteMaxPb, 3000);
  const etat = lireEtat(jetable.base);
  assert.deepEqual(etat.enveloppes.map((e) => e.type).sort(), ['livret', 'pea', 'pee']);
  const pee = etat.actifs.find((a) => a.libelle.startsWith('PEE'));
  assert.equal(pee.classePoche, 'mixte');
  assert.equal(pee.partActionsPb, 5000);

  const accueil = normaliser((await requete()).corps);
  assert.match(accueil, /Valeur de la poche/);
  assert.match(accueil, /43 000 €/, 'réserve 25 000 + PEE 18 000');
  assert.match(accueil, /texte de repli/);
  assert.match(accueil, /sans clé d'API/);
  assert.match(accueil, /Actions monde → ETF actions monde/, 'tout le versement va aux actions, les plus en retard');
  assert.match(accueil, /500 €/);
  assert.match(accueil, /Part financière/);
  assert.equal(appelsClaude.length, 0, 'sans clé, aucun appel');
});

test('S-L1-4 et S-L1-5 — avec une clé : repli immédiat, appel en arrière-plan, puis texte rédigé servi depuis le cache sans second appel', async () => {
  cle = 'cle-de-test';
  const premier = await requete();
  assert.match(premier.corps, /texte de repli/);
  assert.match(premier.corps, /arrive au prochain chargement/);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(appelsClaude.length, 1);
  assert.equal(appelsClaude[0].options.cle, 'cle-de-test');
  assert.ok(!JSON.stringify(appelsClaude[0].charge).includes('louche'), 'la source de l\'immobilier ne part pas');

  const second = await requete();
  assert.match(second.corps, /Texte rédigé par le faux Claude/);
  assert.match(second.corps, /rédigé par Claude \(faux-modele\)/);
  assert.equal(appelsClaude.length, 1, 'mêmes entrées : pas de second appel');
  assert.equal(jetable.base.prepare('SELECT COUNT(*) AS n FROM explication').get().n, 1);
});

test('un versement s\'enregistre comme transaction immuable, et sa nouvelle valeur change la poche et l\'empreinte', async () => {
  const etat = lireEtat(jetable.base);
  const etf = etat.actifs.find((a) => a.libelle === 'ETF actions monde');
  const r = await post('/versement', { montant: '500', actif_id: String(etf.id), date: '2026-10-23', type: 'versement', nouvelle_valeur: '500', source: 'ordre exécuté' });
  assert.equal(r.statut, 303);
  const v = lireVersements(jetable.base);
  assert.equal(v.length, 1);
  assert.equal(v[0].montantCentimes, 500_00);
  const accueil = normaliser((await requete()).corps);
  assert.match(accueil, /43 500 €/);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(appelsClaude.length, 2, 'la situation a changé : nouvel appel');
});

test('un versement sans montant, ou sur une ligne inconnue, est refusé', async () => {
  const r = await post('/versement', { montant: '', actif_id: '999', date: '2026-10-23' });
  assert.equal(r.statut, 400);
  assert.match(r.corps, /montant obligatoire/);
});

test('classer une ligne depuis la page Lignes', async () => {
  const etat = lireEtat(jetable.base);
  const pee = etat.actifs.find((a) => a.libelle.startsWith('PEE'));
  const r = await post('/lignes', { actif_id: String(pee.id), classe: 'mixte', part_actions: '70' });
  assert.equal(r.statut, 303);
  assert.equal(lireEtat(jetable.base).actifs.find((a) => a.id === pee.id).partActionsPb, 7000);
  const refus = await post('/lignes', { actif_id: String(pee.id), classe: 'mixte', part_actions: '' });
  assert.equal(refus.statut, 400);
  assert.match(refus.corps, /part actions/);
});

test('quand Claude échoue, le repli reste affiché et la raison est dite', async () => {
  reponseClaude = { ok: false, raison: 'transitoire' };
  await post('/versement', { montant: '10', actif_id: String(lireEtat(jetable.base).actifs[0].id), date: '2026-10-23', nouvelle_valeur: '25 010', source: 'relevé' });
  const premier = await requete();
  assert.match(premier.corps, /texte de repli/);
  await new Promise((r) => setTimeout(r, 20));
  const second = await requete();
  assert.match(second.corps, /dernier appel : transitoire/);
});
