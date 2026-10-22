// Pages HTML rendues côté serveur. Tout texte venant de la base ou d'une
// saisie passe par echapper() : un libellé ne devient jamais du HTML.

import { TYPES_ENVELOPPE, NATURES_ACTIF, TYPES_PASSIF, STATUTS } from '../lib/referentiel.mjs';

function echapper(valeur) {
  return String(valeur ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const FORMAT_EUROS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const euros = (centimes) => (centimes == null ? '—' : FORMAT_EUROS.format(centimes / 100));

const LIBELLES_TYPE = {
  immobilier_direct: 'Immobilier en direct', pee: 'PEE', per: 'PER', pea: 'PEA', cto: 'Compte-titres',
  av: 'Assurance-vie', livret: 'Livret', compte_courant: 'Compte courant', societe: 'Parts de société',
};
const LIBELLES_NATURE = {
  bien: 'Bien immobilier', fcpe: 'FCPE / épargne salariale', etf: 'ETF', action: 'Action', parts: 'Parts', liquidites: 'Liquidités',
};
const LIBELLES_PASSIF = { amortissable: 'Amortissable', in_fine: 'In fine' };

const quotePart = (qp) => (qp.num === qp.den ? '100 %' : `${qp.num}/${qp.den}`);
const pastille = (statut) => `<span class="pastille ${statut === 'fait' ? 'fait' : 'estim'}">${statut === 'fait' ? 'fait' : 'estimation'}</span>`;

function options(valeurs, libelles, choisie) {
  return valeurs
    .map((v) => `<option value="${echapper(v)}"${v === choisie ? ' selected' : ''}>${echapper(libelles?.[v] ?? v)}</option>`)
    .join('');
}

function gabarit(titre, actif, contenu) {
  const lien = (href, nom) => `<a href="${href}"${actif === href ? ' aria-current="page"' : ''}>${nom}</a>`;
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
  <nav>${lien('/', 'Bilan')}${lien('/enveloppes', 'Enveloppes')}${lien('/actifs', 'Actifs')}${lien('/passifs', 'Crédits')}${lien('/valorisations', 'Valorisations')}</nav>
</header>
<main>
${contenu}
</main>
</body>
</html>`;
}

function blocErreurs(motifs) {
  if (!motifs?.length) return '';
  return `<div class="erreurs" role="alert"><strong>Saisie refusée :</strong><ul>${motifs.map((m) => `<li>${echapper(m)}</li>`).join('')}</ul></div>`;
}

const champ = (nom, libelle, valeurs, { type = 'text', aide = '', requis = false } = {}) =>
  `<label>${libelle}${requis ? ' *' : ''}<input type="${type}" name="${nom}" id="${nom}" value="${echapper(valeurs?.[nom])}"${requis ? ' required' : ''}>${aide ? `<small>${aide}</small>` : ''}</label>`;

const choix = (nom, libelle, contenu) => `<label>${libelle}<select name="${nom}" id="${nom}">${contenu}</select></label>`;

// ——— Bilan ————————————————————————————————————————————————————————————

const MESSAGES_AVERTISSEMENT = {
  actif_non_valorise: (a) => `« ${a.libelle} » n'a aucune valeur saisie à cette date : il est exclu du total.`,
  passif_sans_solde: (a) => `Le crédit « ${a.libelle} » n'a pas de capital restant dû saisi : bilan incomplet.`,
  valorisation_ancienne: (a) => `La valeur de « ${a.libelle} » date de ${a.ageJours} jours.`,
  dette_sans_actif: (a) => `Le crédit « ${a.libelle} » garde un solde alors que « ${a.actif} » n'est pas au bilan à cette date : la dette reste comptée.`,
};

const age = (jours) => (jours === 0 ? 'du jour' : `il y a ${jours} j`);
const dateEtAge = (v) => `${echapper(v.date)}, ${age(v.ageJours)}`;

export function pageBilan(bilan) {
  const g = bilan.global;
  const avertissements = bilan.avertissements.length
    ? `<section class="avertissements"><h2>À compléter</h2><ul>${bilan.avertissements.map((a) => `<li>${echapper(MESSAGES_AVERTISSEMENT[a.code](a))}</li>`).join('')}</ul></section>`
    : '';

  const enveloppes = bilan.enveloppes.map((e) => {
    const lignes = e.biens.map((b) => {
      const source = b.valeur ? `${echapper(b.valeur.source)}, ${dateEtAge(b.valeur)}` : 'aucune valeur saisie';
      const dettes = b.dettes.map((d) => `<div class="sous">${echapper(d.libelle)} : ${d.crd ? `${euros(d.crd.centimes)} (${dateEtAge(d.crd)})` : 'capital restant dû non saisi'}</div>`).join('');
      return `<tr>
        <td>${echapper(b.libelle)}<div class="sous">${source}</div>${dettes}</td>
        <td class="num">${b.valeur ? euros(b.valeur.centimes) : '—'}</td>
        <td class="num">${b.dettes.length ? euros(b.dette.centimes) : '—'}</td>
        <td class="num fort">${b.net ? euros(b.net.centimes) : '—'}</td>
        <td>${b.valeur ? pastille(b.statut) : '<span class="pastille manque">non valorisé</span>'}</td>
      </tr>`;
    }).join('') + e.dettesSansActif.map((d) => `<tr>
        <td>${echapper(d.libelle)}<div class="sous">crédit de « ${echapper(d.actif)} », hors bilan à cette date · ${echapper(d.crd.source)}, ${dateEtAge(d.crd)}</div></td>
        <td class="num">—</td>
        <td class="num">${euros(d.crd.centimes)}</td>
        <td class="num fort">—</td>
        <td><span class="pastille manque">dette sans bien</span></td>
      </tr>`).join('');
    return `<section class="enveloppe">
      <h2>${echapper(e.libelle)} <span class="meta">${echapper(LIBELLES_TYPE[e.type] ?? e.type)} · quote-part ${quotePart(e.quotePart)}</span></h2>
      <div class="table"><table>
        <thead><tr><th>Ligne</th><th class="num">Valeur</th><th class="num">Dette</th><th class="num">Net</th><th>Statut</th></tr></thead>
        <tbody>${lignes || '<tr><td colspan="5" class="vide">Aucun actif dans cette enveloppe.</td></tr>'}</tbody>
        <tfoot><tr><td>Total à ta quote-part</td><td class="num">${euros(e.valeur.centimes)}</td><td class="num">${euros(e.dette.centimes)}</td><td class="num fort">${euros(e.net.centimes)}</td><td>${pastille(e.statut)}</td></tr></tfoot>
      </table></div>
    </section>`;
  }).join('');

  const vide = bilan.enveloppes.length === 0
    ? '<p class="vide">Rien n\'est encore saisi. Commence par créer une <a href="/enveloppes">enveloppe</a>, puis ses <a href="/actifs">actifs</a>, leurs <a href="/passifs">crédits</a> et leurs <a href="/valorisations">valorisations</a>.</p>'
    : '';

  return gabarit('Bilan', '/', `
<form class="date" method="get" action="/"><label>Bilan au <input type="date" name="date" id="date" value="${echapper(bilan.date)}"></label><button>Afficher</button></form>
<section class="synthese">
  <div><span class="etiquette">Patrimoine net</span><span class="chiffre">${euros(g.net.centimes)}</span>${pastille(g.statut)}${g.complet ? '' : ' <span class="pastille manque">incomplet</span>'}</div>
  <div><span class="etiquette">Actifs</span><span class="chiffre petit">${euros(g.valeur.centimes)}</span></div>
  <div><span class="etiquette">Dettes</span><span class="chiffre petit">${euros(g.dette.centimes)}</span></div>
</section>
${avertissements}
${vide}
${enveloppes}`);
}

export function pageErreur(titre, message) {
  return gabarit(titre, '', `<h1>${echapper(titre)}</h1><p>${echapper(message)}</p><p><a href="/">Retour au bilan</a></p>`);
}

// ——— Listes et formulaires ————————————————————————————————————————————

export function pageEnveloppes({ enveloppes }, { valeurs = {}, motifs = [] } = {}) {
  const lignes = enveloppes.map((e) => `<tr><td>${echapper(e.libelle)}</td><td>${echapper(LIBELLES_TYPE[e.type])}</td><td>${echapper(e.etablissement)}</td><td>${quotePart(e.quotePart)}</td><td>${echapper(e.dateOuverture)}</td></tr>`).join('');
  return gabarit('Enveloppes', '/enveloppes', `
<h1>Enveloppes</h1>
<p class="aide">Le contenant fiscal ou juridique : un bien en direct, un PEE, un livret… La quote-part dit quelle fraction t'appartient (1/2 pour une indivision).</p>
<div class="table"><table><thead><tr><th>Libellé</th><th>Type</th><th>Établissement</th><th>Quote-part</th><th>Ouverture</th></tr></thead>
<tbody>${lignes || '<tr><td colspan="5" class="vide">Aucune enveloppe.</td></tr>'}</tbody></table></div>
<h2>Ajouter une enveloppe</h2>
${blocErreurs(motifs)}
<form method="post" action="/enveloppes" class="saisie">
  ${choix('type', 'Type *', options(TYPES_ENVELOPPE, LIBELLES_TYPE, valeurs.type))}
  ${champ('libelle', 'Libellé', valeurs, { requis: true })}
  ${champ('etablissement', 'Établissement', valeurs)}
  ${champ('date_ouverture', 'Date d\'ouverture', valeurs, { type: 'date' })}
  ${champ('quote_part', 'Quote-part', valeurs, { aide: '1/2, 1/3, 50 % — vide = 100 %' })}
  ${champ('regime_fiscal', 'Régime fiscal', valeurs, { aide: 'texte libre au lot 0 (LMNP Censi-Bouvard, Pinel…)' })}
  <button>Enregistrer</button>
</form>`);
}

export function pageActifs({ enveloppes, actifs }, { valeurs = {}, motifs = [] } = {}) {
  const nomEnveloppe = new Map(enveloppes.map((e) => [e.id, e.libelle]));
  const lignes = actifs.map((a) => `<tr><td>${echapper(a.libelle)}</td><td>${echapper(LIBELLES_NATURE[a.nature])}</td><td>${echapper(nomEnveloppe.get(a.enveloppeId))}</td><td>${echapper(a.dateAcquisition)}</td><td class="num">${euros(a.prixAcquisitionCentimes)}</td></tr>`).join('');
  const choixEnveloppes = enveloppes.map((e) => `<option value="${e.id}"${String(e.id) === valeurs.enveloppe_id ? ' selected' : ''}>${echapper(e.libelle)}</option>`).join('');
  return gabarit('Actifs', '/actifs', `
<h1>Actifs</h1>
<p class="aide">Ce que tu possèdes, rangé dans une enveloppe. Saisis-le à 100 % : la quote-part de l'enveloppe s'applique au calcul.</p>
<div class="table"><table><thead><tr><th>Libellé</th><th>Nature</th><th>Enveloppe</th><th>Acquisition</th><th class="num">Prix</th></tr></thead>
<tbody>${lignes || '<tr><td colspan="5" class="vide">Aucun actif.</td></tr>'}</tbody></table></div>
<h2>Ajouter un actif</h2>
${enveloppes.length ? '' : '<p class="vide">Crée d\'abord une <a href="/enveloppes">enveloppe</a>.</p>'}
${blocErreurs(motifs)}
<form method="post" action="/actifs" class="saisie">
  ${choix('enveloppe_id', 'Enveloppe *', choixEnveloppes)}
  ${choix('nature', 'Nature *', options(NATURES_ACTIF, LIBELLES_NATURE, valeurs.nature))}
  ${champ('libelle', 'Libellé', valeurs, { requis: true })}
  ${champ('identifiant', 'Identifiant', valeurs, { aide: 'ISIN, ou ville du bien' })}
  ${champ('date_acquisition', 'Date d\'acquisition', valeurs, { type: 'date' })}
  ${champ('prix_acquisition', 'Prix d\'acquisition (€)', valeurs, { aide: 'à 100 %' })}
  ${champ('frais_acquisition', 'Frais d\'acquisition (€)', valeurs)}
  ${champ('date_cloture', 'Date de cession', valeurs, { type: 'date', aide: 'vide tant que tu le détiens' })}
  ${champ('classe', 'Classe d\'actifs', valeurs, { aide: 'immobilier, actions, monétaire…' })}
  <button>Enregistrer</button>
</form>`);
}

export function pagePassifs({ actifs, passifs }, { valeurs = {}, motifs = [] } = {}) {
  const nomActif = new Map(actifs.map((a) => [a.id, a.libelle]));
  const taux = (pb) => (pb == null ? '—' : `${(pb / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} %`);
  const lignes = passifs.map((p) => `<tr><td>${echapper(p.libelle)}</td><td>${echapper(nomActif.get(p.actifId))}</td><td>${echapper(p.etablissement)}</td><td class="num">${taux(p.tauxPb)}</td><td class="num">${euros(p.mensualiteCentimes)}</td><td class="num">${euros(p.assuranceMensuelleCentimes)}</td></tr>`).join('');
  const choixActifs = actifs.map((a) => `<option value="${a.id}"${String(a.id) === valeurs.actif_id ? ' selected' : ''}>${echapper(a.libelle)}</option>`).join('');
  return gabarit('Crédits', '/passifs', `
<h1>Crédits</h1>
<p class="aide">Chaque crédit finance un actif. Son capital restant dû se saisit dans <a href="/valorisations">Valorisations</a>, depuis ton relevé de prêt.</p>
<div class="table"><table><thead><tr><th>Libellé</th><th>Bien financé</th><th>Établissement</th><th class="num">Taux</th><th class="num">Mensualité</th><th class="num">Assurance</th></tr></thead>
<tbody>${lignes || '<tr><td colspan="6" class="vide">Aucun crédit.</td></tr>'}</tbody></table></div>
<h2>Ajouter un crédit</h2>
${blocErreurs(motifs)}
<form method="post" action="/passifs" class="saisie">
  ${choix('actif_id', 'Bien financé *', choixActifs)}
  ${champ('libelle', 'Libellé', valeurs, { requis: true })}
  ${champ('etablissement', 'Établissement', valeurs)}
  ${champ('capital_initial', 'Capital emprunté (€)', valeurs)}
  ${champ('taux', 'Taux nominal (%)', valeurs, { aide: 'exemple : 1,45' })}
  ${champ('duree_mois', 'Durée (mois)', valeurs)}
  ${champ('mensualite', 'Mensualité hors assurance (€)', valeurs)}
  ${champ('assurance', 'Assurance mensuelle (€)', valeurs)}
  ${champ('date_premiere_echeance', 'Première échéance', valeurs, { type: 'date' })}
  ${choix('type', 'Type', options(TYPES_PASSIF, LIBELLES_PASSIF, valeurs.type))}
  <button>Enregistrer</button>
</form>`);
}

export function pageValorisations({ actifs, passifs, valorisations }, { valeurs = {}, motifs = [] } = {}) {
  const nomActif = new Map(actifs.map((a) => [a.id, a.libelle]));
  const nomPassif = new Map(passifs.map((p) => [p.id, p.libelle]));
  const cible = (c) => (c.actifId != null ? nomActif.get(c.actifId) : `Crédit · ${nomPassif.get(c.passifId)}`);
  const lignes = [...valorisations].reverse().map((v) => `<tr><td>${echapper(v.date)}</td><td>${echapper(cible(v.cible))}</td><td class="num">${euros(v.valeurCentimes)}</td><td>${echapper(v.source)}</td><td>${pastille(v.statut)}</td></tr>`).join('');
  const choixCible = [
    ...actifs.map((a) => [`actif:${a.id}`, a.libelle]),
    ...passifs.map((p) => [`passif:${p.id}`, `Crédit · ${p.libelle} (capital restant dû)`]),
  ].map(([v, l]) => `<option value="${v}"${v === valeurs.cible ? ' selected' : ''}>${echapper(l)}</option>`).join('');
  return gabarit('Valorisations', '/valorisations', `
<h1>Valorisations</h1>
<p class="aide">Une valeur datée pour un actif, ou le capital restant dû d'un crédit. Toujours à 100 %, toujours avec sa source.</p>
<h2>Ajouter une valeur</h2>
${blocErreurs(motifs)}
<form method="post" action="/valorisations" class="saisie">
  ${choix('cible', 'Porte sur *', choixCible)}
  ${champ('date', 'Date', valeurs, { type: 'date', requis: true })}
  ${champ('valeur', 'Montant (€)', valeurs, { requis: true, aide: 'à 100 %, exemple : 245 000' })}
  ${champ('source', 'Source', valeurs, { requis: true, aide: 'relevé de prêt, estimation d\'agence, relevé PEE…' })}
  ${choix('statut', 'Statut *', options(STATUTS, { fait: 'Fait (relevé, acte)', estimation: 'Estimation' }, valeurs.statut))}
  ${champ('note', 'Note', valeurs)}
  <button>Enregistrer</button>
</form>
<h2>Historique</h2>
<div class="table"><table><thead><tr><th>Date</th><th>Porte sur</th><th class="num">Montant à 100 %</th><th>Source</th><th>Statut</th></tr></thead>
<tbody>${lignes || '<tr><td colspan="5" class="vide">Aucune valeur saisie.</td></tr>'}</tbody></table></div>`);
}
