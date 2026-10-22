// Formulaires → données du référentiel. Fonctions pures : elles lisent les
// champs tapés et rendent { donnees, motifs }. Le référentiel valide ensuite
// les règles du domaine ; ici, on ne fait que lire.

import { lireMontantFacultatif, lireQuotePart, lireTauxPb, lireDate, lireEntier, lireTexte } from '../lib/saisie.mjs';

function lecteur(champs) {
  const motifs = [];
  const lire = (fn, nom, libelle) => {
    const r = fn(champs[nom] ?? '');
    if (!r.ok) {
      motifs.push(`${libelle} : ${r.motif}`);
      return null;
    }
    return r.valeur;
  };
  return { motifs, lire, texte: (nom) => lireTexte(champs[nom]) };
}

const id = (texte) => (/^\d+$/.test(texte ?? '') ? Number(texte) : null);

export function lireFormulaireEnveloppe(champs) {
  const { motifs, lire, texte } = lecteur(champs);
  const donnees = {
    type: texte('type'),
    libelle: texte('libelle'),
    etablissement: texte('etablissement'),
    dateOuverture: lire(lireDate, 'date_ouverture', 'Date d\'ouverture'),
    quotePart: lire(lireQuotePart, 'quote_part', 'Quote-part'),
    regimeFiscal: texte('regime_fiscal'),
  };
  return { donnees, motifs };
}

export function lireFormulaireActif(champs) {
  const { motifs, lire, texte } = lecteur(champs);
  const donnees = {
    enveloppeId: id(champs.enveloppe_id),
    nature: texte('nature'),
    libelle: texte('libelle'),
    identifiant: texte('identifiant'),
    classe: texte('classe'),
    dateAcquisition: lire(lireDate, 'date_acquisition', 'Date d\'acquisition'),
    dateCloture: lire(lireDate, 'date_cloture', 'Date de cession'),
    prixAcquisitionCentimes: lire(lireMontantFacultatif, 'prix_acquisition', 'Prix d\'acquisition'),
    fraisAcquisitionCentimes: lire(lireMontantFacultatif, 'frais_acquisition', 'Frais d\'acquisition'),
  };
  return { donnees, motifs };
}

export function lireFormulairePassif(champs) {
  const { motifs, lire, texte } = lecteur(champs);
  const donnees = {
    actifId: id(champs.actif_id),
    libelle: texte('libelle'),
    etablissement: texte('etablissement'),
    capitalInitialCentimes: lire(lireMontantFacultatif, 'capital_initial', 'Capital initial'),
    tauxPb: lire(lireTauxPb, 'taux', 'Taux'),
    dureeMois: lire(lireEntier, 'duree_mois', 'Durée'),
    mensualiteCentimes: lire(lireMontantFacultatif, 'mensualite', 'Mensualité'),
    assuranceMensuelleCentimes: lire(lireMontantFacultatif, 'assurance', 'Assurance'),
    datePremiereEcheance: lire(lireDate, 'date_premiere_echeance', 'Première échéance'),
    type: texte('type') ?? 'amortissable',
  };
  return { donnees, motifs };
}

/**
 * La cible arrive sous la forme « actif:12 » ou « passif:3 ». Un champ vide
 * n'est pas signalé ici : le domaine le refuse déjà (« date obligatoire »,
 * « valeur obligatoire »), et le dire deux fois n'aiderait personne.
 */
export function lireFormulaireValorisation(champs) {
  const { motifs, lire, texte } = lecteur(champs);
  const m = /^(actif|passif):(\d+)$/.exec(champs.cible ?? '');
  const cible = m ? (m[1] === 'actif' ? { actifId: Number(m[2]) } : { passifId: Number(m[2]) }) : {};
  const donnees = {
    cible,
    date: lire(lireDate, 'date', 'Date'),
    valeurCentimes: lire(lireMontantFacultatif, 'valeur', 'Valeur'),
    source: texte('source'),
    statut: texte('statut'),
    note: texte('note'),
  };
  return { donnees, motifs };
}
