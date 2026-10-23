// La poche assemblée : lignes classées, destinations, état complet.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appliquerMigrations } from '../lib/schema.mjs';
import { creerEnveloppe, creerActif, ajouterValorisation, lireEtat } from '../lib/referentiel.mjs';
import { enregistrerObjectif, lireObjectif, lireCible, classerLigne } from '../lib/objectif.mjs';
import { lignesDeLaPoche, destinations, etatDeLaPoche, rendementDeLaPoche } from '../lib/poche.mjs';
import { baseJetable } from './aide.mjs';

const OBJ = {
  reserveCentimes: 25_000_00, matelasCentimes: 15_000_00, epargneMensuelleCentimes: 500_00,
  horizonAnnees: 10, perteMaxPb: 3000, immobilierNetCentimes: 300_000_00, immobilierDate: '2026-10-01', immobilierSource: 'louche',
};

function ligne(base, type, libelleEnv, nature, libelle, classe, valeur, partActionsPb) {
  const env = creerEnveloppe(base, { type, libelle: libelleEnv });
  const id = creerActif(base, { enveloppeId: env, nature, libelle });
  classerLigne(base, id, classe, partActionsPb);
  if (valeur != null) ajouterValorisation(base, { cible: { actifId: id }, date: '2026-10-20', valeurCentimes: valeur, source: 'relevé', statut: 'fait' });
  return id;
}

test('les lignes de la poche excluent l\'immobilier et les actifs non classés', () => {
  const { base, nettoyer } = baseJetable();
  try {
    appliquerMigrations(base);
    const immo = creerEnveloppe(base, { type: 'immobilier_direct', libelle: 'Maison' });
    const bien = creerActif(base, { enveloppeId: immo, nature: 'bien', libelle: 'Maison' });
    classerLigne(base, bien, 'sans_risque'); // classé par erreur : l'enveloppe l'exclut quand même
    const livretEnv = creerEnveloppe(base, { type: 'livret', libelle: 'Livret' });
    creerActif(base, { enveloppeId: livretEnv, nature: 'liquidites', libelle: 'Non classé' });
    ligne(base, 'livret', 'Livret A', 'liquidites', 'Livret A', 'sans_risque', 10_000_00);
    const l = lignesDeLaPoche(lireEtat(base), '2026-10-23');
    assert.deepEqual(l.map((x) => x.libelle), ['Livret A']);
    assert.equal(l[0].valeurCentimes, 10_000_00);
  } finally {
    nettoyer();
  }
});

test('destinations : PEA pour les actions, livret sous le matelas puis assurance-vie ; sinon, à ouvrir', () => {
  const l = (classe, enveloppeType, valeurCentimes) => ({ classe, enveloppeType, valeurCentimes, libelle: enveloppeType });
  let d = destinations([], 15_000_00);
  assert.equal(d.actions_monde.aOuvrir, 'pea');
  assert.equal(d.sans_risque.aOuvrir, 'av');

  d = destinations([l('sans_risque', 'livret', 10_000_00)], 15_000_00);
  assert.equal(d.sans_risque.ligne.enveloppeType, 'livret');
  assert.equal(d.sans_risque.motif, 'matelas');

  d = destinations([l('sans_risque', 'livret', 20_000_00)], 15_000_00);
  assert.equal(d.sans_risque.aOuvrir, 'av', 'matelas atteint, pas d\'assurance-vie : à ouvrir');

  d = destinations([l('sans_risque', 'livret', 20_000_00), l('sans_risque', 'av', 0), l('actions_monde', 'cto', 100), l('actions_monde', 'pea', 0)], 15_000_00);
  assert.equal(d.sans_risque.ligne.enveloppeType, 'av');
  assert.equal(d.actions_monde.ligne.enveloppeType, 'pea', 'le PEA passe avant le compte-titres');
});

