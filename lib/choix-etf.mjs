// Choisir mon ETF (sous-lot 2b) — fonctions pures : le coût de chaque
// candidat pour l'usage réel, le classement, la charge utile fermée pour
// Claude et le texte de repli (seams S-L2-5, S-L2-7).
//
// Le coût d'un ETF pour une personne qui verse chaque mois, c'est deux
// choses : le courtage de chaque ordre, et les frais courants prélevés sur
// l'encours. On simule mois par mois, en centimes entiers, avec la même
// hypothèse de rendement que la trajectoire du lot 1.

import { fraction, multiplier, arrondir } from './fraction.mjs';
import { MENTION } from './explication.mjs';
import { euros, eurosRonds, pctEntier } from './format.mjs';

/** Les seules clés qui partent vers Claude (L2b-1). Un test le vérifie. */
export const CLES_CHARGE_UTILE_ETF = ['candidats', 'versementCentimes', 'horizonAnnees', 'rendementPb', 'minimumOrdreCentimes', 'recommande'];

/** Bornes des hypothèses saisies dans la page (mêmes bornes que le point de départ). */
export const BORNES_HYPOTHESES = {
  versementCentimes: { min: 1, max: 100_000_00, texte: '0,01 € et 100 000 €' },
  horizonAnnees: { min: 1, max: 60, texte: '1 et 60 ans' },
  rendementPb: { min: 0, max: 2000, texte: '0 et 20 %' },
};
/** Sans point de départ : des hypothèses neutres, pour que la page vive quand même. */
export const HYPOTHESES_NEUTRES = { versementCentimes: 500_00, horizonAnnees: 10, rendementPb: 500 };

/** Un douzième en points de base : 10000 pb × 12 mois. */
const DOUZIEME_PB = 120_000;
const part = (centimes, pb) => arrondir(multiplier(fraction(centimes), fraction(pb, DOUZIEME_PB)));

/** Courtage d'un ordre d'achat de `montantCentimes` sur ce candidat chez ce courtier, en centimes. */
export function fraisOrdre(courtier, candidat, montantCentimes) {
  if (courtier.faits.emetteursSansCourtageAchat.valeur.includes(candidat.emetteur)) return 0;
  const t = courtier.faits.fraisOrdre.valeur;
  const tarif = montantCentimes <= t.jusquaCentimes ? t.forfaitCentimes : arrondir(multiplier(fraction(montantCentimes), fraction(t.tauxAuDelaPb, 10000)));
  const plafond = arrondir(multiplier(fraction(montantCentimes), fraction(t.plafondPeaPb, 10000)));
  return Math.min(tarif, plafond);
}

/** Une part au moins par versement, et le versement passe le minimum d'ordre du courtier. */
export function achetableChaqueMois(courtier, candidat, versementCentimes) {
  return versementCentimes >= candidat.faits.prixPartCentimes.valeur && versementCentimes >= courtier.faits.minimumOrdreCentimes.valeur;
}

/**
 * Simulation mensuelle : le versement s'accumule en espèces jusqu'à pouvoir
 * passer un ordre (au moins une part, au moins le minimum du courtier) ; le
 * courtage est retenu sur l'ordre ; le capital investi croît d'un douzième
 * du rendement annuel, puis paie un douzième des frais courants. Fractions
 * exactes, un seul arrondi au centime par opération (S-L2-5). Une ligne par an.
 */
export function simuler({ courtier, candidat, versementCentimes, horizonAnnees, rendementPb }) {
  const prixPart = candidat.faits.prixPartCentimes.valeur;
  const minimum = courtier.faits.minimumOrdreCentimes.valeur;
  const fraisPb = candidat.faits.fraisCourantsPb.valeur;
  let capital = 0;
  let especes = 0;
  const annees = [];
  for (let a = 1; a <= horizonAnnees; a++) {
    let ordres = 0;
    let gestion = 0;
    let nombreOrdres = 0;
    for (let m = 0; m < 12; m++) {
      especes += versementCentimes;
      if (especes >= prixPart && especes >= minimum) {
        const frais = fraisOrdre(courtier, candidat, especes);
        ordres += frais;
        nombreOrdres++;
        capital += especes - frais;
        especes = 0;
      }
      capital += part(capital, rendementPb);
      const g = part(capital, fraisPb);
      gestion += g;
      capital -= g;
    }
    annees.push({ annee: a, ordresCentimes: ordres, gestionCentimes: gestion, totalCentimes: ordres + gestion, nombreOrdres, capitalCentimes: capital });
  }
  return annees;
}

/** Le coût d'un candidat : première année et cumul sur l'horizon. */
export function coutCandidat(hypotheses, candidat) {
  const annees = simuler({ ...hypotheses, candidat });
  const somme = (cle) => annees.reduce((s, a) => s + a[cle], 0);
  return {
    premiereAnnee: annees[0],
    horizon: { ordresCentimes: somme('ordresCentimes'), gestionCentimes: somme('gestionCentimes'), totalCentimes: somme('totalCentimes'), capitalCentimes: annees.at(-1).capitalCentimes },
    achetableChaqueMois: achetableChaqueMois(hypotheses.courtier, candidat, hypotheses.versementCentimes),
    sansCourtageAchat: fraisOrdre(hypotheses.courtier, candidat, hypotheses.versementCentimes) === 0,
  };
}

/**
 * Classe les candidats : les achetables chaque mois d'abord, par coût cumulé
 * croissant, puis par encours décroissant ; les autres ensuite. Le premier
 * achetable est le recommandé — un seul ETF monde suffit.
 */
