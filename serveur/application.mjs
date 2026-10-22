// Routeur HTTP du serveur local — Node `http` natif, sans framework.
//
// Gardes, dans l'ordre, sur chaque requête :
// 1. l'en-tête Host doit être l'adresse locale du serveur (403 sinon) :
//    bloque le rebond DNS d'une page tierce vers 127.0.0.1 ;
// 2. une écriture (POST) doit venir d'une page du serveur lui-même : son
//    en-tête Origin doit être exactement http://<Host> (403 sinon). Un
//    formulaire posté depuis un autre site porte l'Origin de ce site ;
// 3. les fichiers statiques ne sortent que de public/, à plat, avec une
//    extension allowlistée (404 sinon).

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { HOTE, RACINE_DEPOT } from './config.mjs';
import {
  lireEtat, creerEnveloppe, creerActif, creerPassif, ajouterValorisation, ErreurSaisie,
  validerEnveloppe, validerActif, validerPassif, validerValorisation,
} from '../lib/referentiel.mjs';
import { calculerBilan } from '../lib/bilan.mjs';
import { lireDate } from '../lib/saisie.mjs';
import { lireFormulaireEnveloppe, lireFormulaireActif, lireFormulairePassif, lireFormulaireValorisation } from './formulaires.mjs';
import { pageBilan, pageEnveloppes, pageActifs, pagePassifs, pageValorisations, pageErreur } from './pages.mjs';

const DOSSIER_PUBLIC = join(RACINE_DEPOT, 'public');
const TYPES_STATIQUES = {
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
const LIMITE_CORPS_OCTETS = 64 * 1024;

// Referrer-Policy : surtout pas « no-referrer ». Avec elle, la norme Fetch
// fait envoyer « Origin: null » sur un POST de formulaire, et la garde
// Origin refuserait les propres formulaires de l'outil (revue du lot 0).
const ENTETES_SECURITE = {
  'Content-Security-Policy': "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Cache-Control': 'no-store',
};

const ECRANS = {
  '/enveloppes': { page: pageEnveloppes, lire: lireFormulaireEnveloppe, valider: validerEnveloppe, ecrire: creerEnveloppe },
  '/actifs': { page: pageActifs, lire: lireFormulaireActif, valider: validerActif, ecrire: creerActif },
  '/passifs': { page: pagePassifs, lire: lireFormulairePassif, valider: validerPassif, ecrire: creerPassif },
  '/valorisations': { page: pageValorisations, lire: lireFormulaireValorisation, valider: validerValorisation, ecrire: ajouterValorisation },
};

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
  const valide = /^[a-z0-9][a-z0-9._-]*$/i.test(nom) && !nom.includes('..') && TYPES_STATIQUES[ext];
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
 * @param {{ base, hotesAutorises: () => string[], aujourdhui?: () => string }} options
 */
function creerGestionnaire({ base, hotesAutorises, aujourdhui = () => new Date().toISOString().slice(0, 10) }) {
  return async (req, res) => {
    try {
      const hote = req.headers.host ?? '';
      if (!hotesAutorises().includes(hote)) {
        return envoyer(res, 403, pageErreur('Accès refusé', 'Cette adresse n\'est pas celle du serveur local.'));
      }
      const url = new URL(req.url, `http://${hote}`);
      const chemin = url.pathname;

      if (req.method === 'GET' || req.method === 'HEAD') {
        if (chemin.startsWith('/public/')) return await servirStatique(res, chemin.slice('/public/'.length));
        if (chemin === '/') {
          const demandee = url.searchParams.get('date');
          const date = demandee ? lireDate(demandee) : { ok: true, valeur: aujourdhui() };
          if (!date.ok) return envoyer(res, 400, pageErreur('Date invalide', date.motif));
          return envoyer(res, 200, pageBilan(calculerBilan(lireEtat(base), date.valeur)));
        }
        if (ECRANS[chemin]) return envoyer(res, 200, ECRANS[chemin].page(lireEtat(base)));
        return envoyer(res, 404, pageErreur('Introuvable', 'Cette page n\'existe pas.'));
      }

      if (req.method === 'POST') {
        if (req.headers.origin !== `http://${hote}`) {
          return envoyer(res, 403, pageErreur('Écriture refusée', 'Une saisie ne peut venir que d\'une page de ce serveur.'));
        }
        const ecran = ECRANS[chemin];
        if (!ecran) return envoyer(res, 404, pageErreur('Introuvable', 'Cette page n\'existe pas.'));
        const champs = Object.fromEntries(new URLSearchParams(await lireCorps(req)));
        const { donnees, motifs } = ecran.lire(champs);
        try {
          // Un champ illisible ne doit pas cacher les autres erreurs : on
          // montre en une fois ce que la lecture ET le domaine reprochent.
          if (motifs.length) throw new ErreurSaisie([...new Set([...motifs, ...ecran.valider(donnees)])]);
          ecran.ecrire(base, donnees);
        } catch (erreur) {
          if (!(erreur instanceof ErreurSaisie)) throw erreur;
          return envoyer(res, 400, ecran.page(lireEtat(base), { valeurs: champs, motifs: erreur.motifs }));
        }
        res.writeHead(303, { Location: chemin, ...ENTETES_SECURITE });
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
export function demarrerServeur({ base, port, aujourdhui }) {
  return new Promise((resoudre, rejeter) => {
    const serveur = createServer();
    const hotesAutorises = () => {
      const p = serveur.address().port;
      return [`${HOTE}:${p}`, `localhost:${p}`];
    };
    serveur.on('request', creerGestionnaire({ base, hotesAutorises, aujourdhui }));
    serveur.once('error', rejeter);
    serveur.listen(port, HOTE, () => resoudre(serveur));
  });
}
