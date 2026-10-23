// Référentiel — écriture et lecture des enveloppes, actifs, passifs et
// valorisations. Chaque écriture est validée ici AVANT la base ; la base
// porte en plus ses propres contraintes (CHECK, NOT NULL, clés étrangères),
// pour qu'un contournement du code échoue aussi (seam S6).

import { lireDate, SYMBOLE_VALIDE } from './saisie.mjs';
import { lireDerniersCours, valorisationsDepuisCours } from './cours.mjs';
import { fraction, multiplier, arrondir } from './fraction.mjs';

export const TYPES_ENVELOPPE = ['immobilier_direct', 'pee', 'per', 'pea', 'cto', 'av', 'livret', 'compte_courant', 'societe'];
export const NATURES_ACTIF = ['bien', 'fcpe', 'etf', 'action', 'parts', 'liquidites'];
export const TYPES_PASSIF = ['amortissable', 'in_fine'];
export const STATUTS = ['fait', 'estimation'];
export const SOURCE_VERSEMENT = 'versement saisi';

/** Une date AAAA-MM-JJ qui existe au calendrier (le 30 février est refusé). */
function dateValide(v) {
  const r = lireDate(v);
  return r.ok && r.valeur !== null;
}

export class ErreurSaisie extends Error {
  constructor(motifs) {
    super(motifs.join(' ; '));
    this.name = 'ErreurSaisie';
    this.motifs = motifs;
  }
}

const vide = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const entierOuNul = (v) => v === null || v === undefined || Number.isSafeInteger(v);

function existe(base, table, id) {
  if (!Number.isSafeInteger(id)) return false;
  return Boolean(base.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id));
}

// ——— Validation (pure) ——————————————————————————————————————————————

export function validerEnveloppe(e) {
  const motifs = [];
  if (!TYPES_ENVELOPPE.includes(e.type)) motifs.push(`type d'enveloppe inconnu : « ${e.type ?? ''} »`);
  if (vide(e.libelle)) motifs.push('libellé obligatoire');
  const qp = e.quotePart ?? { num: 1, den: 1 };
  if (!Number.isSafeInteger(qp.num) || !Number.isSafeInteger(qp.den) || qp.num <= 0 || qp.den <= 0 || qp.num > qp.den) {
    motifs.push('quote-part hors bornes (entre 0 exclu et 1)');
  }
  if (!vide(e.dateOuverture) && !dateValide(e.dateOuverture)) motifs.push('date d\'ouverture : date réelle au format AAAA-MM-JJ');
  return motifs;
}

const LIBELLES_CHAMPS = {
  dateAcquisition: 'date d\'acquisition',
  dateCloture: 'date de cession',
  prixAcquisitionCentimes: 'prix d\'acquisition',
  fraisAcquisitionCentimes: 'frais d\'acquisition',
  capitalInitialCentimes: 'capital emprunté',
  tauxPb: 'taux',
  dureeMois: 'durée',
  mensualiteCentimes: 'mensualité',
  assuranceMensuelleCentimes: 'assurance mensuelle',
};

export function validerActif(a) {
  const motifs = [];
  if (!NATURES_ACTIF.includes(a.nature)) motifs.push(`nature d'actif inconnue : « ${a.nature ?? ''} »`);
  if (vide(a.libelle)) motifs.push('libellé obligatoire');
  for (const champ of ['dateAcquisition', 'dateCloture']) {
    if (!vide(a[champ]) && !dateValide(a[champ])) motifs.push(`${LIBELLES_CHAMPS[champ]} : date réelle au format AAAA-MM-JJ`);
  }
  for (const champ of ['prixAcquisitionCentimes', 'fraisAcquisitionCentimes']) {
    if (!entierOuNul(a[champ])) motifs.push(`${LIBELLES_CHAMPS[champ]} : montant en centimes entiers attendu`);
  }
  return motifs;
}

export function validerPassif(p) {
  const motifs = [];
  if (vide(p.libelle)) motifs.push('libellé obligatoire');
  if (!TYPES_PASSIF.includes(p.type ?? 'amortissable')) motifs.push(`type de crédit inconnu : « ${p.type} »`);
  for (const champ of ['capitalInitialCentimes', 'tauxPb', 'dureeMois', 'mensualiteCentimes', 'assuranceMensuelleCentimes']) {
    if (!entierOuNul(p[champ]) || (p[champ] ?? 0) < 0) motifs.push(`${LIBELLES_CHAMPS[champ]} : nombre entier positif attendu`);
  }
  if (!vide(p.datePremiereEcheance) && !dateValide(p.datePremiereEcheance)) {
    motifs.push('date de première échéance : date réelle au format AAAA-MM-JJ');
  }
  return motifs;
}