export function classer(references, hypotheses) {
  const h = { ...hypotheses, courtier: references.courtier };
  const lignes = references.candidats.map((c) => ({ candidat: c, cout: coutCandidat(h, c) }));
  lignes.sort((x, y) => {
    if (x.cout.achetableChaqueMois !== y.cout.achetableChaqueMois) return x.cout.achetableChaqueMois ? -1 : 1;
    if (x.cout.horizon.totalCentimes !== y.cout.horizon.totalCentimes) return x.cout.horizon.totalCentimes - y.cout.horizon.totalCentimes;
    return y.candidat.faits.encoursMillionsEuros.valeur - x.candidat.faits.encoursMillionsEuros.valeur;
  });
  const recommande = lignes.find((l) => l.cout.achetableChaqueMois)?.candidat.symbole ?? null;
  return { lignes, recommande };
}

/** La charge utile fermée : les faits chiffrés des candidats et les hypothèses. Rien d'autre. */
export function chargeUtileEtf(references, classement, hypotheses) {
  return {
    candidats: classement.lignes.map(({ candidat: c, cout }) => ({
      symbole: c.symbole,
      nom: c.nom,
      emetteur: c.emetteur,
      fraisCourantsPb: c.faits.fraisCourantsPb.valeur,
      prixPartCentimes: c.faits.prixPartCentimes.valeur,
      encoursMillionsEuros: c.faits.encoursMillionsEuros.valeur,
      capitalisant: c.faits.capitalisant.valeur,
      sansCourtageAchat: cout.sansCourtageAchat,
      achetableChaqueMois: cout.achetableChaqueMois,
      coutPremiereAnneeCentimes: cout.premiereAnnee.totalCentimes,
      coutHorizonCentimes: cout.horizon.totalCentimes,
    })),
    versementCentimes: hypotheses.versementCentimes,
    horizonAnnees: hypotheses.horizonAnnees,
    rendementPb: hypotheses.rendementPb,
    minimumOrdreCentimes: references.courtier.faits.minimumOrdreCentimes.valeur,
    recommande: classement.recommande,
  };
}

/** La raison, vraie, pour laquelle un candidat n'est pas achetable chaque mois. */
const pourquoiPasChaqueMois = (x, c) => (x.prixPartCentimes > c.versementCentimes
  ? `${x.symbole} n'est pas achetable chaque mois : une part vaut ${euros(x.prixPartCentimes)}.`
  : `${x.symbole} n'est pas achetable chaque mois : le versement est sous le minimum d'ordre du courtier (${euros(c.minimumOrdreCentimes)}).`);

/** Le texte de repli : les mêmes chiffres, dits simplement, sans réseau. */
export function texteDeRepliEtf(c) {
  const phrases = [];
  const reco = c.candidats.find((x) => x.symbole === c.recommande);
  phrases.push(`Pour ${eurosRonds(c.versementCentimes)} par mois pendant ${c.horizonAnnees} ans, à ${pctEntier(c.rendementPb)} par an d'hypothèse.`);
  if (reco) {
    phrases.push(`Le moins coûteux parmi les ETF monde achetables chaque mois est ${reco.nom} (${reco.symbole}) : ${euros(reco.coutPremiereAnneeCentimes)} la première année, ${eurosRonds(reco.coutHorizonCentimes)} sur l'horizon, avec ${(reco.fraisCourantsPb / 100).toLocaleString('fr-FR')} % de frais courants${reco.sansCourtageAchat ? ' et aucun courtage à l\'achat' : ''}.`);
  } else {
    phrases.push(c.candidats.length && c.versementCentimes < c.minimumOrdreCentimes
      ? `Aucun candidat n'est achetable chaque mois : le versement est sous le minimum d'ordre du courtier (${euros(c.minimumOrdreCentimes)}).`
      : 'Aucun candidat n\'est achetable chaque mois avec ce versement.');
  }
  for (const x of c.candidats) {
    if (x.symbole === c.recommande) continue;
    if (!x.achetableChaqueMois) phrases.push(pourquoiPasChaqueMois(x, c));
    else phrases.push(`${x.symbole} coûterait ${eurosRonds(x.coutHorizonCentimes)} sur l'horizon${x.capitalisant ? '' : ' et distribue ses dividendes, à replacer soi-même'}.`);
  }
  phrases.push('Un seul ETF monde suffit ; on ne vend rien, c\'est le prochain versement qui va sur la ligne choisie.');
  phrases.push(MENTION);
  return phrases.join(' ');
}

/** Consigne et message pour Claude : il met en mots le classement, il ne le refait pas. */
export function messagesPourClaudeEtf(c) {
  const consigne = [
    'Tu rédiges, en français, l\'explication courte d\'un classement d\'ETF déjà calculé par des règles.',
    'Tu ne décides rien, tu n\'ajoutes aucun chiffre, aucun produit, aucun conseil fiscal : tu mets en mots les données fournies, et tu ne contredis jamais le candidat recommandé.',
    'Les pourcentages s\'écrivent avec au plus deux décimales pour les frais courants (« 0,20 % »), en nombres entiers ailleurs, et les montants en euros ronds.',
    'Ton : celui d\'un conseiller pédagogue qui parle à une seule personne, au tutoiement, sans jargon, sans emphase.',
    'Forme : un seul paragraphe de 70 à 120 mots, sans titre, sans liste, sans formule d\'introduction.',
    `Termine par la phrase exacte : « ${MENTION} »`,
  ].join(' ');
  const demande = `Données (centimes et points de base, 10000 = 100 %) : ${JSON.stringify(c)}. `
    + 'Explique pourquoi le candidat recommandé l\'est pour ce versement mensuel et cet horizon, ce qui distingue les autres (coût, prix de part, dividendes), et rappelle qu\'un seul ETF monde suffit et qu\'on ne vend jamais une ligne existante : c\'est le prochain versement qui va sur la ligne choisie.';
  return { system: consigne, user: demande };
}
