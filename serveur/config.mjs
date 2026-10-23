// Configuration du serveur local, testée par la fumée.
//
// Deux règles structurelles (cadrage du lot 0) :
// - le serveur n'écoute que sur 127.0.0.1 : l'hôte est une constante, aucune
//   variable d'environnement ne peut le changer ;
// - la base ne peut pas vivre dans le dépôt (ADR-0002) : un chemin situé
//   sous la racine du dépôt empêche le démarrage, avant toute ouverture.
//   Le disque du Mac ignore la casse et suit les liens : la comparaison se
//   fait donc sur le chemin canonique, en minuscules, et un fichier de base
//   qui serait un lien symbolique est refusé (revue sécurité du lot 0).

import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { empreinteValide, SECRET_MIN } from './session.mjs';

export const HOTE = '127.0.0.1';
const PORT_PAR_DEFAUT = 8710;
export const RACINE_DEPOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function estUnLien(chemin) {
  try {
    return lstatSync(chemin).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Chemin canonique : parent résolu par le système (casse réelle, liens suivis). */
function canonique(chemin) {
  const absolu = resolve(chemin);
  const parent = dirname(absolu);
  return existsSync(parent) ? join(realpathSync.native(parent), basename(absolu)) : absolu;
}

function sousLaRacine(chemin, racine) {
  const c = chemin.toLowerCase();
  const r = racine.toLowerCase();
  return c === r || c.startsWith(r + sep);
}

/**
 * @returns {{ ok: true } | { ok: false, motif: string }}
 */
export function cheminBaseAutorise(chemin, racineDepot = RACINE_DEPOT) {
  if (typeof chemin !== 'string' || chemin.trim() === '') {
    return { ok: false, motif: 'PATRIMOINE_DB absent : indiquer le chemin de la base (hors du dépôt, par exemple ~/Patrimoine/patrimoine.db)' };
  }
  if (estUnLien(resolve(chemin))) {
    return { ok: false, motif: `la base ne peut pas être un lien symbolique : ${resolve(chemin)}` };
  }
  const cible = canonique(chemin);
  const racine = existsSync(racineDepot) ? realpathSync.native(racineDepot) : resolve(racineDepot);
  if (sousLaRacine(cible, racine) || sousLaRacine(resolve(chemin), resolve(racineDepot))) {
    return { ok: false, motif: `la base ne peut pas vivre dans le dépôt (ADR-0002) : ${cible}` };
  }
  if (!existsSync(dirname(cible))) {
    return { ok: false, motif: `le dossier de la base n'existe pas : ${dirname(cible)}` };
  }
  return { ok: true };
}

/**
 * Le mode public (lot 3) : déclaré par `PATRIMOINE_MODE=public` (posé par le
 * fichier compose, pas par le fichier d'environnement), il exige l'hôte
 * public, l'empreinte de la phrase, le secret de session et le seul
 * utilisateur. Des réglages publics sans la déclaration, ou la déclaration
 * sans un réglage : refus de démarrer — jamais une porte à moitié posée, et
 * jamais un mode local par oubli sur le VPS.
 * @returns {{ ok: true, public: null | { hote, empreinte, secret, utilisateur } } | { ok: false, motif }}
 */
export function lireModePublic(env) {
  const mode = env.PATRIMOINE_MODE?.trim();
  const hote = env.PATRIMOINE_HOTE_PUBLIC?.trim();
  const empreinte = env.PATRIMOINE_PHRASE_EMPREINTE?.trim();
  const secret = env.PATRIMOINE_SECRET_SESSION?.trim();
  const utilisateur = env.PATRIMOINE_UTILISATEUR?.trim();
  if (mode !== 'public') {
    if (mode) return { ok: false, motif: `PATRIMOINE_MODE inconnu : « ${mode} » (public, ou absent pour le mode local)` };
    if (hote || empreinte || secret || utilisateur) return { ok: false, motif: 'réglages du mode public présents sans PATRIMOINE_MODE=public : refus plutôt qu\'une porte à moitié posée' };
    return { ok: true, public: null };
  }
  if (!hote || !/^[a-z0-9.-]+(:\d{1,5})?$/i.test(hote)) return { ok: false, motif: 'PATRIMOINE_HOTE_PUBLIC absent ou illisible (nom tailnet et port, ex. machine.mon-tailnet.ts.net:8006)' };
  if (!empreinteValide(empreinte)) return { ok: false, motif: 'PATRIMOINE_PHRASE_EMPREINTE absente ou mal formée : node scripts/empreinte-phrase.mjs la fabrique' };
  if (!secret || secret.length < SECRET_MIN) return { ok: false, motif: `PATRIMOINE_SECRET_SESSION absent ou trop court (${SECRET_MIN} caractères au moins)` };
  if (!utilisateur) return { ok: false, motif: 'PATRIMOINE_UTILISATEUR absent : le login Tailscale du seul utilisateur' };
  return { ok: true, public: { hote, empreinte, secret, utilisateur } };
}

/**
 * Lit la configuration depuis l'environnement. Seuls le chemin de la base,
 * le port et le mode public sont réglables ; l'hôte d'écoute ne l'est pas.
 * @returns {{ ok: true, chemin: string, port: number, public: object | null } | { ok: false, motif: string }}
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
  const mode = lireModePublic(env);
  if (!mode.ok) return mode;
  return { ok: true, chemin: resolve(chemin), port, public: mode.public };
}
