import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'clube-verification-'));
  const helper = join(root, '.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo.mjs');
  mkdirSync(join(root, '.agents/skills/verify-clube-do-jogo/scripts'), { recursive: true });
  copyFileSync(new URL('../scripts/verify-clube-do-jogo.mjs', import.meta.url), helper);
  const manifest = (id, data) => {
    const path = join(root, 'state/verify-clube-do-jogo', id, 'manifest.json');
    mkdirSync(join(root, 'state/verify-clube-do-jogo', id), { recursive: true });
    writeFileSync(path, JSON.stringify({ runId: id, ...data }));
    return path;
  };
  const run = (...args) => spawnSync(process.execPath, [helper, ...args], { encoding: 'utf8', cwd: root });
  return { root, manifest, run, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('an explicit run id selects that run even when a newer run exists', () => {
  const f = fixture();
  try {
    const older = f.manifest('older', { marker: 'requested' });
    const newer = f.manifest('newer', { marker: 'latest' });
    utimesSync(older, 1000, 1000);
    utimesSync(newer, 2000, 2000);
    const result = f.run('status', '--run-id', 'older');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).marker, 'requested');
    assert.equal(JSON.parse(f.run('status').stdout).marker, 'latest');
    assert.notEqual(f.run('status', '--run-id', '../outside').status, 0);
  } finally { f.cleanup(); }
});

test('cleanup refuses a live process with the wrong recorded identity', async () => {
  const f = fixture();
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { cwd: f.root, stdio: 'ignore' });
  await new Promise(resolve => child.once('spawn', resolve));
  try {
    f.manifest('reused', { pid: child.pid, worktree: f.root, processIdentity: 'another-process' });
    const result = f.run('cleanup', '--run-id', 'reused');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /cleanup abortado/);
    assert.doesNotThrow(() => process.kill(child.pid, 0));
  } finally {
    child.kill();
    await new Promise(resolve => child.once('exit', resolve));
    f.cleanup();
  }
});
