// Seams S-L2-5 (coût exact, exemples à la main) et S-L2-7 (charge utile fermée).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fraisOrdre, achetableChaqueMois, simuler, classer, chargeUtileEtf, empreinteEtf, texteDeRepliEtf, messagesPourClaudeEtf, CLES_CHARGE_UTILE_ETF, MENTION } from '../lib/choix-etf.mjs';

const fait = (valeur) => ({ valeur, source: 'https://exemple.test/', releve_le: '2026-10-23' });
const COURTIER = {
  nom: 'Courtier test', formule: 'Test',
  faits: {
    fraisOrdre: fait({ forfaitCentimes: 199, jusquaCentimes: 50000, tauxAuDelaPb: 60, plafondPeaPb: 50 }),
    minimumOrdreCentimes: fait(10000), droitsDeGardeCentimes: fait(0), emetteursSansCourtageAchat: fait(['Gratuit']),
  },
};
const candidat = (symbole, emetteur, { frais = 20, prix = 700, encours = 1000, capitalisant = true } = {}) => ({
  symbole, isin: `ISIN${symbole}`, nom: `ETF ${symbole}`, emetteur,
  faits: { fraisCourantsPb: fait(frais), prixPartCentimes: fait(prix), encoursMillionsEuros: fait(encours), replication: fait('synthétique'), capitalisant: fait(capitalisant), eligiblePea: fait(true), indice: fait('MSCI World'), premiereVl: fait('2024-01-01') },
});

test('S-L2-5 — courtage d\'un ordre : forfait, taux au-delà, plafond PEA, et zéro chez un émetteur partenaire', () => {
  const payant = candidat('P', 'Payant');
  assert.equal(fraisOrdre(COURTIER, payant, 50000), 199, '500 € : forfait (le plafond 2,50 € ne mord pas)');
  assert.equal(fraisOrdre(COURTIER, payant, 30000), 150, '300 € : le plafond de 0,5 % (1,50 €) passe sous le forfait');
  assert.equal(fraisOrdre(COURTIER, payant, 100000), 500, '1 000 € : 0,60 % = 6 €, plafonné à 0,5 % = 5 €');
  assert.equal(fraisOrdre(COURTIER, candidat('G', 'Gratuit'), 50000), 0);
});

test('S-L2-5 — achetable chaque mois : au moins une part et au moins le minimum du courtier', () => {
  assert.equal(achetableChaqueMois(COURTIER, candidat('A', 'X', { prix: 700 }), 50000), true);
  assert.equal(achetableChaqueMois(COURTIER, candidat('B', 'X', { prix: 70000 }), 50000), false, 'une part à 700 € pour 500 € par mois');
  assert.equal(achetableChaqueMois(COURTIER, candidat('C', 'X', { prix: 700 }), 5000), false, '50 € par mois : sous le minimum d\'ordre');
});

test('S-L2-5 — coût calculé à la main : 100 € par mois, 12 % de frais courants, rendement nul, aucun courtage', () => {
  // Chaque mois : +100 € investis, puis 1 % de frais sur le capital.
  // 10 000 → 100 ; 19 900 → 199 ; 29 701 → 297 ; 39 404 → 394 ; 49 010 → 490 ; 58 520 → 585 ;
  // 67 935 → 679 ; 77 256 → 773 ; 86 483 → 865 ; 95 618 → 956 ; 104 662 → 1 047 ; 113 615 → 1 136.
  const [an] = simuler({ courtier: COURTIER, candidat: candidat('G', 'Gratuit', { frais: 1200, prix: 100 }), versementCentimes: 10000, horizonAnnees: 1, rendementPb: 0 });
  assert.equal(an.gestionCentimes, 7521);
  assert.equal(an.ordresCentimes, 0);
  assert.equal(an.nombreOrdres, 12);
  assert.equal(an.capitalCentimes, 120000 - 7521);
});

test('S-L2-5 — coût calculé à la main : 500 € par mois, 0 % de frais courants, courtage payant, puis une part trop chère', () => {
  const [an] = simuler({ courtier: COURTIER, candidat: candidat('P', 'Payant', { frais: 0 }), versementCentimes: 50000, horizonAnnees: 1, rendementPb: 0 });
  assert.equal(an.ordresCentimes, 12 * 199);
  assert.equal(an.capitalCentimes, 12 * (50000 - 199));
  // Part à 700 € : l'argent attend un mois, six ordres de 1 000 € dans l'année, 5 € chacun (plafond).
  const [cher] = simuler({ courtier: COURTIER, candidat: candidat('C', 'Payant', { frais: 0, prix: 70000 }), versementCentimes: 50000, horizonAnnees: 1, rendementPb: 0 });
  assert.equal(cher.nombreOrdres, 6);
  assert.equal(cher.ordresCentimes, 6 * 500);
  // Le rendement joue sur le coût de gestion, pas sur le courtage.
  const [avecRendement] = simuler({ courtier: COURTIER, candidat: candidat('G', 'Gratuit', { frais: 20 }), versementCentimes: 50000, horizonAnnees: 1, rendementPb: 1200 });
  const [sansRendement] = simuler({ courtier: COURTIER, candidat: candidat('G', 'Gratuit', { frais: 20 }), versementCentimes: 50000, horizonAnnees: 1, rendementPb: 0 });
  assert.ok(avecRendement.gestionCentimes > sansRendement.gestionCentimes);
  assert.equal(avecRendement.ordresCentimes, sansRendement.ordresCentimes);
});

