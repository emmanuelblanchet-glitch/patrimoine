// Fumée du serveur local : n'écoute que sur 127.0.0.1, sert le bilan, ne sert
// rien hors de public/, refuse une saisie invalide avec le motif, refuse un
// hôte ou une origine étrangers, et ne démarre pas sur une base du dépôt.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { demarrerServeur } from '../serveur/application.mjs';
import { cheminBaseAutorise, lireConfiguration, RACINE_DEPOT, HOTE } from '../serveur/config.mjs';
import { appliquerMigrations } from '../lib/schema.mjs';
import { lireEtat } from '../lib/referentiel.mjs';
import { baseJetable } from './aide.mjs';

let jetable;
let serveur;
let port;

before(async () => {
  jetable = baseJetable();
  appliquerMigrations(jetable.base);
  serveur = await demarrerServeur({ base: jetable.base, port: 0, aujourdhui: () => '2026-10-22' });
  port = serveur.address().port;
});

after(async () => {
  await new Promise((r) => serveur.close(r));
  jetable.nettoyer();
});

/** Requête HTTP brute : contrôle total des en-têtes Host et Origin. */
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

const origine = () => ({ Origin: `http://${HOTE}:${port}` });
const formulaire = (champs) => new URLSearchParams(champs).toString();

test('le serveur n\'écoute que sur 127.0.0.1', () => {
  assert.equal(serveur.address().address, '127.0.0.1');
});

test('GET / répond 200 avec le bilan, et les en-têtes de sécurité', async () => {
  const r = await requete();
  assert.equal(r.statut, 200);
  assert.match(r.corps, /Patrimoine net/);
  assert.match(r.entetes['content-security-policy'], /default-src 'none'/);
  assert.equal(r.entetes['x-content-type-options'], 'nosniff');
  // « no-referrer » ferait envoyer « Origin: null » sur nos propres formulaires.
  assert.equal(r.entetes['referrer-policy'], 'same-origin');
});

test('une écriture avec « Origin: null » est refusée (403)', async () => {
  const r = await requete({ methode: 'POST', chemin: '/enveloppes', entetes: { Origin: 'null' }, corps: formulaire({ type: 'livret', libelle: 'Origine nulle' }) });
  assert.equal(r.statut, 403);
});

test('la feuille de style est servie depuis public/', async () => {
  const r = await requete({ chemin: '/public/style.css' });
  assert.equal(r.statut, 200);
  assert.match(r.entetes['content-type'], /^text\/css/);
});

test('rien n\'est servi hors de public/ ni hors des extensions permises', async () => {
  for (const chemin of [
    '/public/../package.json',
    '/public/%2e%2e/package.json',
    '/public/..%2fpackage.json',
    '/package.json',
    '/lib/bilan.mjs',
    '/public/absent.css',
    '/public/style.css.map',
    '/.gitignore',
  ]) {
    const r = await requete({ chemin });
    assert.equal(r.statut, 404, chemin);
  }
});

test('un hôte étranger est refusé (403), en lecture comme en écriture', async () => {
  const lecture = await requete({ entetes: { Host: 'attaquant.example:80' } });
  assert.equal(lecture.statut, 403);
  const ecriture = await requete({ methode: 'POST', chemin: '/enveloppes', entetes: { Host: 'attaquant.example', Origin: 'http://attaquant.example' }, corps: formulaire({ type: 'livret', libelle: 'X' }) });
  assert.equal(ecriture.statut, 403);
});

test('une écriture sans Origin, ou d\'une autre origine, est refusée (403) et n\'écrit rien', async () => {
  const sans = await requete({ methode: 'POST', chemin: '/enveloppes', corps: formulaire({ type: 'livret', libelle: 'Sans origine' }) });
  assert.equal(sans.statut, 403);
  const autre = await requete({ methode: 'POST', chemin: '/enveloppes', entetes: { Origin: 'http://attaquant.example' }, corps: formulaire({ type: 'livret', libelle: 'Autre origine' }) });
  assert.equal(autre.statut, 403);
  assert.equal(lireEtat(jetable.base).enveloppes.some((e) => /origine/i.test(e.libelle)), false);
});

