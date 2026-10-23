// La porte de l'outil en mode public (lot 3, L3-1) : phrase de passe en
// empreinte scrypt, session signée HMAC portée par un cookie, et compteur
// d'essais par source. Pur, sans accès réseau ; l'horloge est injectable.
//
// La phrase elle-même n'est jamais stockée : seule son empreinte vit dans
// l'environnement du conteneur. Le secret de session signe les jetons ; le
// changer déconnecte tout le monde.

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'patrimoine_session';
export const DUREE_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export const ESSAIS_MAX = 5;
export const RECUL_ESSAIS_MS = 10 * 60 * 1000;
export const SECRET_MIN = 32;
const SCRYPT = { N: 16384, r: 8, p: 1, longueur: 32 };
const FORMAT_EMPREINTE = /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/;

/** Empreinte d'une phrase : `scrypt$sel$hash`, à coller dans l'environnement. */
export function empreintePhrase(phrase, sel = randomBytes(16)) {
  const hash = scryptSync(phrase.normalize('NFC'), sel, SCRYPT.longueur, SCRYPT);
  return `scrypt$${sel.toString('hex')}$${hash.toString('hex')}`;
}

export const empreinteValide = (texte) => typeof texte === 'string' && FORMAT_EMPREINTE.test(texte);

/** Compare en temps constant ; une empreinte mal formée vaut un refus. */
export function verifierPhrase(phrase, empreinte) {
  if (typeof phrase !== 'string' || !empreinteValide(empreinte)) return false;
  const [, selHex, hashHex] = empreinte.split('$');
  const attendu = Buffer.from(hashHex, 'hex');
  const calcule = scryptSync(phrase.normalize('NFC'), Buffer.from(selHex, 'hex'), SCRYPT.longueur, SCRYPT);
  return timingSafeEqual(attendu, calcule);
}

/**
 * Jetons signés et compteur d'essais. Un jeton = `expiration.nonce.signature` ;
 * la signature couvre l'expiration et le nonce. Rien n'est stocké côté
 * serveur : la session survit à un redémarrage tant que le secret ne change pas.
 */
export function creerSessions({ secret, maintenant = () => Date.now() }) {
  if (typeof secret !== 'string' || secret.length < SECRET_MIN) throw new Error(`secret de session trop court (${SECRET_MIN} caractères au moins)`);
  const signer = (corps) => createHmac('sha256', secret).update(corps).digest('hex');
  const essais = new Map(); // source → { echecs, bloqueJusqua }

  const menage = () => {
    if (essais.size < 1000) return;
    for (const [source, e] of essais) if (e.bloqueJusqua < maintenant() && e.echecs === 0) essais.delete(source);
  };

  return {
    emettre() {
      const corps = `${maintenant() + DUREE_SESSION_MS}.${randomBytes(16).toString('hex')}`;
      return `${corps}.${signer(corps)}`;
    },
    valider(jeton) {
      if (typeof jeton !== 'string') return false;
      const parties = jeton.split('.');
      if (parties.length !== 3) return false;
      const [expiration, nonce, signature] = parties;
      const attendue = signer(`${expiration}.${nonce}`);
      if (signature.length !== attendue.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(attendue))) return false;
      return Number(expiration) > maintenant();
    },
    /** Millisecondes d'attente restantes pour cette source, 0 si libre. */
    attente(source) {
      const e = essais.get(source);
      return e && e.bloqueJusqua > maintenant() ? e.bloqueJusqua - maintenant() : 0;
    },
    echec(source) {
      menage();
      const e = essais.get(source) ?? { echecs: 0, bloqueJusqua: 0 };
      e.echecs += 1;
      if (e.echecs >= ESSAIS_MAX) {
        e.echecs = 0;
        e.bloqueJusqua = maintenant() + RECUL_ESSAIS_MS;
      }
      essais.set(source, e);
      return e.bloqueJusqua > maintenant() ? e.bloqueJusqua - maintenant() : 0;
    },
    reussite(source) {
      essais.delete(source);
    },
  };
}

/** Le jeton porté par l'en-tête Cookie, ou null. */
export function lireCookie(enTete) {
  if (typeof enTete !== 'string') return null;
  for (const morceau of enTete.split(';')) {
    const [nom, ...reste] = morceau.trim().split('=');
    if (nom === COOKIE) return reste.join('=');
  }
  return null;
}

/** En-tête Set-Cookie : HttpOnly, SameSite=Strict, Secure en mode public, 30 jours. */
export function enTeteCookie(jeton, { secure }) {
  return `${COOKIE}=${jeton}; Path=/; Max-Age=${DUREE_SESSION_MS / 1000}; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
}

export function enTeteCookieEffacement({ secure }) {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
}
