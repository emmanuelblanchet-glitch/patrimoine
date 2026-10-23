// Collecteur Yahoo Finance — la seule source de cours du lot 2 (L2-1).
//
// Isolé des moteurs : une source qui casse ne casse pas un calcul. Les
// deux parseurs sont purs et testés sur des fixtures ; les deux lectures
// réseau n'émettent que des GET, et seul le symbole ou le code part (S10).
// Non officiel : peut casser sans préavis ; on refuse tout ce qui n'a pas
// la forme attendue plutôt que d'enregistrer une valeur douteuse.

import { SYMBOLE_VALIDE } from '../lib/saisie.mjs';

const UA = 'Mozilla/5.0 (compatible; patrimoine-local)';
const DELAI_MS = 15_000;
const PERIODE = '1mo';
export const SOURCE = 'Yahoo Finance';

/** Un texte venu de la source, bon pour un journal : borné, sans caractère de contrôle. */
const sur = (t) => String(t ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 120);

/** Date civile (AAAA-MM-JJ) d'un horodatage Unix, dans le fuseau de la place de cotation. */
function dateDePlace(secondes, decalageSecondes) {
  return new Date((secondes + decalageSecondes) * 1000).toISOString().slice(0, 10);
}

/**
 * Pure : la réponse « chart » → { symbole, nom, devise, cours: [{ date, centimes }] }.
 * @returns {{ ok: true, valeur } | { ok: false, motif: string }}
 */
export function lireCours(json) {
  const chart = json?.chart;
  if (!chart) return { ok: false, motif: 'réponse sans « chart »' };
  if (chart.error) return { ok: false, motif: `erreur de la source : ${sur(chart.error.description ?? chart.error.code ?? 'inconnue')}` };
  const r = chart.result?.[0];
  if (!r?.meta?.symbol) return { ok: false, motif: 'réponse sans résultat' };
  const decalage = Number.isFinite(r.meta.gmtoffset) ? r.meta.gmtoffset : 0;
  const horodatages = r.timestamp ?? [];
  const clotures = r.indicators?.quote?.[0]?.close ?? [];
  // Le dernier point d'une séance en cours n'est pas une clôture : c'est le
  // prix du moment. On ne garde que les séances terminées (revue du lot 2).
  const seance = r.meta.currentTradingPeriod?.regular;
  const enSeance = (t) => seance && typeof seance.start === 'number' && typeof seance.end === 'number' && t >= seance.start && t < seance.end;
  const cours = [];
  for (let i = 0; i < horodatages.length; i++) {
    const c = clotures[i];
    if (typeof c !== 'number' || !Number.isFinite(c) || c <= 0) continue; // jour sans cotation, ou valeur douteuse
    if (enSeance(horodatages[i])) continue;
    cours.push({ date: dateDePlace(horodatages[i], decalage), centimes: Math.round(c * 100) });
  }
  if (cours.length === 0) return { ok: false, motif: 'aucun cours exploitable dans la réponse' };
  return {
    ok: true,
    valeur: { symbole: r.meta.symbol, nom: r.meta.longName ?? r.meta.shortName ?? null, devise: r.meta.currency ?? null, cours },
  };
}

/**
 * Pure : la réponse « search » → candidats cotés [{ symbole, nom, place, type }].
 * Ne garde que les ETF et actions ; écarte les doublons de symbole.
 */
export function lireRecherche(json) {
  const quotes = Array.isArray(json?.quotes) ? json.quotes : [];
  const vus = new Set();
  const candidats = [];
  for (const q of quotes) {
    if (typeof q?.symbol !== 'string' || !q.symbol) continue;
    if (!['ETF', 'EQUITY'].includes(q.quoteType)) continue;
    if (vus.has(q.symbol)) continue;
    vus.add(q.symbol);
    candidats.push({ symbole: q.symbol, nom: q.longname ?? q.shortname ?? q.symbol, place: q.exchange ?? null, type: q.quoteType === 'ETF' ? 'etf' : 'action' });
  }
  return candidats;
}

async function lireJson(url, fetchImpl) {
  let reponse;
  try {
    reponse = await fetchImpl(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(DELAI_MS) });
  } catch (e) {
    return { ok: false, motif: e.name === 'TimeoutError' ? 'délai dépassé' : 'réseau injoignable' };
  }
  if (!reponse.ok) return { ok: false, motif: `http_${reponse.status}` };
  try {
    return { ok: true, json: await reponse.json() };
  } catch {
    return { ok: false, motif: 'réponse illisible' };
  }
}

/** GET des cours d'un symbole sur un mois, pas quotidien. */
export async function recupererCours(symbole, { fetchImpl = fetch } = {}) {
  if (!SYMBOLE_VALIDE.test(symbole)) return { ok: false, motif: `symbole illisible : « ${sur(symbole)} »` };
  const r = await lireJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbole)}?range=${PERIODE}&interval=1d`, fetchImpl);
  return r.ok ? lireCours(r.json) : r;
}

/** GET de la recherche d'un code ISIN ou d'un symbole. */
export async function chercher(texte, { fetchImpl = fetch } = {}) {
  const q = String(texte ?? '').trim();
  if (!/^[A-Za-z0-9.\-^ ]{2,40}$/.test(q)) return { ok: false, motif: 'tape un code ISIN ou un symbole (lettres et chiffres)' };
  const r = await lireJson(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`, fetchImpl);
  return r.ok ? { ok: true, valeur: lireRecherche(r.json) } : r;
}
