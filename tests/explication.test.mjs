// Seams S-L1-3 (minimisation), S-L1-4 (repli), S-L1-5 (cache) et l'appel à Claude isolé.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargeUtile, empreinte, texteDeRepli, messagesPourClaude, CLES_CHARGE_UTILE } from '../lib/explication.mjs';
import { exposition, ecarts, repartirVersement } from '../lib/allocation.mjs';
import { redigerExplication } from '../serveur/claude.mjs';

function chargeExemple({ versement = 500_00, lignes = [{ classe: 'actions_monde', valeurCentimes: 5_000_00 }, { classe: 'sans_risque', valeurCentimes: 5_000_00 }] } = {}) {
  const expo = exposition(lignes);
  const e = ecarts(expo);
  return chargeUtile({
    ecarts: e, versementCentimes: versement,
    repartition: repartirVersement(versement, expo),
    objectif: { horizonAnnees: 10, perteMaxPb: 3000, immobilierSource: 'NE DOIT PAS PARTIR', immobilierNetCentimes: 999 },
    destinations: { actions_monde: { enveloppeType: 'pea', ligne: { libelle: 'NE DOIT PAS PARTIR' } }, sans_risque: { aOuvrir: 'av', enveloppeType: 'av' } },
  });
}

test('S-L1-3 — la charge utile ne contient que les clés prévues, et aucun libellé ni donnée immobilière', () => {
  const c = chargeExemple();
  assert.deepEqual(Object.keys(c).sort(), [...CLES_CHARGE_UTILE].sort());
  const texte = JSON.stringify(c);
  assert.ok(!texte.includes('NE DOIT PAS PARTIR'));
  assert.ok(!texte.includes('999'));
  assert.ok(!texte.includes('immobilier'));
  assert.ok(!('pocheCentimes' in c) && !('partFinancierePb' in c), 'ni valeur de poche ni part financière : on en déduirait l\'immobilier');
  assert.deepEqual(c.aOuvrir, ['av']);
  assert.equal(c.repartition[0].enveloppe, 'pea');
});

test('S-L1-5 — mêmes entrées, même empreinte ; une entrée changée, une autre empreinte ; l\'ordre des clés est indifférent', () => {
  const a = chargeExemple();
  const b = chargeExemple();
  assert.equal(empreinte(a), empreinte(b));
  assert.notEqual(empreinte(a), empreinte(chargeExemple({ versement: 600_00 })));
  const melange = Object.fromEntries(Object.entries(a).reverse());
  assert.equal(empreinte(melange), empreinte(a));
});

test('S-L1-4 — le texte de repli dit la cible, l\'écart, la répartition et l\'enveloppe à ouvrir, sans réseau', () => {
  const t = texteDeRepli(chargeExemple()).replace(/[\u202f\u00a0]/g, ' ');
  assert.match(t, /60 % actions monde et 40 % sans risque/);
  assert.match(t, /actions monde pèse 50 %/);
  assert.match(t, /tout le versement va à la ligne la plus en retard : 500 € sur actions monde \(le PEA\)/);
  assert.match(t, /À ouvrir.*l'assurance-vie/);
  assert.match(t, /Rien à vendre/);
  assert.match(t, /Aide à la décision, pas un conseil réglementé\.$/);
  const vide = texteDeRepli(chargeExemple({ lignes: [] }));
  assert.match(vide, /La poche est vide/);
});

test('les messages pour Claude portent la consigne (ne décide rien) et la charge utile', () => {
  const { system, user } = messagesPourClaude(chargeExemple());
  assert.match(system, /ne décides rien/);
  assert.match(system, /Aide à la décision, pas un conseil réglementé/);
  assert.match(user, /"versementCentimes":50000/);
});

function fauxFetch(reponse) {
  const appels = [];
  const f = async (url, options) => {
    appels.push({ url, options });
    if (reponse instanceof Error) throw reponse;
    return reponse;
  };
  return { f, appels };
}
const json = (statut, corps) => ({ ok: statut >= 200 && statut < 300, status: statut, json: async () => corps });

test('appel à Claude — sans clé : aucun appel réseau', async () => {
  const { f, appels } = fauxFetch(json(200, {}));
  const r = await redigerExplication(chargeExemple(), { cle: '', fetchImpl: f });
  assert.deepEqual(r, { ok: false, raison: 'sans_cle' });
  assert.equal(appels.length, 0);
});

test('appel à Claude — requête conforme : modèle, en-têtes, effort bas, repli serveur, charge utile dans le message', async () => {
  const { f, appels } = fauxFetch(json(200, { model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: '  Texte rédigé.  ' }] }));
  const r = await redigerExplication(chargeExemple(), { cle: 'cle-de-test', fetchImpl: f });
  assert.deepEqual(r, { ok: true, texte: 'Texte rédigé.', modele: 'claude-opus-5-5' });
  assert.equal(appels.length, 1);
  const { url, options } = appels[0];
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(options.headers['x-api-key'], 'cle-de-test');
  assert.equal(options.headers['anthropic-version'], '2023-06-01');
  const corps = JSON.parse(options.body);
  assert.equal(corps.model, 'claude-opus-5-5');
  assert.equal(corps.output_config.effort, 'low');
  assert.equal(corps.fallbacks, 'default');
  assert.match(corps.messages[0].content, /"horizonAnnees":10/);
  assert.ok(!corps.messages[0].content.includes('NE DOIT PAS PARTIR'));
  assert.ok(!('tools' in corps) && !('tool_choice' in corps), 'S10 : aucun outil, une lecture de texte');
});

test('appel à Claude — erreurs distinguées : clé refusée, transitoire, autre, refus, vide, réseau', async () => {
  const cas = [
    [json(401, {}), 'cle_refusee'],
    [json(429, {}), 'transitoire'],
    [json(503, {}), 'transitoire'],
    [json(400, {}), 'http_400'],
    [json(200, { stop_reason: 'refusal', content: [] }), 'refus'],
    [json(200, { stop_reason: 'end_turn', content: [] }), 'vide'],
    [new TypeError('fetch failed'), 'reseau'],
  ];
  for (const [reponse, raison] of cas) {
    const { f } = fauxFetch(reponse);
    const r = await redigerExplication(chargeExemple(), { cle: 'x', fetchImpl: f });
    assert.deepEqual(r, { ok: false, raison }, raison);
  }
});
