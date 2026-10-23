// Seams S-L3-1 et S-L3-3, côté pur : empreinte scrypt, jetons signés, essais.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { empreintePhrase, empreinteValide, verifierPhrase, creerSessions, lireCookie, enTeteCookie, enTeteCookieEffacement } from '../serveur/session.mjs';

const TRENTE_JOURS = 30 * 24 * 60 * 60 * 1000;
const DIX_MINUTES = 10 * 60 * 1000;

test('S-L3-3 — l\'empreinte se vérifie, ne se renverse pas, et refuse une phrase voisine ou une empreinte mal formée', () => {
  const e = empreintePhrase('une phrase assez longue');
  assert.ok(empreinteValide(e));
  assert.doesNotMatch(e, /phrase/);
  assert.equal(verifierPhrase('une phrase assez longue', e), true);
  assert.equal(verifierPhrase('une phrase assez longue ', e), false);
  assert.equal(verifierPhrase('Une phrase assez longue', e), false);
  assert.equal(verifierPhrase('une phrase assez longue', 'scrypt$00$00'), false);
  assert.equal(verifierPhrase('é'.normalize('NFD'), empreintePhrase('é'.normalize('NFC'))), true, 'même phrase tapée sur le Mac et sur l\'iPhone (formes Unicode différentes)');
});

test('S-L3-1 — jeton : valide trente jours, refusé altéré, tronqué ou expiré ; changer le secret OU la phrase révoque tout', () => {
  let horloge = 1_000_000;
  const s = creerSessions({ secret: 's'.repeat(32), empreinte: 'e1', maintenant: () => horloge });
  const j = s.emettre();
  assert.equal(s.valider(j), true);
  assert.equal(s.valider(j.slice(0, -1) + (j.endsWith('0') ? '1' : '0')), false, 'signature altérée');
  const [exp, nonce, sig] = j.split('.');
  assert.equal(s.valider(`${Number(exp) + 1}.${nonce}.${sig}`), false, 'expiration altérée');
  assert.equal(s.valider(`${exp}.${nonce}`), false);
  assert.equal(s.valider(null), false, 'pas de cookie');
  horloge += TRENTE_JOURS - 1;
  assert.equal(s.valider(j), true);
  horloge += 2;
  assert.equal(s.valider(j), false, 'expiré');
  horloge = 1_000_000;
  assert.equal(creerSessions({ secret: 'a'.repeat(32), empreinte: 'e1', maintenant: () => horloge }).valider(j), false, 'autre secret');
  assert.equal(creerSessions({ secret: 's'.repeat(32), empreinte: 'e2', maintenant: () => horloge }).valider(j), false, 'phrase changée : session révoquée');
});

test('S-L3-1 — cinq échecs bloquent la source dix minutes ; une réussite efface le compteur ; une autre source n\'est pas touchée', () => {
  let horloge = 0;
  const s = creerSessions({ secret: 's'.repeat(32), empreinte: 'e', maintenant: () => horloge });
  for (let i = 1; i < 5; i++) assert.equal(s.echec('a'), 0, `essai ${i} : pas encore bloqué`);
  assert.equal(s.echec('a'), DIX_MINUTES, 'cinquième : bloqué');
  assert.equal(s.attente('b'), 0);
  horloge += DIX_MINUTES - 1;
  assert.ok(s.attente('a') > 0);
  horloge += 1;
  assert.equal(s.attente('a'), 0, 'libéré');
  s.echec('b'); s.echec('b');
  s.reussite('b');
  for (let i = 1; i < 5; i++) assert.equal(s.echec('b'), 0, 'le compteur repart de zéro après une réussite');
});

test('S-L3-1 — vingt échecs en dix minutes, toutes sources confondues, suspendent les essais pour tout le monde', () => {
  let horloge = 0;
  const s = creerSessions({ secret: 's'.repeat(32), empreinte: 'e', maintenant: () => horloge });
  for (let i = 1; i < 20; i++) assert.equal(s.echec(`source-${i}`), 0, `échec ${i} depuis une source neuve`);
  assert.equal(s.echec('source-20'), DIX_MINUTES, 'vingtième : plafond global atteint');
  assert.equal(s.attente('jamais-vue'), DIX_MINUTES, 'une source neuve attend aussi');
  horloge += DIX_MINUTES;
  assert.equal(s.attente('jamais-vue'), 0);
  // Des échecs étalés au-delà de la fenêtre ne s'additionnent pas.
  for (let i = 1; i <= 25; i++) { horloge += DIX_MINUTES / 15; assert.equal(s.attente(`etale-${i}`), 0); s.echec(`etale-${i}`); }
});

test('cookie : lu dans l\'en-tête ; émis HttpOnly, SameSite=Strict, Secure, trente jours ; effacé avec Max-Age=0', () => {
  assert.equal(lireCookie('autre=1; patrimoine_session=abc.def.ghi; x=2'), 'abc.def.ghi');
  assert.equal(lireCookie('autre=1'), null);
  assert.equal(enTeteCookie('j'), 'patrimoine_session=j; Path=/; Max-Age=2592000; HttpOnly; SameSite=Strict; Secure');
  assert.equal(enTeteCookieEffacement(), 'patrimoine_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict; Secure');
});
