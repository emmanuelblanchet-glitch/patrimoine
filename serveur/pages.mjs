// Pages HTML rendues côté serveur. Tout texte venant de la base ou d'une
// saisie passe par echapper() : un libellé ne devient jamais du HTML.
//
// L'entrée de l'outil est « Ma poche » (lot 1). Les pages du lot 0
// (bilan, enveloppes, actifs, crédits, valorisations) restent sous
// « Réglages → données détaillées ».

import { TYPES_ENVELOPPE, NATURES_ACTIF, TYPES_PASSIF, STATUTS } from '../lib/referentiel.mjs';
import { LIBELLES_CLASSE, CLASSES_LIGNE } from '../lib/allocation.mjs';
import { TYPES_FINANCIERS } from '../lib/poche.mjs';
import { MENTION } from '../lib/explication.mjs';
import { euros, eurosRonds, pct } from '../lib/format.mjs';

function echapper(valeur) {
  return String(valeur ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const dateFr = (iso) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');

const LIBELLES_TYPE = {
  immobilier_direct: 'Immobilier en direct', pee: 'PEE', per: 'PER', pea: 'PEA', cto: 'Compte-titres',
  av: 'Assurance-vie', livret: 'Livret', compte_courant: 'Compte courant', societe: 'Parts de société',
};
const LIBELLES_NATURE = {
  bien: 'Bien immobilier', fcpe: 'FCPE / épargne salariale', etf: 'ETF', action: 'Action', parts: 'Parts', liquidites: 'Liquidités',
};
const LIBELLES_PASSIF = { amortissable: 'Amortissable', in_fine: 'In fine' };
const LIBELLES_CLASSE_LIGNE = { ...LIBELLES_CLASSE, mixte: 'Mixte' };
const NOM_ENVELOPPE_A_OUVRIR = { pea: 'un PEA', av: 'une assurance-vie' };

const quotePart = (qp) => (qp.num === qp.den ? '100 %' : `${qp.num}/${qp.den}`);
const tag = (classe, texte) => `<span class="tag ${classe}">${echapper(texte)}</span>`;
const tagStatut = (statut) => (statut === 'fait' ? tag('fait', 'fait') : tag('estim', 'estimation'));
const age = (jours) => (jours === 0 ? 'du jour' : `il y a ${jours} j`);
const dateEtAge = (v) => `${echapper(v.date)}, ${age(v.ageJours)}`;

function options(valeurs, libelles, choisie) {
  return valeurs
    .map((v) => `<option value="${echapper(v)}"${v === choisie ? ' selected' : ''}>${echapper(libelles?.[v] ?? v)}</option>`)
    .join('');
}

const NAV = [['/', 'Ma poche'], ['/allocation', 'Allocation'], ['/lignes', 'Lignes'], ['/versement', 'Versement'], ['/reglages', 'Réglages']];
const NAV_DETAILS = [['/bilan', 'Bilan complet'], ['/enveloppes', 'Enveloppes'], ['/actifs', 'Actifs'], ['/passifs', 'Crédits'], ['/valorisations', 'Valorisations']];

function gabarit(titre, actif, contenu, { details = false } = {}) {
  const lien = ([href, nom]) => `<a href="${href}"${actif === href ? ' aria-current="page"' : ''}>${nom}</a>`;
  const nav = details ? [...NAV, ...NAV_DETAILS] : NAV;
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
  <nav>${nav.map(lien).join('')}</nav>
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

function blocAvertissements(titre, items) {
  if (!items?.length) return '';
  return `<section class="avertissements"><h2>${echapper(titre)}</h2><ul>${items.map((m) => `<li>${echapper(m)}</li>`).join('')}</ul></section>`;
}

const champ = (nom, libelle, valeurs, { type = 'text', aide = '', requis = false, question = false } = {}) =>
  `<label><span${question ? ' class="question"' : ''}>${libelle}${requis ? ' *' : ''}</span><input type="${type}" name="${nom}" id="${nom}" value="${echapper(valeurs?.[nom])}"${requis ? ' required' : ''}>${aide ? `<small>${aide}</small>` : ''}</label>`;

const choix = (nom, libelle, contenu, { aide = '' } = {}) => `<label>${libelle}<select name="${nom}" id="${nom}">${contenu}</select>${aide ? `<small>${aide}</small>` : ''}</label>`;

const case_ = (nom, libelle, valeurs) =>
  `<label class="case"><input type="checkbox" name="${nom}" id="${nom}" value="oui"${valeurs?.[nom] === 'oui' ? ' checked' : ''}> ${libelle}</label>`;

export function pageErreur(titre, message) {
  return gabarit(titre, '', `<h1>${echapper(titre)}</h1><p>${echapper(message)}</p><p><a href="/">Retour à ma poche</a></p>`);
}

// ——— Ma poche (accueil, lot 1) ————————————————————————————————————————

export function pageAccueil({ poche, explication, aujourdhui }) {
  if (!poche.objectif) {
    return gabarit('Ma poche', '/', `
<h1>Ma poche financière</h1>
<p class="sous-titre">L'outil ne sait encore rien de toi. Six questions suffisent pour démarrer.</p>
<div class="appel">
  <p>Dis-moi ce que tu as de côté, ce que tu peux placer chaque mois, ton horizon et la perte que tu accepterais de voir sans vendre. L'outil en déduit une cible simple, et te dit chaque mois quoi faire de ton épargne.</p>
  <p><a class="bouton-lien" href="/depart">Répondre aux six questions</a></p>
  <p class="aide">Tu as déjà des données détaillées (lot 0) ? Elles sont sous <a href="/reglages">Réglages</a>.</p>
</div>`);
  }

  const { objectif, exposition, ecarts, repartition, trajectoire, partFinancierePb, immobilierNetCentimes, lignes } = poche;
  const dernier = trajectoire.at(-1);
  const anneeCible = new Date(`${aujourdhui}T00:00:00Z`).getUTCFullYear() + objectif.horizonAnnees;

  const partsVersement = repartition.filter((p) => p.centimes > 0).map((p) => {
    const d = p.destination;
    const ou = d?.ligne
      ? `${echapper(d.ligne.libelle)} <small>· ${echapper(LIBELLES_TYPE[d.enveloppeType] ?? d.enveloppeType)}</small>`
      : `<span class="tag manque">à ouvrir : ${echapper(NOM_ENVELOPPE_A_OUVRIR[d?.aOuvrir] ?? d?.aOuvrir ?? '?')}</span>`;
    return `<li><span>${echapper(LIBELLES_CLASSE[p.classe])} → ${ou}</span><span class="num">${eurosRonds(p.centimes)}</span></li>`;
  }).join('');

  const origine = explication.origine === 'claude'
    ? `${tag('opinion', 'aide à la décision')} <small>rédigé par Claude (${echapper(explication.modele)}), ${dateFr(explication.date.slice(0, 10))}</small>`
    : `${tag('opinion', 'aide à la décision')} ${tag('estim', 'texte de repli')} <small>${
      explication.raison === 'sans_cle' ? 'sans clé d\'API, l\'outil se contente des règles'
        : explication.raison ? `dernier appel : ${echapper(explication.raison)}${explication.enCours ? ' ; nouvel essai en cours' : explication.enRecul ? ' ; nouvel essai dans dix minutes' : ''}`
          : explication.enCours ? 'l\'explication rédigée arrive au prochain chargement' : ''}</small>`;

  const alloc = ecarts.map((e) => `<div class="ligne-alloc">
    <span class="nom">${echapper(LIBELLES_CLASSE[e.classe])}<small>${e.dansLaBande ? 'dans la bande' : e.ecartPb > 0 ? `${pct(e.ecartPb)} sous la cible` : `${pct(-e.ecartPb)} au-dessus de la cible`}</small></span>
    <span class="valeurs">${pct(e.actuelPb)} <small>· cible ${pct(e.ciblePb)}</small></span>
    <div class="barre"><div class="actuel" style="width:${Math.min(100, e.actuelPb / 100)}%"></div><div class="cible" style="left:${e.ciblePb / 100}%"></div></div>
  </div>`).join('');

  const lignesHtml = lignes.length
    ? lignes.map((l) => `<tr>
        <td>${echapper(l.libelle)}<span class="sous">${echapper(LIBELLES_TYPE[l.enveloppeType] ?? l.enveloppeType)} · ${echapper(LIBELLES_CLASSE_LIGNE[l.classe])}${l.classe === 'mixte' ? ` (${pct(l.partActionsPb)} actions)` : ''}</span></td>
        <td class="num">${l.valorisee ? euros(l.valeurCentimes) : '—'}</td>
        <td>${l.valeur ? `${tagStatut(l.valeur.statut)} <small>${echapper(l.valeur.source)}, ${dateEtAge(l.valeur)}</small>` : tag('manque', 'non valorisé')}</td>
      </tr>`).join('')
    : '<tr><td colspan="3" class="vide">Aucune ligne encore. <a href="/lignes">Classer ou créer des lignes</a>.</td></tr>';

  return gabarit('Ma poche', '/', `
<h1>Ma poche financière</h1>
<p class="sous-titre">Au ${dateFr(poche.date)}. Objectif : une poche diversifiée, alimentée de ${eurosRonds(objectif.epargneMensuelleCentimes)} par mois, pour ne plus dépendre de l'immobilier.</p>

<div class="synthese">
  <div class="carte"><span class="etiquette">Valeur de la poche</span><span class="chiffre">${eurosRonds(exposition.totalCentimes)}</span><span class="delta">${lignes.length} ligne${lignes.length > 1 ? 's' : ''}</span></div>
  <div class="carte"><span class="etiquette">Versement du mois</span><span class="chiffre petit">${eurosRonds(objectif.epargneMensuelleCentimes)}</span><span class="delta">réglé dans <a href="/depart">ton point de départ</a></span></div>
  <div class="carte"><span class="etiquette">Part financière</span><span class="chiffre petit">${pct(partFinancierePb)}</span><span class="delta">du patrimoine net${dernier ? ` · ${pct(dernier.partFinancierePb)} en ${anneeCible} ${tag('estim', 'estimation')}` : ''}</span></div>
</div>

<section class="section">
  <h2>Quoi faire ce mois-ci</h2>
  <div class="carte action">
    <div class="texte">
      <ul class="repartition">${partsVersement || '<li><span>Rien à verser ce mois-ci</span><span class="num">0 €</span></li>'}</ul>
      <p>${echapper(explication.texte)}</p>
      <p class="source">${origine}</p>
      <p class="source">${poche.regle === 'rattrapage' ? `Règle : tout le versement à la ligne la plus en retard (${echapper(LIBELLES_CLASSE[poche.classeRattrapee])}).` : 'Règle : toutes les lignes sont dans leur bande, le versement suit la cible.'} Rien à vendre.</p>
    </div>
    <div class="montant">${eurosRonds(objectif.epargneMensuelleCentimes)}</div>
  </div>
</section>

<section class="section">
  <h2>Allocation contre la cible</h2>
  <div class="carte alloc">${alloc}</div>
</section>

<section class="section">
  <h2>Mes lignes</h2>
  <div class="table"><table>
    <thead><tr><th>Ligne</th><th class="num">Valeur</th><th>Valeur du</th></tr></thead>
    <tbody>${lignesHtml}</tbody>
  </table></div>
</section>

<section class="section">
  <h2>Financier contre immobilier</h2>
  <div class="carte part">
    <div class="jauge"><div class="fin" style="width:${partFinancierePb / 100}%"></div><div class="immo" style="width:${100 - partFinancierePb / 100}%"></div></div>
    <div class="legende"><span>Poche financière ${pct(partFinancierePb)}</span><span>Immobilier net ${pct(10000 - partFinancierePb)} <small>(${eurosRonds(immobilierNetCentimes)}, ${echapper(objectif.immobilierSource)}, ${echapper(objectif.immobilierDate)})</small></span></div>
    ${dernier ? `<p class="source">Trajectoire : à ${eurosRonds(objectif.epargneMensuelleCentimes)} par mois et ${pct(objectif.rendementEstimePb)} par an, la poche vaudrait ${eurosRonds(dernier.pocheCentimes)} en ${anneeCible}, soit ${pct(dernier.partFinancierePb)} du patrimoine net ${tag('estim', 'estimation')}</p>` : ''}
  </div>
</section>`);
}

// ——— Point de départ ————————————————————————————————————————————————

export function pageDepart({ objectif, enveloppes }, { valeurs = {}, motifs = [], avertissements = [], enregistre = false } = {}) {
  const v = Object.keys(valeurs).length ? valeurs : objectif ? {
    reserve: (objectif.reserveCentimes / 100).toString(),
    matelas: (objectif.matelasCentimes / 100).toString(),
    epargne_mensuelle: (objectif.epargneMensuelleCentimes / 100).toString(),
    horizon: String(objectif.horizonAnnees),
    perte_max: (objectif.perteMaxPb / 100).toString(),
    immobilier: (objectif.immobilierNetCentimes / 100).toString(),
    immobilier_date: objectif.immobilierDate,
    immobilier_source: objectif.immobilierSource,
    rendement: (objectif.rendementEstimePb / 100).toString(),
  } : {};
  const types = new Set((enveloppes ?? []).map((e) => e.type));
  const dejaPee = types.has('pee');
  return gabarit('Point de départ', '/depart', `
<h1>${objectif ? 'Mon point de départ' : 'Six questions pour démarrer'}</h1>
<p class="sous-titre">Réponds à la louche, en euros. Tu pourras revenir ici quand tu veux. ${objectif ? '' : 'À la fin, l\'outil crée tes premières lignes.'}</p>
${enregistre ? `<div class="carte" style="margin-bottom:var(--esp-3)">${tag('fait', 'enregistré')} Ton point de départ est enregistré. Lis ce qui suit, puis <a href="/">va voir ta poche</a>.</div>` : ''}
${blocErreurs(motifs)}
${blocAvertissements('À savoir', avertissements)}
<form method="post" action="/depart" class="saisie questions">
  ${champ('reserve', '1. Combien as-tu de côté, disponible tout de suite ?', v, { requis: true, question: true, aide: 'livrets et comptes, hors PEE' })}
  ${champ('matelas', 'Dont combien veux-tu garder en matelas de précaution ?', v, { requis: true, aide: 'ce qui reste sur le livret quoi qu\'il arrive' })}
  ${champ('epargne_mensuelle', '2. Combien veux-tu placer chaque mois ?', v, { requis: true, question: true })}
  ${dejaPee ? '<p class="aide">3. Ton PEE est déjà enregistré comme ligne ; sa valeur se met à jour dans <a href="/versement">Versement</a>.</p>' : `${champ('pee', '3. Qu\'y a-t-il sur ton PEE ?', v, { question: true, aide: '0 si tu n\'en as pas' })}
  ${champ('pee_part_actions', 'Quelle part du PEE est en actions ? (%)', v, { aide: 'si tu ne sais pas, laisse vide : 50 %' })}`}
  ${champ('horizon', '4. Dans combien d\'années comptes-tu te servir de cet argent ?', v, { requis: true, question: true, aide: 'en années' })}
  ${champ('perte_max', '5. Quelle perte maximale accepterais-tu de voir, sans vendre ? (%)', v, { requis: true, question: true, aide: 'sur l\'ensemble de la poche ; 30 par défaut' })}
  ${champ('immobilier', '6. Que vaut ton immobilier, net de crédits, à la louche ?', v, { requis: true, question: true, aide: 'une estimation suffit ; 0 si aucun' })}
  ${champ('immobilier_date', 'Date de cette estimation', v, { type: 'date', requis: true })}
  ${champ('immobilier_source', 'D\'où vient-elle ?', v, { requis: true, aide: 'agence, annonces, à la louche…' })}
  ${champ('rendement', 'Rendement annuel estimé de la poche (%)', v, { aide: 'sert à la trajectoire seulement ; 5 par défaut, c\'est une estimation' })}
  ${objectif ? '' : `<div><span class="question">Ce que tu as déjà ouvert</span>${case_('a_pea', 'un PEA', v)}${case_('a_av', 'une assurance-vie', v)}<small>Coche seulement ce qui existe ; l'outil te dira quoi ouvrir sinon.</small></div>`}
  <button>Enregistrer</button>
</form>`);
}

// ——— Allocation ——————————————————————————————————————————————————————

const POURQUOI_ENVELOPPE = {
  pea: 'Le PEA : après cinq ans de détention, les gains n\'y paient que les prélèvements sociaux. On l\'ouvre tôt, le compteur part à l\'ouverture. Un retrait avant cinq ans le ferme.',
  livret: 'Le livret garde le matelas de précaution : disponible tout de suite, sans risque, sans impôt.',
  av: 'L\'assurance-vie en fonds euros reçoit la part sans risque au-delà du matelas : capital garanti, argent disponible, fiscalité adoucie après huit ans.',
  compte_courant: 'Le compte courant tient lieu de livret tant que celui-ci n\'existe pas.',
  pee: 'Le PEE compte dans la poche selon la part actions de ses fonds ; il est bloqué cinq ans, on n\'y verse que l\'abondement et la participation.',
  cto: 'Le compte-titres n\'a ni contrainte ni avantage : il reçoit ce qui ne rentre pas dans le PEA.',
};

export function pageAllocation({ poche, cible }) {
  const lignesCible = poche.classes === undefined ? Object.keys(cible) : poche.classes;
  const blocs = lignesCible.map((classe) => {
    const d = poche.destinations[classe];
    const type = d.enveloppeType;
    const ou = d.ligne ? `${echapper(d.ligne.libelle)} <small>· ${echapper(LIBELLES_TYPE[type] ?? type)}</small>` : tag('manque', `à ouvrir : ${NOM_ENVELOPPE_A_OUVRIR[d.aOuvrir] ?? d.aOuvrir}`);
    const motif = d.motif === 'matelas' ? ' Le livret d\'abord, tant que le matelas de précaution n\'est pas reconstitué.' : '';
    return `<div class="carte"><span class="etiquette">${echapper(LIBELLES_CLASSE[classe])}</span><span class="chiffre petit">${pct(cible[classe])}</span>
      <p>Reçoit ses versements sur : ${ou}.</p>
      <p class="source">${echapper(POURQUOI_ENVELOPPE[type] ?? '')}${echapper(motif)}</p></div>`;
  }).join('');
  return gabarit('Allocation', '/allocation', `
<h1>Mon allocation</h1>
<p class="sous-titre">La cible de la poche, et l'enveloppe qui accueille chaque part. ${tag('opinion', 'aide à la décision')}</p>
<div class="synthese">${blocs}</div>
<section class="section">
  <h2>La règle, en clair</h2>
  <div class="carte">
    <p>Chaque classe a une bande de tolérance : 5 points autour de sa cible, ou 25 % de la cible si c'est moins. Tant qu'une classe est sous sa cible au-delà de sa bande, <strong>tout le versement du mois lui va</strong> (la plus en retard d'abord). Quand tout est dans la bande, le versement suit la cible. <strong>Rien ne se vend</strong> : on ne rééquilibre que par les versements.</p>
    <p>Le PEE compte dans les deux classes selon la part actions de ses fonds. La cible 60 / 40 vient du point de départ : avec 60 % d'actions, une chute de moitié des marchés ferait perdre 30 % de la poche, la perte maximale que tu as dite accepter.</p>
    <p class="source">${echapper(MENTION)}</p>
  </div>
</section>`);
}

// ——— Lignes ——————————————————————————————————————————————————————————

export function pageLignes({ etat, poche }, { valeurs = {}, motifs = [] } = {}) {
  const financiers = etat.enveloppes.filter((e) => TYPES_FINANCIERS.has(e.type));
  const idsFinanciers = new Set(financiers.map((e) => e.id));
  const nomEnv = new Map(etat.enveloppes.map((e) => [e.id, e]));
  const candidats = etat.actifs.filter((a) => idsFinanciers.has(a.enveloppeId) && !a.dateCloture);
  const lignes = poche.lignes.map((l) => `<tr>
      <td>${echapper(l.libelle)}<span class="sous">${echapper(l.enveloppeLibelle)} · ${echapper(LIBELLES_TYPE[l.enveloppeType] ?? l.enveloppeType)}</span></td>
      <td>${echapper(LIBELLES_CLASSE_LIGNE[l.classe])}${l.classe === 'mixte' ? ` <small>${pct(l.partActionsPb)} actions</small>` : ''}</td>
      <td class="num">${l.valorisee ? euros(l.valeurCentimes) : '—'}</td>
    </tr>`).join('');
  const nonClasses = candidats.filter((a) => !a.classePoche);
  const choixActifs = candidats.map((a) => `<option value="${a.id}"${String(a.id) === valeurs.actif_id ? ' selected' : ''}>${echapper(a.libelle)} (${echapper(nomEnv.get(a.enveloppeId)?.libelle)})${a.classePoche ? '' : ' — à classer'}</option>`).join('');
  return gabarit('Lignes', '/lignes', `
<h1>Mes lignes</h1>
<p class="sous-titre">Chaque ligne de la poche a une classe : actions monde, sans risque, ou mixte. C'est elle qui décide où va ton versement.</p>
<div class="table"><table>
  <thead><tr><th>Ligne</th><th>Classe</th><th class="num">Valeur</th></tr></thead>
  <tbody>${lignes || '<tr><td colspan="3" class="vide">Aucune ligne classée.</td></tr>'}</tbody>
</table></div>
${nonClasses.length ? blocAvertissements('À classer', nonClasses.map((a) => `« ${a.libelle} » n'a pas de classe : il ne compte pas dans la poche.`)) : ''}
<section class="section">
<h2>Classer une ligne</h2>
${blocErreurs(motifs)}
${candidats.length ? `<form method="post" action="/lignes" class="saisie">
  ${choix('actif_id', 'Ligne', choixActifs)}
  ${choix('classe', 'Classe', options(CLASSES_LIGNE, LIBELLES_CLASSE_LIGNE, valeurs.classe))}
  ${champ('part_actions', 'Part actions, si mixte (%)', valeurs, { aide: 'pour un PEE ou un fonds mélangé' })}
  <button>Classer</button>
</form>` : '<p class="vide">Aucun actif financier à classer. Crée-les depuis <a href="/actifs">données détaillées</a>, ou réponds au <a href="/depart">point de départ</a>.</p>'}
<p class="aide">Pour ajouter une ligne qui n'existe pas encore (un ETF dans le PEA, un fonds euros) : <a href="/actifs">créer l'actif</a> dans son enveloppe, puis le classer ici.</p>
</section>`);
}

// ——— Versement ——————————————————————————————————————————————————————

export function pageVersement({ poche, aujourdhui }, { valeurs = {}, motifs = [] } = {}) {
  const choixLignes = poche.lignes.map((l) => `<option value="${l.actifId}"${String(l.actifId) === valeurs.actif_id ? ' selected' : ''}>${echapper(l.libelle)} (${echapper(LIBELLES_TYPE[l.enveloppeType] ?? l.enveloppeType)})</option>`).join('');
  const v = { date: aujourdhui, ...valeurs };
  return gabarit('Versement', '/versement', `
<h1>J'ai versé</h1>
<p class="sous-titre">Une phrase, trois champs. Si tu connais la nouvelle valeur de la ligne (relevé, cours), donne-la : elle remplace l'ancienne.</p>
${blocErreurs(motifs)}
${poche.lignes.length ? `<form method="post" action="/versement" class="saisie">
  ${champ('montant', 'Montant (€)', v, { requis: true })}
  ${choix('actif_id', 'Sur la ligne', choixLignes)}
  ${champ('date', 'Le', v, { type: 'date', requis: true })}
  ${choix('type', 'Nature', options(['versement', 'abondement'], { versement: 'Versement', abondement: 'Abondement (PEE)' }, valeurs.type))}
  ${champ('nouvelle_valeur', 'Nouvelle valeur de la ligne (€)', v, { aide: 'facultatif : la valeur totale après ce versement' })}
  ${champ('source', 'Source de cette valeur', v, { aide: 'relevé, cours du jour…' })}
  <button>Enregistrer</button>
</form>` : '<p class="vide">Aucune ligne encore. Réponds d\'abord au <a href="/depart">point de départ</a>.</p>'}`);
}

// ——— Réglages ——————————————————————————————————————————————————————

export function pageReglages({ objectif, cible, cleClaude }) {
  return gabarit('Réglages', '/reglages', `
<h1>Réglages</h1>
<div class="liens">
  <a href="/depart"><strong>Mon point de départ</strong><small>${objectif ? `mis à jour le ${dateFr(objectif.misAJourLe.slice(0, 10))}` : 'pas encore rempli'}</small></a>
  <a href="/allocation"><strong>Mon allocation</strong><small>la cible, les enveloppes et pourquoi</small></a>
  <a href="/bilan"><strong>Données détaillées</strong><small>bilan complet, enveloppes, actifs, crédits, valorisations (immobilier compris)</small></a>
</div>
<section class="section">
  <h2>Argumentation par Claude</h2>
  <div class="carte"><p>${cleClaude ? `${tag('fait', 'clé présente')} Les textes sont rédigés par Claude et mis en cache tant que la situation ne change pas.` : `${tag('manque', 'pas de clé')} Sans <code>ANTHROPIC_API_KEY</code> dans l'environnement du serveur, l'outil affiche un texte de repli écrit depuis les mêmes chiffres.`}</p><p class="source">Ce qui part : la cible, les poids actuels, le versement et sa répartition (avec l'enveloppe visée, ou à ouvrir), l'horizon et le plancher. Rien d'autre : ni valeur de la poche, ni immobilier, ni libellé, ni identité.</p></div>
</section>`);
}

// ——— Bilan complet (lot 0) ————————————————————————————————————————————

const MESSAGES_AVERTISSEMENT = {
  actif_non_valorise: (a) => `« ${a.libelle} » n'a aucune valeur saisie à cette date : il est exclu du total.`,
  passif_sans_solde: (a) => `Le crédit « ${a.libelle} » n'a pas de capital restant dû saisi : bilan incomplet.`,
  valorisation_ancienne: (a) => `La valeur de « ${a.libelle} » date de ${a.ageJours} jours.`,
  dette_sans_actif: (a) => `Le crédit « ${a.libelle} » garde un solde alors que « ${a.actif} » n'est pas au bilan à cette date : la dette reste comptée.`,
};

export function pageBilan(bilan) {
  const g = bilan.global;
  const enveloppes = bilan.enveloppes.map((e) => {
    const lignes = e.biens.map((b) => {
      const source = b.valeur ? `${echapper(b.valeur.source)}, ${dateEtAge(b.valeur)}` : 'aucune valeur saisie';
      const dettes = b.dettes.map((d) => `<span class="sous">${echapper(d.libelle)} : ${d.crd ? `${euros(d.crd.centimes)} (${dateEtAge(d.crd)})` : 'capital restant dû non saisi'}</span>`).join('');
      return `<tr>
        <td>${echapper(b.libelle)}<span class="sous">${source}</span>${dettes}</td>
        <td class="num">${b.valeur ? euros(b.valeur.centimes) : '—'}</td>
        <td class="num">${b.dettes.length ? euros(b.dette.centimes) : '—'}</td>
        <td class="num fort">${b.net ? euros(b.net.centimes) : '—'}</td>
        <td>${b.valeur ? tagStatut(b.statut) : tag('manque', 'non valorisé')}</td>
      </tr>`;
    }).join('') + e.dettesSansActif.map((d) => `<tr>
        <td>${echapper(d.libelle)}<span class="sous">crédit de « ${echapper(d.actif)} », hors bilan à cette date · ${echapper(d.crd.source)}, ${dateEtAge(d.crd)}</span></td>
        <td class="num">—</td><td class="num">${euros(d.crd.centimes)}</td><td class="num fort">—</td><td>${tag('manque', 'dette sans bien')}</td>
      </tr>`).join('');
    return `<section class="section">
      <h2>${echapper(e.libelle)} <span class="meta">${echapper(LIBELLES_TYPE[e.type] ?? e.type)} · quote-part ${quotePart(e.quotePart)}</span></h2>
      <div class="table"><table>
        <thead><tr><th>Ligne</th><th class="num">Valeur</th><th class="num">Dette</th><th class="num">Net</th><th>Statut</th></tr></thead>
        <tbody>${lignes || '<tr><td colspan="5" class="vide">Aucun actif dans cette enveloppe.</td></tr>'}</tbody>
        <tfoot><tr><td>Total à ta quote-part</td><td class="num">${euros(e.valeur.centimes)}</td><td class="num">${euros(e.dette.centimes)}</td><td class="num fort">${euros(e.net.centimes)}</td><td>${tagStatut(e.statut)}</td></tr></tfoot>
      </table></div>
    </section>`;
  }).join('');

  return gabarit('Bilan complet', '/bilan', `
<form class="date" method="get" action="/bilan"><label>Bilan au <input type="date" name="date" id="date" value="${echapper(bilan.date)}"></label><button>Afficher</button></form>
<div class="synthese">
  <div class="carte"><span class="etiquette">Patrimoine net</span><span class="chiffre">${euros(g.net.centimes)}</span><span class="delta">${tagStatut(g.statut)}${g.complet ? '' : ` ${tag('manque', 'incomplet')}`}</span></div>
  <div class="carte"><span class="etiquette">Actifs</span><span class="chiffre petit">${euros(g.valeur.centimes)}</span></div>
  <div class="carte"><span class="etiquette">Dettes</span><span class="chiffre petit">${euros(g.dette.centimes)}</span></div>
</div>
${blocAvertissements('À compléter', bilan.avertissements.map((a) => MESSAGES_AVERTISSEMENT[a.code](a)))}
${bilan.enveloppes.length === 0 ? '<p class="vide">Rien n\'est encore saisi. Commence par créer une <a href="/enveloppes">enveloppe</a>, puis ses <a href="/actifs">actifs</a>, leurs <a href="/passifs">crédits</a> et leurs <a href="/valorisations">valorisations</a>.</p>' : ''}
${enveloppes}`, { details: true });
}

// ——— Données détaillées (lot 0) ——————————————————————————————————————

export function pageEnveloppes({ enveloppes }, { valeurs = {}, motifs = [] } = {}) {
  const lignes = enveloppes.map((e) => `<tr><td>${echapper(e.libelle)}</td><td>${echapper(LIBELLES_TYPE[e.type])}</td><td>${echapper(e.etablissement)}</td><td>${quotePart(e.quotePart)}</td><td>${echapper(e.dateOuverture)}</td></tr>`).join('');
  return gabarit('Enveloppes', '/enveloppes', `
<h1>Enveloppes</h1>
<p class="aide">Le contenant fiscal ou juridique : un bien en direct, un PEE, un livret… La quote-part dit quelle fraction t'appartient (1/2 pour une indivision).</p>
<div class="table"><table><thead><tr><th>Libellé</th><th>Type</th><th>Établissement</th><th>Quote-part</th><th>Ouverture</th></tr></thead>
<tbody>${lignes || '<tr><td colspan="5" class="vide">Aucune enveloppe.</td></tr>'}</tbody></table></div>
<section class="section"><h2>Ajouter une enveloppe</h2>
${blocErreurs(motifs)}
<form method="post" action="/enveloppes" class="saisie">
  ${choix('type', 'Type *', options(TYPES_ENVELOPPE, LIBELLES_TYPE, valeurs.type))}
  ${champ('libelle', 'Libellé', valeurs, { requis: true })}
  ${champ('etablissement', 'Établissement', valeurs)}
  ${champ('date_ouverture', 'Date d\'ouverture', valeurs, { type: 'date' })}
  ${champ('quote_part', 'Quote-part', valeurs, { aide: '1/2, 1/3, 50 % — vide = 100 %' })}
  ${champ('regime_fiscal', 'Régime fiscal', valeurs, { aide: 'texte libre (LMNP, Pinel…)' })}
  <button>Enregistrer</button>
</form></section>`, { details: true });
}

export function pageActifs({ enveloppes, actifs }, { valeurs = {}, motifs = [] } = {}) {
  const nomEnveloppe = new Map(enveloppes.map((e) => [e.id, e.libelle]));
  const lignes = actifs.map((a) => `<tr><td>${echapper(a.libelle)}</td><td>${echapper(LIBELLES_NATURE[a.nature])}</td><td>${echapper(nomEnveloppe.get(a.enveloppeId))}</td><td>${echapper(a.dateAcquisition)}</td><td class="num">${euros(a.prixAcquisitionCentimes)}</td></tr>`).join('');
  const choixEnveloppes = enveloppes.map((e) => `<option value="${e.id}"${String(e.id) === valeurs.enveloppe_id ? ' selected' : ''}>${echapper(e.libelle)}</option>`).join('');
  return gabarit('Actifs', '/actifs', `
<h1>Actifs</h1>
<p class="aide">Ce que tu possèdes, rangé dans une enveloppe. Saisis-le à 100 % : la quote-part de l'enveloppe s'applique au calcul. Une ligne de la poche financière se classe ensuite dans <a href="/lignes">Lignes</a>.</p>
<div class="table"><table><thead><tr><th>Libellé</th><th>Nature</th><th>Enveloppe</th><th>Acquisition</th><th class="num">Prix</th></tr></thead>
<tbody>${lignes || '<tr><td colspan="5" class="vide">Aucun actif.</td></tr>'}</tbody></table></div>
<section class="section"><h2>Ajouter un actif</h2>
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
</form></section>`, { details: true });
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
<section class="section"><h2>Ajouter un crédit</h2>
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
</form></section>`, { details: true });
}

export function pageValorisations({ actifs, passifs, valorisations }, { valeurs = {}, motifs = [] } = {}) {
  const nomActif = new Map(actifs.map((a) => [a.id, a.libelle]));
  const nomPassif = new Map(passifs.map((p) => [p.id, p.libelle]));
  const cible = (c) => (c.actifId != null ? nomActif.get(c.actifId) : `Crédit · ${nomPassif.get(c.passifId)}`);
  const lignes = [...valorisations].reverse().map((v) => `<tr><td>${echapper(v.date)}</td><td>${echapper(cible(v.cible))}</td><td class="num">${euros(v.valeurCentimes)}</td><td>${echapper(v.source)}</td><td>${tagStatut(v.statut)}</td></tr>`).join('');
  const choixCible = [
    ...actifs.map((a) => [`actif:${a.id}`, a.libelle]),
    ...passifs.map((p) => [`passif:${p.id}`, `Crédit · ${p.libelle} (capital restant dû)`]),
  ].map(([v, l]) => `<option value="${v}"${v === valeurs.cible ? ' selected' : ''}>${echapper(l)}</option>`).join('');
  return gabarit('Valorisations', '/valorisations', `
<h1>Valorisations</h1>
<p class="aide">Une valeur datée pour un actif, ou le capital restant dû d'un crédit. Toujours à 100 %, toujours avec sa source.</p>
<section class="section"><h2>Ajouter une valeur</h2>
${blocErreurs(motifs)}
<form method="post" action="/valorisations" class="saisie">
  ${choix('cible', 'Porte sur *', choixCible)}
  ${champ('date', 'Date', valeurs, { type: 'date', requis: true })}
  ${champ('valeur', 'Montant (€)', valeurs, { requis: true, aide: 'à 100 %, exemple : 245 000' })}
  ${champ('source', 'Source', valeurs, { requis: true, aide: 'relevé de prêt, estimation d\'agence, relevé PEE…' })}
  ${choix('statut', 'Statut *', options(STATUTS, { fait: 'Fait (relevé, acte)', estimation: 'Estimation' }, valeurs.statut))}
  ${champ('note', 'Note', valeurs)}
  <button>Enregistrer</button>
</form></section>
<section class="section"><h2>Historique</h2>
<div class="table"><table><thead><tr><th>Date</th><th>Porte sur</th><th class="num">Montant à 100 %</th><th>Source</th><th>Statut</th></tr></thead>
<tbody>${lignes || '<tr><td colspan="5" class="vide">Aucune valeur saisie.</td></tr>'}</tbody></table></div></section>`, { details: true });
}
