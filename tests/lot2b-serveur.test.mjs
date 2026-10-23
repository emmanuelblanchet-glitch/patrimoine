// Sous-lot 2b de bout en bout : la page Choisir mon ETF, ses hypothèses, la
// charge utile qui part vers Claude (fausse rédaction), le cache séparé de
// celui de la poche, et l'alerte de fraîcheur.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';

import { demarrerServeur } from '../serveur/application.mjs';
import { HOTE } from '../serveur/config.mjs';
import { appliquerMigrations } from '../lib/schema.mjs';
import { CLES_CHARGE_UTILE_ETF } from '../lib/choix-etf.mjs';
import { baseJetable } from './aide.mjs';

let jetable;
let serveur;
let port;
let aujourdhui = '2026-10-23';
const appels = [];
const rediger = async (charge, { messages }) => {
  appels.push({ charge, messages: messages(charge) });
  return { ok: true, texte: `Texte rédigé pour ${charge.recommande ?? charge.regle}. Aide à la décision, pas un conseil réglementé.`, modele: 'faux-modele' };
};

before(async () => {
  jetable = baseJetable();
  appliquerMigrations(jetable.base);
  serveur = await demarrerServeur({ base: jetable.base, port: 0, aujourdhui: () => aujourdhui, cleClaude: () => 'cle-de-test', rediger, fetchCours: async () => ({ ok: false, status: 503 }) });
  port = serveur.address().port;
});
after(async () => { await new Promise((r) => serveur.close(r)); jetable.nettoyer(); });

function requete(chemin) {
  return new Promise((resoudre, rejeter) => {
    const req = request({ host: HOTE, port, method: 'GET', path: chemin, headers: { Host: `${HOTE}:${port}` } }, (res) => {
      const morceaux = [];
      res.on('data', (m) => morceaux.push(m));
      res.on('end', () => resoudre({ statut: res.statusCode, corps: Buffer.concat(morceaux).toString('utf8').replace(/[\u00a0\u202f]/g, ' ') }));
    });
    req.on('error', rejeter);
    req.end();
  });
}
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

test('sans point de départ : hypothèses neutres, les quatre candidats, DCAM recommandé pour 500 € par mois, repli puis texte rédigé', async () => {
  const r = await requete('/choisir/etf');
  assert.equal(r.statut, 200);
  assert.match(r.corps, /value="500"/, 'versement neutre');
  for (const s of ['WPEA.PA', 'DCAM.PA', 'CW8.PA', 'EWLD.PA']) assert.ok(r.corps.includes(s), s);
  assert.match(r.corps, /<tr class="reco">[\s\S]*?DCAM\.PA/, 'DCAM : 0,20 %, sans courtage à l\'achat chez BoursoBank');
  assert.match(r.corps, /CW8\.PA[\s\S]*?pas chaque mois/, 'CW8 : une part à 710 € pour 500 € par mois');
  assert.match(r.corps, /texte de repli écrit depuis les chiffres/);
  await attendre(30);
  assert.equal(appels.length, 1, 'un appel à Claude, en arrière-plan');
  const { charge, messages } = appels[0];
  assert.deepEqual(Object.keys(charge).sort(), [...CLES_CHARGE_UTILE_ETF].sort());
  assert.equal(charge.recommande, 'DCAM.PA');
  assert.match(messages.system, /classement d'ETF déjà calculé/);
  const apres = await requete('/choisir/etf');
  assert.match(apres.corps, /Texte rédigé pour DCAM\.PA/);
  assert.match(apres.corps, /rédigé par Claude \(faux-modele\)/);
  assert.equal(appels.length, 1, 'servi depuis le cache');
});

test('les hypothèses de la requête priment, rien n\'est écrit, et une valeur illisible répond 400 avec le motif', async () => {
  const r = await requete('/choisir/etf?versement=1000&horizon=5&rendement=0');
  assert.equal(r.statut, 200);
  assert.match(r.corps, /Coût sur 5 ans/);
  assert.match(r.corps, /value="1000"/);
  await attendre(30);
  assert.equal(appels.at(-1).charge.versementCentimes, 100000);
  assert.equal(appels.at(-1).charge.horizonAnnees, 5);
  // 1 000 € par mois : CW8 devient achetable chaque mois.
  assert.match(r.corps, /CW8\.PA[\s\S]*?<span class="tag fait">oui/);
  assert.equal(jetable.base.prepare('SELECT COUNT(*) AS n FROM objectif').get().n, 0, 'rien d\'écrit');
  const refus = await requete('/choisir/etf?versement=abc&horizon=99');
  assert.equal(refus.statut, 400);
  assert.match(refus.corps, /Versement mensuel : /);
  assert.match(refus.corps, /Horizon : entre 1 et 60 ans/);
});

test('les caches de la poche et de l\'ETF ne s\'épurent pas l\'un l\'autre', async () => {
  const avant = jetable.base.prepare("SELECT COUNT(*) AS n FROM explication WHERE sujet = 'etf'").get().n;
  assert.ok(avant >= 1);
  // Un point de départ déclenche l'explication de la poche (sujet « poche »).
  const corps = new URLSearchParams({ reserve: '25 000', matelas: '15 000', epargne_mensuelle: '500', horizon: '10', perte_max: '30', immobilier: '300 000', immobilier_date: '2026-10-01', immobilier_source: 'à la louche' }).toString();
  await new Promise((resoudre, rejeter) => {
    const req = request({ host: HOTE, port, method: 'POST', path: '/depart', headers: { Host: `${HOTE}:${port}`, Origin: `http://${HOTE}:${port}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(corps) } }, (res) => { res.resume(); res.on('end', resoudre); });
    req.on('error', rejeter);
    req.end(corps);
  });
  await requete('/');
  await attendre(30);
  assert.equal(jetable.base.prepare("SELECT COUNT(*) AS n FROM explication WHERE sujet = 'poche'").get().n, 1);
  assert.equal(jetable.base.prepare("SELECT COUNT(*) AS n FROM explication WHERE sujet = 'etf'").get().n, avant, 'le cache ETF est intact');
  // Et la page ETF se pré-remplit désormais depuis le point de départ.
  const r = await requete('/choisir/etf');
  assert.match(r.corps, /value="500"/);
  assert.match(r.corps, /Coût sur 10 ans/);
});

test('au-delà de six mois, la page signale les faits à rafraîchir', async () => {
  aujourdhui = '2027-06-01';
  const r = await requete('/choisir/etf');
  assert.match(r.corps, /Faits à rafraîchir/);
  assert.match(r.corps, /plus de 183 jours/);
  aujourdhui = '2026-10-23';
  assert.doesNotMatch((await requete('/choisir/etf')).corps, /Faits à rafraîchir/);
});
