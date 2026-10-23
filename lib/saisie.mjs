// Lecture des valeurs tapées par l'utilisateur — fonctions pures.
// Chacune rend { ok: true, valeur } ou { ok: false, motif }.
// Les montants deviennent des centimes entiers ; jamais de flottant stocké.

const ok = (valeur) => ({ ok: true, valeur });
const ko = (motif) => ({ ok: false, motif });

/** « 123 456,78 », « 123456.78 », « 1 200 € », « -50 » → centimes entiers. */
export function lireMontant(texte) {
  if (typeof texte !== 'string') return ko('montant absent');
  const net = texte.replace(/[\s  €]/g, '');
  if (net === '') return ko('montant absent');
  const m = /^(-?)(\d+)(?:[.,](\d{1,2}))?$/.exec(net);
  if (!m) return ko(`montant illisible : « ${texte} » (exemple : 123 456,78)`);
  const [, signe, euros, cts = ''] = m;
  const centimes = Number(euros) * 100 + Number(cts.padEnd(2, '0'));
  if (!Number.isSafeInteger(centimes)) return ko(`montant trop grand : « ${texte} »`);
  return ok(signe === '-' ? -centimes : centimes);
}

/** Montant facultatif : vide → null, sinon comme lireMontant. */
export function lireMontantFacultatif(texte) {
  if (typeof texte !== 'string' || texte.trim() === '') return ok(null);
  return lireMontant(texte);
}

/** « 1/2 », « 1 », « 100 % », « 50% » → { num, den } avec 0 < num ≤ den. */
export function lireQuotePart(texte) {
  if (typeof texte !== 'string' || texte.trim() === '') return ok({ num: 1, den: 1 });
  const net = texte.replace(/\s/g, '');
  let num;
  let den;
  let m;
  if ((m = /^(\d+)\/(\d+)$/.exec(net))) {
    num = Number(m[1]);
    den = Number(m[2]);
  } else if ((m = /^(\d+)%$/.exec(net))) {
    num = Number(m[1]);
    den = 100;
  } else if (net === '1') {
    num = 1;
    den = 1;
  } else {
    return ko(`quote-part illisible : « ${texte} » (exemples : 1/2, 1/3, 50 %)`);
  }
  if (den === 0 || num === 0 || num > den) {
    return ko(`quote-part hors bornes : « ${texte} » (entre 0 exclu et 1)`);
  }
  return ok({ num, den });
}

/** « 3,25 » (%) → 325 points de base. */
export function lireTauxPb(texte) {
  if (typeof texte !== 'string' || texte.trim() === '') return ok(null);
  const net = texte.replace(/[\s%]/g, '');
  const m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(net);
  if (!m) return ko(`taux illisible : « ${texte} » (exemple : 3,25)`);
  return ok(Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')));
}

/** AAAA-MM-JJ, date réelle du calendrier (le 30 février est refusé) ; vide → null. */
export function lireDate(texte) {
  if (typeof texte !== 'string' || texte.trim() === '') return ok(null);
  const net = texte.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(net);
  if (!m) return ko(`date illisible : « ${texte} » (format AAAA-MM-JJ)`);
  const [a, mo, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(a, mo - 1, j));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== j) {
    return ko(`date inexistante : « ${texte} »`);
  }
  return ok(net);
}

/** Entier positif ou nul (durée en mois…). */
export function lireEntier(texte) {
  if (typeof texte !== 'string' || texte.trim() === '') return ok(null);
  const net = texte.trim();
  if (!/^\d+$/.test(net)) return ko(`nombre entier attendu : « ${texte} »`);
  const n = Number(net);
  if (!Number.isSafeInteger(n)) return ko(`nombre trop grand : « ${texte} »`);
  return ok(n);
}

/** Symbole de cotation accepté : lettres, chiffres, point, tiret, jusqu'à 20 caractères (ex. WPEA.PA). */
export const SYMBOLE_VALIDE = /^[A-Z0-9][A-Z0-9.\-^]{0,19}$/;

/** « 12 », « 12,5 », « 0.25 » → millionièmes de part (entier). Jamais de flottant intermédiaire. */
export function lireParts(texte) {
  if (typeof texte !== 'string' || texte.trim() === '') return ko('nombre de parts obligatoire');
  const m = /^(\d+)(?:[.,](\d{1,6}))?$/.exec(texte.replace(/\s/g, ''));
  if (!m) return ko(`nombre de parts illisible : « ${texte} » (exemple : 12 ou 12,5)`);
  const millioniemes = Number(m[1]) * 1_000_000 + Number((m[2] ?? '').padEnd(6, '0'));
  if (!Number.isSafeInteger(millioniemes) || millioniemes === 0) return ko('nombre de parts : positif attendu');
  return ok(millioniemes);
}

/** Texte libre, espaces de bord retirés ; vide → null. */
export function lireTexte(texte) {
  if (typeof texte !== 'string') return null;
  const net = texte.trim();
  return net === '' ? null : net;
}
