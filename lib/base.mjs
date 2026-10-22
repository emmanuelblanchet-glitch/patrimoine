// Ouverture de la base SQLite — et le garde-fou anti-prod des tests.
//
// En mode test, une base ne s'ouvre QUE dans le dossier temporaire du
// système (ou en mémoire). Ce n'est pas une convention : c'est codé ici,
// et `.verrous` interdit de modifier ce fichier en session. Un test ne peut
// donc jamais atteindre la base réelle, quelle que soit la variable
// d'environnement qu'on lui passe.

import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';

export const EN_MEMOIRE = ':memory:';

/**
 * Décide si un chemin de base peut s'ouvrir. Pure.
 * @param {string} chemin
 * @param {{ modeTest: boolean, dossierTemp?: string }} options
 * @returns {{ ok: boolean, raison?: string }}
 */
export function cheminAutorise(chemin, { modeTest, dossierTemp = tmpdir() }) {
  if (typeof chemin !== 'string' || chemin.length === 0) {
    return { ok: false, raison: 'chemin de base vide' };
  }
  if (chemin === EN_MEMOIRE) {
    return modeTest
      ? { ok: true }
      : { ok: false, raison: 'une base en mémoire n\'est permise qu\'en test' };
  }
  if (!modeTest) return { ok: true };

  const racineTemp = resolve(dossierTemp) + sep;
  const absolu = resolve(chemin);
  if (!absolu.startsWith(racineTemp)) {
    return {
      ok: false,
      raison: `les tests n'ouvrent jamais une base hors du dossier temporaire (${absolu})`,
    };
  }
  return { ok: true };
}

/**
 * Ouvre la base, en refusant tout chemin interdit.
 * `modeTest` est vrai sous `node --test` (NODE_ENV=test) ou quand l'appelant le dit.
 */
export function ouvrirBase(chemin, { modeTest = process.env.NODE_ENV === 'test', dossierTemp } = {}) {
  const verdict = cheminAutorise(chemin, { modeTest, dossierTemp });
  if (!verdict.ok) throw new Error(`base refusée : ${verdict.raison}`);
  const base = new DatabaseSync(chemin);
  base.exec('PRAGMA foreign_keys = ON');
  if (chemin !== EN_MEMOIRE) base.exec('PRAGMA journal_mode = WAL');
  return base;
}
