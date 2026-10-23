// Seam « migrations idempotentes » : le schéma s'applique sur une base vide,
// se rejoue sans effet, et refuse une base plus récente que le code.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appliquerMigrations, versionDeLaBase, VERSION_CONNUE, MIGRATIONS } from '../lib/schema.mjs';
import { baseJetable } from './aide.mjs';

const TABLES = ['actif', 'allocation_cible', 'cours', 'enveloppe', 'explication', 'migration', 'objectif', 'passif', 'profil', 'transactions', 'valorisation'];

function tables(base) {
  return base
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((r) => r.name);
}

test('sur une base vide, toutes les migrations s\'appliquent', () => {
  const { base, nettoyer } = baseJetable();
  try {
    assert.equal(versionDeLaBase(base), 0);
    const r = appliquerMigrations(base);
    assert.deepEqual(r, { avant: 0, apres: VERSION_CONNUE, appliquees: MIGRATIONS.map((m) => m.version) });
    assert.deepEqual(tables(base), TABLES);
    assert.equal(versionDeLaBase(base), VERSION_CONNUE);
  } finally {
    nettoyer();
  }
});

test('rejouer les migrations ne change rien', () => {
  const { base, nettoyer } = baseJetable();
  try {
    appliquerMigrations(base);
    base.prepare("INSERT INTO enveloppe (type, libelle, quote_part_num, quote_part_den) VALUES ('livret', 'Livret A', 1, 1)").run();
    const r = appliquerMigrations(base);
    assert.deepEqual(r.appliquees, []);
    assert.equal(base.prepare('SELECT COUNT(*) AS n FROM migration').get().n, MIGRATIONS.length);
    assert.equal(base.prepare('SELECT COUNT(*) AS n FROM enveloppe').get().n, 1, 'les données survivent au rejeu');
  } finally {
    nettoyer();
  }
});

test('une base plus récente que le code est refusée, sans y toucher', () => {
  const { base, nettoyer } = baseJetable();
  try {
    appliquerMigrations(base);
    base.prepare("INSERT INTO migration (version, nom, appliquee_le) VALUES (99, 'future', '2030-01-01')").run();
    assert.throws(() => appliquerMigrations(base), /version 99.*ouverture refusée/);
    assert.equal(versionDeLaBase(base), 99);
  } finally {
    nettoyer();
  }
});

test('une migration qui échoue est annulée en entier', () => {
  const { base, nettoyer } = baseJetable();
  try {
    appliquerMigrations(base);
    const cassee = [...MIGRATIONS, { version: VERSION_CONNUE + 1, nom: 'cassée', sql: 'CREATE TABLE essai (x); SELECT * FROM table_inexistante;' }];
    assert.throws(() => appliquerMigrations(base, { migrations: cassee }));
    assert.equal(versionDeLaBase(base), VERSION_CONNUE);
    assert.ok(!tables(base).includes('essai'), 'la table partielle a été annulée');
  } finally {
    nettoyer();
  }
});
