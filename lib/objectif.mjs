// Le point de départ : les six questions, leur validation et leur
// enregistrement (seam S-L1-2). Les montants arrivent déjà en centimes.

import { CIBLE_PAR_DEFAUT, CLASSES, CLASSES_LIGNE, PART_ACTIONS_PAR_DEFAUT_PB, perteTheoriquePb } from './allocation.mjs';
import { ErreurSaisie, daterEnveloppe } from './referentiel.mjs';
import { lireDate } from './saisie.mjs';

const entierPositif = (v) => Number.isSafeInteger(v) && v >= 0;

/** Pure : rend les motifs de refus, et les avertissements (non bloquants). */
export function validerObjectif(o, cible = CIBLE_PAR_DEFAUT) {
  const motifs = [];
  const avertissements = [];
  if (!entierPositif(o.reserveCentimes)) motifs.push('de côté : montant obligatoire, en euros');
  if (!entierPositif(o.matelasCentimes)) motifs.push('matelas de précaution : montant obligatoire, en euros');
  if (entierPositif(o.reserveCentimes) && entierPositif(o.matelasCentimes) && o.matelasCentimes > o.reserveCentimes) {
    avertissements.push('ton matelas de précaution dépasse ce que tu as de côté : les premiers versements iront le reconstituer');
  }
  if (!entierPositif(o.epargneMensuelleCentimes)) motifs.push('par mois : montant obligatoire, en euros (0 si rien pour l\'instant)');
  if (!Number.isSafeInteger(o.horizonAnnees) || o.horizonAnnees < 1 || o.horizonAnnees > 60) motifs.push('horizon : entre 1 et 60 ans');
  if (!Number.isSafeInteger(o.perteMaxPb) || o.perteMaxPb < 0 || o.perteMaxPb > 10000) motifs.push('perte maximale : entre 0 et 100 %');
  else if (o.perteMaxPb < perteTheoriquePb(cible)) {
    avertissements.push(`avec ${cible.actions_monde / 100} % d'actions, une chute de moitié des marchés ferait perdre ${perteTheoriquePb(cible) / 100} % : plus que ce que tu dis accepter`);
  }
  if (!entierPositif(o.immobilierNetCentimes)) motifs.push('immobilier net : montant obligatoire, en euros (0 si aucun)');
  const d = lireDate(o.immobilierDate ?? '');
  if (!d.ok || d.valeur === null) motifs.push('immobilier : date de l\'estimation obligatoire');
  if (typeof o.immobilierSource !== 'string' || o.immobilierSource.trim() === '') motifs.push('immobilier : d\'où vient cette estimation ?');
  if (o.rendementEstimePb !== undefined && (!Number.isSafeInteger(o.rendementEstimePb) || o.rendementEstimePb < -2000 || o.rendementEstimePb > 2000)) {
    motifs.push('rendement estimé : entre −20 % et +20 % par an');
  }
  return { motifs, avertissements };
}

export function enregistrerObjectif(base, o, { maintenant = () => new Date().toISOString() } = {}) {
  const { motifs, avertissements } = validerObjectif(o);
  if (motifs.length) throw new ErreurSaisie(motifs);
  base.prepare(`INSERT INTO objectif (id, reserve_centimes, matelas_centimes, epargne_mensuelle_centimes, horizon_annees, perte_max_pb,
                                      immobilier_net_centimes, immobilier_date, immobilier_source, rendement_estime_pb, mis_a_jour_le)
                VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                  reserve_centimes = excluded.reserve_centimes, matelas_centimes = excluded.matelas_centimes,
                  epargne_mensuelle_centimes = excluded.epargne_mensuelle_centimes, horizon_annees = excluded.horizon_annees,
                  perte_max_pb = excluded.perte_max_pb, immobilier_net_centimes = excluded.immobilier_net_centimes,
                  immobilier_date = excluded.immobilier_date, immobilier_source = excluded.immobilier_source,
                  rendement_estime_pb = excluded.rendement_estime_pb, mis_a_jour_le = excluded.mis_a_jour_le`)
    .run(o.reserveCentimes, o.matelasCentimes, o.epargneMensuelleCentimes, o.horizonAnnees, o.perteMaxPb,
      o.immobilierNetCentimes, o.immobilierDate, o.immobilierSource.trim(), o.rendementEstimePb ?? 500, maintenant());
  if (base.prepare('SELECT COUNT(*) AS n FROM allocation_cible').get().n === 0) {
    for (const classe of CLASSES) {
      base.prepare('INSERT INTO allocation_cible (classe, poids_pb) VALUES (?, ?)').run(classe, CIBLE_PAR_DEFAUT[classe]);
    }
  }
  return avertissements;
}

