// Configuration du serveur local — fonctions pures, testées par la fumée.
//
// Deux règles structurelles (cadrage du lot 0) :
// - le serveur n'écoute que sur 127.0.0.1 : l'hôte est une constante, aucune
//   variable d'environnement ne peut le changer ;
// - la base ne peut pas vivre dans le dépôt (ADR-0002) : un chemin situé
//   sous la racine du dépôt empêche le démarrage, avant toute ouverture.

import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOTE = '127.0.0.1';
export const PORT_PAR_DEFAUT = 8710;
export const RACINE_DEPOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Chemin canonique, liens symboliques résolus sur la partie qui existe (macOS : /tmp → /private/tmp). */
function canonique(chemin) {
  const absolu = resolve(chemin);
  const parent = dirname(absolu);
  return existsSync(parent) ? join(realpathSync(parent), basename(absolu)) : absolu;
}

/**
 * @returns {{ ok: true } | { ok: false, motif: string }}
 */
export function cheminBaseAutorise(chemin, racineDepot = RACINE_DEPOT) {
  if (typeof chemin !== 'string' || chemin.trim() === '') {
    return { ok: false, motif: 'PATRIMOINE_DB absent : indiquer le chemin de la base (hors du dépôt, par exemple ~/Patrimoine/patrimoine.db)' };
  }
  const cible = canonique(chemin);
  const racine = existsSync(racineDepot) ? realpathSync(racineDepot) : resolve(racineDepot);
  if (cible === racine || cible.startsWith(racine + sep)) {
    return { ok: false, motif: `la base ne peut pas vivre dans le dépôt (ADR-0002) : ${cible}` };
  }
  if (!existsSync(dirname(cible))) {
    return { ok: false, motif: `le dossier de la base n'existe pas : ${dirname(cible)}` };
  }
  return { ok: true };
}

/**
 * Lit la configuration depuis l'environnement. Seuls le chemin de la base et
 * le port sont réglables ; l'hôte ne l'est pas.
 * @returns {{ ok: true, chemin: string, port: number } | { ok: false, motif: string }}
 */
export function lireConfiguration(env, racineDepot = RACINE_DEPOT) {
  const chemin = env.PATRIMOINE_DB;
  const verdict = cheminBaseAutorise(chemin, racineDepot);
  if (!verdict.ok) return verdict;

  let port = PORT_PAR_DEFAUT;
  if (env.PATRIMOINE_PORT !== undefined && env.PATRIMOINE_PORT !== '') {
    port = Number(env.PATRIMOINE_PORT);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      return { ok: false, motif: `PATRIMOINE_PORT invalide : « ${env.PATRIMOINE_PORT} » (entre 1024 et 65535)` };
    }
  }
  return { ok: true, chemin: resolve(chemin), port };
}
