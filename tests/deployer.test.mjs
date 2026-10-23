// Seam S-L3-6 : le script de déploiement n'envoie que le commit de main —
// fichiers suivis seulement, jamais une base, un fichier d'environnement ou le
// câblage MCP —, et refuse une autre branche, un brouillon, ou un dépôt qui
// suivrait un secret. Sur un dépôt jetable, en simulation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const SCRIPT = fileURLToPath(new URL('../scripts/deployer-vps.sh', import.meta.url));
// Pendant un commit, le hook pre-commit lance ces tests avec GIT_INDEX_FILE
// (et d'autres GIT_*) pointant sur l'index du VRAI dépôt : on les retire, le
// dépôt jetable ne doit jamais toucher l'autre.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
const IDENTITE = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (depot, ...args) => execFileSync('git', ['-C', depot, ...args], { stdio: 'pipe', env: { ...ENV, ...IDENTITE } }).toString();
const simuler = (depot) => spawnSync('sh', [SCRIPT], { env: { ...ENV, DEPLOYER_SIMULATION: '1', DEPLOYER_DEPOT: depot }, encoding: 'utf8' });

function depotJetable() {
  const depot = mkdtempSync(join(tmpdir(), 'patrimoine-deploiement-'));
  git(depot, 'init', '-q', '-b', 'main');
  writeFileSync(join(depot, 'suivi.mjs'), 'export const a = 1;\n');
  writeFileSync(join(depot, 'clé é.txt'), 'nom accentué\n');
  writeFileSync(join(depot, '.gitignore'), '*.db\n*.env\n.env\n.mcp.json\n');
  for (const local of ['patrimoine.db', '.env', 'patrimoine.env', '.mcp.json', 'brouillon.txt']) writeFileSync(join(depot, local), 'local');
  git(depot, 'add', 'suivi.mjs', 'clé é.txt', '.gitignore');
  git(depot, 'commit', '-q', '-m', 'init');
  return depot;
}

test('S-L3-6 — en simulation, seuls les fichiers du commit sont listés, noms accentués compris ; rien de local', () => {
  const depot = depotJetable();
  try {
    const r = simuler(depot);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.stdout.trim().split('\n').sort(), ['.gitignore', 'clé é.txt', 'suivi.mjs']);
  } finally {
    rmSync(depot, { recursive: true, force: true });
  }
});

test('S-L3-6 — refus : un secret suivi par git (patrimoine.env, base SQLite), une autre branche, un fichier suivi modifié', () => {
  for (const [faute, motif] of [['patrimoine.env', /secret/], ['donnees.sqlite', /secret/], ['base.db-wal', /secret/]]) {
    const depot = depotJetable();
    try {
      writeFileSync(join(depot, faute), 'x');
      git(depot, 'add', '-f', faute);
      git(depot, 'commit', '-q', '-m', 'faute');
      const r = simuler(depot);
      assert.equal(r.status, 1, faute);
      assert.match(r.stderr, motif);
      assert.equal(r.stdout, '');
    } finally {
      rmSync(depot, { recursive: true, force: true });
    }
  }
  const depot = depotJetable();
  try {
    git(depot, 'checkout', '-q', '-b', 'essai');
    assert.match(simuler(depot).stderr, /on ne déploie que main/);
    git(depot, 'checkout', '-q', 'main');
    writeFileSync(join(depot, 'suivi.mjs'), 'export const a = 2;\n');
    assert.match(simuler(depot).stderr, /non commitées/);
  } finally {
    rmSync(depot, { recursive: true, force: true });
  }
});
