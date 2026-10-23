// La poche financière : assemble l'état (lignes classées, valeurs, point de
// départ, cible) et rend tout ce que la page d'accueil affiche. Pur, à
// partir de l'état déjà lu ; l'explication (cache ou appel) est à part.

import { calculerBilan } from './bilan.mjs';
import { exposition, ecarts, repartirVersement, trajectoire, partPb } from './allocation.mjs';
import { chargeUtile, empreinte } from './explication.mjs';
import { plusValue, tri, reculJours } from './performance.mjs';

export const RECUL_TRI_JOURS = 30;
const RECUL_TRI_ESTIMATION_JOURS = 365;

export const TYPES_FINANCIERS = new Set(['pee', 'per', 'pea', 'cto', 'av', 'livret', 'compte_courant']);

/**
 * Les lignes de la poche : actifs classés, dans une enveloppe financière,
 * avec leur valeur à la quote-part à la date donnée (via le bilan).
 */
export function lignesDeLaPoche(etat, dateBilan) {
  const bilan = calculerBilan(etat, dateBilan);
  const typeEnveloppe = new Map(etat.enveloppes.map((e) => [e.id, e.type]));
  const lignes = [];
  for (const env of bilan.enveloppes) {
    if (!TYPES_FINANCIERS.has(env.type)) continue;
    for (const bien of env.biens) {
      const actif = etat.actifs.find((a) => a.id === bien.actifId);
      if (!actif?.classePoche) continue;
      const position = etat.positions[actif.id] ?? null;
      const cours = etat.derniersCours[actif.id] ?? null;
      lignes.push({
        symboleCours: actif.symboleCours,
        position,
        cours,
        plusValue: bien.valeur && position ? plusValue({ valeurCentimes: bien.valeur.centimes, coutCentimes: position.coutCentimes }) : null,
        actifId: actif.id,
        libelle: actif.libelle,
        enveloppeId: env.enveloppeId,
        enveloppeLibelle: env.libelle,
        enveloppeType: typeEnveloppe.get(env.enveloppeId),
        classe: actif.classePoche,
        partActionsPb: actif.partActionsPb,
        valeurCentimes: bien.valeur ? bien.valeur.centimes : 0,
        valorisee: Boolean(bien.valeur),
        valeur: bien.valeur,
      });
    }
  }
  return lignes;
}

/**
 * Où va l'argent d'une classe : la ligne qui la reçoit, ou l'enveloppe à ouvrir.
 * Actions monde → la ligne actions d'un PEA (sinon une autre ligne actions).
 * Sans risque → le livret tant qu'il est sous le matelas, sinon l'assurance-vie.
 */
export function destinations(lignes, matelasCentimes) {
  const actions = lignes.filter((l) => l.classe === 'actions_monde');
  const actionsPea = actions.find((l) => l.enveloppeType === 'pea');
  const sansRisque = lignes.filter((l) => l.classe === 'sans_risque');
  const livret = sansRisque.find((l) => l.enveloppeType === 'livret' || l.enveloppeType === 'compte_courant');
  const av = sansRisque.find((l) => l.enveloppeType === 'av');

  const d = {};
  d.actions_monde = actionsPea
    ? { ligne: actionsPea, enveloppeType: 'pea' }
    : actions[0] ? { ligne: actions[0], enveloppeType: actions[0].enveloppeType } : { aOuvrir: 'pea', enveloppeType: 'pea' };

  if (livret && livret.valeurCentimes < matelasCentimes) d.sans_risque = { ligne: livret, enveloppeType: livret.enveloppeType, motif: 'matelas' };
  else if (av) d.sans_risque = { ligne: av, enveloppeType: 'av' };
  else if (livret) d.sans_risque = { ligne: livret, enveloppeType: livret.enveloppeType, motif: 'sans_av', aOuvrir: 'av' };
  else d.sans_risque = { aOuvrir: 'av', enveloppeType: 'av' };
  return d;
}

