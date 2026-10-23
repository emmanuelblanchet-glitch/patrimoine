// Seam S-L3-4 : la sauvegarde chiffrée se déchiffre avec la phrase, s'ouvre
// en SQLite avec les mêmes tables et lignes ; une mauvaise phrase ou un
// fichier altéré échoue bruyamment ; rotation à 30 jours.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { chiffrer, dechiffrer, sauvegarder, restaurer, RETENTION_JOURS } from '../scripts/sauvegarder.mjs';
import { appliquerMigrations } from '../lib/schema.mjs';
import { creerEnveloppe, creerActif } from '../lib/referentiel.mjs';
import { baseJetable } from './aide.mjs';

const PHRASE = 'une phrase de sauvegarde longue';

test('chiffrer puis déchiffrer rend l\'original ; mauvaise phrase, altération ou faux fichier sont refusés', () => {
  const clair = Buffer.from('données de test, pas des chiffres réels');
  const c = chiffrer(clair, PHRASE);
  assert.ok(c.subarray(0, 11).equals(Buffer.from('PATRIMOINE1')));
  assert.ok(!c.includes(clair), 'rien du clair ne transparaît');
  assert.ok(dechiffrer(c, PHRASE).equals(clair));
  assert.notEqual(chiffrer(clair, PHRASE).toString('hex'), c.toString('hex'), 'sel et nonce neufs à chaque fois');
  assert.throws(() => dechiffrer(c, 'une autre phrase longue'), /mauvaise phrase ou fichier altéré/);
  const altere = Buffer.from(c); altere[altere.length - 1] ^= 1;
  assert.throws(() => dechiffrer(altere, PHRASE), /mauvaise phrase ou fichier altéré/);
  assert.throws(() => dechiffrer(Buffer.from('n importe quoi'), PHRASE), /pas une sauvegarde/);
  assert.throws(() => chiffrer(clair, 'courte'), /trop courte/);
});

test('S-L3-4 — sauvegarder une base vivante puis la restaurer : mêmes tables, mêmes lignes ; pas d\'écrasement ; rotation', () => {
  const { base, chemin, nettoyer } = baseJetable();
  const dossier = mkdtempSync(join(tmpdir(), 'patrimoine-sauvegardes-'));
  try {
    appliquerMigrations(base);
    const env = creerEnveloppe(base, { type: 'pea', libelle: 'PEA test' });
    creerActif(base, { enveloppeId: env, nature: 'etf', libelle: 'ETF test' });
    const vieille = join(dossier, 'patrimoine-2020-01-01T00-00-00.sqlite.chiffre');
    writeFileSync(vieille, chiffrer(Buffer.from('x'), PHRASE));
    const vieux = Date.now() - (RETENTION_JOURS + 1) * 86_400_000;
    utimesSync(vieille, vieux / 1000, vieux / 1000);
    const recente = join(dossier, 'patrimoine-2026-10-22T00-00-00.sqlite.chiffre');
    writeFileSync(recente, chiffrer(Buffer.from('y'), PHRASE));
    writeFileSync(join(dossier, 'autre.txt'), 'pas à moi');

    const sortie = sauvegarder(chemin, dossier, PHRASE, { maintenant: () => new Date('2026-10-23T03:30:00Z') });
    assert.match(sortie, /patrimoine-2026-10-23T03-30-00\.sqlite\.chiffre$/);
    assert.deepEqual(readdirSync(dossier).sort(), ['autre.txt', 'patrimoine-2026-10-22T00-00-00.sqlite.chiffre', 'patrimoine-2026-10-23T03-30-00.sqlite.chiffre'], 'la vieille est partie, le reste est intact');
    assert.ok(!readFileSync(sortie).includes('PEA test'), 'le libellé ne transparaît pas');

    const restauree = join(dossier, 'restauree.db');
    assert.deepEqual(restaurer(sortie, restauree, PHRASE), { tables: base.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'").get().n });
    const r = new DatabaseSync(restauree, { readOnly: true });
    try {
      assert.equal(r.prepare('SELECT libelle FROM enveloppe').get().libelle, 'PEA test');
      assert.equal(r.prepare('SELECT COUNT(*) AS n FROM actif').get().n, 1);
      assert.equal(r.prepare('SELECT MAX(version) AS v FROM migration').get().v, base.prepare('SELECT MAX(version) AS v FROM migration').get().v);
    } finally {
      r.close();
    }
    assert.throws(() => restaurer(sortie, restauree, PHRASE), /EEXIST/, 'jamais d\'écrasement');
    assert.throws(() => restaurer(sortie, join(dossier, 'autre.db'), 'une mauvaise phrase longue'), /mauvaise phrase/);
    // La base d'origine est restée ouverte et intacte.
    assert.equal(base.prepare('SELECT COUNT(*) AS n FROM actif').get().n, 1);
  } finally {
    nettoyer();
    rmSync(dossier, { recursive: true, force: true });
  }
});
