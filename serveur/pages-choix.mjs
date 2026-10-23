// Page « Choisir mon ETF » (sous-lot 2b) : hypothèses modifiables sans rien
// écrire, coût de chaque candidat, recommandation rédigée, faits datés.

import { echapper, gabarit, blocErreurs, blocAvertissements, champ, tag, dateFr } from './gabarit.mjs';
import { euros, eurosRonds, pct } from '../lib/format.mjs';
import { MENTION } from '../lib/choix-etf.mjs';
import { FRAICHEUR_MAX_JOURS, ageJours } from '../lib/references.mjs';

const LIBELLES_FAIT = {
  fraisCourantsPb: 'frais courants', prixPartCentimes: 'prix de part', encoursMillionsEuros: 'encours', replication: 'réplication',
  capitalisant: 'capitalisant', eligiblePea: 'éligible PEA', indice: 'indice', premiereVl: 'première valeur liquidative',
  fraisOrdre: 'courtage par ordre', minimumOrdreCentimes: 'minimum par ordre', droitsDeGardeCentimes: 'droits de garde', emetteursSansCourtageAchat: 'ETF sans courtage à l\'achat',
};

function valeurFait(nom, fait) {
  const v = fait.valeur;
  switch (nom) {
    case 'fraisCourantsPb': return pct(v);
    case 'prixPartCentimes': case 'minimumOrdreCentimes': case 'droitsDeGardeCentimes': return euros(v);
    case 'encoursMillionsEuros': return `${v.toLocaleString('fr-FR')} M€`;
    case 'capitalisant': case 'eligiblePea': return v ? 'oui' : 'non';
    case 'premiereVl': return dateFr(v);
    case 'fraisOrdre': return `${euros(v.forfaitCentimes)} jusqu'à ${eurosRonds(v.jusquaCentimes)}, puis ${pct(v.tauxAuDelaPb)} ; plafond PEA ${pct(v.plafondPeaPb)} de l'ordre`;
    case 'emetteursSansCourtageAchat': return v.length ? v.join(', ') : 'aucun';
    default: return String(v);
  }
}

const faitHtml = ([nom, f]) => `${LIBELLES_FAIT[nom] ?? nom} ${echapper(valeurFait(nom, f))} <small>(<a href="${echapper(f.source)}" rel="noreferrer">source</a>, ${dateFr(f.releve_le)})</small>`;