test('état de la poche : exposition, répartition du mois, part financière, trajectoire, charge utile et empreinte', () => {
  const { base, nettoyer } = baseJetable();
  try {
    appliquerMigrations(base);
    enregistrerObjectif(base, OBJ);
    ligne(base, 'livret', 'Livret', 'liquidites', 'Livret', 'sans_risque', 10_000_00);
    ligne(base, 'pee', 'PEE', 'fcpe', 'PEE global', 'mixte', 10_000_00, 5000);
    ligne(base, 'pea', 'PEA', 'etf', 'ETF monde', 'actions_monde', 0);
    const p = etatDeLaPoche(lireEtat(base), lireObjectif(base), lireCible(base), '2026-10-23');
    assert.equal(p.exposition.totalCentimes, 20_000_00);
    assert.equal(p.exposition.parClasse.actions_monde.poidsPb, 2500);
    assert.equal(p.regle, 'rattrapage');
    assert.equal(p.classeRattrapee, 'actions_monde');
    assert.equal(p.repartition[0].centimes, 500_00);
    assert.equal(p.repartition[0].destination.ligne.libelle, 'ETF monde');
    assert.equal(p.partFinancierePb, Math.round((20_000_00 * 10000) / 320_000_00));
    assert.equal(p.trajectoire.length, 11);
    assert.ok(p.trajectoire[10].partFinancierePb > p.partFinancierePb);
    assert.equal(typeof p.empreinte, 'string');
    assert.equal(p.charge.versementCentimes, 500_00);
  } finally {
    nettoyer();
  }
});

test('sans point de départ : pas de charge utile, pas de trajectoire, mais un état lisible', () => {
  const { base, nettoyer } = baseJetable();
  try {
    appliquerMigrations(base);
    const p = etatDeLaPoche(lireEtat(base), null, lireCible(base), '2026-10-23');
    assert.equal(p.objectif, null);
    assert.equal(p.charge, null);
    assert.deepEqual(p.trajectoire, []);
    assert.equal(p.versementCentimes, 0);
  } finally {
    nettoyer();
  }
});

test('S-L2-3 — le rendement ne compte que les lignes alimentées par un flux suivi, jamais la réserve d\'avant l\'outil', () => {
  const lignes = [{ actifId: 1, valeurCentimes: 25_000_00 }, { actifId: 2, valeurCentimes: 110_000 }];
  const flux = [{ date: '2025-10-23', actifId: 2, centimes: 100_000 }];
  const r = rendementDeLaPoche(flux, lignes, '2026-10-23');
  assert.equal(r.valeurCentimes, 110_000, 'la réserve (ligne 1) est hors calcul');
  assert.ok(Math.abs(r.pb - 1000) <= 2, `10 % attendu, ${r.pb} pb`);
  assert.equal(r.statut, 'fait');
  assert.equal(rendementDeLaPoche([], lignes, '2026-10-23').pb, null);
  assert.equal(rendementDeLaPoche([{ date: '2026-10-10', actifId: 2, centimes: 1 }], lignes, '2026-10-23').statut, null, 'trop tôt');
});

test('S-L2-3 — le stock « point de départ » d\'une ligne alimentée compte comme un flux à sa date, sinon le TRI est absurde', () => {
  // Ligne 2 : 1 000 € au point de départ (23/10/2025), 100 € versés le même jour, 1 210 € un an après → 10 %.
  const lignes = [{ actifId: 2, valeurCentimes: 121_000 }];
  const flux = [{ date: '2025-10-23', actifId: 2, centimes: 10_000 }];
  const valorisations = [{ cible: { actifId: 2 }, date: '2025-10-23', valeurCentimes: 100_000, source: 'point de départ' }];
  const avec = rendementDeLaPoche(flux, lignes, '2026-10-23', valorisations);
  assert.ok(Math.abs(avec.pb - 1000) <= 2, `10 % attendu, ${avec.pb} pb`);
  const sans = rendementDeLaPoche(flux, lignes, '2026-10-23');
  assert.equal(sans.pb, null, 'sans le stock, le TRI sort des bornes du calcul (> 1 000 % par an)');
  const autre = rendementDeLaPoche(flux, lignes, '2026-10-23', [{ cible: { actifId: 1 }, date: '2025-10-23', valeurCentimes: 100_000, source: 'point de départ' }]);
  assert.equal(autre.pb, null, 'le stock d\'une autre ligne ne compte pas');
});
