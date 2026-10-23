// Sous-lot 2b de bout en bout, sur des références SYNTHÉTIQUES injectées :
// la page Choisir mon ETF, ses hypothèses, la charge utile qui part vers
// Claude (fausse rédaction), le cache séparé de celui de la poche, l'alerte
// de fraîcheur. Le vrai fichier du dépôt est couvert par references.test.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';

import { demarrerServeur } from '../serveur/application.mjs';
import { HOTE } from '../serveur/config.mjs';
import { appliquerMigrations } from '../lib/schema.mjs';
import { CLES_CHARGE_UTILE_ETF } from '../lib/choix-etf.mjs';
import { verifierReferences } from '../lib/references.mjs';
import { baseJetable, normaliser } from './aide.mjs';

const fait = (valeur, note = '') => ({ valeur, source: 'https://exemple.test/officiel', releve_le: '2026-10-23', note });
const candidat = (symbole, emetteur, { frais, prix, encours, capitalisant = true }) => ({
  symbole, isin: `ISIN${symbole}`, nom: `ETF ${symbole}`, emetteur,
  faits: { fraisCourantsPb: fait(frais), prixPartCentimes: fait(prix), encoursMillionsEuros: fait(encours), replication: fait('synthétique'), capitalisant: fait(capitalisant), eligiblePea: fait(true), indice: fait('MSCI World'), premiereVl: fait('2024-01-01') },
});
// Même forme que le vrai fichier : un courtier à grille Découverte, un émetteur partenaire sans courtage.
const REFERENCES = {
  courtier: { nom: 'Courtier test', formule: 'Test', faits: { fraisOrdre: fait({ forfaitCentimes: 199, jusquaCentimes: 50000, tauxAuDelaPb: 60, plafondPeaPb: 50 }), minimumOrdreCentimes: fait(10000), droitsDeGardeCentimes: fait(0), emetteursSansCourtageAchat: fait(['Gratuit']) } },
  candidats: [
    candidat('PAYANT.PA', 'Payant', { frais: 20, prix: 716, encours: 2337 }),
    candidat('GRATUIT.PA', 'Gratuit', { frais: 20, prix: 634, encours: 1407 }),
    candidat('CHER.PA', 'Gratuit', { frais: 38, prix: 71035, encours: 7200 }),
  ],
};

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
  assert.deepEqual(verifierReferences(REFERENCES), [], 'les références synthétiques passent la même vérification que le fichier');
  jetable = baseJetable();
  appliquerMigrations(jetable.base);
  serveur = await demarrerServeur({ base: jetable.base, port: 0, aujourdhui: () => aujourdhui, cleClaude: () => 'cle-de-test', rediger, fetchCours: async () => ({ ok: false, status: 503 }), references: REFERENCES });
  port = serveur.address().port;
});
after(async () => { await new Promise((r) => serveur.close(r)); jetable.nettoyer(); });

function requete(chemin) {
  return new Promise((resoudre, rejeter) => {
    const req = request({ host: HOTE, port, method: 'GET', path: chemin, headers: { Host: `${HOTE}:${port}` } }, (res) => {
      const morceaux = [];
      res.on('data', (m) => morceaux.push(m));
      res.on('end', () => resoudre({ statut: res.statusCode, corps: normaliser(Buffer.concat(morceaux).toString('utf8')) }));
    });
    req.on('error', rejeter);
    req.end();
  });
}
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