export function pageChoisirEtf({ references, classement, explication, hypotheses, perimes, aujourdhui }, { valeurs = {}, motifs = [] } = {}) {
  const v = {
    versement: valeurs.versement ?? (hypotheses.versementCentimes / 100).toString(),
    horizon: valeurs.horizon ?? String(hypotheses.horizonAnnees),
    rendement: valeurs.rendement ?? (hypotheses.rendementPb / 100).toString(),
  };
  const courtier = references.courtier;
  const lignes = classement.lignes.map(({ candidat: c, cout }) => `<tr${c.symbole === classement.recommande ? ' class="reco"' : ''}>
      <td>${echapper(c.nom)}<span class="sous">${echapper(c.symbole)} · ${echapper(c.emetteur)}${c.faits.capitalisant.valeur ? '' : ' · distribuant'}</span></td>
      <td class="num">${pct(c.faits.fraisCourantsPb.valeur)}</td>
      <td class="num">${euros(c.faits.prixPartCentimes.valeur)}</td>
      <td class="num">${c.faits.encoursMillionsEuros.valeur.toLocaleString('fr-FR')} M€</td>
      <td class="num">${cout.sansCourtageAchat ? '0 €' : euros(Math.round(cout.premiereAnnee.ordresCentimes / Math.max(1, cout.premiereAnnee.nombreOrdres)))}</td>
      <td class="num">${euros(cout.premiereAnnee.totalCentimes)}</td>
      <td class="num">${eurosRonds(cout.horizon.totalCentimes)}</td>
      <td>${cout.achetableChaqueMois ? tag('fait', c.symbole === classement.recommande ? 'recommandé' : 'oui') : tag('manque', 'pas chaque mois')}</td>
    </tr>`).join('');
  const faits = [
    `<li><strong>${echapper(courtier.nom)}</strong> (${echapper(courtier.formule)}) : ${Object.entries(courtier.faits).map(faitHtml).join(' · ')}</li>`,
    ...references.candidats.map((c) => `<li><strong>${echapper(c.symbole)}</strong> ${echapper(c.nom)}, ISIN ${echapper(c.isin)} : ${Object.entries(c.faits).map(faitHtml).join(' · ')}</li>`),
  ].join('');
  const tousLesFaits = [...Object.values(courtier.faits), ...references.candidats.flatMap((c) => Object.values(c.faits))];
  const plusAncien = Math.max(...tousLesFaits.map((f) => ageJours(f, aujourdhui)));
  const origine = explication.origine === 'claude'
    ? `rédigé par Claude (${echapper(explication.modele ?? '')}) le ${echapper(explication.date?.slice(0, 10) ?? '')}`
    : `texte de repli écrit depuis les chiffres ; ${explication.raison === 'sans_cle' ? 'aucune clé Claude dans l\'environnement' : explication.raison ? `dernier appel : ${echapper(explication.raison)}${explication.enCours ? ' ; nouvel essai en cours' : explication.enRecul ? ' ; nouvel essai dans dix minutes' : ''}` : 'Claude rédige en arrière-plan, recharge la page dans un instant'}`;
  return gabarit('Choisir mon ETF', '/choisir/etf', `
<h1>Choisir mon ETF monde</h1>
<p class="sous-titre">Les ETF MSCI World éligibles au PEA, et ce que chacun te coûterait chez ${echapper(courtier.nom)} pour ton rythme. Un seul suffit. Les faits viennent des pages officielles, chacun avec sa date.</p>
${blocErreurs(motifs)}
${perimes.length ? blocAvertissements('Faits à rafraîchir', [`${perimes.length} fait${perimes.length > 1 ? 's ont' : ' a'} plus de ${FRAICHEUR_MAX_JOURS} jours (${[...new Set(perimes.map((p) => p.ou))].join(', ')}) : les coûts ci-dessous peuvent avoir changé.`]) : ''}
<form method="get" action="/choisir/etf" class="saisie" style="margin-bottom:var(--esp-3)">
  ${champ('versement', 'Versement mensuel (€)', v, { requis: true, aide: 'pré-rempli depuis ton point de départ' })}
  ${champ('horizon', 'Horizon (années)', v, { requis: true })}
  ${champ('rendement', 'Rendement annuel estimé (%)', v, { aide: 'sert au coût cumulé seulement' })}
  <button>Recalculer</button>
</form>
<div class="table"><table>
  <thead><tr><th>ETF</th><th class="num">Frais courants</th><th class="num">Part</th><th class="num">Encours</th><th class="num">Courtage / ordre</th><th class="num">Coût 1<sup>re</sup> année</th><th class="num">Coût sur ${hypotheses.horizonAnnees} ans</th><th>Achetable chaque mois</th></tr></thead>
  <tbody>${lignes}</tbody>
</table></div>
<p class="source">Coût = courtage de chaque ordre + frais courants prélevés sur l'encours, mois par mois, à ${pct(hypotheses.rendementPb)} par an d'hypothèse ${tag('estim', 'estimation')}. Le courtage suit la grille ${echapper(courtier.formule)} de ${echapper(courtier.nom)} ; les ETF ${echapper(courtier.faits.emetteursSansCourtageAchat.valeur.join(', '))} sont sans courtage à l'achat. Un ETF dont la part vaut plus que le versement n'est pas achetable chaque mois : l'argent attend.</p>
<section class="section">
<h2>Ce que ça veut dire</h2>
<div class="carte"><p>${echapper(explication.texte)}</p><p class="source">${origine}</p></div>
</section>
<section class="section">
<h2>Les faits et leurs dates</h2>
<ul class="faits">${faits}</ul>
<p class="aide">Rien ne met ces faits à jour tout seul : ils sont relevés à la main sur les pages officielles, puis relus. Au ${dateFr(aujourdhui)}, le plus ancien a ${plusAncien} jour${plusAncien > 1 ? 's' : ''}. ${MENTION}</p>
</section>`);
}