/**
 * Rendement de l'épargne suivie : TRI des flux sortis (négatifs) vers les
 * lignes qui en ont reçu, et de la valeur du jour de ces lignes-là
 * (positive). Les lignes sans flux suivi (la réserve d'avant l'outil) n'y
 * entrent pas : leur point de départ n'est pas un versement. Affiché
 * seulement avec RECUL_TRI_JOURS de recul ; estimation en deçà d'un an. Pur.
 */
export function rendementDeLaPoche(flux, lignes, dateBilan, valorisations = []) {
  const alimentees = new Set(flux.map((f) => f.actifId));
  // Le stock qu'une ligne alimentée avait quand l'outil l'a prise en charge
  // (sa valorisation « point de départ ») est un flux sortant à sa date :
  // sans lui, un versement sur le livret rendrait un TRI absurde.
  const stocks = valorisations
    .filter((v) => v.source === 'point de départ' && v.cible.actifId != null && alimentees.has(v.cible.actifId))
    .map((v) => ({ date: v.date, centimes: -v.valeurCentimes }));
  const sorties = [...flux.map((f) => ({ date: f.date, centimes: -f.centimes })), ...stocks];
  const recul = reculJours(sorties, dateBilan);
  const valeur = lignes.filter((l) => alimentees.has(l.actifId)).reduce((s, l) => s + l.valeurCentimes, 0);
  if (!flux.length || recul < RECUL_TRI_JOURS || valeur <= 0) return { pb: null, reculJours: recul, statut: null, valeurCentimes: valeur };
  const pb = tri([...sorties, { date: dateBilan, centimes: valeur }]);
  return { pb, reculJours: recul, statut: pb === null ? null : recul < RECUL_TRI_ESTIMATION_JOURS ? 'estimation' : 'fait', valeurCentimes: valeur };
}

/**
 * Tout ce que la page d'accueil affiche, calculé une fois.
 * @param {object} etat        lireEtat(base)
 * @param {object} objectif    lireObjectif(base), peut être null
 * @param {object} cible       lireCible(base)
 * @param {string} dateBilan   AAAA-MM-JJ
 */
export function etatDeLaPoche(etat, objectif, cible, dateBilan) {
  const flux = etat.flux ?? [];
  const lignes = lignesDeLaPoche(etat, dateBilan);
  const expo = exposition(lignes);
  const rendement = rendementDeLaPoche(flux, lignes, dateBilan, etat.valorisations);
  const e = ecarts(expo, cible);
  const versement = objectif?.epargneMensuelleCentimes ?? 0;
  const repartition = repartirVersement(versement, expo, cible);
  const dest = destinations(lignes, objectif?.matelasCentimes ?? 0);
  const immobilier = objectif?.immobilierNetCentimes ?? 0;
  const partFinancierePb = partPb(expo.totalCentimes, immobilier);
  const traj = objectif
    ? trajectoire({
      pocheCentimes: expo.totalCentimes,
      epargneMensuelleCentimes: versement,
      rendementPb: objectif.rendementEstimePb,
      immobilierCentimes: immobilier,
      annees: objectif.horizonAnnees,
    })
    : [];
  const charge = objectif
    ? chargeUtile({ ecarts: e, versementCentimes: versement, repartition, objectif, destinations: dest })
    : null;
  return {
    date: dateBilan,
    objectif,
    cible,
    lignes,
    exposition: expo,
    ecarts: e,
    versementCentimes: versement,
    repartition: repartition.parts.map((p) => ({ ...p, destination: dest[p.classe] })),
    regle: repartition.regle,
    classeRattrapee: repartition.classeRattrapee ?? null,
    destinations: dest,
    partFinancierePb,
    immobilierNetCentimes: immobilier,
    rendement,
    trajectoire: traj,
    charge,
    empreinte: charge ? empreinte(charge) : null,
  };
}
