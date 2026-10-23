// La porte du mode public (lot 3, L3-1) : phrase de passe en empreinte
// scrypt, session signée HMAC portée par un cookie, compteur d'essais par
// source et plafond global. Pur, sans accès réseau ; l'horloge est injectable.
//
// La phrase n'est jamais stockée : seule son empreinte vit dans
// l'environnement du conteneur. La clé de signature combine le secret de
// session et l'empreinte : changer l'un ou l'autre révoque toutes les
// sessions (un cookie volé ne survit pas à un changement de phrase).

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const COOKIE = 'patrimoine_session';
const DUREE_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const ESSAIS_MAX = 5;
// La source vient d'un en-tête que seul le relais devrait écrire ; un
// processus qui le forgerait changerait de source à chaque essai. Au-delà de
// ce plafond, toutes sources confondues, plus personne n'essaie pendant le recul.
const ECHECS_GLOBAUX_MAX = 20;
const RECUL_ESSAIS_MS = 10 * 60 * 1000;
export const SECRET_MIN = 32;
// N = 2^15 demande 32 Mo : au-dessus de la limite par défaut de Node, d'où maxmem.
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
const LONGUEUR = 32;
const FORMAT_EMPREINTE = /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/;

/** Empreinte d'une phrase : `scrypt$sel$hash`, à mettre dans l'environnement. */
export function empreintePhrase(phrase, sel = randomBytes(16)) {
  const hash = scryptSync(phrase.normalize('NFC'), sel, LONGUEUR, SCRYPT);
  return `scrypt$${sel.toString('hex')}$${hash.toString('hex')}`;
}

export const empreinteValide = (texte) => typeof texte === 'string' && FORMAT_EMPREINTE.test(texte);

/** Compare en temps constant ; une empreinte mal formée vaut un refus. */
export function verifierPhrase(phrase, empreinte) {
  if (!empreinteValide(empreinte)) return false;
  const [, selHex, hashHex] = empreinte.split('$');
  const calcule = scryptSync(phrase.normalize('NFC'), Buffer.from(selHex, 'hex'), LONGUEUR, SCRYPT);
  return timingSafeEqual(Buffer.from(hashHex, 'hex'), calcule);
}

/**
 * Jetons signés et compteurs d'essais. Un jeton = `expiration.nonce.signature`.
 * Rien n'est stocké côté serveur : la session survit à un redémarrage tant
 * que le secret et l'empreinte ne changent pas.
 */
export function creerSessions({ secret, empreinte, maintenant = () => Date.now() }) {
  const cle = `${secret}|${empreinte}`;
  const signer = (corps) => createHmac('sha256', cle).update(corps).digest('hex');
  const essais = new Map(); // source → { echecs, bloqueJusqua, dernier }
  let echecsGlobaux = []; // horodatages des échecs de la fenêtre
  let blocageGlobalJusqua = 0;

  const menage = (t) => {
    for (const [source, e] of essais) if (t - e.dernier > RECUL_ESSAIS_MS && e.bloqueJusqua <= t) essais.delete(source);
    echecsGlobaux = echecsGlobaux.filter((h) => t - h < RECUL_ESSAIS_MS);
  };
  /** Millisecondes d'attente restantes pour cette source, 0 si libre. */
  const attente = (source) => {
    const t = maintenant();
    return Math.max(0, blocageGlobalJusqua - t, (essais.get(source)?.bloqueJusqua ?? 0) - t);
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
      // timingSafeEqual lève sur des longueurs différentes : on compare d'abord la longueur.
      if (signature.length !== attendue.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(attendue))) return false;
      return Number(expiration) > maintenant();
    },
    attente,
    echec(source) {
      const t = maintenant();
      menage(t);
      const e = essais.get(source) ?? { echecs: 0, bloqueJusqua: 0, dernier: t };
      e.echecs += 1;
      e.dernier = t;
      if (e.echecs >= ESSAIS_MAX) {
        e.echecs = 0;
        e.bloqueJusqua = t + RECUL_ESSAIS_MS;
      }
      essais.set(source, e);
      echecsGlobaux.push(t);
      if (echecsGlobaux.length >= ECHECS_GLOBAUX_MAX) {
        blocageGlobalJusqua = t + RECUL_ESSAIS_MS;
        echecsGlobaux = [];
      }
      return attente(source);
    },
    reussite(source) {
      essais.delete(source);
    },
  };
}

export function lireCookie(enTete) {
  if (typeof enTete !== 'string') return null;
  for (const morceau of enTete.split(';')) {
    const [nom, ...reste] = morceau.trim().split('=');
    if (nom === COOKIE) return reste.join('=');
  }
  return null;
}

/** Le cookie n'existe qu'en mode public, donc derrière HTTPS : toujours Secure. */
export const enTeteCookie = (jeton) => `${COOKIE}=${jeton}; Path=/; Max-Age=${DUREE_SESSION_MS / 1000}; HttpOnly; SameSite=Strict; Secure`;
export const enTeteCookieEffacement = () => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict; Secure`;
