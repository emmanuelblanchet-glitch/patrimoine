// Performance — fonctions pures (seam S-L2-3).
//
// Plus-value d'une ligne : valeur du jour − coût d'acquisition.
// Rendement de la poche : taux de rendement interne (TRI, ou XIRR) des
// flux datés — ce que l'épargne rapporte, versements compris. Pas de TWR
// avant la V1.

const JOUR_MS = 24 * 60 * 60 * 1000;

/** Plus-value en centimes et en points de base du coût ; null sans coût. */
export function plusValue({ valeurCentimes, coutCentimes }) {
  if (!Number.isSafeInteger(coutCentimes) || coutCentimes <= 0 || !Number.isSafeInteger(valeurCentimes)) return null;
  const centimes = valeurCentimes - coutCentimes;
  return { centimes, pb: Math.round((centimes * 10000) / coutCentimes) };
}

function valeurActuelle(flux, taux, origineMs) {
  let v = 0;
  for (const f of flux) {
    const annees = (Date.parse(`${f.date}T00:00:00Z`) - origineMs) / (365.25 * JOUR_MS);
    v += f.centimes / Math.pow(1 + taux, annees);
  }
  return v;
}

/**
 * TRI annualisé en points de base. Convention : les versements sont des
 * flux négatifs (l'argent sort de ta poche), la valeur finale un flux
 * positif à sa date. Rend null si le calcul n'a pas de sens (moins de deux
 * flux, pas de signe opposé, pas de convergence).
 * @param {{ date: string, centimes: number }[]} flux
 */
export function tri(flux) {
  if (!Array.isArray(flux) || flux.length < 2) return null;
  const tries = [...flux].filter((f) => Number.isSafeInteger(f.centimes) && f.centimes !== 0).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (tries.length < 2) return null;
  if (!tries.some((f) => f.centimes > 0) || !tries.some((f) => f.centimes < 0)) return null;
  const origineMs = Date.parse(`${tries[0].date}T00:00:00Z`);
  if (Date.parse(`${tries.at(-1).date}T00:00:00Z`) === origineMs) return null;

  // Bissection sur [-99 %, +1000 %] : la fonction est monotone dans ce cas
  // d'usage (sorties puis entrée finale), robuste là où Newton diverge.
  let bas = -0.99;
  let haut = 10;
  let fBas = valeurActuelle(tries, bas, origineMs);
  const fHaut = valeurActuelle(tries, haut, origineMs);
  if (Math.sign(fBas) === Math.sign(fHaut)) return null;
  for (let i = 0; i < 200; i++) {
    const milieu = (bas + haut) / 2;
    const fMilieu = valeurActuelle(tries, milieu, origineMs);
    if (Math.abs(fMilieu) < 1e-7 || haut - bas < 1e-9) return Math.round(milieu * 10000);
    if (Math.sign(fMilieu) === Math.sign(fBas)) {
      bas = milieu;
      fBas = fMilieu;
    } else {
      haut = milieu;
    }
  }
  return null;
}

/** Jours entre le premier flux et la date du jour : pour n'afficher le TRI qu'avec du recul. */
export function reculJours(flux, aujourdhui) {
  if (!flux?.length) return 0;
  const premier = flux.map((f) => f.date).sort()[0];
  return Math.round((Date.parse(`${aujourdhui}T00:00:00Z`) - Date.parse(`${premier}T00:00:00Z`)) / JOUR_MS);
}
