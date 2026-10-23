// Les références du sous-lot 2b : le fichier de faits datés et sourcés
// (`docs/references/etf-monde-pea.json`), lu, vérifié et daté. Aucun
// accès réseau : rien ne met ces faits à jour tout seul (S10). Un fait sans
// source ou sans date fait échouer le chargement (seam S-L2-6).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE_DEPOT } from '../serveur/config.mjs';
import { lireDate } from './saisie.mjs';

export const FICHIER_ETF_MONDE = join(RACINE_DEPOT, 'docs', 'references', 'etf-monde-pea.json');
/** Au-delà, un fait est signalé périmé (cadrage du 2b : six mois). */
export const FRAICHEUR_MAX_JOURS = 183;

const FAITS_COURTIER = ['fraisOrdre', 'minimumOrdreCentimes', 'droitsDeGardeCentimes', 'emetteursSansCourtageAchat'];
const FAITS_CANDIDAT = ['fraisCourantsPb', 'prixPartCentimes', 'encoursMillionsEuros', 'replication', 'capitalisant', 'eligiblePea', 'indice', 'premiereVl'];
const JOUR_MS = 24 * 60 * 60 * 1000;

export class ErreurReference extends Error {
  constructor(motifs) {
    super(`références illisibles : ${motifs.join(' ; ')}`);
    this.motifs = motifs;
  }
}

function verifierFait(fait, ou, motifs) {
  if (!fait || typeof fait !== 'object') return motifs.push(`${ou} : fait absent`);
  if (!('valeur' in fait)) motifs.push(`${ou} : sans valeur`);
  if (typeof fait.source !== 'string' || !/^https:\/\/\S+$/.test(fait.source)) motifs.push(`${ou} : sans source (URL https)`);
  if (!fait.releve_le || !lireDate(fait.releve_le).ok) motifs.push(`${ou} : sans date de relevé`);
}

/** Pure : vérifie la forme du fichier et rend ses motifs d'erreur (vide = bon). */
export function verifierReferences(donnees) {
  const motifs = [];
  const courtier = donnees?.courtier;
  if (!courtier?.nom) motifs.push('courtier : nom manquant');
  for (const nom of FAITS_COURTIER) verifierFait(courtier?.faits?.[nom], `courtier ${nom}`, motifs);
  const candidats = Array.isArray(donnees?.candidats) ? donnees.candidats : [];
  if (!candidats.length) motifs.push('aucun candidat');
  const symboles = new Set();
  for (const c of candidats) {
    const ou = c?.symbole ?? '?';
    if (!c?.symbole || !c?.isin || !c?.nom || !c?.emetteur) motifs.push(`${ou} : symbole, ISIN, nom et émetteur obligatoires`);
    if (symboles.has(c?.symbole)) motifs.push(`${ou} : symbole en double`);
    symboles.add(c?.symbole);
    for (const nom of FAITS_CANDIDAT) verifierFait(c?.faits?.[nom], `${ou} ${nom}`, motifs);
    if (c?.faits?.eligiblePea?.valeur !== true) motifs.push(`${ou} : seul un ETF éligible au PEA entre ici (L2b-3)`);
    if (c?.faits?.indice?.valeur !== 'MSCI World') motifs.push(`${ou} : seul un ETF MSCI World entre ici (L2b-3)`);
  }
  return motifs;
}

/** Âge d'un fait en jours à la date donnée. */
export function ageJours(fait, aujourdhui) {
  return Math.round((Date.parse(`${aujourdhui}T00:00:00Z`) - Date.parse(`${fait.releve_le}T00:00:00Z`)) / JOUR_MS);
}

/** Pure : les faits de plus de FRAICHEUR_MAX_JOURS, nommés, pour l'alerte de la page. */
export function faitsPerimes(references, aujourdhui) {
  const perimes = [];
  for (const [nom, fait] of Object.entries(references.courtier.faits)) {
    if (ageJours(fait, aujourdhui) > FRAICHEUR_MAX_JOURS) perimes.push({ ou: references.courtier.nom, nom, releveLe: fait.releve_le });
  }
  for (const c of references.candidats) {
    for (const [nom, fait] of Object.entries(c.faits)) {
      if (ageJours(fait, aujourdhui) > FRAICHEUR_MAX_JOURS) perimes.push({ ou: c.symbole, nom, releveLe: fait.releve_le });
    }
  }
  return perimes;
}

/** Lit et vérifie le fichier ; lève ErreurReference s'il est illisible. */
export function chargerReferences(chemin = FICHIER_ETF_MONDE) {
  let donnees;
  try {
    donnees = JSON.parse(readFileSync(chemin, 'utf8'));
  } catch (e) {
    throw new ErreurReference([`fichier ${chemin} : ${e.message}`]);
  }
  const motifs = verifierReferences(donnees);
  if (motifs.length) throw new ErreurReference(motifs);
  return donnees;
}
