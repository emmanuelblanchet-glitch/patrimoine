// Routeur HTTP du serveur local — Node `http` natif, sans framework.
//
// Gardes, dans l'ordre, sur chaque requête :
// 1. l'en-tête Host doit être l'adresse locale du serveur (403 sinon) :
//    bloque le rebond DNS d'une page tierce vers 127.0.0.1 ;
// 2. une écriture (POST) doit venir d'une page du serveur lui-même : son
//    en-tête Origin doit être exactement http://<Host> (403 sinon). Un
//    formulaire posté depuis un autre site porte l'Origin de ce site ;
// 3. les fichiers statiques ne sortent que de public/ (à plat, ou dans
//    public/fonts/), avec une extension allowlistée (404 sinon).

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { HOTE, RACINE_DEPOT } from './config.mjs';
import {
  lireEtat, creerEnveloppe, creerActif, creerPassif, ajouterValorisation, ErreurSaisie,
  validerEnveloppe, validerActif, validerPassif, validerValorisation, validerVersement, enregistrerVersement,
  validerAchat, enregistrerAchat, annulerAchat, lireAchats, validerLigneCotee, creerLigneCotee,
} from '../lib/referentiel.mjs';
import { calculerBilan } from '../lib/bilan.mjs';
import { validerObjectif, enregistrerObjectif, amorcerLignes, lireObjectif, lireCible, classerLigne, validerClasse } from '../lib/objectif.mjs';
import { etatDeLaPoche } from '../lib/poche.mjs';
import { aujourdhuiLocal } from '../lib/format.mjs';
import { creerRafraichisseur } from './cours.mjs';
import {
  lireFormulaireEnveloppe, lireFormulaireActif, lireFormulairePassif, lireFormulaireValorisation,
  lireFormulaireDepart, lireFormulaireVersement, lireFormulaireClasse, lireFormulaireAchat, lireFormulaireAjoutLigne, lireFormulaireAnnulation, lireFormulaireHypotheses, lireFormulaireConnexion,
} from './formulaires.mjs';
import { pageErreur, configurerGabarit } from './gabarit.mjs';
import { pageConnexion } from './pages-session.mjs';
import { creerSessions, verifierPhrase, lireCookie, enTeteCookie, enTeteCookieEffacement } from './session.mjs';
import { pageAccueil, pageDepart, pageAllocation, pageLignes, pageVersement, pageReglages } from './pages-poche.mjs';
import { pageBilan, pageEnveloppes, pageActifs, pagePassifs, pageValorisations } from './pages-details.mjs';
import { pageChoisirEtf } from './pages-choix.mjs';
import { creerFournisseur } from './explications.mjs';
import { chargerReferences, faitsPerimes } from '../lib/references.mjs';
import { classer, chargeUtileEtf, texteDeRepliEtf, messagesPourClaudeEtf, HYPOTHESES_NEUTRES } from '../lib/choix-etf.mjs';
import { empreinte } from '../lib/explication.mjs';
import { lireDate } from '../lib/saisie.mjs';