test('un POST invalide répond 400 avec le motif, et n\'écrit rien', async () => {
  const avant = lireEtat(jetable.base).enveloppes.length;
  const r = await requete({ methode: 'POST', chemin: '/enveloppes', entetes: origine(), corps: formulaire({ type: 'livret', libelle: '', quote_part: '3/2' }) });
  assert.equal(r.statut, 400);
  assert.match(r.corps, /Saisie refusée/);
  assert.match(r.corps, /libellé obligatoire/);
  assert.match(r.corps, /quote-part hors bornes/i);
  assert.equal(lireEtat(jetable.base).enveloppes.length, avant);
});

test('une valeur sans source est refusée par le formulaire (S6 de bout en bout)', async () => {
  const env = await requete({ methode: 'POST', chemin: '/enveloppes', entetes: origine(), corps: formulaire({ type: 'livret', libelle: 'Livret S6' }) });
  assert.equal(env.statut, 303);
  const enveloppeId = lireEtat(jetable.base).enveloppes.find((e) => e.libelle === 'Livret S6').id;
  await requete({ methode: 'POST', chemin: '/actifs', entetes: origine(), corps: formulaire({ enveloppe_id: String(enveloppeId), nature: 'liquidites', libelle: 'Livret S6' }) });
  const actifId = lireEtat(jetable.base).actifs.find((a) => a.libelle === 'Livret S6').id;
  const r = await requete({ methode: 'POST', chemin: '/valorisations', entetes: origine(), corps: formulaire({ cible: `actif:${actifId}`, date: '2026-10-20', valeur: '1 000', source: '', statut: 'fait' }) });
  assert.equal(r.statut, 400);
  assert.match(r.corps, /source obligatoire/);
});

test('parcours complet : un bien à 1/2 et son crédit donnent le bon net sur la page', async () => {
  const post = (chemin, champs) => requete({ methode: 'POST', chemin, entetes: origine(), corps: formulaire(champs) });
  assert.equal((await post('/enveloppes', { type: 'immobilier_direct', libelle: 'Indivision test', quote_part: '1/2' })).statut, 303);
  const enveloppeId = lireEtat(jetable.base).enveloppes.find((e) => e.libelle === 'Indivision test').id;
  assert.equal((await post('/actifs', { enveloppe_id: String(enveloppeId), nature: 'bien', libelle: 'Maison test' })).statut, 303);
  const actifId = lireEtat(jetable.base).actifs.find((a) => a.libelle === 'Maison test').id;
  assert.equal((await post('/passifs', { actif_id: String(actifId), libelle: 'Prêt test', taux: '1,45', duree_mois: '240' })).statut, 303);
  const passifId = lireEtat(jetable.base).passifs.find((p) => p.libelle === 'Prêt test').id;
  assert.equal((await post('/valorisations', { cible: `actif:${actifId}`, date: '2026-10-01', valeur: '300 000', source: 'estimation test', statut: 'estimation' })).statut, 303);
  assert.equal((await post('/valorisations', { cible: `passif:${passifId}`, date: '2026-10-05', valeur: '100 000,02', source: 'relevé test', statut: 'fait' })).statut, 303);

  const page = await requete({ chemin: '/?date=2026-10-22' });
  assert.equal(page.statut, 200);
  // (300 000 − 100 000,02) / 2 = 99 999,99 ; Intl fr-FR sépare les milliers par une espace fine insécable.
  assert.match(page.corps.replace(/[  ]/g, ' '), /99 999,99 €/);
});

test('une date de bilan invalide répond 400', async () => {
  assert.equal((await requete({ chemin: '/?date=2026-02-30' })).statut, 400);
});

