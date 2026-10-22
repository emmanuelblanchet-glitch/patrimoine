// Moteur de bilan — fonction pure : état + date → bilan net à la quote-part.
//
// Règles (cadrage du lot 0, ADR-0003) :
// - tout est stocké à 100 %, la quote-part de l'enveloppe s'applique au
//   calcul, TOUJOURS à la valeur et à la dette ensemble (seam S2) ;
// - arithmétique exacte en fractions, un seul arrondi au centime ;
// - un actif sans valorisation est signalé « non valorisé » et exclu de la
//   valeur, jamais compté à zéro en silence ;
// - une dette, elle, n'est jamais masquée : si son bien n'est pas valorisé,
//   elle reste comptée et le bilan est marqué incomplet ;
// - le statut d'un agrégat est « estimation » dès qu'un composant l'est.

import { fraction, ZERO, ajouter, soustraire, multiplier, arrondir } from './fraction.mjs';

export const AGE_ALERTE_JOURS = 365;
const JOUR_MS = 24 * 60 * 60 * 1000;

const montant = (exact) => ({ exact, centimes: arrondir(exact) });

function ageJours(dateValeur, dateBilan) {
  return Math.round((Date.parse(`${dateBilan}T00:00:00Z`) - Date.parse(`${dateValeur}T00:00:00Z`)) / JOUR_MS);
}

/** La dernière valorisation d'une cible à la date du bilan (à date égale, la plus récemment saisie). */
function indexerValorisations(valorisations, dateBilan) {
  const derniere = new Map();
  for (const v of valorisations) {
    if (v.date > dateBilan) continue;
    const cle = v.cible.actifId != null ? `a${v.cible.actifId}` : `p${v.cible.passifId}`;
    const actuelle = derniere.get(cle);
    if (!actuelle || v.date > actuelle.date || (v.date === actuelle.date && v.id > actuelle.id)) {
      derniere.set(cle, v);
    }
  }
  return derniere;
}

function actifPresent(actif, dateBilan) {
  if (actif.dateAcquisition && actif.dateAcquisition > dateBilan) return false;
  if (actif.dateCloture && actif.dateCloture <= dateBilan) return false;
  return true;
}

function decrireValeur(v, quotePart, dateBilan) {
  const exact = multiplier(fraction(v.valeurCentimes), quotePart);
  return {
    ...montant(exact),
    centimesA100: v.valeurCentimes,
    date: v.date,
    source: v.source,
    statut: v.statut,
    ageJours: ageJours(v.date, dateBilan),
  };
}

const pire = (a, b) => (a === 'estimation' || b === 'estimation' ? 'estimation' : 'fait');

/**
 * @param {{ enveloppes, actifs, passifs, valorisations }} etat  tel que rendu par lireEtat()
 * @param {string} dateBilan  AAAA-MM-JJ
 */
export function calculerBilan({ enveloppes, actifs, passifs, valorisations }, dateBilan) {
  const derniere = indexerValorisations(valorisations, dateBilan);
  const avertissements = [];
  let valeurGlobale = ZERO;
  let detteGlobale = ZERO;
  let statutGlobal = 'fait';
  let completGlobal = true;

  const lignesEnveloppes = enveloppes.map((env) => {
    const qp = fraction(env.quotePart.num, env.quotePart.den);
    let valeurEnv = ZERO;
    let detteEnv = ZERO;
    let statutEnv = 'fait';
    let completEnv = true;

    const biens = actifs
      .filter((a) => a.enveloppeId === env.id && actifPresent(a, dateBilan))
      .map((actif) => {
        const v = derniere.get(`a${actif.id}`);
        const valeur = v ? decrireValeur(v, qp, dateBilan) : null;
        let statut = v ? v.statut : 'fait';
        let complet = Boolean(v);

        if (!v) {
          avertissements.push({ code: 'actif_non_valorise', actifId: actif.id, libelle: actif.libelle });
        } else if (valeur.ageJours > AGE_ALERTE_JOURS) {
          avertissements.push({ code: 'valorisation_ancienne', actifId: actif.id, libelle: actif.libelle, ageJours: valeur.ageJours });
        }

        let detteBien = ZERO;
        const dettes = passifs
          .filter((p) => p.actifId === actif.id)
          .map((passif) => {
            const crd = derniere.get(`p${passif.id}`);
            if (!crd) {
              complet = false;
              avertissements.push({ code: 'passif_non_valorise', passifId: passif.id, libelle: passif.libelle });
              return { passifId: passif.id, libelle: passif.libelle, crd: null };
            }
            const d = decrireValeur(crd, qp, dateBilan);
            if (d.ageJours > AGE_ALERTE_JOURS) {
              avertissements.push({ code: 'valorisation_ancienne', passifId: passif.id, libelle: passif.libelle, ageJours: d.ageJours });
            }
            detteBien = ajouter(detteBien, d.exact);
            statut = pire(statut, crd.statut);
            return { passifId: passif.id, libelle: passif.libelle, crd: d };
          });

        valeurEnv = valeur ? ajouter(valeurEnv, valeur.exact) : valeurEnv;
        detteEnv = ajouter(detteEnv, detteBien);
        statutEnv = pire(statutEnv, statut);
        completEnv = completEnv && complet;

        return {
          actifId: actif.id,
          libelle: actif.libelle,
          nature: actif.nature,
          valeur,
          dettes,
          dette: montant(detteBien),
          net: valeur ? montant(soustraire(valeur.exact, detteBien)) : null,
          statut,
          complet,
        };
      });

    valeurGlobale = ajouter(valeurGlobale, valeurEnv);
    detteGlobale = ajouter(detteGlobale, detteEnv);
    statutGlobal = pire(statutGlobal, statutEnv);
    completGlobal = completGlobal && completEnv;

    return {
      enveloppeId: env.id,
      libelle: env.libelle,
      type: env.type,
      quotePart: env.quotePart,
      biens,
      valeur: montant(valeurEnv),
      dette: montant(detteEnv),
      net: montant(soustraire(valeurEnv, detteEnv)),
      statut: statutEnv,
      complet: completEnv,
    };
  });

  return {
    date: dateBilan,
    enveloppes: lignesEnveloppes,
    global: {
      valeur: montant(valeurGlobale),
      dette: montant(detteGlobale),
      net: montant(soustraire(valeurGlobale, detteGlobale)),
      statut: statutGlobal,
      complet: completGlobal,
    },
    avertissements,
  };
}
