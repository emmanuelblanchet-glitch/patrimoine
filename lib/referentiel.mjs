// Référentiel — écriture et lecture des enveloppes, actifs, passifs et
// valorisations. Chaque écriture est validée ici AVANT la base ; la base
// porte en plus ses propres contraintes (CHECK, NOT NULL, clés étrangères),
// pour qu'un contournement du code échoue aussi (seam S6).

export const TYPES_ENVELOPPE = ['immobilier_direct', 'pee', 'per', 'pea', 'cto', 'av', 'livret', 'compte_courant', 'societe'];
export const NATURES_ACTIF = ['bien', 'fcpe', 'etf', 'action', 'parts', 'liquidites'];
export const TYPES_PASSIF = ['amortissable', 'in_fine'];
export const STATUTS = ['fait', 'estimation'];

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

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
  if (!vide(e.dateOuverture) && !DATE_ISO.test(e.dateOuverture)) motifs.push('date d\'ouverture au format AAAA-MM-JJ');
  return motifs;
}

export function validerActif(a) {
  const motifs = [];
  if (!NATURES_ACTIF.includes(a.nature)) motifs.push(`nature d'actif inconnue : « ${a.nature ?? ''} »`);
  if (vide(a.libelle)) motifs.push('libellé obligatoire');
  for (const champ of ['dateAcquisition', 'dateCloture']) {
    if (!vide(a[champ]) && !DATE_ISO.test(a[champ])) motifs.push(`${champ} au format AAAA-MM-JJ`);
  }
  for (const champ of ['prixAcquisitionCentimes', 'fraisAcquisitionCentimes']) {
    if (!entierOuNul(a[champ])) motifs.push(`${champ} : entier en centimes attendu`);
  }
  return motifs;
}

export function validerPassif(p) {
  const motifs = [];
  if (vide(p.libelle)) motifs.push('libellé obligatoire');
  if (!TYPES_PASSIF.includes(p.type ?? 'amortissable')) motifs.push(`type de crédit inconnu : « ${p.type} »`);
  for (const champ of ['capitalInitialCentimes', 'tauxPb', 'dureeMois', 'mensualiteCentimes', 'assuranceMensuelleCentimes']) {
    if (!entierOuNul(p[champ]) || (p[champ] ?? 0) < 0) motifs.push(`${champ} : entier positif attendu`);
  }
  if (!vide(p.datePremiereEcheance) && !DATE_ISO.test(p.datePremiereEcheance)) {
    motifs.push('date de première échéance au format AAAA-MM-JJ');
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
  if (vide(v.date) || !DATE_ISO.test(v.date)) motifs.push('date obligatoire au format AAAA-MM-JJ');
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

// ——— Lecture ——————————————————————————————————————————————————————————

export function lireEnveloppes(base) {
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

export function lireActifs(base) {
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
  }));
}

export function lirePassifs(base) {
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

export function lireValorisations(base) {
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

/** Tout ce dont le moteur de bilan a besoin, en une lecture. */
export function lireEtat(base) {
  return {
    enveloppes: lireEnveloppes(base),
    actifs: lireActifs(base),
    passifs: lirePassifs(base),
    valorisations: lireValorisations(base),
  };
}
