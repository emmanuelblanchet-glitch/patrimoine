#!/usr/bin/env node
// Validateur de l'état du dépôt — le check derrière le garde-fou 1 du
// CLAUDE.md : le dépôt est du code, jamais des données ni des secrets.
//
//   node scripts/valider.mjs            sort 1 au premier manquement
//
// Le raisonnement est dans `verifier()` (pure : elle ne lit rien) ; la
// lecture du dépôt est dans `collecter()`. Les tests n'exercent que la
// fonction pure.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Motifs que `.gitignore` doit contenir, ligne pour ligne (ADR-0002). */
export const IGNORES_REQUIS = ['*.db', '*.sqlite', '*.sqlite3', 'data/', 'sauvegardes/', '*.env', '.env*', '.mcp.json', 'node_modules/'];

/** Un fichier suivi qui ressemble à une donnée ou à un secret est un manquement. */
export const MOTIFS_INTERDITS = [
  { motif: /\.(db|db-wal|db-shm|sqlite3?)$/i, raison: 'base de données suivie par git' },
  { motif: /(^|\/)\.?[^/]*\.env$|(^|\/)\.env[^/]*$/i, raison: 'fichier d\'environnement suivi par git' },
  { motif: /^data\//, raison: 'dossier de données suivi par git' },
  { motif: /^sauvegardes\//, raison: 'sauvegarde suivie par git' },
  { motif: /(^|\/)\.mcp\.json$/, raison: 'câblage MCP du poste suivi par git' },
];

/** Motifs de secrets ou d'identifiants bancaires, cherchés dans le contenu des fichiers suivis. */
export const MOTIFS_CONTENU = [
  { motif: /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}/, raison: 'clé d\'API' },
  { motif: /\bFR\d{2}(?:[ ]?\d{4}){5}[ ]?[\dA-Z]{3}\b/, raison: 'motif IBAN' },
  { motif: /\btskey-[A-Za-z0-9-]{10,}/, raison: 'clé Tailscale' },
];

/** Fichiers sans lesquels le socle n'existe pas (skill /nouveau-projet). */
export const FICHIERS_REQUIS = [
  'CLAUDE.md',
  'CONTEXT.md',
  'docs/adr/README.md',
  '.verrous',
  '.supprimes',
  '.githooks/pre-commit',
  '.github/workflows/tests.yml',
];

/**
 * @param {object} etat
 * @param {string[]} etat.fichiersSuivis  chemins relatifs, tels que `git ls-files`
 * @param {string} etat.gitignore          contenu de .gitignore
 * @param {(chemin: string) => boolean} etat.existe
 * @param {(chemin: string) => string} etat.lire  contenu d'un fichier suivi (texte)
 * @param {object} etat.packageJson        package.json analysé
 * @returns {{ ok: boolean, manquements: string[] }}
 */
export function verifier({ fichiersSuivis, gitignore, existe, lire, packageJson }) {
  const manquements = [];

  const lignesIgnore = new Set(gitignore.split('\n').map((l) => l.trim()));
  for (const motif of IGNORES_REQUIS) {
    if (!lignesIgnore.has(motif)) manquements.push(`.gitignore : motif manquant « ${motif} »`);
  }

  for (const chemin of fichiersSuivis) {
    for (const { motif, raison } of MOTIFS_INTERDITS) {
      if (motif.test(chemin)) manquements.push(`${chemin} : ${raison}`);
    }
  }

  for (const chemin of fichiersSuivis) {
    let contenu;
    try { contenu = lire(chemin); } catch { continue; }
    if (typeof contenu !== 'string') continue;
    for (const { motif, raison } of MOTIFS_CONTENU) {
      if (motif.test(contenu)) manquements.push(`${chemin} : ${raison} dans le contenu`);
    }
  }

  for (const chemin of FICHIERS_REQUIS) {
    if (!existe(chemin)) manquements.push(`${chemin} : fichier du socle absent`);
  }

  for (const champ of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const deps = packageJson?.[champ];
    if (deps && Object.keys(deps).length > 0) {
      manquements.push(`package.json : « ${champ} » non vide (ADR-0001, zéro dépendance)`);
    }
  }

  return { ok: manquements.length === 0, manquements };
}

export function collecter(racine = process.cwd()) {
  const fichiersSuivis = execFileSync('git', ['ls-files', '-z'], { cwd: racine, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
  const lireTexte = (chemin) => readFileSync(join(racine, chemin), 'utf8');
  return {
    fichiersSuivis,
    gitignore: existsSync(join(racine, '.gitignore')) ? lireTexte('.gitignore') : '',
    existe: (chemin) => existsSync(join(racine, chemin)),
    lire: lireTexte,
    packageJson: JSON.parse(lireTexte('package.json')),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const racine = resolve(process.argv[2] || process.cwd());
  const { ok, manquements } = verifier(collecter(racine));
  if (ok) {
    process.stdout.write('État du dépôt valide : aucune donnée, aucun secret, socle complet, zéro dépendance.\n');
    process.exit(0);
  }
  process.stderr.write('État du dépôt INVALIDE :\n' + manquements.map((m) => `  - ${m}`).join('\n') + '\n');
  process.exit(1);
}