const DOSSIER_PUBLIC = join(RACINE_DEPOT, 'public');
const TYPES_STATIQUES = {
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
const LIMITE_CORPS_OCTETS = 64 * 1024;
// Chaque recherche de ligne part vers Yahoo : au plus RECHERCHES_PAR_MINUTE par source.
const RECHERCHES_PAR_MINUTE = 10;

// Referrer-Policy : surtout pas « no-referrer ». Avec elle, la norme Fetch
// fait envoyer « Origin: null » sur un POST de formulaire, et la garde
// Origin refuserait les propres formulaires de l'outil (revue du lot 0).
const ENTETES_SECURITE = {
  'Content-Security-Policy': "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Cache-Control': 'no-store',
};

// Chaque écran : la page (depuis le contexte de la requête), la lecture du
// formulaire, la validation du domaine, l'écriture, et où aller ensuite.
const ECRANS = {
  '/depart': {
    page: (ctx, options) => pageDepart({ objectif: ctx.objectif, enveloppes: ctx.etat.enveloppes }, options),
    lire: lireFormulaireDepart,
    valider: (d) => validerObjectif(d).motifs,
    // Une seule transaction : le point de départ et ses lignes amorcées,
    // ou rien. Rend les avertissements à montrer avant de continuer.
    ecrire: (base, d, ctx) => {
      base.exec('BEGIN');
      try {
        const avertissements = enregistrerObjectif(base, d);
        amorcerLignes(base, d, ctx.aujourdhui);
        base.exec('COMMIT');
        return avertissements;
      } catch (e) {
        base.exec('ROLLBACK');
        throw e;
      }
    },
    apres: '/',
  },
  '/versement': {
    page: (ctx, options) => pageMouvement(ctx, options),
    lire: lireFormulaireVersement,
    valider: validerVersement,
    ecrire: enregistrerVersement,
    apres: '/',
  },
  '/lignes': {
    page: (ctx, options) => pageLignes({ etat: ctx.etat, poche: ctx.poche }, options),
    lire: lireFormulaireClasse,
    valider: validerClasse,
    ecrire: (base, d) => classerLigne(base, d.actifId, d.classe, d.partActionsPb),
    apres: '/lignes',
  },
  '/lignes/ajouter': {
    page: (ctx, options) => pageLignes({ etat: ctx.etat, poche: ctx.poche }, options),
    lire: lireFormulaireAjoutLigne,
    valider: validerLigneCotee,
    // La ligne créée, ses cours arrivent en arrière-plan.
    ecrire: (base, d, ctx) => {
      const id = creerLigneCotee(base, d);
      ctx.rafraichisseur.rafraichirSiVieux([{ actifId: id, symboleCours: d.symbole }], { forcer: true });
    },
    apres: '/lignes',
  },
  '/achat': {
    page: (ctx, options) => pageMouvement(ctx, { ...options, formulaire: 'achat' }),
    lire: lireFormulaireAchat,
    valider: validerAchat,
    ecrire: enregistrerAchat,
    apres: '/',
  },
  '/achat/annuler': {
    page: (ctx, options) => pageMouvement(ctx, { ...options, formulaire: 'annulation' }),
    lire: lireFormulaireAnnulation,
    valider: () => [],
    ecrire: (base, d, ctx) => annulerAchat(base, d.transactionId, { date: ctx.aujourdhui }),
    apres: '/versement',
  },
  '/enveloppes': { page: (ctx, o) => pageEnveloppes(ctx.etat, o), lire: lireFormulaireEnveloppe, valider: validerEnveloppe, ecrire: creerEnveloppe, apres: '/enveloppes' },
  '/actifs': { page: (ctx, o) => pageActifs(ctx.etat, o), lire: lireFormulaireActif, valider: validerActif, ecrire: creerActif, apres: '/actifs' },
  '/passifs': { page: (ctx, o) => pagePassifs(ctx.etat, o), lire: lireFormulairePassif, valider: validerPassif, ecrire: creerPassif, apres: '/passifs' },
  '/valorisations': { page: (ctx, o) => pageValorisations(ctx.etat, o), lire: lireFormulaireValorisation, valider: validerValorisation, ecrire: ajouterValorisation, apres: '/valorisations' },
};

const pageMouvement = (ctx, options) => pageVersement({ poche: ctx.poche, aujourdhui: ctx.aujourdhui, achats: lireAchats(ctx.base) }, options);

/** Tout ce qu'une page peut avoir besoin de lire, calculé une fois par requête. */
function contexte(base, aujourdhui, cleClaude, rafraichisseur) {
  const etat = lireEtat(base);
  const objectif = lireObjectif(base);
  const cible = lireCible(base);
  const poche = etatDeLaPoche(etat, objectif, cible, aujourdhui);
  const etatCours = Object.fromEntries(poche.lignes.filter((l) => l.symboleCours).map((l) => [l.symboleCours, rafraichisseur.etat(l.symboleCours)]));
  return { base, etat, objectif, cible, poche, aujourdhui, cleClaude: Boolean(cleClaude()), rafraichisseur, etatCours };
}

function envoyer(res, statut, corps, entetes = {}) {
  res.writeHead(statut, { 'Content-Type': 'text/html; charset=utf-8', ...ENTETES_SECURITE, ...entetes });
  res.end(corps);
}

function lireCorps(req) {
  return new Promise((resoudre, rejeter) => {
    const morceaux = [];
    let taille = 0;
    const surDonnees = (m) => {
      taille += m.length;
      if (taille > LIMITE_CORPS_OCTETS) {
        // On cesse de garder le corps mais on le laisse s'écouler : détruire
        // la connexion ici empêcherait le client de recevoir le 413.
        req.off('data', surDonnees);
        req.resume();
        rejeter(Object.assign(new Error('corps trop volumineux'), { statut: 413 }));
        return;
      }
      morceaux.push(m);
    };
    req.on('data', surDonnees);
    req.on('end', () => resoudre(Buffer.concat(morceaux).toString('utf8')));
    req.on('error', rejeter);
  });
}

async function servirStatique(res, nom) {
  const ext = extname(nom);
  // À plat dans public/, ou dans public/fonts/ : rien d'autre.
  const valide = /^(fonts\/)?[a-z0-9][a-z0-9._-]*$/i.test(nom) && !nom.includes('..') && TYPES_STATIQUES[ext];
  if (!valide) return envoyer(res, 404, pageErreur('Introuvable', 'Cette page n\'existe pas.'));
  try {
    const contenu = await readFile(join(DOSSIER_PUBLIC, nom));
    res.writeHead(200, { 'Content-Type': TYPES_STATIQUES[ext], ...ENTETES_SECURITE });
    res.end(contenu);
  } catch {
    envoyer(res, 404, pageErreur('Introuvable', 'Cette page n\'existe pas.'));
  }
}

/**
 * Fenêtre glissante d'une minute par source : rend 0 si la requête passe,
 * sinon les millisecondes à attendre.
 */
function creerLimiteur({ parMinute, maintenant }) {
  const historique = new Map(); // source → horodatages de la dernière minute
  return (source) => {
    const t = maintenant();
    for (const [s, h] of historique) if (t - h.at(-1) >= 60_000) historique.delete(s);
    const recents = historique.get(source) ?? [];
    if (recents.length >= parMinute) return 60_000 - (t - recents[0]);
    recents.push(t);
    historique.set(source, recents);
    return 0;
  };
}

/** La source d'une requête : l'adresse que le relais transmet, sinon la prise. */
const sourceDe = (req) => (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress;
/** Un en-tête venu de l'extérieur, bon pour un journal : borné, sans caractère de contrôle. */
const sur = (t) => String(t ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 80);
const secondes = (ms) => String(Math.ceil(ms / 1000));
const PAGE_NUE = { nu: true };

/**
 * @param {{ base, hotesAutorises: () => string[], aujourdhui?: () => string }} options
 */
function creerGestionnaire({ base, hotesAutorises, aujourdhui = aujourdhuiLocal, fournisseur, fournisseurEtf, references, rafraichisseur, cleClaude = () => process.env.ANTHROPIC_API_KEY, public: modePublic = null, maintenant = () => Date.now(), journal = console.error }) {
  const ctxDe = () => contexte(base, aujourdhui(), cleClaude, rafraichisseur);
  const sessions = modePublic ? creerSessions({ secret: modePublic.secret, empreinte: modePublic.empreinte, maintenant }) : null;
  const attenteRecherche = creerLimiteur({ parMinute: RECHERCHES_PAR_MINUTE, maintenant });
  const schema = modePublic ? 'https' : 'http';
  configurerGabarit({ deconnexion: Boolean(modePublic) });

  /** Le relais doit dire HTTPS et porter l'identité Tailscale du seul utilisateur. Rend la page d'erreur, ou null. */
  function refusRelais(req) {
    if (req.headers['x-forwarded-proto'] !== 'https') return pageErreur('Relais sans HTTPS', 'Le mode public exige un relais HTTPS (tailscale serve --https).', PAGE_NUE);
    if (req.headers['tailscale-user-login'] !== modePublic.utilisateur) {
      journal(`[patrimoine] identité refusée depuis ${sur(sourceDe(req))}`);
      return pageErreur('Accès refusé', 'Cet outil n\'est pas le tien.', PAGE_NUE);
    }
    return null;
  }

  /** POST /connexion : la phrase, les essais par source et le plafond global, puis le cookie. */
  async function connexion(req, res, source) {
    const attente = sessions.attente(source);
    if (attente > 0) {
      await lireCorps(req);
      return envoyer(res, 429, pageConnexion({ attenteMinutes: Math.ceil(attente / 60_000) }), { 'Retry-After': secondes(attente) });
    }
    const { phrase } = lireFormulaireConnexion(Object.fromEntries(new URLSearchParams(await lireCorps(req))));
    if (!verifierPhrase(phrase, modePublic.empreinte)) {
      const bloque = sessions.echec(source);
      journal(`[patrimoine] phrase refusée depuis ${sur(source)}${bloque ? ' ; essais suspendus dix minutes' : ''}`);
      return envoyer(res, bloque ? 429 : 401, pageConnexion({ motifs: ['phrase refusée'], attenteMinutes: Math.ceil(bloque / 60_000) }), bloque ? { 'Retry-After': secondes(bloque) } : {});
    }
    sessions.reussite(source);
    res.writeHead(303, { Location: '/', 'Set-Cookie': enTeteCookie(sessions.emettre()), ...ENTETES_SECURITE });
    return res.end();
  }

  /**
   * La porte du mode public, avant toute route : relais et identité, puis une
   * session valide — sauf pour la page de connexion et les statiques. Rend
   * true si la réponse est déjà envoyée.
   */
  async function porte(req, res, chemin, hote) {
    const refus = refusRelais(req);
    if (refus) { envoyer(res, 403, refus); return true; }
    if (chemin.startsWith('/public/')) return false;
    // Connexion et déconnexion changent un état : comme toute écriture, elles
    // ne viennent que d'une page de l'outil (sinon une page tierce ouverte
    // dans le navigateur pourrait épuiser les essais et bloquer la porte).
    const ecriture = req.method === 'POST' && (chemin === '/connexion' || chemin === '/deconnexion');
    if (ecriture && req.headers.origin !== `https://${hote}`) {
      await lireCorps(req);
      envoyer(res, 403, pageErreur('Écriture refusée', 'Une saisie ne peut venir que d\'une page de ce serveur.', PAGE_NUE));
      return true;
    }
    const source = sourceDe(req);
    if (chemin === '/connexion') {
      if (req.method === 'POST') await connexion(req, res, source);
      else if (req.method === 'GET' || req.method === 'HEAD') envoyer(res, 200, pageConnexion({ attenteMinutes: Math.ceil(sessions.attente(source) / 60_000) }));
      else envoyer(res, 405, pageErreur('Méthode refusée', 'Seules la lecture et la saisie par formulaire sont permises.', PAGE_NUE), { Allow: 'GET, HEAD, POST' });
      return true;
    }
    const sansSession = !sessions.valider(lireCookie(req.headers.cookie));
    if (sansSession || chemin === '/deconnexion') {
      // Le corps est lu avant de répondre : sinon le client ne recevrait pas la redirection.
      if (req.method === 'POST') await lireCorps(req);
      const sortie = !sansSession && req.method === 'POST' ? { 'Set-Cookie': enTeteCookieEffacement() } : {};
      res.writeHead(303, { Location: '/connexion', ...sortie, ...ENTETES_SECURITE });
      res.end();
      return true;
    }
    return false;
  }

  return async (req, res) => {
    try {
      const hote = req.headers.host ?? '';
      if (!hotesAutorises().includes(hote)) {
        // Au premier déploiement, c'est ici qu'on voit si le relais garde l'en-tête Host.
        if (modePublic) journal(`[patrimoine] hôte refusé : ${sur(hote)}`);
        return envoyer(res, 403, pageErreur('Accès refusé', 'Cette adresse n\'est pas celle du serveur.', PAGE_NUE));
      }
      const url = new URL(req.url, `${schema}://${hote}`);
      const chemin = url.pathname;
      if (modePublic && (await porte(req, res, chemin, hote))) return;

      if (req.method === 'GET' || req.method === 'HEAD') {
        if (chemin.startsWith('/public/')) return await servirStatique(res, chemin.slice('/public/'.length));
        if (chemin === '/') {
          const ctx = ctxDe();
          rafraichisseur.rafraichirSiVieux(ctx.poche.lignes);
          const explication = ctx.poche.charge ? fournisseur.obtenir(ctx.poche.charge, ctx.poche.empreinte) : null;
          return envoyer(res, 200, pageAccueil({ poche: ctx.poche, explication, aujourdhui: ctx.aujourdhui, etatCours: ctx.etatCours }));
        }
        if (chemin === '/lignes' && url.searchParams.has('q')) {
          const attente = attenteRecherche(sourceDe(req));
          if (attente > 0) return envoyer(res, 429, pageErreur('Trop de recherches', `Au plus ${RECHERCHES_PAR_MINUTE} recherches par minute : chacune part vers la source de cours.`), { 'Retry-After': secondes(attente) });
          const ctx = ctxDe();
          const q = url.searchParams.get('q');
          const r = await rafraichisseur.chercher(q);
          const recherche = r.ok ? { q, resultats: r.valeur } : { q, resultats: [], motif: `recherche impossible : ${r.motif}` };
          return envoyer(res, 200, pageLignes({ etat: ctx.etat, poche: ctx.poche }, { recherche }));
        }
        if (chemin === '/bilan') {
          const demandee = url.searchParams.get('date');
          const date = demandee ? lireDate(demandee) : { ok: true, valeur: aujourdhui() };
          if (!date.ok) return envoyer(res, 400, pageErreur('Date invalide', date.motif));
          return envoyer(res, 200, pageBilan(calculerBilan(lireEtat(base), date.valeur)));
        }
        if (chemin === '/allocation') {
          const ctx = ctxDe();
          return envoyer(res, 200, pageAllocation({ poche: ctx.poche, cible: ctx.cible, enveloppes: ctx.etat.enveloppes }));
        }
        if (chemin === '/choisir/etf') {
          const objectif = lireObjectif(base);
          const champs = Object.fromEntries(url.searchParams);
          const { donnees, motifs } = lireFormulaireHypotheses(champs);
          const depart = objectif
            ? { versementCentimes: objectif.epargneMensuelleCentimes, horizonAnnees: objectif.horizonAnnees, rendementPb: objectif.rendementEstimePb }
            : HYPOTHESES_NEUTRES;
          const hypotheses = Object.fromEntries(Object.entries(depart).map(([k, v]) => [k, donnees[k] ?? v]));
          const classement = classer(references, hypotheses);
          const charge = chargeUtileEtf(references, classement, hypotheses);
          // Claude ne rédige que pour les hypothèses du point de départ : une
          // seule situation, un seul appel — jamais un appel par valeur tapée
          // dans l'adresse (revue sécurité du 2b).
          const modifiees = Object.values(donnees).some((v) => v != null);
          const explication = modifiees
            ? { texte: texteDeRepliEtf(charge), origine: 'repli', raison: 'hypotheses_modifiees' }
            : fournisseurEtf.obtenir(charge, empreinte(charge));
          const jour = aujourdhui();
          return envoyer(res, motifs.length ? 400 : 200, pageChoisirEtf({ references, classement, explication, hypotheses, perimes: faitsPerimes(references, jour), aujourdhui: jour }, { valeurs: champs, motifs }));
        }
        if (chemin === '/reglages') {
          const ctx = ctxDe();
          return envoyer(res, 200, pageReglages({ objectif: ctx.objectif, cible: ctx.cible, cleClaude: ctx.cleClaude }));
        }
        if (ECRANS[chemin]) return envoyer(res, 200, ECRANS[chemin].page(ctxDe()));
        return envoyer(res, 404, pageErreur('Introuvable', 'Cette page n\'existe pas.'));
      }

      if (req.method === 'POST') {
        if (req.headers.origin !== `${schema}://${hote}`) {
          return envoyer(res, 403, pageErreur('Écriture refusée', 'Une saisie ne peut venir que d\'une page de ce serveur.'));
        }
        if (chemin === '/cours/actualiser') {
          await lireCorps(req);
          rafraichisseur.rafraichirSiVieux(ctxDe().poche.lignes, { forcer: true });
          res.writeHead(303, { Location: '/', ...ENTETES_SECURITE });
          return res.end();
        }
        const ecran = ECRANS[chemin];
        if (!ecran) return envoyer(res, 404, pageErreur('Introuvable', 'Cette page n\'existe pas.'));
        const champs = Object.fromEntries(new URLSearchParams(await lireCorps(req)));
        const { donnees, motifs } = ecran.lire(champs);
        const ctx = ctxDe();
        try {
          // La validation du domaine joue TOUJOURS, et ses motifs s'ajoutent
          // à ceux de la lecture : on montre tout en une fois.
          const tous = [...new Set([...motifs, ...ecran.valider(donnees)])];
          if (tous.length) throw new ErreurSaisie(tous);
          const avertissements = ecran.ecrire(base, donnees, ctx);
          if (Array.isArray(avertissements) && avertissements.length) {
            // Enregistré, mais quelque chose mérite d'être lu avant de continuer.
            return envoyer(res, 200, ecran.page(ctxDe(), { valeurs: champs, avertissements, enregistre: true }));
          }
        } catch (erreur) {
          if (!(erreur instanceof ErreurSaisie)) throw erreur;
          return envoyer(res, 400, ecran.page(ctx, { valeurs: champs, motifs: erreur.motifs }));
        }
        res.writeHead(303, { Location: ecran.apres, ...ENTETES_SECURITE });
        return res.end();
      }

      return envoyer(res, 405, pageErreur('Méthode refusée', 'Seules la lecture et la saisie par formulaire sont permises.'), { Allow: 'GET, HEAD, POST' });
    } catch (erreur) {
      if (erreur.statut === 413) return envoyer(res, 413, pageErreur('Saisie trop longue', 'Le formulaire dépasse la taille permise.'), { Connection: 'close' });
      console.error(`[patrimoine] ${req.method} ${req.url} : ${erreur.stack ?? erreur}`);
      return envoyer(res, 500, pageErreur('Erreur interne', 'L\'opération a échoué ; rien n\'a été enregistré. Le détail est dans le terminal du serveur.'));
    }
  };
}

/** Démarre le serveur, uniquement sur 127.0.0.1. `port: 0` choisit un port libre (tests). */
export function demarrerServeur({ base, port, aujourdhui, cleClaude = () => process.env.ANTHROPIC_API_KEY, rediger, fetchCours, references = chargerReferences(), public: modePublic = null, maintenant, journal }) {
  return new Promise((resoudre, rejeter) => {
    const serveur = createServer();
    // En mode public, seul l'hôte déclaré est admis : le relais seul y mène.
    const hotesAutorises = () => {
      if (modePublic) return [modePublic.hote];
      const p = serveur.address().port;
      return [`${HOTE}:${p}`, `localhost:${p}`];
    };
    const fournisseur = creerFournisseur({ base, cle: cleClaude, rediger });
    const fournisseurEtf = creerFournisseur({ base, cle: cleClaude, rediger, sujet: 'etf', repli: texteDeRepliEtf, messages: messagesPourClaudeEtf });
    const rafraichisseur = creerRafraichisseur({ base, ...(fetchCours ? { fetchImpl: fetchCours } : {}) });
    serveur.on('request', creerGestionnaire({ base, hotesAutorises, aujourdhui, fournisseur, fournisseurEtf, references, rafraichisseur, cleClaude, public: modePublic, maintenant, journal }));
    serveur.once('error', rejeter);
    serveur.listen(port, HOTE, () => resoudre(serveur));
  });
}
