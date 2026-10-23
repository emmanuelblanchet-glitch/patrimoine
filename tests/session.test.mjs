// Seams S-L3-1 et S-L3-3, côté pur : empreinte scrypt, jetons signés, essais.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { empreintePhrase, empreinteValide, verifierPhrase, creerSessions, lireCookie, enTeteCookie, enTeteCookieEffacement, DUREE_SESSION_MS, ESSAIS_MAX, RECUL_ESSAIS_MS } from '../serveur/session.mjs';

test('S-L3-3 — l\'empreinte se vérifie, ne se renverse pas, et refuse une phrase voisine ou une empreinte mal formée', () => {
  const e = empreintePhrase('une phrase assez longue');
  assert.ok(empreinteValide(e));
  assert.doesNotMatch(e, /phrase/);
  assert.equal(verifierPhrase('une phrase assez longue', e), true);
  assert.equal(verifierPhrase('une phrase assez longue ', e), false);
  assert.equal(verifierPhrase('Une phrase assez longue', e), false);
  assert.equal(verifierPhrase('une phrase assez longue', 'scrypt$00$00'), false);
  assert.equal(verifierPhrase(undefined, e), false);
  assert.notEqual(empreintePhrase('x'.repeat(12)), empreintePhrase('x'.repeat(12)), 'sel neuf à chaque fois');
  assert.equal(verifierPhrase('é'.normalize('NFD'), empreintePhrase('é'.normalize('NFC'))), true, 'même phrase, deux formes Unicode');
});

test('S-L3-1 — jeton : valide pendant 30 jours, refusé altéré, tronqué, expiré ou signé d\'un autre secret', () => {
  let horloge = 1_000_000;
  const s = creerSessions({ secret: 's'.repeat(32), maintenant: () => horloge });
  const j = s.emettre();
  assert.equal(s.valider(j), true);
  assert.equal(s.valider(j.slice(0, -1) + (j.endsWith('0') ? '1' : '0')), false, 'signature altérée');
  assert.equal(s.valider(`${Number(j.split('.')[0]) + 1}.${j.split('.')[1]}.${j.split('.')[2]}`), false, 'expiration altérée');
  assert.equal(s.valider(j.split('.').slice(0, 2).join('.')), false);
  assert.equal(s.valider(''), false);
  assert.equal(s.valider(null), false);
  horloge += DUREE_SESSION_MS - 1;
  assert.equal(s.valider(j), true);
  horloge += 2;
  assert.equal(s.valider(j), false, 'expiré');
  const autre = creerSessions({ secret: 'a'.repeat(32), maintenant: () => 1_000_000 });
  assert.equal(autre.valider(j), false);
  assert.throws(() => creerSessions({ secret: 'court' }), /trop court/);
});

test('S-L3-1 — cinq échecs bloquent la source dix minutes ; une réussite efface le compteur ; une autre source n\'est pas touchée', () => {
  let horloge = 0;
  const s = creerSessions({ secret: 's'.repeat(32), maintenant: () => horloge });
  for (let i = 1; i < ESSAIS_MAX; i++) assert.equal(s.echec('a'), 0, `essai ${i} : pas encore bloqué`);
  assert.equal(s.echec('a'), RECUL_ESSAIS_MS, 'cinquième : bloqué');
  assert.equal(s.attente('a'), RECUL_ESSAIS_MS);
  assert.equal(s.attente('b'), 0);
  horloge += RECUL_ESSAIS_MS - 1;
  assert.ok(s.attente('a') > 0);
  horloge += 1;
  assert.equal(s.attente('a'), 0, 'libéré');
  s.echec('b'); s.echec('b');
  s.reussite('b');
  for (let i = 1; i < ESSAIS_MAX; i++) assert.equal(s.echec('b'), 0, 'le compteur repart de zéro après une réussite');
});

test('cookie : lu dans l\'en-tête, émis HttpOnly SameSite=Strict (Secure en public), effacé avec Max-Age=0', () => {
  assert.equal(lireCookie('autre=1; patrimoine_session=abc.def.ghi; x=2'), 'abc.def.ghi');
  assert.equal(lireCookie('autre=1'), null);
  assert.equal(lireCookie(undefined), null);
  const e = enTeteCookie('j', { secure: true });
  assert.match(e, /^patrimoine_session=j; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Strict; Secure$/);
  assert.doesNotMatch(enTeteCookie('j', { secure: false }), /Secure/);
  assert.match(enTeteCookieEffacement({ secure: true }), /Max-Age=0; HttpOnly; SameSite=Strict; Secure/);
});
