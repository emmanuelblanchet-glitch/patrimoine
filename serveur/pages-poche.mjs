// Pages de la poche financière (lots 1 et 2) : accueil, point de départ,
// allocation, lignes, mouvements, réglages.

import {
  echapper, gabarit, blocErreurs, blocAvertissements, champ, choix, case_, options, tag, tagStatut, dateEtAge, dateFr,
  LIBELLES_TYPE, LIBELLES_CLASSE_LIGNE, NOM_ENVELOPPE_A_OUVRIR,
} from './gabarit.mjs';
import { LIBELLES_CLASSE, CLASSES, CLASSES_LIGNE } from '../lib/allocation.mjs';
import { TYPES_FINANCIERS, RECUL_TRI_JOURS } from '../lib/poche.mjs';
import { MENTION } from '../lib/explication.mjs';
import { euros, eurosRonds, pct } from '../lib/format.mjs';

// ——— Ma poche (accueil, lot 1) ————————————————————————————————————————

/** « 5 ans le … » d'une enveloppe PEA datée, ou null. */
function dateCinqAns(enveloppe) {
  if (enveloppe?.type !== 'pea' || !enveloppe.dateOuverture) return null;
  const [a, m, j] = enveloppe.dateOuverture.split('-').map(Number);
  return `${a + 5}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
}

const signe = (c) => (c > 0 ? '+' : '');

export function pageAccueil({ poche, explication, aujourdhui, etatCours = {} }) {
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

  const { objectif, exposition, ecarts, repartition, trajectoire, partFinancierePb, immobilierNetCentimes, lignes, rendement } = poche;
  const cotees = lignes.filter((l) => l.symboleCours);
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

  const etatCote = (l) => {
    if (!l.symboleCours) return '';
    const e = etatCours[l.symboleCours] ?? {};
    if (e.enVol) return ' <small>· cours en cours de mise à jour</small>';
    if (e.echec) return ` <small>· mise à jour impossible : ${echapper(e.echec)}</small>`;
    return '';
  };
  const lignesHtml = lignes.length
    ? lignes.map((l) => `<tr>
        <td>${echapper(l.libelle)}<span class="sous">${echapper(LIBELLES_TYPE[l.enveloppeType] ?? l.enveloppeType)} · ${echapper(LIBELLES_CLASSE_LIGNE[l.classe])}${l.classe === 'mixte' ? ` (${pct(l.partActionsPb)} actions)` : ''}${l.symboleCours ? ` · ${echapper(l.symboleCours)}${l.position ? `, ${l.position.partsMillioniemes / 1_000_000} parts` : ''}` : ''}</span></td>
        <td class="num">${l.valorisee ? euros(l.valeurCentimes) : '—'}</td>
        <td class="num">${l.plusValue ? `${signe(l.plusValue.centimes)}${euros(l.plusValue.centimes)}<span class="sous">${signe(l.plusValue.pb)}${pct(l.plusValue.pb)}</span>` : '—'}</td>
        <td>${l.valeur ? `${tagStatut(l.valeur.statut)} <small>${echapper(l.valeur.source)}, ${dateEtAge(l.valeur)}</small>` : l.symboleCours ? `${tag('manque', 'pas de cours')}` : tag('manque', 'non valorisé')}${etatCote(l)}</td>
      </tr>`).join('')
    : '<tr><td colspan="4" class="vide">Aucune ligne encore. <a href="/lignes">Classer ou créer des lignes</a>.</td></tr>';
  const rendementHtml = rendement.pb === null
    ? `<span class="chiffre petit">—</span><span class="delta">${rendement.reculJours === 0 ? 'aucun versement ou achat saisi' : rendement.reculJours < RECUL_TRI_JOURS ? `${rendement.reculJours} jour${rendement.reculJours > 1 ? 's' : ''} de recul : trop tôt pour le dire` : 'calcul impossible sur ces flux'}</span>`
    : `<span class="chiffre petit">${signe(rendement.pb)}${pct(rendement.pb)} <small>/ an</small></span><span class="delta">TRI de tes versements et achats${rendement.statut === 'estimation' ? ` ${tag('estim', 'estimation')} <small>moins d'un an de recul</small>` : ''}</span>`;

  return gabarit('Ma poche', '/', `
<h1>Ma poche financière</h1>
<p class="sous-titre">Au ${dateFr(poche.date)}. Objectif : une poche diversifiée, alimentée de ${eurosRonds(objectif.epargneMensuelleCentimes)} par mois, pour ne plus dépendre de l'immobilier.</p>

<div class="synthese">
  <div class="carte"><span class="etiquette">Valeur de la poche</span><span class="chiffre">${eurosRonds(exposition.totalCentimes)}</span><span class="delta">${lignes.length} ligne${lignes.length > 1 ? 's' : ''}</span></div>
  <div class="carte"><span class="etiquette">Versement du mois</span><span class="chiffre petit">${eurosRonds(objectif.epargneMensuelleCentimes)}</span><span class="delta">réglé dans <a href="/depart">ton point de départ</a></span></div>
  <div class="carte"><span class="etiquette">Part financière</span><span class="chiffre petit">${pct(partFinancierePb)}</span><span class="delta">du patrimoine net${dernier ? ` · ${pct(dernier.partFinancierePb)} en ${anneeCible} ${tag('estim', 'estimation')}` : ''}</span></div>
  <div class="carte"><span class="etiquette">Ce que ça rapporte</span>${rendementHtml}</div>
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
    <thead><tr><th>Ligne</th><th class="num">Valeur</th><th class="num">Depuis l'achat</th><th>Valeur du</th></tr></thead>
    <tbody>${lignesHtml}</tbody>
  </table></div>
  ${cotees.length ? `<form method="post" action="/cours/actualiser" class="date" style="margin-top:var(--esp-2)"><button>Actualiser les cours</button><small>Les cours se mettent à jour seuls quand ils ont plus de vingt heures ; ce bouton force la mise à jour.</small></form>` : ''}
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
  const peaSansDate = enveloppes.find((e) => e.type === 'pea' && !e.dateOuverture);
  const blocPea = types.has('pea')
    ? peaSansDate ? `<input type="hidden" name="a_pea" value="oui">${champ('pea_date', 'Date d\'ouverture de ton PEA', v, { type: 'date', aide: 'il est enregistré, mais sans date : ses avantages fiscaux sont acquis cinq ans après' })}` : ''
    : `${case_('a_pea', 'un PEA', v)}${champ('pea_date', 'Date d\'ouverture du PEA', v, { type: 'date', aide: 'ses avantages fiscaux sont acquis cinq ans après' })}`;
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
  ${dejaPee ? '<p class="aide">3. Ton PEE est déjà enregistré comme ligne ; sa valeur se met à jour dans <a href="/versement">Mouvement</a>.</p>' : `${champ('pee', '3. Qu\'y a-t-il sur ton PEE ?', v, { question: true, aide: '0 si tu n\'en as pas' })}
  ${champ('pee_part_actions', 'Quelle part du PEE est en actions ? (%)', v, { aide: 'si tu ne sais pas, laisse vide : 50 %' })}`}
  ${champ('horizon', '4. Dans combien d\'années comptes-tu te servir de cet argent ?', v, { requis: true, question: true, aide: 'en années' })}
  ${champ('perte_max', '5. Quelle perte maximale accepterais-tu de voir, sans vendre ? (%)', v, { requis: true, question: true, aide: 'sur l\'ensemble de la poche ; 30 par défaut' })}
  ${champ('immobilier', '6. Que vaut ton immobilier, net de crédits, à la louche ?', v, { requis: true, question: true, aide: 'une estimation suffit ; 0 si aucun' })}
  ${champ('immobilier_date', 'Date de cette estimation', v, { type: 'date', requis: true })}
  ${champ('immobilier_source', 'D\'où vient-elle ?', v, { requis: true, aide: 'agence, annonces, à la louche…' })}
  ${champ('rendement', 'Rendement annuel estimé de la poche (%)', v, { aide: 'sert à la trajectoire seulement ; 5 par défaut, c\'est une estimation' })}
  ${!blocPea && types.has('av') ? '' : `<div><span class="question">Ce que tu as déjà ouvert</span>${blocPea}${types.has('av') ? '' : case_('a_av', 'une assurance-vie', v)}<small>Coche seulement ce qui existe ; l'outil te dira quoi ouvrir sinon. Tu peux revenir cocher ici le jour où tu l'ouvres.</small></div>`}
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

export function pageAllocation({ poche, cible, enveloppes = [] }) {
  const lignesCible = Object.keys(cible);
  const pea = enveloppes.find((e) => e.type === 'pea');
  const cinqAns = dateCinqAns(pea);
  const blocs = lignesCible.map((classe) => {
    const d = poche.destinations[classe];
    const type = d.enveloppeType;
    const ou = d.ligne ? `${echapper(d.ligne.libelle)} <small>· ${echapper(LIBELLES_TYPE[type] ?? type)}</small>` : tag('manque', `à ouvrir : ${NOM_ENVELOPPE_A_OUVRIR[d.aOuvrir] ?? d.aOuvrir}`);
    const motif = d.motif === 'matelas' ? ' Le livret d\'abord, tant que le matelas de précaution n\'est pas reconstitué.' : '';
    return `<div class="carte"><span class="etiquette">${echapper(LIBELLES_CLASSE[classe])}</span><span class="chiffre petit">${pct(cible[classe])}</span>
      <p>Reçoit ses versements sur : ${ou}.</p>
      <p class="source">${echapper(POURQUOI_ENVELOPPE[type] ?? '')}${echapper(motif)}${type === 'pea' && pea ? (cinqAns ? ` Avantages fiscaux acquis le ${dateFr(cinqAns)}.` : ' Date d\'ouverture du PEA inconnue : indique-la au point de départ pour connaître la date des cinq ans.') : ''}</p></div>`;
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

export function pageLignes({ etat, poche }, { valeurs = {}, motifs = [], recherche = null } = {}) {
  const financiers = etat.enveloppes.filter((e) => TYPES_FINANCIERS.has(e.type));
  const idsFinanciers = new Set(financiers.map((e) => e.id));
  const nomEnv = new Map(etat.enveloppes.map((e) => [e.id, e]));
  const candidats = etat.actifs.filter((a) => idsFinanciers.has(a.enveloppeId) && !a.dateCloture);
  const lignes = poche.lignes.map((l) => `<tr>
      <td>${echapper(l.libelle)}<span class="sous">${echapper(l.enveloppeLibelle)} · ${echapper(LIBELLES_TYPE[l.enveloppeType] ?? l.enveloppeType)}${l.symboleCours ? ` · ${echapper(l.symboleCours)}` : ''}</span></td>
      <td>${echapper(LIBELLES_CLASSE_LIGNE[l.classe])}${l.classe === 'mixte' ? ` <small>${pct(l.partActionsPb)} actions</small>` : ''}</td>
      <td class="num">${l.valorisee ? euros(l.valeurCentimes) : '—'}</td>
    </tr>`).join('');
  const nonClasses = candidats.filter((a) => !a.classePoche);
  const choixActifs = candidats.map((a) => `<option value="${a.id}"${String(a.id) === valeurs.actif_id ? ' selected' : ''}>${echapper(a.libelle)} (${echapper(nomEnv.get(a.enveloppeId)?.libelle)})${a.classePoche ? '' : ' — à classer'}</option>`).join('');
  const enveloppesCotees = financiers.filter((e) => ['pea', 'cto', 'av', 'per'].includes(e.type));
  const choixEnveloppesCotees = enveloppesCotees.map((e) => `<option value="${e.id}"${String(e.id) === valeurs.enveloppe_id ? ' selected' : ''}>${echapper(e.libelle)} (${echapper(LIBELLES_TYPE[e.type])})</option>`).join('');
  const resultats = recherche?.resultats?.length
    ? `<div class="table"><table><thead><tr><th>Trouvé</th><th>Place</th><th>Ajouter dans</th><th></th></tr></thead><tbody>${recherche.resultats.map((r) => `<tr>
        <td>${echapper(r.nom)}<span class="sous">${echapper(r.symbole)} · ${r.type === 'etf' ? 'ETF' : 'action'}</span></td>
        <td>${echapper(r.place ?? '')}</td>
        <td><form method="post" action="/lignes/ajouter" class="date"><input type="hidden" name="symbole" value="${echapper(r.symbole)}"><input type="hidden" name="nom" value="${echapper(r.nom)}"><input type="hidden" name="nature" value="${r.type}">
          <select name="enveloppe_id" aria-label="enveloppe">${choixEnveloppesCotees}</select>
          <select name="classe" aria-label="classe">${options(CLASSES, LIBELLES_CLASSE, 'actions_monde')}</select>
          <button>Ajouter</button></form></td><td></td></tr>`).join('')}</tbody></table></div>`
    : recherche ? `<p class="vide">${recherche.motif ? echapper(recherche.motif) : `Rien trouvé pour « ${echapper(recherche.q)} ». Essaie le code ISIN (sur la fiche de l\'ETF) ou le symbole de cotation.`}</p>` : '';
  const pea = etat.enveloppes.find((e) => e.type === 'pea');
  const cinqAns = dateCinqAns(pea);
  return gabarit('Lignes', '/lignes', `
<h1>Mes lignes</h1>
<p class="sous-titre">Chaque ligne de la poche a une classe : actions monde, sans risque, ou mixte. C'est elle qui décide où va ton versement.${cinqAns ? ` PEA : avantages fiscaux acquis le ${dateFr(cinqAns)}.` : ''}</p>
<section class="section" style="margin-top:0">
<h2>Ajouter une ligne cotée</h2>
<p class="aide">Tape le code ISIN (douze caractères, sur la fiche du fonds) ou le symbole de cotation ; l'outil retrouve le nom et la place, tu choisis l'enveloppe et la classe.</p>
${enveloppesCotees.length ? `<form method="get" action="/lignes" class="date">${champ('q', 'Code ISIN ou symbole', { q: recherche?.q ?? '' }, { requis: true })}<button>Chercher</button></form>${resultats}` : '<p class="vide">Il faut d\'abord une enveloppe qui accueille des titres (PEA, compte-titres, assurance-vie) : coche-la au <a href="/depart">point de départ</a>.</p>'}
</section>
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
<p class="aide">Une ligne non cotée (fonds euros, livret) se crée depuis <a href="/actifs">données détaillées</a>, puis se classe ici.</p>
</section>`);
}

// ——— Versement ——————————————————————————————————————————————————————

export function pageVersement({ poche, aujourdhui, achats = [] }, { valeurs = {}, motifs = [], formulaire = 'versement' } = {}) {
  const nonCotees = poche.lignes.filter((l) => !l.symboleCours);
  const cotees = poche.lignes.filter((l) => l.symboleCours);
  const nomLigne = new Map(poche.lignes.map((l) => [l.actifId, l.libelle]));
  const option = (l) => `<option value="${l.actifId}"${String(l.actifId) === valeurs.actif_id ? ' selected' : ''}>${echapper(l.libelle)} (${echapper(LIBELLES_TYPE[l.enveloppeType] ?? l.enveloppeType)})</option>`;
  // Les valeurs retapées ne reviennent que dans le formulaire qui a échoué.
  const v = { date: aujourdhui, ...valeurs };
  const vAchat = formulaire === 'achat' ? v : { date: aujourdhui };
  const vVersement = formulaire === 'versement' ? v : { date: aujourdhui };
  const erreurs = (nom) => (formulaire === nom ? blocErreurs(motifs) : '');
  const lignesAchats = achats.map((a) => `<tr>
      <td>${echapper(dateFr(a.date))}</td>
      <td>${echapper(nomLigne.get(a.actifId) ?? '?')}<span class="sous">${a.partsMillioniemes / 1_000_000} parts${a.fraisCentimes ? `, ${euros(a.fraisCentimes)} de frais` : ''}</span></td>
      <td class="num">${euros(a.montantCentimes)}</td>
      <td><form method="post" action="/achat/annuler"><input type="hidden" name="achat_id" value="${a.id}"><button class="discret">Annuler</button></form></td>
    </tr>`).join('');
  return gabarit('Mouvement', '/versement', `
<h1>J'ai acheté, j'ai versé</h1>
<p class="sous-titre">Une phrase, trois champs. Un achat de parts suit ensuite son cours tout seul ; un versement sur une ligne sans cours porte sa nouvelle valeur si tu la connais.</p>
<section class="section" style="margin-top:0">
<h2>J'ai acheté des parts</h2>
${erreurs('achat')}
${cotees.length ? `<form method="post" action="/achat" class="saisie">
  ${champ('parts', 'Nombre de parts', vAchat, { requis: true, aide: 'exemple : 12 ou 12,5' })}
  ${champ('prix', 'Prix par part (€)', vAchat, { requis: true })}
  ${choix('actif_id', 'Sur la ligne', cotees.map(option).join(''))}
  ${champ('date', 'Le', vAchat, { type: 'date', requis: true })}
  ${champ('frais', 'Frais de courtage (€)', vAchat, { aide: 'facultatif' })}
  <button>Enregistrer l'achat</button>
</form>` : '<p class="vide">Aucune ligne cotée : <a href="/lignes">ajoute ton ETF</a> par son code.</p>'}
${lignesAchats ? `<h3>Mes achats</h3>${erreurs('annulation')}<div class="table"><table>
  <thead><tr><th>Le</th><th>Ligne</th><th class="num">Coût</th><th></th></tr></thead>
  <tbody>${lignesAchats}</tbody>
</table></div><p class="aide">Une erreur de saisie s'annule ; l'achat reste dans l'historique, barré par son annulation. Le rendement s'affiche après ${RECUL_TRI_JOURS} jours de recul.</p>` : ''}
</section>
<section class="section">
<h2>J'ai versé</h2>
${erreurs('versement')}
${nonCotees.length ? `<form method="post" action="/versement" class="saisie">
  ${champ('montant', 'Montant (€)', vVersement, { requis: true })}
  ${choix('actif_id', 'Sur la ligne', nonCotees.map(option).join(''))}
  ${champ('date', 'Le', vVersement, { type: 'date', requis: true })}
  ${choix('type', 'Nature', options(['versement', 'abondement'], { versement: 'Versement', abondement: 'Abondement (PEE)' }, vVersement.type))}
  ${champ('nouvelle_valeur', 'Nouvelle valeur de la ligne (€)', vVersement, { aide: 'facultatif : la valeur totale après ce versement' })}
  ${champ('source', 'Source de cette valeur', vVersement, { aide: 'relevé, cours du jour…' })}
  <button>Enregistrer</button>
</form>` : '<p class="vide">Aucune ligne sans cours. Réponds d\'abord au <a href="/depart">point de départ</a>.</p>'}
</section>`);
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
