// Garde-fou anti-prod : un test ne peut pas atteindre la base réelle.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { cheminAutorise, ouvrirBase, EN_MEMOIRE } from '../lib/base.mjs';
import { baseJetable } from './aide.mjs';

test('en mode test, un chemin hors du dossier temporaire est refusé', () => {
  for (const chemin of ['/srv/patrimoine/patrimoine.db', resolve('data/patrimoine.db'), '/var/lib/patrimoine.db', 'patrimoine.db']) {
    const verdict = cheminAutorise(chemin, { modeTest: true, dossierTemp: '/tmp' });
    assert.equal(verdict.ok, false, chemin);
    assert.match(verdict.raison, /dossier temporaire/);
  }
});

test('en mode test, une remontée hors du dossier temporaire est refusée', () => {
  const verdict = cheminAutorise(join(tmpdir(), '..', 'etc', 'x.db'), { modeTest: true });
  assert.equal(verdict.ok, false);
});

test('en mode test, le dossier temporaire et la mémoire sont permis', () => {
  assert.equal(cheminAutorise(join(tmpdir(), 'x', 'p.db'), { modeTest: true }).ok, true);
  assert.equal(cheminAutorise(EN_MEMOIRE, { modeTest: true }).ok, true);
});

test('hors test, la mémoire est refusée et un chemin réel est permis', () => {
  assert.equal(cheminAutorise(EN_MEMOIRE, { modeTest: false }).ok, false);
  assert.equal(cheminAutorise('/srv/patrimoine/patrimoine.db', { modeTest: false }).ok, true);
});

test('ouvrirBase lève une erreur explicite sur un chemin refusé', () => {
  assert.throws(() => ouvrirBase('/srv/patrimoine/patrimoine.db', { modeTest: true }), /base refusée/);
});

test('ouvrirBase ignore toute variable d\'environnement : seul le chemin passé compte', () => {
  const ancien = process.env.PATRIMOINE_DB;
  process.env.PATRIMOINE_DB = '/srv/patrimoine/patrimoine.db';
  try {
    assert.throws(() => ouvrirBase(process.env.PATRIMOINE_DB, { modeTest: true }), /base refusée/);
  } finally {
    if (ancien === undefined) delete process.env.PATRIMOINE_DB; else process.env.PATRIMOINE_DB = ancien;
  }
});

test('une base jetable s\'ouvre, écrit, relit, et disparaît au ménage', () => {
  const { base, chemin, nettoyer } = baseJetable();
  try {
    assert.ok(chemin.startsWith(resolve(tmpdir())));
    base.exec('CREATE TABLE essai (montant_centimes INTEGER NOT NULL)');
    base.prepare('INSERT INTO essai (montant_centimes) VALUES (?)').run(123456);
    const ligne = base.prepare('SELECT montant_centimes FROM essai').get();
    assert.equal(ligne.montant_centimes, 123456);
    assert.equal(base.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  } finally {
    nettoyer();
  }
});
