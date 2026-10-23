// Seam S-L2-1 : les parseurs du collecteur Yahoo, sur des fixtures réelles (relevées le 23/10/2026), jamais le réseau.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lireCours, lireRecherche, recupererCours, chercher } from '../collecteurs/yahoo.mjs';
import { SYMBOLE_VALIDE } from '../lib/saisie.mjs';

const fixture = (nom) => JSON.parse(readFileSync(new URL(`./fixtures/${nom}`, import.meta.url), 'utf8'));

test('lireCours : la fixture WPEA donne des cours datés en centimes, sans le jour nul', () => {
  const r = lireCours(fixture('yahoo-cours-wpea.json'));
  assert.equal(r.ok, true);
  assert.equal(r.valeur.symbole, 'WPEA.PA');
  assert.equal(r.valeur.devise, 'EUR');
  assert.match(r.valeur.nom, /MSCI World/);
  assert.equal(r.valeur.cours.length, 21, '23 points : un nul, un en séance');
  for (const c of r.valeur.cours) {
    assert.match(c.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Number.isSafeInteger(c.centimes) && c.centimes > 0);
  }
  assert.equal(r.valeur.cours.at(-1).date, '2026-10-21', 'la séance du 23 est en cours : pas une clôture');
  assert.equal(r.valeur.cours.at(-1).centimes, 719, '7,19 € à la dernière clôture de la fixture');
});

test('lireCours : vide, erreur de la source, sans résultat, valeurs nulles ou négatives → refus explicite', () => {
  assert.equal(lireCours(null).ok, false);
  assert.equal(lireCours({}).ok, false);
  assert.match(lireCours({ chart: { error: { description: 'No data found' } } }).motif, /No data found/);
  assert.equal(lireCours({ chart: { result: [] } }).ok, false);
  const base = fixture('yahoo-cours-wpea.json');
  base.chart.result[0].indicators.quote[0].close = base.chart.result[0].indicators.quote[0].close.map(() => null);
  assert.match(lireCours(base).motif, /aucun cours exploitable/);
  base.chart.result[0].indicators.quote[0].close = base.chart.result[0].indicators.quote[0].close.map(() => -1);
  assert.equal(lireCours(base).ok, false);
});

test('lireCours : la date est celle de la place de cotation, pas celle du serveur', () => {
  // 23 h 45 UTC le 21 : à Paris (UTC+2), c'est déjà le 22.
  const json = { chart: { result: [{ meta: { symbol: 'X', gmtoffset: 7200 }, timestamp: [Date.UTC(2026, 9, 21, 23, 45) / 1000], indicators: { quote: [{ close: [10] }] } }] } };
  assert.equal(lireCours(json).valeur.cours[0].date, '2026-10-22');
});

test('lireRecherche : la fixture ISIN rend l\'ETF de Paris, et écarte la ligne « MUTUALFUND »', () => {
  const c = lireRecherche(fixture('yahoo-recherche-isin.json'));
  assert.deepEqual(c.map((x) => [x.symbole, x.place, x.type]), [['WPEA.PA', 'PAR', 'etf']]);
  assert.match(c[0].nom, /MSCI World/);
  assert.deepEqual(lireRecherche({}), []);
  assert.deepEqual(lireRecherche({ quotes: [{ symbol: 'A', quoteType: 'ETF' }, { symbol: 'A', quoteType: 'ETF' }, { symbol: 'B', quoteType: 'INDEX' }] }).map((x) => x.symbole), ['A']);
});

test('S10 — le collecteur n\'émet que des GET, sans corps, et seul le symbole part', async () => {
  const appels = [];
  const f = async (url, options) => { appels.push({ url, options }); return { ok: true, json: async () => fixture('yahoo-cours-wpea.json') }; };
  const r = await recupererCours('WPEA.PA', { fetchImpl: f });
  assert.equal(r.ok, true);
  assert.equal(appels.length, 1);
  assert.equal(appels[0].options.method, undefined, 'GET implicite');
  assert.equal(appels[0].options.body, undefined);
  assert.match(appels[0].url, /\/chart\/WPEA\.PA\?/);
});

test('recupererCours / chercher : symbole illisible refusé sans appel, réseau et HTTP en échec dits', async () => {
  let appels = 0;
  const f = async () => { appels++; return { ok: false, status: 503 }; };
  assert.equal((await recupererCours('../etc', { fetchImpl: f })).ok, false);
  assert.equal((await recupererCours('WPEA.PA; DROP', { fetchImpl: f })).ok, false);
  assert.equal(appels, 0);
  assert.equal((await recupererCours('WPEA.PA', { fetchImpl: f })).motif, 'http_503');
  assert.equal((await chercher('<script>', { fetchImpl: f })).ok, false);
  const panne = async () => { throw new TypeError('fetch failed'); };
  assert.equal((await chercher('IE0002XZSHO1', { fetchImpl: panne })).motif, 'réseau injoignable');
  assert.ok(SYMBOLE_VALIDE.test('CW8.PA') && !SYMBOLE_VALIDE.test('cw8.pa'));
});

test('lireCours : le point de la séance en cours est écarté, celui d\'une séance finie est gardé', () => {
  const seance = { start: 1792738800, end: 1792769400 };
  const json = (t) => ({ chart: { result: [{ meta: { symbol: 'X', gmtoffset: 0, currentTradingPeriod: { regular: seance } }, timestamp: [t], indicators: { quote: [{ close: [10] }] } }] } });
  assert.equal(lireCours(json(seance.start + 60)).ok, false, 'en séance : rien d\'exploitable');
  assert.equal(lireCours(json(seance.start - 86_400)).ok, true, 'veille : clôture');
  assert.equal(lireCours(json(seance.end)).ok, true, 'séance fermée : clôture');
});