test('classement : achetables d\'abord par coût cumulé, puis encours ; le premier achetable est recommandé', () => {
  const references = {
    courtier: COURTIER,
    candidats: [
      candidat('CHER', 'Payant', { frais: 38, prix: 70000, encours: 7000 }),
      candidat('PAYANT', 'Payant', { frais: 20, prix: 700, encours: 2300 }),
      candidat('GRATUIT', 'Gratuit', { frais: 20, prix: 600, encours: 1400 }),
      candidat('GRATUIT2', 'Gratuit', { frais: 20, prix: 600, encours: 1500 }),
    ],
  };
  const c = classer(references, { versementCentimes: 50000, horizonAnnees: 10, rendementPb: 500 });
  assert.deepEqual(c.lignes.map((l) => l.candidat.symbole), ['GRATUIT2', 'GRATUIT', 'PAYANT', 'CHER'], 'à coût égal, l\'encours le plus gros d\'abord ; le non achetable en dernier');
  assert.equal(c.recommande, 'GRATUIT2');
  assert.equal(c.lignes[3].cout.achetableChaqueMois, false);
  assert.equal(classer({ courtier: COURTIER, candidats: [candidat('X', 'Payant', { prix: 70000 })] }, { versementCentimes: 50000, horizonAnnees: 1, rendementPb: 0 }).recommande, null);
});

test('S-L2-7 — la charge utile ne contient que les clés prévues ; par candidat, des faits chiffrés et rien d\'autre', () => {
  const references = { courtier: COURTIER, candidats: [candidat('A', 'Gratuit'), candidat('B', 'Payant', { capitalisant: false })] };
  const hypotheses = { versementCentimes: 50000, horizonAnnees: 10, rendementPb: 500 };
  const charge = chargeUtileEtf(classer(references, hypotheses), hypotheses);
  assert.deepEqual(Object.keys(charge).sort(), [...CLES_CHARGE_UTILE_ETF].sort());
  const clesCandidat = ['symbole', 'nom', 'emetteur', 'fraisCourantsPb', 'prixPartCentimes', 'encoursMillionsEuros', 'capitalisant', 'sansCourtageAchat', 'achetableChaqueMois', 'coutPremiereAnneeCentimes', 'coutHorizonCentimes'];
  for (const c of charge.candidats) assert.deepEqual(Object.keys(c).sort(), [...clesCandidat].sort());
  const texte = JSON.stringify(charge);
  assert.doesNotMatch(texte, /source|releve_le|isin|immobilier|libelle/i);
  assert.equal(charge.recommande, 'A');
  // Même charge, même empreinte ; une hypothèse change, autre empreinte.
  assert.equal(empreinteEtf(charge), empreinteEtf(JSON.parse(texte)));
  assert.notEqual(empreinteEtf(charge), empreinteEtf(chargeUtileEtf(classer(references, { ...hypotheses, horizonAnnees: 11 }), { ...hypotheses, horizonAnnees: 11 })));
});

test('le texte de repli dit le recommandé, ses coûts, les autres, et finit par la mention ; les messages pour Claude portent la consigne', () => {
  const references = { courtier: COURTIER, candidats: [candidat('A', 'Gratuit'), candidat('B', 'Payant', { capitalisant: false }), candidat('C', 'Payant', { prix: 70000 })] };
  const hypotheses = { versementCentimes: 50000, horizonAnnees: 10, rendementPb: 500 };
  const charge = chargeUtileEtf(classer(references, hypotheses), hypotheses);
  const t = texteDeRepliEtf(charge).replace(/[\u00a0\u202f]/g, ' ');
  assert.match(t, /500 € par mois pendant 10 ans/);
  assert.match(t, /ETF A \(A\)/);
  assert.match(t, /aucun courtage à l'achat/);
  assert.match(t, /B coûterait .* et distribue ses dividendes/);
  assert.match(t, /C n'est pas achetable chaque mois : une part vaut 700,00 €/);
  assert.ok(t.endsWith(MENTION));
  const m = messagesPourClaudeEtf(charge);
  assert.match(m.system, /ne décides rien/);
  assert.match(m.system, /ne contredis jamais le candidat recommandé/);
  assert.ok(m.user.includes(JSON.stringify(charge)));
  assert.match(texteDeRepliEtf({ ...charge, recommande: null }), /Aucun candidat n'est achetable/);
});