test('sans point de départ : hypothèses neutres, le partenaire sans courtage recommandé, la part trop chère signalée, repli puis texte rédigé', async () => {
  const r = await requete('/choisir/etf');
  assert.equal(r.statut, 200);
  assert.match(r.corps, /value="500"/, 'versement neutre');
  assert.match(r.corps, /<tr class="reco">[\s\S]*?GRATUIT\.PA/, 'mêmes frais que PAYANT, mais sans courtage à l\'achat');
  assert.match(r.corps, /CHER\.PA[\s\S]*?pas chaque mois/, 'une part à 710 € pour 500 € par mois');
  assert.match(r.corps, /texte écrit depuis les chiffres/);
  await attendre(30);
  assert.equal(appels.length, 1, 'un appel à Claude, en arrière-plan');
  const { charge, messages } = appels[0];
  assert.deepEqual(Object.keys(charge).sort(), [...CLES_CHARGE_UTILE_ETF].sort());
  assert.equal(charge.recommande, 'GRATUIT.PA');
  assert.match(messages.system, /classement d'ETF déjà calculé/);
  const apres = await requete('/choisir/etf');
  assert.match(apres.corps, /Texte rédigé pour GRATUIT\.PA/);
  assert.match(apres.corps, /rédigé par Claude \(faux-modele\)/);
  assert.equal(appels.length, 1, 'servi depuis le cache');
});

test('des hypothèses modifiées recalculent la page SANS appel à Claude, n\'écrivent rien, et une valeur illisible répond 400', async () => {
  const avant = appels.length;
  const r = await requete('/choisir/etf?versement=1000&horizon=5&rendement=0');
  assert.equal(r.statut, 200);
  assert.match(r.corps, /Coût sur 5 ans/);
  assert.match(r.corps, /value="1000"/);
  assert.match(r.corps, /CHER\.PA[\s\S]*?<span class="tag fait">oui/, '1 000 € par mois : la part à 710 € devient achetable chaque mois');
  assert.match(r.corps, /Claude ne rédige que pour les hypothèses de ton point de départ/);
  await attendre(30);
  assert.equal(appels.length, avant, 'aucun appel : le coût ne se pilote pas depuis l\'adresse');
  assert.equal(jetable.base.prepare('SELECT COUNT(*) AS n FROM objectif').get().n, 0, 'rien d\'écrit');
  const refus = await requete('/choisir/etf?versement=abc&horizon=99&rendement=-5');
  assert.equal(refus.statut, 400);
  assert.match(refus.corps, /Versement mensuel : /);
  assert.match(refus.corps, /Horizon : entre 1 et 60 ans/);
  assert.match(refus.corps, /Rendement estimé : /);
  assert.equal(appels.length, avant);
  // Sous le minimum d'ordre : la vraie raison, pas le prix de la part.
  const petit = await requete('/choisir/etf?versement=50');
  assert.match(petit.corps, /sous le minimum d.{0,6}ordre du courtier \(100,00 €\)/, 'l\'apostrophe est échappée dans la page');
});

test('les caches de la poche et de l\'ETF ne s\'épurent pas l\'un l\'autre, et le point de départ pré-remplit la page', async () => {
  const avant = jetable.base.prepare("SELECT COUNT(*) AS n FROM explication WHERE sujet = 'etf'").get().n;
  assert.ok(avant >= 1);
  const corps = new URLSearchParams({ reserve: '25 000', matelas: '15 000', epargne_mensuelle: '300', horizon: '12', perte_max: '30', immobilier: '300 000', immobilier_date: '2026-10-01', immobilier_source: 'à la louche' }).toString();
  await new Promise((resoudre, rejeter) => {
    const req = request({ host: HOTE, port, method: 'POST', path: '/depart', headers: { Host: `${HOTE}:${port}`, Origin: `http://${HOTE}:${port}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(corps) } }, (res) => { res.resume(); res.on('end', resoudre); });
    req.on('error', rejeter);
    req.end(corps);
  });
  await requete('/');
  await attendre(30);
  assert.equal(jetable.base.prepare("SELECT COUNT(*) AS n FROM explication WHERE sujet = 'poche'").get().n, 1);
  assert.equal(jetable.base.prepare("SELECT COUNT(*) AS n FROM explication WHERE sujet = 'etf'").get().n, avant, 'le cache ETF est intact');
  const r = await requete('/choisir/etf');
  assert.match(r.corps, /value="300"/);
  assert.match(r.corps, /Coût sur 12 ans/);
  await attendre(30);
  assert.equal(appels.at(-1).charge.versementCentimes, 300_00, 'une nouvelle situation de départ : un appel, une fois');
});

test('au-delà de six mois, la page signale les faits à rafraîchir', async () => {
  aujourdhui = '2027-06-01';
  const r = await requete('/choisir/etf');
  assert.match(r.corps, /Faits à rafraîchir/);
  assert.match(r.corps, /plus de 183 jours/);
  aujourdhui = '2026-10-23';
  assert.doesNotMatch((await requete('/choisir/etf')).corps, /Faits à rafraîchir/);
});

test('les pages Lignes et Allocation mènent à Choisir mon ETF', async () => {
  assert.match((await requete('/lignes')).corps, /href="\/choisir\/etf"/);
  assert.match((await requete('/allocation')).corps, /href="\/choisir\/etf"/);
});