test('les libellés saisis sont échappés à l\'affichage', async () => {
  await requete({ methode: 'POST', chemin: '/enveloppes', entetes: origine(), corps: formulaire({ type: 'livret', libelle: '<script>alert(1)</script>' }) });
  const r = await requete({ chemin: '/enveloppes' });
  assert.ok(!r.corps.includes('<script>alert(1)</script>'));
  assert.match(r.corps, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('une méthode autre que GET/HEAD/POST répond 405', async () => {
  const r = await requete({ methode: 'DELETE', chemin: '/enveloppes' });
  assert.equal(r.statut, 405);
  assert.equal(r.entetes.allow, 'GET, HEAD, POST');
});

test('un corps de plus de 64 Ko répond 413', async () => {
  const r = await requete({ methode: 'POST', chemin: '/enveloppes', entetes: origine(), corps: formulaire({ type: 'livret', libelle: 'x'.repeat(70 * 1024) }) });
  assert.equal(r.statut, 413);
  assert.match(r.corps, /Saisie trop longue/);
  assert.equal((await requete()).statut, 200, 'le serveur survit');
});

// ——— Configuration : la base ne vit jamais dans le dépôt ———————————————

test('une base dans le dépôt est refusée, quel que soit le détour du chemin', () => {
  for (const chemin of [
    join(RACINE_DEPOT, 'patrimoine.db'),
    join(RACINE_DEPOT, 'data', 'patrimoine.db'),
    join(RACINE_DEPOT, 'lib', '..', 'patrimoine.db'),
  ]) {
    const v = cheminBaseAutorise(chemin);
    assert.equal(v.ok, false, chemin);
    assert.match(v.motif, /ne peut pas vivre dans le dépôt/);
  }
});

test('la garde ne se contourne ni par la casse ni par un lien symbolique', () => {
  // Le disque du Mac ignore la casse : /…/PATRIMOINE/x.db EST le dépôt.
  const enMajuscules = join(RACINE_DEPOT.toUpperCase(), 'piege.db');
  assert.match(cheminBaseAutorise(enMajuscules).motif ?? '', /ne peut pas vivre dans le dépôt/, enMajuscules);

  const dossier = mkdtempSync(join(tmpdir(), 'patrimoine-lien-'));
  try {
    const lien = join(dossier, 'base.db');
    symlinkSync(join(RACINE_DEPOT, 'piege.db'), lien);
    const v = cheminBaseAutorise(lien);
    assert.equal(v.ok, false);
    assert.match(v.motif, /lien symbolique/);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});

test('une base hors du dépôt, dans un dossier existant, est acceptée', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'patrimoine-config-'));
  try {
    assert.deepEqual(cheminBaseAutorise(join(dossier, 'patrimoine.db')), { ok: true });
    assert.equal(cheminBaseAutorise(join(dossier, 'absent', 'p.db')).ok, false);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});

test('la configuration exige PATRIMOINE_DB et un port valide ; l\'hôte n\'est pas réglable', () => {
  assert.equal(lireConfiguration({}).ok, false);
  const dossier = mkdtempSync(join(tmpdir(), 'patrimoine-config-'));
  try {
    const db = join(dossier, 'p.db');
    assert.equal(lireConfiguration({ PATRIMOINE_DB: db, PATRIMOINE_PORT: '80' }).ok, false);
    assert.equal(lireConfiguration({ PATRIMOINE_DB: db, PATRIMOINE_PORT: 'abc' }).ok, false);
    const c = lireConfiguration({ PATRIMOINE_DB: db, PATRIMOINE_HOTE: '0.0.0.0', HOST: '0.0.0.0' });
    assert.equal(c.ok, true);
    assert.equal(c.port, 8710);
    assert.ok(!('hote' in c), 'aucune clé d\'hôte dans la configuration');
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});

test('le script de démarrage refuse une base du dépôt sans rien créer', () => {
  const cible = join(RACINE_DEPOT, 'refus-essai.db');
  const r = spawnSync(process.execPath, [join(RACINE_DEPOT, 'serveur', 'demarrer.mjs')], {
    env: { ...process.env, PATRIMOINE_DB: cible },
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Démarrage refusé : la base ne peut pas vivre dans le dépôt/);
  assert.equal(existsSync(cible), false);
});

test('le script de démarrage refuse de démarrer sans PATRIMOINE_DB', () => {
  const env = { ...process.env };
  delete env.PATRIMOINE_DB;
  const r = spawnSync(process.execPath, [join(RACINE_DEPOT, 'serveur', 'demarrer.mjs')], { env, encoding: 'utf8', timeout: 10_000 });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /PATRIMOINE_DB absent/);
});
