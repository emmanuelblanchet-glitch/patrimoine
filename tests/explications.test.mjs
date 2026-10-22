// Le fournisseur d'explications : cache, un seul appel en vol, recul après échec, cache épuré.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appliquerMigrations } from '../lib/schema.mjs';
import { creerFournisseur, RECUL_MS } from '../serveur/explications.mjs';
import { baseJetable } from './aide.mjs';

const CHARGE = { cible: [], actuel: [], versementCentimes: 0, repartition: [], regle: 'prorata', horizonAnnees: 1, perteMaxPb: 0, aOuvrir: [] };

function fournisseurDeTest(reponses) {
  const { base, nettoyer } = baseJetable();
  appliquerMigrations(base);
  let horloge = 1_000_000;
  const appels = [];
  let resoudreEnVol;
  const f = creerFournisseur({
    base,
    cle: () => 'cle',
    journal: () => {},
    maintenant: () => horloge,
    rediger: (charge) => new Promise((resolve) => { appels.push(charge); resoudreEnVol = () => resolve(reponses.shift()); }),
  });
  return { f, base, appels, nettoyer, avancer: (ms) => { horloge += ms; }, finirAppel: async () => { resoudreEnVol(); await new Promise((r) => setTimeout(r, 5)); } };
}

test('repli immédiat, un seul appel en vol, puis texte du cache sans nouvel appel', async () => {
  const t = fournisseurDeTest([{ ok: true, texte: 'Rédigé.', modele: 'm' }]);
  try {
    const a = t.f.obtenir(CHARGE, 'e1');
    assert.equal(a.origine, 'repli');
    assert.equal(a.enCours, true);
    t.f.obtenir(CHARGE, 'e1');
    assert.equal(t.appels.length, 1, 'un seul appel pour une situation en vol');
    await t.finirAppel();
    const b = t.f.obtenir(CHARGE, 'e1');
    assert.equal(b.origine, 'claude');
    assert.equal(b.texte, 'Rédigé.');
    assert.equal(t.appels.length, 1);
  } finally {
    t.nettoyer();
  }
});

test('après un échec : raison affichée, aucun nouvel appel avant le recul, puis un seul nouvel essai', async () => {
  const t = fournisseurDeTest([{ ok: false, raison: 'transitoire' }, { ok: true, texte: 'Enfin.', modele: 'm' }]);
  try {
    t.f.obtenir(CHARGE, 'e2');
    await t.finirAppel();
    const r = t.f.obtenir(CHARGE, 'e2');
    assert.equal(r.raison, 'transitoire');
    assert.equal(r.enRecul, true);
    assert.equal(t.appels.length, 1);
    t.avancer(RECUL_MS + 1);
    t.f.obtenir(CHARGE, 'e2');
    assert.equal(t.appels.length, 2);
    await t.finirAppel();
    assert.equal(t.f.obtenir(CHARGE, 'e2').texte, 'Enfin.');
  } finally {
    t.nettoyer();
  }
});

test('le cache ne garde que la situation courante', async () => {
  const t = fournisseurDeTest([{ ok: true, texte: 'Un.', modele: 'm' }, { ok: true, texte: 'Deux.', modele: 'm' }]);
  try {
    t.f.obtenir(CHARGE, 'e3');
    await t.finirAppel();
    t.f.obtenir({ ...CHARGE, versementCentimes: 1 }, 'e4');
    await t.finirAppel();
    const lignes = t.base.prepare('SELECT empreinte FROM explication').all().map((r) => r.empreinte);
    assert.deepEqual(lignes, ['e4']);
  } finally {
    t.nettoyer();
  }
});
