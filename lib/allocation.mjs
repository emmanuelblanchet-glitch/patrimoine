// Moteur d'allocation — fonctions pures (seam S-L1-1).
//
// Décisions du lot 1 : cible par classe en points de base (L1-1 : 6000 /
// 4000), bandes de tolérance « 5/25 » (on sort de la bande au-delà de
// 5 points absolus OU de 25 % de la cible en relatif, le plus petit des
// deux), répartition du versement du mois en option A (L1-5) : tout à la
// classe la plus éloignée sous sa cible ; si toutes les classes sont dans
// leur bande, au prorata des cibles. Jamais de vente, jamais de montant
// négatif, somme des parts = versement au centime.

export const CLASSES = ['actions_monde', 'sans_risque'];
export const CLASSES_LIGNE = [...CLASSES, 'mixte'];
export const LIBELLES_CLASSE = { actions_monde: 'Actions monde', sans_risque: 'Sans risque' };
export const CIBLE_PAR_DEFAUT = { actions_monde: 6000, sans_risque: 4000 };
export const PART_ACTIONS_PAR_DEFAUT_PB = 5000;
const BANDE_ABSOLUE_PB = 500;
const BANDE_RELATIVE_PB = 2500;

/** Part actions d'une ligne selon sa classe, en points de base. */
export function partActionsPb(ligne) {
  if (ligne.classe === 'actions_monde') return 10000;
  if (ligne.classe === 'sans_risque') return 0;
  if (ligne.classe === 'mixte') return ligne.partActionsPb ?? PART_ACTIONS_PAR_DEFAUT_PB;
  return 0;
}

/**
 * Exposition de la poche par classe, à partir des lignes valorisées.
 * @param {{ classe: string, partActionsPb?: number, valeurCentimes: number }[]} lignes
 */
export function exposition(lignes) {
  let actions = 0;
  let sansRisque = 0;
  for (const l of lignes) {
    if (!Number.isSafeInteger(l.valeurCentimes) || l.valeurCentimes <= 0) continue;
    const part = partActionsPb(l);
    const a = Math.round((l.valeurCentimes * part) / 10000);
    actions += a;
    sansRisque += l.valeurCentimes - a;
  }
  const total = actions + sansRisque;
  const poidsPb = (c) => (total === 0 ? 0 : Math.round((c * 10000) / total));
  return {
    totalCentimes: total,
    parClasse: {
      actions_monde: { centimes: actions, poidsPb: poidsPb(actions) },
      sans_risque: { centimes: sansRisque, poidsPb: poidsPb(sansRisque) },
    },
  };
}

/** Largeur de bande d'une classe : min(5 points, 25 % de sa cible). */
export function bandePb(ciblePb) {
  return Math.min(BANDE_ABSOLUE_PB, Math.round((ciblePb * BANDE_RELATIVE_PB) / 10000));
}

/** Écart de chaque classe à sa cible, et si elle est dans sa bande. */
export function ecarts(expo, cible = CIBLE_PAR_DEFAUT) {
  return CLASSES.map((classe) => {
    const ciblePb = cible[classe] ?? 0;
    const actuelPb = expo.parClasse[classe].poidsPb;
    const ecartPb = ciblePb - actuelPb; // positif = sous la cible
    const bande = bandePb(ciblePb);
    return { classe, ciblePb, actuelPb, ecartPb, bandePb: bande, dansLaBande: Math.abs(ecartPb) <= bande };
  });
}

/**
 * Répartition d'un versement entre classes (option A).
 * @returns {{ parts: { classe: string, centimes: number }[], regle: 'rattrapage' | 'prorata', classeRattrapee?: string }}
 */
export function repartirVersement(versementCentimes, expo, cible = CIBLE_PAR_DEFAUT) {
  if (!Number.isSafeInteger(versementCentimes) || versementCentimes < 0) {
    throw new RangeError(`versement invalide : ${versementCentimes}`);
  }
  const e = ecarts(expo, cible);
  const sousCible = e.filter((x) => x.ecartPb > x.bandePb).sort((a, b) => b.ecartPb - a.ecartPb);

  if (sousCible.length > 0 && expo.totalCentimes > 0) {
    const classe = sousCible[0].classe;
    return {
      regle: 'rattrapage',
      classeRattrapee: classe,
      parts: CLASSES.map((c) => ({ classe: c, centimes: c === classe ? versementCentimes : 0 })),
    };
  }

  // Prorata des cibles ; le dernier reçoit le reste pour que la somme soit exacte.
  const parts = [];
  let distribue = 0;
  CLASSES.forEach((c, i) => {
    const centimes = i === CLASSES.length - 1
      ? versementCentimes - distribue
      : Math.round((versementCentimes * (cible[c] ?? 0)) / 10000);
    distribue += centimes;
    parts.push({ classe: c, centimes });
  });
  return { regle: 'prorata', parts };
}

/**
 * Trajectoire estimée de la poche : épargne mensuelle constante, rendement
 * annuel constant, immobilier constant. Une estimation, jamais un fait.
 * @returns {{ annee: number, pocheCentimes: number, partFinancierePb: number }[]}
 */
export function trajectoire({ pocheCentimes, epargneMensuelleCentimes, rendementPb, immobilierCentimes, annees }) {
  const r = rendementPb / 10000 / 12;
  let v = pocheCentimes;
  const points = [{ annee: 0, pocheCentimes: Math.round(v), partFinancierePb: partPb(v, immobilierCentimes) }];
  for (let a = 1; a <= annees; a++) {
    for (let m = 0; m < 12; m++) v = v * (1 + r) + epargneMensuelleCentimes;
    points.push({ annee: a, pocheCentimes: Math.round(v), partFinancierePb: partPb(v, immobilierCentimes) });
  }
  return points;
}

export function partPb(poche, immobilier) {
  const total = poche + immobilier;
  return total <= 0 ? 0 : Math.round((poche * 10000) / total);
}

/**
 * Perte maximale théorique de la cible, en points de base, si les actions
 * perdent `chuteActionsPb` (défaut : la moitié) et le sans risque rien.
 */
export function perteTheoriquePb(cible = CIBLE_PAR_DEFAUT, chuteActionsPb = 5000) {
  return Math.round(((cible.actions_monde ?? 0) * chuteActionsPb) / 10000);
}
