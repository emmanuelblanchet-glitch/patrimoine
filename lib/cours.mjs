// Les cours en base : écriture idempotente, dernier cours par ligne, et
// la valorisation « parts × cours » synthétisée pour le moteur de bilan.

import { fraction, multiplier, arrondir } from './fraction.mjs';

/** Écrit des cours datés ; même ligne, même jour → inchangé. Rend le nombre d'ajouts. */
export function enregistrerCours(base, actifId, cours, { source, releveLe = new Date().toISOString() }) {
  const inserer = base.prepare('INSERT OR IGNORE INTO cours (actif_id, date, cours_centimes, source, releve_le) VALUES (?, ?, ?, ?, ?)');
  let ajouts = 0;
  base.exec('BEGIN');
  try {
    for (const c of cours) {
      if (!Number.isSafeInteger(c.centimes) || c.centimes <= 0) continue;
      ajouts += inserer.run(actifId, c.date, c.centimes, source, releveLe).changes;
    }
    base.exec('COMMIT');
  } catch (e) {
    base.exec('ROLLBACK');
    throw e;
  }
  return ajouts;
}

/** Dernier cours par actif : { actifId: { date, centimes, source, releveLe } }. */
export function lireDerniersCours(base) {
  const rows = base.prepare(`SELECT c.actif_id, c.date, c.cours_centimes, c.source, c.releve_le FROM cours c
                             JOIN (SELECT actif_id, MAX(date) AS d FROM cours GROUP BY actif_id) m ON m.actif_id = c.actif_id AND m.d = c.date`).all();
  return Object.fromEntries(rows.map((r) => [r.actif_id, { date: r.date, centimes: r.cours_centimes, source: r.source, releveLe: r.releve_le }]));
}

/**
 * Pure : pour chaque actif coté qui a des parts et un cours, une
 * valorisation « fait » à la date du cours, valeur = parts × cours (un seul
 * arrondi), marquée `origine: 'cours'` : le bilan la fait primer sur une
 * saisie du même jour.
 */
export function valorisationsDepuisCours(actifs, positions, derniersCours) {
  const sorties = [];
  for (const a of actifs) {
    const p = positions[a.id];
    const c = derniersCours[a.id];
    if (!a.symboleCours || !p || p.partsMillioniemes <= 0 || !c) continue;
    const valeur = arrondir(multiplier(fraction(p.partsMillioniemes, 1_000_000), fraction(c.centimes)));
    sorties.push({ id: null, origine: 'cours', cible: { actifId: a.id }, date: c.date, valeurCentimes: valeur, source: `${c.source} (${p.partsMillioniemes / 1_000_000} parts)`, statut: 'fait' });
  }
  return sorties;
}
