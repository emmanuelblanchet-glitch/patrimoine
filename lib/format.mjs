// Formats d'affichage partagés par les pages et les textes générés.

const FORMAT_EUROS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const FORMAT_EUROS_RONDS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export const euros = (centimes) => (centimes == null ? '—' : FORMAT_EUROS.format(centimes / 100));
export const eurosRonds = (centimes) => (centimes == null ? '—' : FORMAT_EUROS_RONDS.format(centimes / 100));
/** Points de base → « 60 % », « 12,7 % ». */
export const pct = (pb) => `${(pb / 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
/** Points de base → « 60 % », « 13 % » : pour les textes, où la décimale ne dit rien. */
export const pctEntier = (pb) => `${Math.round(pb / 100).toLocaleString('fr-FR')} %`;
/** Date locale du Mac (AAAA-MM-JJ), pas la date UTC : à 1 h du matin, on est déjà demain ici. */
export const aujourdhuiLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
