// Gabarit et aides communes des pages HTML rendues côté serveur. Tout texte
// venant de la base ou d'une saisie passe par echapper() : un libellé ne
// devient jamais du HTML.

import { LIBELLES_CLASSE } from '../lib/allocation.mjs';

export function echapper(valeur) {
  return String(valeur ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export const dateFr = (iso) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');

export const LIBELLES_TYPE = {
  immobilier_direct: 'Immobilier en direct', pee: 'PEE', per: 'PER', pea: 'PEA', cto: 'Compte-titres',
  av: 'Assurance-vie', livret: 'Livret', compte_courant: 'Compte courant', societe: 'Parts de société',
};
export const LIBELLES_NATURE = {
  bien: 'Bien immobilier', fcpe: 'FCPE / épargne salariale', etf: 'ETF', action: 'Action', parts: 'Parts', liquidites: 'Liquidités',
};
export const LIBELLES_PASSIF = { amortissable: 'Amortissable', in_fine: 'In fine' };
export const LIBELLES_CLASSE_LIGNE = { ...LIBELLES_CLASSE, mixte: 'Mixte' };
export const NOM_ENVELOPPE_A_OUVRIR = { pea: 'un PEA', av: 'une assurance-vie' };

export const quotePart = (qp) => (qp.num === qp.den ? '100 %' : `${qp.num}/${qp.den}`);
export const tag = (classe, texte) => `<span class="tag ${classe}">${echapper(texte)}</span>`;
export const tagStatut = (statut) => (statut === 'fait' ? tag('fait', 'fait') : tag('estim', 'estimation'));
const age = (jours) => (jours === 0 ? 'du jour' : `il y a ${jours} j`);
export const dateEtAge = (v) => `${echapper(v.date)}, ${age(v.ageJours)}`;

export function options(valeurs, libelles, choisie) {
  return valeurs
    .map((v) => `<option value="${echapper(v)}"${v === choisie ? ' selected' : ''}>${echapper(libelles?.[v] ?? v)}</option>`)
    .join('');
}

const NAV = [['/', 'Ma poche'], ['/allocation', 'Allocation'], ['/lignes', 'Lignes'], ['/versement', 'Mouvement'], ['/choisir/etf', 'Choisir mon ETF'], ['/reglages', 'Réglages']];
const NAV_DETAILS = [['/bilan', 'Bilan complet'], ['/enveloppes', 'Enveloppes'], ['/actifs', 'Actifs'], ['/passifs', 'Crédits'], ['/valorisations', 'Valorisations']];

let deconnexion = false;
/** En mode public, chaque page porte le bouton de déconnexion. */
export function configurerGabarit({ deconnexion: d }) { deconnexion = d; }

export function gabarit(titre, actif, contenu, { details = false, nu = false } = {}) {
  const lien = ([href, nom]) => `<a href="${href}"${actif === href ? ' aria-current="page"' : ''}>${nom}</a>`;
  const nav = nu ? [] : details ? [...NAV, ...NAV_DETAILS] : NAV;
  const sortie = deconnexion && !nu ? '<form method="post" action="/deconnexion" class="deconnexion"><button class="discret">Déconnexion</button></form>' : '';
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${echapper(titre)} · Patrimoine</title>
<link rel="stylesheet" href="/public/style.css">
</head>
<body>
<header class="entete">
  <span class="marque">Patrimoine</span>
  <nav>${nav.map(lien).join('')}${sortie}</nav>
</header>
<main>
${contenu}
</main>
</body>
</html>`;
}

export function blocErreurs(motifs) {
  if (!motifs?.length) return '';
  return `<div class="erreurs" role="alert"><strong>Saisie refusée :</strong><ul>${motifs.map((m) => `<li>${echapper(m)}</li>`).join('')}</ul></div>`;
}

export function blocAvertissements(titre, items) {
  if (!items?.length) return '';
  return `<section class="avertissements"><h2>${echapper(titre)}</h2><ul>${items.map((m) => `<li>${echapper(m)}</li>`).join('')}</ul></section>`;
}

export const champ = (nom, libelle, valeurs, { type = 'text', aide = '', requis = false, question = false } = {}) =>
  `<label><span${question ? ' class="question"' : ''}>${libelle}${requis ? ' *' : ''}</span><input type="${type}" name="${nom}" id="${nom}" value="${echapper(valeurs?.[nom])}"${requis ? ' required' : ''}>${aide ? `<small>${aide}</small>` : ''}</label>`;

export const choix = (nom, libelle, contenu, { aide = '' } = {}) => `<label>${libelle}<select name="${nom}" id="${nom}">${contenu}</select>${aide ? `<small>${aide}</small>` : ''}</label>`;

export const case_ = (nom, libelle, valeurs) =>
  `<label class="case"><input type="checkbox" name="${nom}" id="${nom}" value="oui"${valeurs?.[nom] === 'oui' ? ' checked' : ''}> ${libelle}</label>`;

/** `nu` : avant la porte, ni navigation ni retour — on ne montre rien de l'outil. */
export function pageErreur(titre, message, { nu = false } = {}) {
  return gabarit(titre, '', `<h1>${echapper(titre)}</h1><p>${echapper(message)}</p>${nu ? '' : '<p><a href="/">Retour à ma poche</a></p>'}`, { nu });
}

