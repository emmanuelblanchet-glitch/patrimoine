// Rafraîchissement des cours en arrière-plan (lot 2, L2-1) : jamais sur le
// chemin du rendu, un seul appel en vol par symbole, recul d'une heure après
// un échec. Le collecteur Yahoo ne fait que des GET avec le symbole (S10).

import { recupererCours, chercher, SOURCE } from '../collecteurs/yahoo.mjs';
import { enregistrerCours } from '../lib/cours.mjs';

export const AGE_MAX_MS = 20 * 60 * 60 * 1000;
export const RECUL_MS = 60 * 60 * 1000;

export function creerRafraichisseur({ base, fetchImpl = fetch, journal = console.error, maintenant = () => Date.now() }) {
  const enVol = new Set();
  const echecs = new Map(); // symbole → { motif, prochainEssai }

  function lancer(ligne) {
    enVol.add(ligne.symboleCours);
    recupererCours(ligne.symboleCours, { fetchImpl })
      .then((r) => {
        if (!r.ok) {
          echecs.set(ligne.symboleCours, { motif: r.motif, prochainEssai: maintenant() + RECUL_MS });
          journal(`[patrimoine] cours ${ligne.symboleCours} : ${r.motif}`);
          return;
        }
        enregistrerCours(base, ligne.actifId, r.valeur.cours, { source: SOURCE, releveLe: new Date(maintenant()).toISOString() });
        echecs.delete(ligne.symboleCours);
      })
      .catch((e) => {
        echecs.set(ligne.symboleCours, { motif: 'erreur', prochainEssai: maintenant() + RECUL_MS });
        journal(`[patrimoine] cours ${ligne.symboleCours} : ${e.message}`);
      })
      .finally(() => enVol.delete(ligne.symboleCours));
  }

  const estVieux = (ligne) => !ligne.cours || maintenant() - Date.parse(ligne.cours.releveLe) > AGE_MAX_MS;
  const enRecul = (symbole) => { const e = echecs.get(symbole); return Boolean(e) && maintenant() < e.prochainEssai; };

  return {
    /** Lance, sans attendre, le rafraîchissement des lignes cotées dont le cours est vieux. */
    rafraichirSiVieux(lignes, { forcer = false } = {}) {
      let lances = 0;
      for (const l of lignes) {
        if (!l.symboleCours || enVol.has(l.symboleCours)) continue;
        if (!forcer && (!estVieux(l) || enRecul(l.symboleCours))) continue;
        lancer(l);
        lances++;
      }
      return lances;
    },
    /** Ce que la page peut dire de chaque symbole. */
    etat(symbole) {
      return { enVol: enVol.has(symbole), echec: echecs.get(symbole)?.motif ?? null };
    },
    /** Recherche synchrone pour l'utilisateur (page Lignes) : on attend la réponse. */
    chercher(texte) {
      return chercher(texte, { fetchImpl });
    },
  };
}