/** Seam S6 : pas de valeur sans source ni statut. */
export function validerValorisation(v) {
  const motifs = [];
  const cible = v.cible ?? {};
  const surActif = cible.actifId != null;
  const surPassif = cible.passifId != null;
  if (surActif === surPassif) motifs.push('choisir sur quoi porte la valeur : un actif OU un crédit');
  if (!dateValide(v.date)) motifs.push('date obligatoire : date réelle au format AAAA-MM-JJ');
  if (!Number.isSafeInteger(v.valeurCentimes)) motifs.push('valeur obligatoire, en centimes entiers');
  else if (surPassif && v.valeurCentimes < 0) motifs.push('un capital restant dû ne peut pas être négatif');
  if (vide(v.source)) motifs.push('source obligatoire : d\'où vient ce chiffre ? (relevé, acte, estimation datée…)');
  if (!STATUTS.includes(v.statut)) motifs.push('statut obligatoire : « fait » ou « estimation »');
  return motifs;
}

// ——— Écriture ————————————————————————————————————————————————————————

function exiger(motifs) {
  if (motifs.length) throw new ErreurSaisie(motifs);
}

const texte = (v) => (vide(v) ? null : String(v).trim());

export function creerEnveloppe(base, e) {
  exiger(validerEnveloppe(e));
  const qp = e.quotePart ?? { num: 1, den: 1 };
  const r = base
    .prepare(`INSERT INTO enveloppe (type, libelle, etablissement, date_ouverture, quote_part_num, quote_part_den, regime_fiscal)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(e.type, texte(e.libelle), texte(e.etablissement), texte(e.dateOuverture), qp.num, qp.den, texte(e.regimeFiscal));
  return Number(r.lastInsertRowid);
}

export function creerActif(base, a) {
  const motifs = validerActif(a);
  if (!existe(base, 'enveloppe', a.enveloppeId)) motifs.push('enveloppe inconnue');
  exiger(motifs);
  const r = base
    .prepare(`INSERT INTO actif (enveloppe_id, nature, libelle, identifiant, classe, zone, secteur, devise, liquidite,
                                 date_acquisition, prix_acquisition_centimes, frais_acquisition_centimes, date_cloture)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      a.enveloppeId, a.nature, texte(a.libelle), texte(a.identifiant), texte(a.classe), texte(a.zone), texte(a.secteur),
      texte(a.devise) ?? 'EUR', texte(a.liquidite), texte(a.dateAcquisition),
      a.prixAcquisitionCentimes ?? null, a.fraisAcquisitionCentimes ?? null, texte(a.dateCloture),
    );
  return Number(r.lastInsertRowid);
}

