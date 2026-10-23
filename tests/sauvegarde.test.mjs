// Seam S-L3-4 : la sauvegarde chiffrée se déchiffre avec la phrase, s'ouvre
// en SQLite avec les mêmes tables et lignes ; une mauvaise phrase ou un
// fichier altéré échoue bruyamment ; rotation à 30 jours.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { chiffrer, dechiffrer, sauvegarder, restaurer } from '../scripts/sauvegarder.mjs';
import { appliquerMigrations } from '../lib/schema.mjs';
import { creerEnveloppe, creerActif } from '../lib/referentiel.mjs';
import { baseJetable } from './aide.mjs';

const PHRASE = 'une phrase de sauvegarde longue';
const JOUR_MS = 86_400_000;

test('chiffrer puis déchiffrer rend l\'original ; mauvaise phrase, altération, troncature ou faux fichier sont refusés', () => {
  const clair = Buffer.from('données de test, pas des chiffres réels');
  const c = chiffrer(clair, PHRASE);
  assert.ok(!c.includes(clair), 'rien du clair ne transparaît');
  assert.ok(dechiffrer(c, PHRASE).equals(clair));
  assert.throws(() => dechiffrer(c, 'une autre phrase longue'), /mauvaise phrase ou fichier altéré/);
  const altere = Buffer.from(c); altere[altere.length - 1] ^= 1;
  assert.throws(() => dechiffrer(altere, PHRASE), /mauvaise phrase ou fichier altéré/);
  assert.throws(() => dechiffrer(c.subarray(0, 40), PHRASE), /pas une sauvegarde/, 'tronqué avant la fin de l\'étiquette');
  assert.throws(() => dechiffrer(Buffer.from('n importe quoi'), PHRASE), /pas une sauvegarde/);
  assert.throws(() => chiffrer(clair, 'courte'), /trop courte/);
});

test('S-L3-4 — sauvegarder une base vivante puis la restaurer : mêmes tables, mêmes lignes ; pas d\'écrasement ; rotation à trente jours', () => {
  const { base, chemin, nettoyer } = baseJetable();
  const dossier = mkdtempSync(join(tmpdir(), 'patrimoine-sauvegardes-'));
  try {
    appliquerMigrations(base);
    const env = creerEnveloppe(base, { type: 'pea', libelle: 'PEA test' });
    creerActif(base, { enveloppeId: env, nature: 'etf', libelle: 'ETF test' });
    const dater = (nom, jours) => { const f = join(dossier, nom); writeFileSync(f, chiffrer(Buffer.from('x'), PHRASE)); const t = (Date.now() - jours * JOUR_MS) / 1000; utimesSync(f, t, t); };
    dater('patrimoine-2020-01-01T00-00-00.sqlite.chiffre', 31);
    dater('patrimoine-2020-01-02T00-00-00.sqlite.chiffre', 29);
    writeFileSync(join(dossier, 'autre.txt'), 'pas à moi');

    const sortie = sauvegarder(chemin, dossier, PHRASE);
    assert.match(sortie, /patrimoine-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.sqlite\.chiffre$/);
    const restants = readdirSync(dossier);
    assert.ok(!restants.includes('patrimoine-2020-01-01T00-00-00.sqlite.chiffre'), 'plus de trente jours : supprimée');
    assert.ok(restants.includes('patrimoine-2020-01-02T00-00-00.sqlite.chiffre'), 'moins de trente jours : gardée');
    assert.ok(restants.includes('autre.txt'), 'un fichier étranger n\'est jamais touché');
    assert.ok(!readFileSync(sortie).includes('PEA test'), 'le libellé ne transparaît pas');

    const restauree = join(dossier, 'restauree.db');
    restaurer(sortie, restauree, PHRASE);
    const r = new DatabaseSync(restauree, { readOnly: true });
    try {
      const tables = base.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((t) => t.name);
      assert.deepEqual(r.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((t) => t.name), tables);
      for (const t of tables) assert.equal(r.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n, base.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n, `table ${t}`);
      assert.equal(r.prepare('SELECT libelle FROM enveloppe').get().libelle, 'PEA test');
    } finally {
      r.close();
    }
    assert.throws(() => restaurer(sortie, restauree, PHRASE), /EEXIST/, 'jamais d\'écrasement');
    assert.throws(() => restaurer(sortie, join(dossier, 'autre.db'), 'une mauvaise phrase longue'), /mauvaise phrase/);
    assert.equal(base.prepare('SELECT COUNT(*) AS n FROM actif').get().n, 1, 'la base d\'origine, restée ouverte, est intacte');
  } finally {
    nettoyer();
    rmSync(dossier, { recursive: true, force: true });
  }
});
