// Lot 3 de bout en bout, mode public : relais HTTPS exigé, identité Tailscale,
// porte par phrase et session, essais, déconnexion, limite de recherche, et
// la configuration qui refuse un mode public incomplet.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';

import { demarrerServeur } from '../serveur/application.mjs';
import { HOTE, lireModePublic } from '../serveur/config.mjs';
import { empreintePhrase, DUREE_SESSION_MS, RECUL_ESSAIS_MS } from '../serveur/session.mjs';
import { appliquerMigrations } from '../lib/schema.mjs';
import { baseJetable } from './aide.mjs';

const PHRASE = 'la phrase du test, assez longue';
const PUBLIC = { hote: 'patrimoine.test', empreinte: empreintePhrase(PHRASE), secret: 's'.repeat(32), utilisateur: 'emmanuel@exemple.test' };
let jetable;
let serveur;
let port;
let horloge = Date.UTC(2026, 9, 23, 10, 0, 0);
const journal = [];
const appelsYahoo = [];

before(async () => {
  jetable = baseJetable();
  appliquerMigrations(jetable.base);
  serveur = await demarrerServeur({
    base: jetable.base, port: 0, aujourdhui: () => '2026-10-23', cleClaude: () => '', public: PUBLIC, maintenant: () => horloge, journal: (m) => journal.push(m),
    fetchCours: async (url) => { appelsYahoo.push(url); return { ok: true, json: async () => ({ quotes: [] }) }; },
  });
  port = serveur.address().port;
});
after(async () => { await new Promise((r) => serveur.close(r)); jetable.nettoyer(); });