export function creerPassif(base, p) {
  const motifs = validerPassif(p);
  if (!existe(base, 'actif', p.actifId)) motifs.push('bien financé inconnu');
  exiger(motifs);
  const r = base
    .prepare(`INSERT INTO passif (actif_id, libelle, etablissement, capital_initial_centimes, taux_pb, duree_mois,
                                  mensualite_centimes, assurance_mensuelle_centimes, date_premiere_echeance, type)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      p.actifId, texte(p.libelle), texte(p.etablissement), p.capitalInitialCentimes ?? null, p.tauxPb ?? null,
      p.dureeMois ?? null, p.mensualiteCentimes ?? null, p.assuranceMensuelleCentimes ?? null,
      texte(p.datePremiereEcheance), p.type ?? 'amortissable',
    );
  return Number(r.lastInsertRowid);
}

export function ajouterValorisation(base, v) {
  const motifs = validerValorisation(v);
  const { actifId = null, passifId = null } = v.cible ?? {};
  if (actifId != null && !existe(base, 'actif', actifId)) motifs.push('actif inconnu');
  if (passifId != null && !existe(base, 'passif', passifId)) motifs.push('crédit inconnu');
  exiger(motifs);
  const r = base
    .prepare(`INSERT INTO valorisation (actif_id, passif_id, date, valeur_centimes, source, statut, note)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(actifId, passifId, v.date, v.valeurCentimes, texte(v.source), v.statut, texte(v.note));
  return Number(r.lastInsertRowid);
}

/** Seam : un versement est une transaction immuable ; sa nouvelle valeur, une valorisation. */
export function validerVersement(v) {
  const motifs = [];
  if (!Number.isSafeInteger(v.actifId)) motifs.push('choisir la ligne qui a reçu le versement');
  if (vide(v.date) || !dateValide(v.date)) motifs.push('date obligatoire : date réelle au format AAAA-MM-JJ');
  if (!Number.isSafeInteger(v.montantCentimes) || v.montantCentimes <= 0) motifs.push('montant obligatoire, positif, en euros');
  if (v.nouvelleValeurCentimes != null && (!Number.isSafeInteger(v.nouvelleValeurCentimes) || v.nouvelleValeurCentimes < 0)) {
    motifs.push('nouvelle valeur : montant positif, en euros');
  }
  if (!['versement', 'abondement'].includes(v.type ?? 'versement')) motifs.push('type de versement inconnu');
  return motifs;
}

export function enregistrerVersement(base, v) {
  const motifs = validerVersement(v);
  if (!motifs.length && !existe(base, 'actif', v.actifId)) motifs.push('ligne inconnue');
  exiger(motifs);
  base.exec('BEGIN');
  try {
    base.prepare('INSERT INTO transactions (date, actif_id, type, montant_centimes, note) VALUES (?, ?, ?, ?, ?)')
      .run(v.date, v.actifId, v.type ?? 'versement', v.montantCentimes, texte(v.note));
    if (v.nouvelleValeurCentimes != null) {
      base.prepare('INSERT INTO valorisation (actif_id, date, valeur_centimes, source, statut) VALUES (?, ?, ?, ?, ?)')
        .run(v.actifId, v.date, v.nouvelleValeurCentimes, texte(v.source) ?? SOURCE_VERSEMENT, 'fait');
    }
    base.exec('COMMIT');
  } catch (e) {
    base.exec('ROLLBACK');
    throw e;
  }
}

/** Un achat de parts : transaction immuable `achat` avec quantité ; le coût = parts × prix + frais. Réservé aux lignes cotées. */
export function validerAchat(a) {
  const motifs = [];
  if (!Number.isSafeInteger(a.actifId)) motifs.push('choisir la ligne achetée');
  if (vide(a.date) || !dateValide(a.date)) motifs.push('date obligatoire : date réelle au format AAAA-MM-JJ');
  if (!Number.isSafeInteger(a.partsMillioniemes) || a.partsMillioniemes <= 0) motifs.push('nombre de parts obligatoire, positif');
  if (!Number.isSafeInteger(a.prixCentimes) || a.prixCentimes <= 0) motifs.push('prix par part obligatoire, positif, en euros');
  if (a.fraisCentimes != null && (!Number.isSafeInteger(a.fraisCentimes) || a.fraisCentimes < 0)) motifs.push('frais : montant positif ou vide');
  return motifs;
}

/** parts × prix en fraction exacte, un seul arrondi, plus les frais. */
export function coutAchat({ partsMillioniemes, prixCentimes, fraisCentimes }) {
  return arrondir(multiplier(fraction(partsMillioniemes, 1_000_000), fraction(prixCentimes))) + (fraisCentimes ?? 0);
}

export function enregistrerAchat(base, a) {
  const motifs = validerAchat(a);
  if (!motifs.length) {
    const actif = base.prepare('SELECT symbole_cours FROM actif WHERE id = ?').get(a.actifId);
    if (!actif) motifs.push('ligne inconnue');
    else if (!actif.symbole_cours) motifs.push('un achat en parts ne se saisit que sur une ligne cotée ; pour une ligne sans cours, saisis un versement');
  }
  exiger(motifs);
  base.prepare('INSERT INTO transactions (date, actif_id, type, montant_centimes, quantite_millioniemes, frais_centimes, note) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(a.date, a.actifId, 'achat', coutAchat(a), a.partsMillioniemes, a.fraisCentimes ?? 0, texte(a.note));
}

/** Annule un achat erroné par contre-écriture : mêmes parts, même montant, en négatif. Une seule fois par achat. */
export function annulerAchat(base, transactionId, { date }) {
  const motifs = [];
  if (vide(date) || !dateValide(date)) motifs.push('date obligatoire : date réelle au format AAAA-MM-JJ');
  const achat = Number.isSafeInteger(transactionId)
    ? base.prepare("SELECT * FROM transactions WHERE id = ? AND type = 'achat'").get(transactionId)
    : null;
  if (!achat) motifs.push('achat inconnu');
  else if (base.prepare('SELECT 1 FROM transactions WHERE contre_ecriture_de = ?').get(transactionId)) motifs.push('cet achat est déjà annulé');
  exiger(motifs);
  base.prepare('INSERT INTO transactions (date, actif_id, type, montant_centimes, quantite_millioniemes, frais_centimes, contre_ecriture_de) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(date, achat.actif_id, 'annulation_achat', -achat.montant_centimes, -achat.quantite_millioniemes, 0, transactionId);
}

/** Quantité détenue et coût d'acquisition par actif : achats moins annulations. */
export function lirePositions(base) {
  const rows = base.prepare("SELECT actif_id, SUM(quantite_millioniemes) AS q, SUM(montant_centimes) AS c FROM transactions WHERE type IN ('achat', 'annulation_achat') GROUP BY actif_id HAVING SUM(quantite_millioniemes) > 0").all();
  return Object.fromEntries(rows.map((r) => [r.actif_id, { partsMillioniemes: r.q, coutCentimes: r.c }]));
}

/** Les achats encore en vigueur (non annulés), les plus récents d'abord : pour la page Mouvement. */
export function lireAchats(base) {
  return base.prepare(`SELECT t.id, t.date, t.actif_id, t.quantite_millioniemes, t.montant_centimes, t.frais_centimes FROM transactions t
                       WHERE t.type = 'achat' AND NOT EXISTS (SELECT 1 FROM transactions a WHERE a.contre_ecriture_de = t.id)
                       ORDER BY t.date DESC, t.id DESC`).all()
    .map((r) => ({ id: r.id, date: r.date, actifId: r.actif_id, partsMillioniemes: r.quantite_millioniemes, montantCentimes: r.montant_centimes, fraisCentimes: r.frais_centimes }));
}

/**
 * Tous les flux d'argent entrés dans la poche, datés et signés : versements,
 * achats et abondements positifs, annulations négatives. Le rendement et
 * la page Mouvement en vivent.
 */
export function lireFlux(base) {
  return base.prepare("SELECT id, date, type, actif_id, montant_centimes FROM transactions WHERE type IN ('versement', 'achat', 'annulation_achat', 'abondement') ORDER BY date, id").all()
    .map((r) => ({ id: r.id, date: r.date, type: r.type, actifId: r.actif_id, centimes: r.montant_centimes }));
}

/** Une ligne cotée : l'actif, sa classe et son symbole naissent ensemble. Le doublon de symbole est aussi refusé par la base. */
export function validerLigneCotee(d) {
  const motifs = [];
  if (!d.symbole || !SYMBOLE_VALIDE.test(d.symbole)) motifs.push('symbole de cotation illisible');
  if (vide(d.nom)) motifs.push('nom de la ligne obligatoire');
  if (!['etf', 'action'].includes(d.nature)) motifs.push('nature inconnue');
  if (!Number.isSafeInteger(d.enveloppeId)) motifs.push("choisir l'enveloppe qui accueille la ligne");
  if (!['actions_monde', 'sans_risque'].includes(d.classe)) motifs.push('classe inconnue (actions monde ou sans risque)');
  return motifs;
}

export function creerLigneCotee(base, d) {
  const motifs = validerLigneCotee(d);
  if (!motifs.length && !existe(base, 'enveloppe', d.enveloppeId)) motifs.push('enveloppe inconnue');
  if (!motifs.length) {
    const doublon = base.prepare('SELECT libelle FROM actif WHERE enveloppe_id = ? AND symbole_cours = ?').get(d.enveloppeId, d.symbole);
    if (doublon) motifs.push(`« ${d.symbole} » est déjà une ligne de cette enveloppe (${doublon.libelle})`);
  }
  exiger(motifs);
  return Number(base.prepare('INSERT INTO actif (enveloppe_id, nature, libelle, identifiant, classe_poche, symbole_cours) VALUES (?, ?, ?, ?, ?, ?)')
    .run(d.enveloppeId, d.nature, texte(d.nom), d.symbole, d.classe, d.symbole).lastInsertRowid);
}

// ——— Lecture ——————————————————————————————————————————————————————————

function lireEnveloppes(base) {
  return base.prepare('SELECT * FROM enveloppe ORDER BY id').all().map((r) => ({
    id: r.id,
    type: r.type,
    libelle: r.libelle,
    etablissement: r.etablissement,
    dateOuverture: r.date_ouverture,
    quotePart: { num: r.quote_part_num, den: r.quote_part_den },
    regimeFiscal: r.regime_fiscal,
  }));
}

function lireActifs(base) {
  return base.prepare('SELECT * FROM actif ORDER BY id').all().map((r) => ({
    id: r.id,
    enveloppeId: r.enveloppe_id,
    nature: r.nature,
    libelle: r.libelle,
    identifiant: r.identifiant,
    classe: r.classe,
    zone: r.zone,
    secteur: r.secteur,
    devise: r.devise,
    liquidite: r.liquidite,
    dateAcquisition: r.date_acquisition,
    prixAcquisitionCentimes: r.prix_acquisition_centimes,
    fraisAcquisitionCentimes: r.frais_acquisition_centimes,
    dateCloture: r.date_cloture,
    classePoche: r.classe_poche,
    partActionsPb: r.part_actions_pb,
    symboleCours: r.symbole_cours,
  }));
}

function lirePassifs(base) {
  return base.prepare('SELECT * FROM passif ORDER BY id').all().map((r) => ({
    id: r.id,
    actifId: r.actif_id,
    libelle: r.libelle,
    etablissement: r.etablissement,
    capitalInitialCentimes: r.capital_initial_centimes,
    tauxPb: r.taux_pb,
    dureeMois: r.duree_mois,
    mensualiteCentimes: r.mensualite_centimes,
    assuranceMensuelleCentimes: r.assurance_mensuelle_centimes,
    datePremiereEcheance: r.date_premiere_echeance,
    type: r.type,
  }));
}

function lireValorisations(base) {
  return base.prepare('SELECT * FROM valorisation ORDER BY date, id').all().map((r) => ({
    id: r.id,
    cible: r.actif_id != null ? { actifId: r.actif_id } : { passifId: r.passif_id },
    date: r.date,
    valeurCentimes: r.valeur_centimes,
    source: r.source,
    statut: r.statut,
    note: r.note,
  }));
}

/**
 * Tout ce dont le moteur de bilan a besoin, en une lecture. Les lignes
 * cotées reçoivent une valorisation synthétique « parts × dernier cours »
 * (lot 2) qui l'emporte sur une valeur saisie plus ancienne.
 */
export function lireEtat(base) {
  const actifs = lireActifs(base);
  const positions = lirePositions(base);
  const derniersCours = lireDerniersCours(base);
  return {
    enveloppes: lireEnveloppes(base),
    actifs,
    passifs: lirePassifs(base),
    valorisations: [...lireValorisations(base), ...valorisationsDepuisCours(actifs, positions, derniersCours)],
    positions,
    derniersCours,
    flux: lireFlux(base),
  };
}

/** Donne (ou change) le symbole de cotation d'une ligne ; vide pour le retirer. */
export function definirSymbole(base, actifId, symbole) {
  const s = texte(symbole);
  if (s !== null && !SYMBOLE_VALIDE.test(s)) throw new ErreurSaisie(['symbole de cotation illisible']);
  const r = base.prepare('UPDATE actif SET symbole_cours = ? WHERE id = ?').run(s, actifId);
  if (r.changes === 0) throw new ErreurSaisie(['ligne inconnue']);
}

/** Date l'ouverture d'une enveloppe qui n'en a pas encore (le PEA ouvert avant l'outil). */
export function daterEnveloppe(base, enveloppeId, dateOuverture) {
  if (!dateValide(dateOuverture)) throw new ErreurSaisie(["date d'ouverture : date réelle au format AAAA-MM-JJ"]);
  const r = base.prepare('UPDATE enveloppe SET date_ouverture = ? WHERE id = ? AND date_ouverture IS NULL').run(dateOuverture, enveloppeId);
  if (r.changes === 0) throw new ErreurSaisie(['enveloppe inconnue ou déjà datée']);
}
