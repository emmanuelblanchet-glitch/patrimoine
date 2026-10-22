// Formats d'affichage partagés par les pages et les textes générés.

const FORMAT_EUROS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const FORMAT_EUROS_RONDS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export const euros = (centimes) => (centimes == null ? '—' : FORMAT_EUROS.format(centimes / 100));
export const eurosRonds = (centimes) => (centimes == null ? '—' : FORMAT_EUROS_RONDS.format(centimes / 100));
/** Points de base → « 60 % », « 12,7 % ». */
export const pct = (pb) => `${(pb / 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
