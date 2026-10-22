// Le validateur d'état : aucune donnée, aucun secret, socle complet, zéro dépendance.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifier, IGNORES_REQUIS, FICHIERS_REQUIS } from '../scripts/valider.mjs';

function etatSain(surcharges = {}) {
  const contenus = { 'README.md': '# Patrimoine\n', 'lib/base.mjs': 'export const x = 1;\n' };
  return {
    fichiersSuivis: Object.keys(contenus),
    gitignore: IGNORES_REQUIS.join('\n') + '\n',
    existe: (chemin) => FICHIERS_REQUIS.includes(chemin),
    lire: (chemin) => contenus[chemin] ?? '',
    packageJson: { name: 'patrimoine' },
    ...surcharges,
  };
}

test('un dépôt sain est valide', () => {
  const { ok, manquements } = verifier(etatSain());
  assert.deepEqual(manquements, []);
  assert.equal(ok, true);
});

test('une base de données suivie par git est un manquement', () => {
  const { ok, manquements } = verifier(etatSain({ fichiersSuivis: ['README.md', 'data/patrimoine.db'] }));
  assert.equal(ok, false);
  assert.ok(manquements.some((m) => m.includes('data/patrimoine.db') && m.includes('base de données')));
  assert.ok(manquements.some((m) => m.includes('dossier de données')));
});

test('un fichier d\'environnement ou le .mcp.json suivi est un manquement', () => {
  const { manquements } = verifier(etatSain({ fichiersSuivis: ['.env', 'serveur.env', '.mcp.json'] }));
  assert.equal(manquements.filter((m) => m.includes('environnement')).length, 2);
  assert.ok(manquements.some((m) => m.includes('.mcp.json')));
});

test('un motif manquant dans .gitignore est un manquement', () => {
  const { ok, manquements } = verifier(etatSain({ gitignore: '*.env\n' }));
  assert.equal(ok, false);
  assert.ok(manquements.some((m) => m.includes('« *.db »')));
});

test('une clé d\'API ou un IBAN dans un fichier suivi est un manquement', () => {
  // Leurres fabriqués à l'exécution : écrits en clair, le validateur du
  // dépôt les attraperait ici même (constaté au premier run du socle).
  const contenus = {
    'notes.md': `clé : ${['sk', 'ant', 'a'.repeat(30)].join('-')}\n`,
    'docs/x.md': `IBAN ${['FR76', ...Array(5).fill('1234'), '189'].join(' ')}\n`,
  };
  const { manquements } = verifier(etatSain({ fichiersSuivis: Object.keys(contenus), lire: (c) => contenus[c] }));
  assert.ok(manquements.some((m) => m.includes('notes.md') && m.includes('clé d\'API')));
  assert.ok(manquements.some((m) => m.includes('docs/x.md') && m.includes('IBAN')));
});

test('un fichier du socle absent est un manquement', () => {
  const { manquements } = verifier(etatSain({ existe: (c) => c !== 'CONTEXT.md' }));
  assert.deepEqual(manquements, ['CONTEXT.md : fichier du socle absent']);
});

test('une dépendance npm est un manquement (ADR-0001)', () => {
  const { manquements } = verifier(etatSain({ packageJson: { dependencies: { 'better-sqlite3': '^11' } } }));
  assert.ok(manquements.some((m) => m.includes('dependencies') && m.includes('ADR-0001')));
});
