// Aides de test — une base jetable par run, marquée d'un identifiant unique,
// et son ménage. Les tests n'ouvrent jamais autre chose.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ouvrirBase } from '../lib/base.mjs';

/** Les montants formatés portent des espaces insécables : on les aplatit pour comparer. */
export const normaliser = (texte) => texte.replace(/[\u00a0\u202f]/g, ' ');

export function baseJetable() {
  const dossier = mkdtempSync(join(tmpdir(), `patrimoine-test-${process.pid}-`));
  const chemin = join(dossier, 'patrimoine.db');
  const base = ouvrirBase(chemin, { modeTest: true });
  return {
    base,
    chemin,
    nettoyer() {
      try { base.close(); } catch { /* déjà fermée */ }
      rmSync(dossier, { recursive: true, force: true });
    },
  };
}
