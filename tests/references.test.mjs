// Seams S-L2-6 et S-L2-8 : le fichier de faits est lisible, complet, daté,
// sourcé, sans donnée personnelle ; un fait périmé est signalé.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerReferences, verifierReferences, faitsPerimes, ageJours, FRAICHEUR_MAX_JOURS, ErreurReference } from '../lib/references.mjs';

const CLES_CANDIDAT = ['symbole', 'isin', 'nom', 'emetteur', 'faits'];
const CLES_FAIT = ['valeur', 'source', 'releve_le', 'note'];

test('S-L2-8 — le fichier du dépôt se charge : quatre ETF MSCI World éligibles au PEA, un courtier, rien d\'autre', () => {
  const r = chargerReferences();
  assert.equal(r.courtier.nom, 'BoursoBank');
  assert.deepEqual(r.candidats.map((c) => c.symbole), ['WPEA.PA', 'DCAM.PA', 'CW8.PA', 'EWLD.PA']);
  for (const c of r.candidats) {
    assert.deepEqual(Object.keys(c).filter((k) => !CLES_CANDIDAT.includes(k)), [], `${c.symbole} : clés inattendues`);
    for (const [nom, f] of Object.entries(c.faits)) {
      assert.deepEqual(Object.keys(f).filter((k) => !CLES_FAIT.includes(k)), [], `${c.symbole} ${nom} : clés inattendues`);
      assert.match(f.source, /^https:\/\/(www\.)?(blackrock\.com|ishares\.com|amundietf\.fr|finance\.yahoo\.com|boursorama\.com|boursobank\.com)\//, `${c.symbole} ${nom} : source officielle attendue`);
    }
  }
  for (const f of Object.values(r.courtier.faits)) assert.match(f.source, /^https:\/\/(www\.)?(boursorama\.com|boursobank\.com)\//);
});

test('S-L2-6 — un fait sans source, sans date, ou un candidat hors périmètre fait échouer la vérification', () => {
  const bon = chargerReferences();
  assert.deepEqual(verifierReferences(bon), []);
  const sansSource = structuredClone(bon);
  sansSource.candidats[0].faits.fraisCourantsPb.source = 'un comparateur';
  assert.match(verifierReferences(sansSource).join(' '), /WPEA\.PA fraisCourantsPb : sans source/);
  const sansDate = structuredClone(bon);
  delete sansDate.courtier.faits.fraisOrdre.releve_le;
  assert.match(verifierReferences(sansDate).join(' '), /courtier fraisOrdre : sans date/);
  const horsPea = structuredClone(bon);
  horsPea.candidats[1].faits.eligiblePea.valeur = false;
  assert.match(verifierReferences(horsPea).join(' '), /DCAM\.PA : seul un ETF éligible au PEA/);
  const horsMonde = structuredClone(bon);
  horsMonde.candidats[2].faits.indice.valeur = 'S&P 500';
  assert.match(verifierReferences(horsMonde).join(' '), /CW8\.PA : seul un ETF MSCI World/);
  assert.throws(() => chargerReferences('/nulle/part.json'), ErreurReference);
});

test('S-L2-6 — un fait de plus de six mois est périmé ; à la limite, non', () => {
  const r = chargerReferences();
  const fait = { releve_le: '2026-10-23' };
  assert.equal(ageJours(fait, '2026-10-23'), 0);
  assert.equal(ageJours(fait, '2027-04-24'), FRAICHEUR_MAX_JOURS);
  assert.equal(faitsPerimes(r, '2027-04-24').length, 0, 'à la limite : rien');
  const perimes = faitsPerimes(r, '2027-04-25');
  assert.ok(perimes.length > 0);
  assert.ok(perimes.some((p) => p.ou === 'BoursoBank' && p.nom === 'fraisOrdre'));
  assert.ok(perimes.some((p) => p.ou === 'WPEA.PA'));
});
