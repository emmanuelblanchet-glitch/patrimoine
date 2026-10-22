// Appel à l'API Messages d'Anthropic — HTTP brut par `fetch` natif, sans
// SDK (ADR-0001, zéro dépendance). Une seule fonction, une seule promesse,
// jamais sur le chemin du rendu des chiffres (seam S-L1-4).
//
// La clé vient de l'environnement du serveur (`ANTHROPIC_API_KEY`), jamais
// du dépôt. Sans clé, on rend { ok: false, raison: 'sans_cle' } sans appel.

import { messagesPourClaude } from '../lib/explication.mjs';

export const MODELE = 'claude-opus-5-5';
const URL_MESSAGES = 'https://api.anthropic.com/v1/messages';
const DELAI_MS = 45_000;

/**
 * @param {object} charge  la charge utile minimale (lib/explication.mjs)
 * @param {{ cle?: string, fetchImpl?: typeof fetch, modele?: string }} options
 * @returns {Promise<{ ok: true, texte: string, modele: string } | { ok: false, raison: string }>}
 */
export async function redigerExplication(charge, { cle = process.env.ANTHROPIC_API_KEY, fetchImpl = fetch, modele = MODELE } = {}) {
  if (!cle) return { ok: false, raison: 'sans_cle' };
  const { system, user } = messagesPourClaude(charge);
  const corps = {
    model: modele,
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { effort: 'low' },
    // Sécurité côté serveur : si un classifieur refuse, Anthropic bascule
    // sur un modèle de repli plutôt que de rendre un refus.
    fallbacks: 'default',
  };

  let reponse;
  try {
    reponse = await fetchImpl(URL_MESSAGES, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cle,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
      },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(DELAI_MS),
    });
  } catch (erreur) {
    return { ok: false, raison: erreur.name === 'TimeoutError' ? 'delai' : 'reseau' };
  }

  if (!reponse.ok) {
    // 429 et 5xx sont transitoires ; 401/403 disent que la clé est en cause.
    const raison = reponse.status === 401 || reponse.status === 403 ? 'cle_refusee'
      : reponse.status === 429 || reponse.status >= 500 ? 'transitoire'
        : `http_${reponse.status}`;
    return { ok: false, raison };
  }

  let message;
  try {
    message = await reponse.json();
  } catch {
    return { ok: false, raison: 'reponse_illisible' };
  }
  if (message.stop_reason === 'refusal') return { ok: false, raison: 'refus' };
  const texte = (message.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  if (!texte) return { ok: false, raison: 'vide' };
  return { ok: true, texte, modele: message.model ?? modele };
}
