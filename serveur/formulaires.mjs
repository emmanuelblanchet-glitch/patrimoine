// Formulaires → données du référentiel. Fonctions pures : elles lisent les
// champs tapés et rendent { donnees, motifs }. Le référentiel valide ensuite
// les règles du domaine ; ici, on ne fait que lire.

import { lireMontantFacultatif, lireQuotePart, lireTauxPb, lireDate, lireEntier, lireTexte } from '../lib/saisie.mjs';
import { PART_ACTIONS_PAR_DEFAUT_PB } from '../lib/allocation.mjs';

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

/** Les six questions du point de départ (+ deux cases : PEA et assurance-vie déjà ouverts). */
export function lireFormulaireDepart(champs) {
  const { motifs, lire, texte } = lecteur(champs);
  // lireTauxPb rend déjà des points de base : « 30 » → 3000.
  const donnees = {
    reserveCentimes: lire(lireMontantFacultatif, 'reserve', 'De côté'),
    matelasCentimes: lire(lireMontantFacultatif, 'matelas', 'Matelas de précaution'),
    epargneMensuelleCentimes: lire(lireMontantFacultatif, 'epargne_mensuelle', 'Par mois'),
    peeCentimes: lire(lireMontantFacultatif, 'pee', 'PEE') ?? 0,
    peePartActionsPb: lire(lireTauxPb, 'pee_part_actions', 'Part actions du PEE') ?? PART_ACTIONS_PAR_DEFAUT_PB,
    horizonAnnees: lire(lireEntier, 'horizon', 'Horizon'),
    perteMaxPb: lire(lireTauxPb, 'perte_max', 'Perte maximale'),
    rendementEstimePb: lire(lireTauxPb, 'rendement', 'Rendement estimé') ?? 500,
    immobilierNetCentimes: lire(lireMontantFacultatif, 'immobilier', 'Immobilier net'),
    immobilierDate: lire(lireDate, 'immobilier_date', 'Date de l\'estimation'),
    immobilierSource: texte('immobilier_source'),
    aPea: champs.a_pea === 'oui',
    peaDate: lire(lireDate, 'pea_date', 'Date d\'ouverture du PEA'),
    aAv: champs.a_av === 'oui',
  };
  return { donnees, motifs };
}

/** « J'ai versé X sur telle ligne, le … » (+ nouvelle valeur de la ligne, facultative). */
export function lireFormulaireVersement(champs) {
  const { motifs, lire, texte } = lecteur(champs);
  const donnees = {
    actifId: id(champs.actif_id),
    date: lire(lireDate, 'date', 'Date'),
    montantCentimes: lire(lireMontantFacultatif, 'montant', 'Montant'),
    nouvelleValeurCentimes: lire(lireMontantFacultatif, 'nouvelle_valeur', 'Nouvelle valeur de la ligne'),
    source: texte('source'),
    type: champs.type === 'abondement' ? 'abondement' : 'versement',
  };
  return { donnees, motifs };
}

/** « J'ai acheté N parts à P € le … » : parts en millionièmes, prix et frais en centimes. */
export function lireFormulaireAchat(champs) {
  const { motifs, lire, texte } = lecteur(champs);
  const partsTexte = String(champs.parts ?? '').replace(',', '.').trim();
  let partsMillioniemes = null;
  if (partsTexte === '') motifs.push('Parts : nombre obligatoire');
  else if (!/^\d+(\.\d{1,6})?$/.test(partsTexte)) motifs.push(`Parts : nombre illisible : « ${champs.parts} » (exemple : 12 ou 12,5)`);
  else partsMillioniemes = Math.round(Number(partsTexte) * 1_000_000);
  const donnees = {
    actifId: id(champs.actif_id),
    date: lire(lireDate, 'date', 'Date'),
    partsMillioniemes,
    prixCentimes: lire(lireMontantFacultatif, 'prix', 'Prix par part'),
    fraisCentimes: lire(lireMontantFacultatif, 'frais', 'Frais'),
    note: texte('note'),
  };
  return { donnees, motifs };
}

/** Ajouter une ligne cotée trouvée par la recherche : symbole, nom, enveloppe, classe. */
export function lireFormulaireAjoutLigne(champs) {
  const { motifs, texte } = lecteur(champs);
  return {
    donnees: { symbole: texte('symbole'), nom: texte('nom'), nature: champs.nature === 'action' ? 'action' : 'etf', enveloppeId: id(champs.enveloppe_id), classe: texte('classe') ?? 'actions_monde' },
    motifs,
  };
}

/** Classer une ligne existante : classe et, pour « mixte », part actions. */
export function lireFormulaireClasse(champs) {
  const { motifs, lire, texte } = lecteur(champs);
  return {
    donnees: { actifId: id(champs.actif_id), classe: texte('classe'), partActionsPb: lire(lireTauxPb, 'part_actions', 'Part actions') },
    motifs,
  };
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
