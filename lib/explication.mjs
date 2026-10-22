// L'explication (le cadrage dit aussi « argumentation ») : ce qui part vers
// Claude, son empreinte, et le texte de repli écrit depuis les mêmes
// chiffres. Tout est pur ici (seams S-L1-3, S-L1-4, S-L1-5) ; l'appel
// réseau vit dans serveur/claude.mjs.

import { createHash } from 'node:crypto';
import { LIBELLES_CLASSE } from './allocation.mjs';
import { eurosRonds, pct } from './format.mjs';

/**
 * Les seules clés qui ont le droit de partir — la liste du cadrage (L1-3) :
 * la cible, les poids actuels, le versement et sa répartition (avec
 * l'enveloppe visée, ou à ouvrir), l'horizon et le plancher. Ni valeur de
 * la poche ni part financière : avec les deux, on retrouverait l'immobilier.
 * Un test le vérifie.
 */
export const CLES_CHARGE_UTILE = ['cible', 'actuel', 'versementCentimes', 'repartition', 'regle', 'horizonAnnees', 'perteMaxPb', 'aOuvrir'];

export const MENTION = 'Aide à la décision, pas un conseil réglementé.';

/** Construit la charge utile minimale. Rien d'autre n'y entre : ni libellés saisis, ni immobilier, ni identité. */
export function chargeUtile({ ecarts, versementCentimes, repartition, objectif, destinations }) {
  return {
    cible: ecarts.map((e) => ({ classe: e.classe, poidsPb: e.ciblePb })),
    actuel: ecarts.map((e) => ({ classe: e.classe, poidsPb: e.actuelPb, dansLaBande: e.dansLaBande })),
    versementCentimes,
    repartition: repartition.parts.map((p) => ({ classe: p.classe, centimes: p.centimes, enveloppe: destinations[p.classe].enveloppeType })),
    regle: repartition.regle,
    horizonAnnees: objectif.horizonAnnees,
    perteMaxPb: objectif.perteMaxPb,
    aOuvrir: Object.values(destinations).filter((d) => d.aOuvrir).map((d) => d.aOuvrir),
  };
}

/** Empreinte stable : mêmes entrées → même empreinte, quel que soit l'ordre des clés. */
export function empreinte(charge) {
  const canon = JSON.stringify(charge, [...clesProfondes(charge)].sort());
  return createHash('sha256').update(canon).digest('hex');
}

function clesProfondes(objet, sortie = new Set()) {
  if (Array.isArray(objet)) objet.forEach((v) => clesProfondes(v, sortie));
  else if (objet && typeof objet === 'object') {
    for (const [k, v] of Object.entries(objet)) {
      sortie.add(k);
      clesProfondes(v, sortie);
    }
  }
  return sortie;
}

const NOM_ENVELOPPE = { pea: 'le PEA', av: 'l\'assurance-vie', livret: 'le livret', compte_courant: 'le compte courant', pee: 'le PEE', cto: 'le compte-titres' };

/** Le texte de repli : les mêmes chiffres, dits simplement, sans réseau. */
export function texteDeRepli(c) {
  const phrases = [];
  const cible = c.cible.map((x) => `${pct(x.poidsPb)} ${LIBELLES_CLASSE[x.classe].toLowerCase()}`).join(' et ');
  phrases.push(`La cible est ${cible}, pour un horizon de ${c.horizonAnnees} ans et une perte maximale acceptée de ${pct(c.perteMaxPb)}.`);
  const pocheVide = c.actuel.every((a) => a.poidsPb === 0);
  if (pocheVide) {
    phrases.push('La poche est vide : le premier versement la démarre au prorata de la cible.');
  } else {
    const hors = c.actuel.filter((a) => !a.dansLaBande);
    if (hors.length === 0) phrases.push('Toutes les lignes sont dans leur bande de tolérance.');
    else phrases.push(`Aujourd'hui ${hors.map((a) => `${LIBELLES_CLASSE[a.classe].toLowerCase()} pèse ${pct(a.poidsPb)}`).join(', ')} : hors de la bande.`);
  }
  if (c.versementCentimes > 0) {
    const parts = c.repartition.filter((p) => p.centimes > 0)
      .map((p) => `${eurosRonds(p.centimes)} sur ${LIBELLES_CLASSE[p.classe].toLowerCase()} (${NOM_ENVELOPPE[p.enveloppe] ?? p.enveloppe}${c.aOuvrir.includes(p.enveloppe) ? ', à ouvrir' : ''})`);
    phrases.push(c.regle === 'rattrapage'
      ? `Ce mois-ci, tout le versement va à la ligne la plus en retard : ${parts.join(', ')}.`
      : `Ce mois-ci, le versement suit la cible : ${parts.join(', ')}.`);
  }
  if (c.aOuvrir.length) phrases.push(`À ouvrir pour que ça fonctionne : ${c.aOuvrir.map((e) => NOM_ENVELOPPE[e] ?? e).join(' et ')}.`);
  phrases.push('Rien à vendre : on ne rééquilibre que par les versements.');
  phrases.push(MENTION);
  return phrases.join(' ');
}

/** Consigne et message pour Claude. Le modèle met en mots, il ne décide rien. */
export function messagesPourClaude(c) {
  const consigne = [
    'Tu rédiges, en français, l\'explication courte d\'une décision d\'épargne déjà prise par des règles.',
    'Tu ne décides rien, tu n\'ajoutes aucun chiffre, aucun produit, aucun conseil fiscal : tu mets en mots les données fournies.',
    'Ton : celui d\'un conseiller pédagogue qui parle à une seule personne, au tutoiement, sans jargon, sans emphase.',
    'Forme : un seul paragraphe de 60 à 110 mots, sans titre, sans liste, sans formule d\'introduction.',
    `Termine par la phrase exacte : « ${MENTION} »`,
  ].join(' ');
  const demande = `Données (centimes et points de base, 10000 = 100 %) : ${JSON.stringify(c)}. `
    + 'Explique où en est la poche par rapport à sa cible, ce que fait le versement de ce mois et pourquoi, et ce qu\'il reste à ouvrir s\'il y a lieu.';
  return { system: consigne, user: demande };
}
