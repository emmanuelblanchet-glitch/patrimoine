// Fractions exactes sur des entiers — pour appliquer une quote-part (1/3)
// sans perdre de centimes en route. Un seul arrondi, à l'affichage.
//
// Les valeurs restent des entiers sûrs (Number.isSafeInteger) : au-delà, on
// lève une erreur plutôt que de rendre un montant faux en silence.

function pgcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

/** Fraction réduite, dénominateur strictement positif. */
export function fraction(num, den = 1) {
  if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den) || den === 0) {
    throw new RangeError(`fraction invalide : ${num}/${den}`);
  }
  if (den < 0) {
    num = -num;
    den = -den;
  }
  const g = pgcd(num, den);
  return { num: num / g, den: den / g };
}

export const ZERO = fraction(0);

export function ajouter(a, b) {
  return fraction(a.num * b.den + b.num * a.den, a.den * b.den);
}

export function soustraire(a, b) {
  return ajouter(a, { num: -b.num, den: b.den });
}

export function multiplier(a, b) {
  return fraction(a.num * b.num, a.den * b.den);
}

export function egales(a, b) {
  return a.num === b.num && a.den === b.den;
}

/** Arrondi à l'entier le plus proche, demi éloigné de zéro. */
export function arrondir(a) {
  const signe = a.num < 0 ? -1 : 1;
  const n = Math.abs(a.num);
  return signe * Math.floor((2 * n + a.den) / (2 * a.den));
}
