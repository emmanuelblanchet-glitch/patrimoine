// Seam S-L3-6 : le script de déploiement n'envoie que des fichiers suivis par
// git — jamais une base, un fichier d'environnement ou le câblage MCP —, et
// refuse un dépôt qui en suivrait un. Sur un dépôt jetable, en simulation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = resolve('scripts/deployer-vps.sh');
const git = (depot, ...args) => execFileSync('git', ['-C', depot, ...args], { stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).toString();

function depotJetable() {
  const depot = mkdtempSync(join(tmpdir(), 'patrimoine-deploiement-'));
  git(depot, 'init', '-q');
  writeFileSync(join(depot, 'suivi.mjs'), 'export const a = 1;\n');
  writeFileSync(join(depot, '.gitignore'), '*.db\n.env\n.mcp.json\n');
  writeFileSync(join(depot, 'patrimoine.db'), 'base');
  writeFileSync(join(depot, '.env'), 'SECRET=x');
  writeFileSync(join(depot, '.mcp.json'), '{}');
  writeFileSync(join(depot, 'brouillon.txt'), 'non suivi');
  git(depot, 'add', 'suivi.mjs', '.gitignore');
  git(depot, 'commit', '-q', '-m', 'init');
  return depot;
}

test('S-L3-6 — en simulation, seuls les fichiers suivis sont listés ; rien de local n\'y figure', () => {
  const depot = depotJetable();
  try {
    const r = spawnSync('sh', [SCRIPT], { env: { ...process.env, DEPLOYER_SIMULATION: '1', DEPLOYER_DEPOT: depot }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.stdout.trim().split('\n').sort(), ['.gitignore', 'suivi.mjs']);
  } finally {
    rmSync(depot, { recursive: true, force: true });
  }
});

test('S-L3-6 — un dépôt qui suit une base ou un fichier d\'environnement est refusé avant tout envoi', () => {
  const depot = depotJetable();
  try {
    git(depot, 'add', '-f', '.env');
    git(depot, 'commit', '-q', '-m', 'faute');
    const r = spawnSync('sh', [SCRIPT], { env: { ...process.env, DEPLOYER_SIMULATION: '1', DEPLOYER_DEPOT: depot }, encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Refus/);
    assert.equal(r.stdout, '');
  } finally {
    rmSync(depot, { recursive: true, force: true });
  }
});