export function lireObjectif(base) {
  const r = base.prepare('SELECT * FROM objectif WHERE id = 1').get();
  if (!r) return null;
  return {
    reserveCentimes: r.reserve_centimes,
    matelasCentimes: r.matelas_centimes,
    epargneMensuelleCentimes: r.epargne_mensuelle_centimes,
    horizonAnnees: r.horizon_annees,
    perteMaxPb: r.perte_max_pb,
    immobilierNetCentimes: r.immobilier_net_centimes,
    immobilierDate: r.immobilier_date,
    immobilierSource: r.immobilier_source,
    rendementEstimePb: r.rendement_estime_pb,
    misAJourLe: r.mis_a_jour_le,
  };
}

export function lireCible(base) {
  const lignes = base.prepare('SELECT classe, poids_pb FROM allocation_cible').all();
  if (lignes.length === 0) return { ...CIBLE_PAR_DEFAUT };
  return Object.fromEntries(lignes.map((l) => [l.classe, l.poids_pb]));
}

/**
 * Amorce les lignes de la poche depuis le point de départ, sans rien créer
 * en double : le livret de réserve (valorisé à la réserve), le PEE s'il y en
 * a un (ligne globale, mixte), un PEA et une assurance-vie si tu les as déjà
 * (lignes vides, à valoriser ensuite). Les valeurs portent la source
 * « point de départ ».
 */
export function amorcerLignes(base, { reserveCentimes, peeCentimes = 0, peePartActionsPb = PART_ACTIONS_PAR_DEFAUT_PB, aPea = false, peaDate = null, aAv = false }, date) {
  const types = new Set(base.prepare('SELECT type FROM enveloppe').all().map((r) => r.type));
  const crees = [];
  const insererEnveloppe = (type, libelle, dateOuverture = null) =>
    Number(base.prepare('INSERT INTO enveloppe (type, libelle, date_ouverture, quote_part_num, quote_part_den) VALUES (?, ?, ?, 1, 1)').run(type, libelle, dateOuverture).lastInsertRowid);
  const insererActif = (enveloppeId, nature, libelle, classe, part = null) =>
    Number(base.prepare('INSERT INTO actif (enveloppe_id, nature, libelle, classe_poche, part_actions_pb) VALUES (?, ?, ?, ?, ?)').run(enveloppeId, nature, libelle, classe, part).lastInsertRowid);
  const valoriser = (actifId, valeur) =>
    base.prepare("INSERT INTO valorisation (actif_id, date, valeur_centimes, source, statut) VALUES (?, ?, ?, 'point de départ', 'fait')").run(actifId, date, valeur);

  if (!types.has('livret') && !types.has('compte_courant')) {
    const id = insererActif(insererEnveloppe('livret', 'Livret (réserve)'), 'liquidites', 'Réserve', 'sans_risque');
    valoriser(id, reserveCentimes);
    crees.push('livret');
  }
  if (peeCentimes > 0 && !types.has('pee')) {
    const id = insererActif(insererEnveloppe('pee', 'PEE'), 'fcpe', 'PEE (ligne globale)', 'mixte', peePartActionsPb);
    valoriser(id, peeCentimes);
    crees.push('pee');
  }
  if (aPea && !types.has('pea')) {
    insererActif(insererEnveloppe('pea', 'PEA', peaDate), 'etf', 'ETF actions monde', 'actions_monde');
    crees.push('pea');
  } else if (aPea && peaDate) {
    // Un PEA d'avant l'outil, encore sans date : on la pose maintenant.
    const pea = base.prepare("SELECT id FROM enveloppe WHERE type = 'pea' AND date_ouverture IS NULL LIMIT 1").get();
    if (pea) daterEnveloppe(base, pea.id, peaDate);
  }
  if (aAv && !types.has('av')) {
    insererActif(insererEnveloppe('av', 'Assurance-vie'), 'liquidites', 'Fonds euros', 'sans_risque');
    crees.push('av');
  }
  return crees;
}

/** Pure : les motifs de refus d'un classement. */
export function validerClasse({ actifId, classe, partActionsPb = null }) {
  const motifs = [];
  if (!Number.isSafeInteger(actifId)) motifs.push('choisir une ligne');
  if (!CLASSES_LIGNE.includes(classe)) motifs.push(`classe inconnue : « ${classe ?? '' } »`);
  if (classe === 'mixte' && !(Number.isSafeInteger(partActionsPb) && partActionsPb >= 0 && partActionsPb <= 10000)) {
    motifs.push('part actions : entre 0 et 100 %');
  }
  return motifs;
}

/** Donne (ou change) la classe d'une ligne de la poche. */
export function classerLigne(base, actifId, classe, partActionsPb = null) {
  const motifs = validerClasse({ actifId, classe, partActionsPb });
  if (motifs.length) throw new ErreurSaisie(motifs);
  const r = base.prepare('UPDATE actif SET classe_poche = ?, part_actions_pb = ? WHERE id = ?')
    .run(classe, classe === 'mixte' ? partActionsPb : null, actifId);
  if (r.changes === 0) throw new ErreurSaisie(['ligne inconnue']);
}