const RELAIS = { Host: PUBLIC.hote, 'X-Forwarded-Proto': 'https', 'Tailscale-User-Login': PUBLIC.utilisateur, 'X-Forwarded-For': '100.64.0.2' };
function requete({ methode = 'GET', chemin = '/', entetes = {}, corps } = {}) {
  const tous = { ...RELAIS, ...entetes };
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
const connexion = (phrase, entetes = {}) => requete({ methode: 'POST', chemin: '/connexion', entetes: { Origin: `https://${PUBLIC.hote}`, ...entetes }, corps: new URLSearchParams({ phrase }).toString() });
const cookieDe = (r) => r.entetes['set-cookie'][0].split(';')[0];

test('S-L3-3 — la configuration refuse un mode public incomplet, et n\'exige rien en mode local', () => {
  assert.deepEqual(lireModePublic({}), { ok: true, public: null });
  const complet = { PATRIMOINE_HOTE_PUBLIC: 'x.ts.net:8006', PATRIMOINE_PHRASE_EMPREINTE: PUBLIC.empreinte, PATRIMOINE_SECRET_SESSION: PUBLIC.secret, PATRIMOINE_UTILISATEUR: 'moi@x' };
  assert.equal(lireModePublic(complet).ok, true);
  for (const cle of Object.keys(complet)) {
    const sans = { ...complet }; delete sans[cle];
    const r = lireModePublic(sans);
    assert.equal(r.ok, false, `${cle} manquant`);
    assert.match(r.motif, new RegExp(cle));
  }
  assert.match(lireModePublic({ ...complet, PATRIMOINE_PHRASE_EMPREINTE: 'ma phrase en clair' }).motif, /mal formée/);
  assert.match(lireModePublic({ ...complet, PATRIMOINE_SECRET_SESSION: 'court' }).motif, /trop court/);
  assert.match(lireModePublic({ ...complet, PATRIMOINE_HOTE_PUBLIC: 'http://x' }).motif, /illisible/);
});

test('S-L3-2 — sans relais HTTPS : 403 ; autre identité Tailscale ou aucune : 403 et une ligne au journal ; hôte local : 403', async () => {
  assert.equal((await requete({ entetes: { 'X-Forwarded-Proto': 'http' } })).statut, 403);
  const autre = await requete({ entetes: { 'Tailscale-User-Login': 'theo@exemple.test' } });
  assert.equal(autre.statut, 403);
  assert.match(autre.corps, /pas le tien/);
  const aucune = await requete({ entetes: { 'Tailscale-User-Login': '' } });
  assert.equal(aucune.statut, 403);
  assert.ok(journal.some((m) => /identité refusée depuis 100\.64\.0\.2/.test(m)));
  assert.ok(!journal.some((m) => /theo/.test(m)), 'le journal ne nomme pas l\'intrus');
  assert.equal((await requete({ entetes: { Host: `${HOTE}:${port}` } })).statut, 403, 'seul l\'hôte public est admis');
});

test('S-L3-1 — sans session : 303 vers la connexion (la feuille de style reste servie) ; mauvaise phrase 401 ; cinq échecs 429 pendant dix minutes', async () => {
  const sans = await requete();
  assert.equal(sans.statut, 303);
  assert.equal(sans.entetes.location, '/connexion');
  assert.equal((await requete({ chemin: '/public/style.css' })).statut, 200);
  const page = await requete({ chemin: '/connexion' });
  assert.equal(page.statut, 200);
  assert.match(page.corps, /type="password" name="phrase"/);
  assert.doesNotMatch(page.corps, /href="\/allocation"/, 'page nue : pas de navigation avant d\'entrer');
  const postSansSession = await requete({ methode: 'POST', chemin: '/versement', entetes: { Origin: `https://${PUBLIC.hote}` }, corps: 'montant=1' });
  assert.equal(postSansSession.statut, 303, 'une écriture sans session est renvoyée à la porte');
  assert.equal(jetable.base.prepare('SELECT COUNT(*) AS n FROM transactions').get().n, 0);

  for (let i = 1; i <= 4; i++) assert.equal((await connexion('mauvaise phrase')).statut, 401, `essai ${i}`);
  const cinq = await connexion('mauvaise phrase');
  assert.equal(cinq.statut, 429);
  assert.equal(cinq.entetes['retry-after'], String(RECUL_ESSAIS_MS / 1000));
  assert.match(cinq.corps, /réessaie dans 10 minutes/);
  assert.equal((await connexion(PHRASE)).statut, 429, 'même la bonne phrase attend');
  assert.ok(journal.some((m) => /phrase refusée depuis 100\.64\.0\.2 ; source bloquée/.test(m)));
  assert.ok(!journal.some((m) => /mauvaise phrase/.test(m)), 'la phrase tapée n\'est jamais journalisée');
  assert.equal((await connexion('mauvaise phrase', { 'X-Forwarded-For': '100.64.0.9' })).statut, 401, 'une autre source n\'est pas bloquée');
  horloge += RECUL_ESSAIS_MS;
  assert.equal((await connexion('mauvaise phrase')).statut, 401, 'libéré après dix minutes');
});

test('S-L3-1 — bonne phrase : cookie signé, HttpOnly, Secure, SameSite=Strict, 30 jours ; la session ouvre les pages et les écritures ; altérée, elle est refusée ; déconnexion', async () => {
  const ok = await connexion(PHRASE);
  assert.equal(ok.statut, 303);
  assert.equal(ok.entetes.location, '/');
  const setCookie = ok.entetes['set-cookie'][0];
  assert.match(setCookie, /^patrimoine_session=[0-9]+\.[0-9a-f]{32}\.[0-9a-f]{64}; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Strict; Secure$/);
  const cookie = cookieDe(ok);
  const accueil = await requete({ entetes: { Cookie: cookie } });
  assert.equal(accueil.statut, 200);
  assert.match(accueil.corps, /action="\/deconnexion"/, 'le bouton de déconnexion est sur la page');
  assert.match(accueil.corps, /Ma poche/);
  const ecriture = await requete({ methode: 'POST', chemin: '/enveloppes', entetes: { Cookie: cookie, Origin: `https://${PUBLIC.hote}` }, corps: new URLSearchParams({ type: 'livret', libelle: 'Livret test', quote_part: '' }).toString() });
  assert.equal(ecriture.statut, 303, 'écriture admise avec session et Origin https');
  assert.equal((await requete({ methode: 'POST', chemin: '/enveloppes', entetes: { Cookie: cookie, Origin: `http://${PUBLIC.hote}` }, corps: 'type=livret' })).statut, 403, 'Origin en http : refusé');
  assert.equal((await requete({ entetes: { Cookie: cookie.slice(0, -2) + '00' } })).statut, 303, 'cookie altéré : retour à la porte');
  horloge += DUREE_SESSION_MS + 1;
  assert.equal((await requete({ entetes: { Cookie: cookie } })).statut, 303, 'session expirée');
  horloge -= DUREE_SESSION_MS + 1;
  const sortie = await requete({ methode: 'POST', chemin: '/deconnexion', entetes: { Cookie: cookie, Origin: `https://${PUBLIC.hote}` }, corps: '' });
  assert.equal(sortie.statut, 303);
  assert.match(sortie.entetes['set-cookie'][0], /Max-Age=0/);
});

test('S-L3-5 — la onzième recherche de la minute répond 429 sans appel sortant ; la minute passée, ça repart', async () => {
  const cookie = cookieDe(await connexion(PHRASE));
  for (let i = 1; i <= 10; i++) assert.equal((await requete({ chemin: '/lignes?q=ABC', entetes: { Cookie: cookie } })).statut, 200, `recherche ${i}`);
  const avant = appelsYahoo.length;
  const onze = await requete({ chemin: '/lignes?q=ABC', entetes: { Cookie: cookie } });
  assert.equal(onze.statut, 429);
  assert.equal(onze.entetes['retry-after'], '60');
  assert.equal(appelsYahoo.length, avant, 'aucun appel vers la source');
  horloge += 60_001;
  assert.equal((await requete({ chemin: '/lignes?q=ABC', entetes: { Cookie: cookie } })).statut, 200);
});
