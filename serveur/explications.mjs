// Fournit le texte d'argumentation d'une situation (seams S-L1-4, S-L1-5) :
// le cache d'abord ; sinon le texte de repli tout de suite, et l'appel à
// Claude part en arrière-plan pour la prochaine fois. L'appel n'est jamais
// sur le chemin du rendu.

import { texteDeRepli } from '../lib/explication.mjs';
import { redigerExplication } from './claude.mjs';

export function creerFournisseur({ base, cle = () => process.env.ANTHROPIC_API_KEY, rediger = redigerExplication, journal = console.error }) {
  const enCours = new Map(); // empreinte → promesse (un seul appel par situation)
  const dernieresRaisons = new Map();

  function lireCache(empreinte) {
    return base.prepare('SELECT texte, origine, modele, cree_le FROM explication WHERE empreinte = ?').get(empreinte) ?? null;
  }

  function lancer(empreinte, charge) {
    if (enCours.has(empreinte)) return enCours.get(empreinte);
    const p = rediger(charge, { cle: cle() })
      .then((r) => {
        if (r.ok) {
          base.prepare('INSERT OR REPLACE INTO explication (empreinte, texte, origine, modele, cree_le) VALUES (?, ?, ?, ?, ?)')
            .run(empreinte, r.texte, 'claude', r.modele, new Date().toISOString());
          dernieresRaisons.delete(empreinte);
        } else {
          dernieresRaisons.set(empreinte, r.raison);
          if (r.raison !== 'sans_cle') journal(`[patrimoine] explication non rédigée : ${r.raison}`);
        }
        return r;
      })
      .catch((e) => {
        dernieresRaisons.set(empreinte, 'erreur');
        journal(`[patrimoine] explication : ${e.message}`);
        return { ok: false, raison: 'erreur' };
      })
      .finally(() => enCours.delete(empreinte));
    enCours.set(empreinte, p);
    return p;
  }

  return {
    /** Synchrone : rend un texte tout de suite, lance l'appel si besoin. */
    obtenir(charge, empreinte) {
      const cache = lireCache(empreinte);
      if (cache) return { texte: cache.texte, origine: 'claude', modele: cache.modele, date: cache.cree_le, enCours: false };
      const aUneCle = Boolean(cle());
      if (aUneCle) lancer(empreinte, charge);
      return {
        texte: texteDeRepli(charge),
        origine: 'repli',
        enCours: aUneCle && enCours.has(empreinte),
        raison: aUneCle ? dernieresRaisons.get(empreinte) ?? null : 'sans_cle',
      };
    },
    /** Pour les tests : attendre la fin d'un appel en cours. */
    attendre(empreinte) {
      return enCours.get(empreinte) ?? Promise.resolve(null);
    },
  };
}
