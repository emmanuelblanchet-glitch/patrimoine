// Fournit le texte d'explication d'une situation (seams S-L1-4, S-L1-5) :
// le cache d'abord ; sinon le texte de repli tout de suite, et l'appel à
// Claude part en arrière-plan pour la prochaine fois. L'appel n'est jamais
// sur le chemin du rendu.
//
// Deux bornes de coût (revue sécurité du lot 1) : un seul appel en vol par
// situation, et après un échec, pas de nouvel essai avant RECUL_MS — sinon
// chaque chargement de page refacturerait un appel qui échoue.

import { texteDeRepli, messagesPourClaude } from '../lib/explication.mjs';
import { redigerExplication } from './claude.mjs';

export const RECUL_MS = 10 * 60 * 1000;

/** `sujet` sépare les caches (poche, etf) ; `repli` et `messages` sont ceux du sujet. */
export function creerFournisseur({ base, cle = () => process.env.ANTHROPIC_API_KEY, rediger = redigerExplication, journal = console.error, maintenant = () => Date.now(), sujet = 'poche', repli = texteDeRepli, messages = messagesPourClaude }) {
  const enCours = new Set();
  const echecs = new Map(); // empreinte → { raison, prochainEssai }

  function lancer(empreinte, charge) {
    enCours.add(empreinte);
    rediger(charge, { cle: cle(), messages })
      .then((r) => {
        if (r.ok) {
          // Une seule situation en cache : les textes passés contiennent des
          // montants et n'ont plus d'usage (données au repos minimisées).
          base.exec('BEGIN');
          try {
            base.prepare('DELETE FROM explication WHERE sujet = ? AND empreinte <> ?').run(sujet, empreinte);
            base.prepare('INSERT OR REPLACE INTO explication (empreinte, texte, origine, modele, cree_le, sujet) VALUES (?, ?, ?, ?, ?, ?)')
              .run(empreinte, r.texte, 'claude', r.modele, new Date(maintenant()).toISOString(), sujet);
            base.exec('COMMIT');
          } catch (e) {
            base.exec('ROLLBACK');
            throw e;
          }
          echecs.delete(empreinte);
        } else {
          echecs.set(empreinte, { raison: r.raison, prochainEssai: maintenant() + RECUL_MS });
          journal(`[patrimoine] explication non rédigée : ${r.raison}`);
        }
      })
      .catch((e) => {
        echecs.set(empreinte, { raison: 'erreur', prochainEssai: maintenant() + RECUL_MS });
        journal(`[patrimoine] explication : ${e.message}`);
      })
      .finally(() => enCours.delete(empreinte));
  }

  return {
    /** Synchrone : rend un texte tout de suite, lance l'appel si c'est permis. */
    obtenir(charge, empreinte) {
      const cache = base.prepare('SELECT texte, modele, cree_le FROM explication WHERE empreinte = ? AND sujet = ?').get(empreinte, sujet);
      if (cache) return { texte: cache.texte, origine: 'claude', modele: cache.modele, date: cache.cree_le, enCours: false };
      if (!cle()) return { texte: repli(charge), origine: 'repli', enCours: false, raison: 'sans_cle' };
      const echec = echecs.get(empreinte);
      const enRecul = Boolean(echec) && maintenant() < echec.prochainEssai;
      if (!enCours.has(empreinte) && !enRecul) lancer(empreinte, charge);
      return { texte: repli(charge), origine: 'repli', enCours: enCours.has(empreinte), raison: echec?.raison ?? null, enRecul };
    },
  };
}
