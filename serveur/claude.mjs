// Appel à l'API Messages d'Anthropic — HTTP brut par `fetch` natif, sans
// SDK (ADR-0001, zéro dépendance). Une seule fonction, une seule promesse,
// jamais sur le chemin du rendu des chiffres (seam S-L1-4).
//
// La clé vient de l'environnement du serveur (`ANTHROPIC_API_KEY`), jamais
// du dépôt. Sans clé, on rend { ok: false, raison: 'sans_cle' } sans appel.
// Une clé créée au niveau de l'organisation (non rattachée à un espace de
// travail) exige l'en-tête `anthropic-workspace-id` : `ANTHROPIC_WORKSPACE_ID`
// le fournit (recette du 23/10/2026 : 400 « not scoped to a workspace »).

import { messagesPourClaude } from '../lib/explication.mjs';

const MODELE = 'claude-opus-5-5';
const URL_MESSAGES = 'https://api.anthropic.com/v1/messages';
const DELAI_MS = 45_000;

/**
 * @param {object} charge  la charge utile minimale (lib/explication.mjs)
 * @param {{ cle?: string, workspaceId?: string, fetchImpl?: typeof fetch, modele?: string, messages?: (charge) => { system: string, user: string } }} options
 * @returns {Promise<{ ok: true, texte: string, modele: string } | { ok: false, raison: string }>}
 */
export async function redigerExplication(charge, { cle = process.env.ANTHROPIC_API_KEY, workspaceId = process.env.ANTHROPIC_WORKSPACE_ID, fetchImpl = fetch, modele = MODELE, messages = messagesPourClaude } = {}) {
  if (!cle) return { ok: false, raison: 'sans_cle' };
  const { system, user } = messages(charge);
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
        ...(workspaceId ? { 'anthropic-workspace-id': workspaceId } : {}),
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
