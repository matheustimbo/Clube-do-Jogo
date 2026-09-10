import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, utimesSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'clube-verification-'));
  const helper = join(root, '.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo.mjs');
  mkdirSync(join(root, '.agents/skills/verify-clube-do-jogo/scripts'), { recursive: true });
  copyFileSync(new URL('../scripts/verify-clube-do-jogo.mjs', import.meta.url), helper);
  const paths = id => ({
    stateDir: join(root, 'state/verify-clube-do-jogo', id),
    evidenceDir: join(root, 'evidence/verify-clube-do-jogo', id),
  });
  const writeManifest = (id, data, evidence = true) => {
    const target = paths(id);
    mkdirSync(target.stateDir, { recursive: true });
    mkdirSync(target.evidenceDir, { recursive: true });
    const value = { runId: id, ...data };
    writeFileSync(join(target.stateDir, 'manifest.json'), `${JSON.stringify(value, null, 2)}\n`);
    if (evidence) writeFileSync(join(target.evidenceDir, 'manifest.json'), `${JSON.stringify(value, null, 2)}\n`);
    return value;
  };
  const initGit = () => {
    const setup = [
      ['git', ['init', '-q']],
      ['git', ['config', 'user.email', 'verification@example.test']],
      ['git', ['config', 'user.name', 'Verification Test']],
    ];
    for (const [command, args] of setup) {
      const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    }
    writeFileSync(join(root, 'fixture.txt'), 'fixture\n');
    for (const args of [['add', 'fixture.txt'], ['commit', '-qm', 'fixture']]) {
      const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    }
    const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const run = (...args) => spawnSync(process.execPath, [helper, ...args], { encoding: 'utf8', cwd: root });
  const runEnv = (env, ...args) => spawnSync(process.execPath, [helper, ...args], { encoding: 'utf8', cwd: root, env });
  return { root, helper, paths, writeManifest, initGit, run, runEnv, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function processSnapshot(pid) {
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
  const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
  const bootId = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
  return { pgid: Number(fields[2]), identity: `${bootId}:${fields[19]}` };
}

function writeValidEvidence(f, id, overrides = {}) {
  const sha = f.initGit();
  const target = f.paths(id);
  const manifest = f.writeManifest(id, {
    version: 1,
    gitSha: sha,
    worktree: f.root,
    port: 3103,
    baseUrl: 'http://127.0.0.1:3103',
    pid: process.pid,
    pgid: process.pid,
    processIdentity: 'fixture-identity',
    processPids: [process.pid],
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3103',
    mode: 'demo',
    launchEnv: { allowlist: ['PATH'], overrides: {} },
    startedAt: '2026-09-10T06:00:00.000Z',
    logPath: join(target.evidenceDir, 'launch.log'),
    stateDir: target.stateDir,
    evidenceDir: target.evidenceDir,
    ...overrides.manifest,
  });
  writeFileSync(join(target.evidenceDir, 'launch.log'), 'request https://demo.test/?access_token=secret-token Authorization: Bearer secret-jwt\n');
  writeFileSync(join(target.evidenceDir, 'before-action.png'), 'before');
  writeFileSync(join(target.evidenceDir, 'after-vote.png'), 'after');
  writeFileSync(join(target.evidenceDir, 'before-action.aria.txt'), 'before aria');
  writeFileSync(join(target.evidenceDir, 'after-vote.aria.txt'), 'after aria');
  const identity = {
    runId: manifest.runId,
    gitSha: manifest.gitSha,
    worktree: manifest.worktree,
    port: manifest.port,
    baseUrl: manifest.baseUrl,
    mode: manifest.mode,
  };
  writeFileSync(join(target.evidenceDir, 'doctor.json'), `${JSON.stringify({ ...identity, checkedAt: '2026-09-10T06:01:00.000Z', ok: true }, null, 2)}\n`);
  writeFileSync(join(target.evidenceDir, 'drive-result.json'), `${JSON.stringify({ ...identity, feature: 'ranking-vote-reason', status: 'passed', sideEffect: { observed: 'Não consigo rodar' } }, null, 2)}\n`);
  return { manifest, target, sha };
}

async function waitForFile(path, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`file not written: ${path}`);
}

async function waitForDead(pid, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
      if (fields[0] === 'Z') return;
    } catch {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`process still alive: ${pid}`);
}

function killIfAlive(pid) {
  if (!pid) return;
  try { process.kill(pid, 'SIGKILL'); } catch { return; }
}

test('an explicit run id selects that run even when a newer run exists', () => {
  const f = fixture();
  try {
    const older = f.writeManifest('older', { marker: 'requested' }, false);
    const newer = f.writeManifest('newer', { marker: 'latest' }, false);
    utimesSync(join(f.paths('older').stateDir, 'manifest.json'), 1000, 1000);
    utimesSync(join(f.paths('newer').stateDir, 'manifest.json'), 2000, 2000);
    const result = f.run('status', '--run-id', 'older');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).marker, older.marker);
    assert.equal(JSON.parse(f.run('status').stdout).marker, newer.marker);
    assert.notEqual(f.run('status', '--run-id', '../outside').status, 0);
  } finally { f.cleanup(); }
});

test('evidence rejects a manifest whose evidence path is outside its run', () => {
  const f = fixture();
  try {
    const { manifest } = writeValidEvidence(f, 'path-check');
    f.writeManifest('path-check', { ...manifest, evidenceDir: join(tmpdir(), 'escape') });
    const result = f.run('evidence', '--run-id', 'path-check');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /diretórios canônicos|evidenceDir divergente/);
  } finally { f.cleanup(); }
});

test('evidence binds artifacts and current checkout to the launch SHA and run id', () => {
  const f = fixture();
  try {
    const { manifest, target } = writeValidEvidence(f, 'artifact-check');
    const valid = f.run('evidence', '--run-id', 'artifact-check');
    assert.equal(valid.status, 0, valid.stderr);
    writeFileSync(join(target.evidenceDir, 'cleanup.json'), JSON.stringify({
      runId: manifest.runId,
      gitSha: manifest.gitSha,
      worktree: manifest.worktree,
      port: manifest.port,
      baseUrl: manifest.baseUrl,
      mode: manifest.mode,
      cleanedAt: '2026-09-10T06:02:00.000Z',
      stopped: false,
      portFree: false,
    }));
    const incompleteCleanup = f.run('evidence', '--run-id', 'artifact-check');
    assert.notEqual(incompleteCleanup.status, 0);
    assert.match(incompleteCleanup.stderr, /cleanup\.json não confirma/);
    const drivePath = join(target.evidenceDir, 'drive-result.json');
    const drive = JSON.parse(readFileSync(drivePath, 'utf8'));
    writeFileSync(drivePath, JSON.stringify({ ...drive, runId: 'other-run' }));
    const mismatched = f.run('evidence', '--run-id', 'artifact-check');
    assert.notEqual(mismatched.status, 0);
    assert.match(mismatched.stderr, /drive-result\.json divergente no campo runId/);
    f.writeManifest('artifact-check', { ...manifest, gitSha: '0'.repeat(40) });
    const stale = f.run('evidence', '--run-id', 'artifact-check');
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /SHA atual não corresponde/);
  } finally { f.cleanup(); }
});

test('launch accepts only the dedicated demo ports', () => {
  const f = fixture();
  try {
    for (const port of ['3101', '8081', '3104']) {
      const result = f.run('launch', '--run-id', `port-${port}`, '--port', port);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /somente as portas dedicadas/);
    }
  } finally { f.cleanup(); }
});

test('launch passes only the demo environment allowlist to its child', async () => {
  const f = fixture();
  let runId;
  try {
    f.initGit();
    const bin = join(f.root, 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'lsof'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    writeFileSync(join(bin, 'npm'), `#!/usr/bin/env node
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]);
fs.writeFileSync(path.join(process.cwd(), 'env-capture.json'), JSON.stringify({ privateToken: process.env.PRIVATE_TOKEN, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, nodeOptions: process.env.NODE_OPTIONS }));
http.createServer((request, response) => { response.end('Clube do Jogo'); }).listen(port, '127.0.0.1');
setInterval(() => {}, 1000);
`);
    spawnSync('chmod', ['+x', join(bin, 'npm')]);
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH || ''}`, PRIVATE_TOKEN: 'private-secret', NEXT_PUBLIC_SUPABASE_URL: 'https://prod.example' };
    runId = 'allowlist';
    const launch = f.runEnv(env, 'launch', '--run-id', runId, '--port', '3103');
    assert.equal(launch.status, 0, launch.stderr);
    const captured = JSON.parse(readFileSync(join(f.root, 'env-capture.json'), 'utf8'));
    assert.equal(captured.privateToken, undefined);
    assert.equal(captured.supabaseUrl, '');
    assert.equal(captured.supabaseKey, '');
    assert.equal(captured.nodeOptions, undefined);
    const doctor = f.runEnv(env, 'doctor', '--run-id', runId);
    assert.equal(doctor.status, 0, doctor.stderr);
    const cleanup = f.run('cleanup', '--run-id', runId);
    assert.equal(cleanup.status, 0, cleanup.stderr);
  } finally {
    if (runId) {
      const cleanup = f.run('cleanup', '--run-id', runId);
      if (cleanup.status !== 0) process.stderr.write(cleanup.stderr);
    }
    f.cleanup();
  }
});

test('evidence redacts credentials from retained text logs', () => {
  const f = fixture();
  try {
    const { target } = writeValidEvidence(f, 'redaction-check');
    const result = f.run('evidence', '--run-id', 'redaction-check');
    assert.equal(result.status, 0, result.stderr);
    const log = readFileSync(join(target.evidenceDir, 'launch.log'), 'utf8');
    assert.doesNotMatch(log, /secret-token|secret-jwt/);
    assert.match(log, /REDACTED/);
  } finally { f.cleanup(); }
});

test('cleanup refuses a live process with the wrong recorded identity', async () => {
  const f = fixture();
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { cwd: f.root, stdio: 'ignore' });
  await new Promise(resolve => child.once('spawn', resolve));
  try {
    const sha = f.initGit();
    const target = f.paths('reused');
    const snapshot = processSnapshot(child.pid);
    f.writeManifest('reused', {
      version: 1,
      gitSha: sha,
      worktree: f.root,
      port: 3103,
      baseUrl: 'http://127.0.0.1:3103',
      pid: child.pid,
      pgid: snapshot.pgid,
      processIdentity: 'another-process',
      processPids: [child.pid],
      command: 'node fixture',
      mode: 'demo',
      launchEnv: { allowlist: [], overrides: {} },
      startedAt: '2026-09-10T06:00:00.000Z',
      logPath: join(target.evidenceDir, 'launch.log'),
      stateDir: target.stateDir,
      evidenceDir: target.evidenceDir,
    });
    const result = f.run('cleanup', '--run-id', 'reused');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /cleanup abortado/);
    assert.doesNotThrow(() => process.kill(child.pid, 0));
  } finally {
    killIfAlive(child.pid);
    await new Promise(resolve => child.once('exit', resolve));
    f.cleanup();
  }
});

test('cleanup terminates an orphan descendant and reports the final group and port state', async () => {
  const f = fixture();
  let leader;
  let orphanPid;
  try {
    const sha = f.initGit();
    const leaderScript = join(f.root, 'leader.js');
    writeFileSync(leaderScript, `const fs = require('node:fs');
const { spawn } = require('node:child_process');
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { cwd: process.cwd(), stdio: 'ignore' });
fs.writeFileSync('orphan-pid', String(child.pid));
setTimeout(() => process.exit(0), 500);
`);
    leader = spawn(process.execPath, [leaderScript], { cwd: f.root, detached: true, stdio: 'ignore' });
    const leaderExit = new Promise(resolve => leader.once('exit', resolve));
    await new Promise(resolve => leader.once('spawn', resolve));
    await waitForFile(join(f.root, 'orphan-pid'));
    orphanPid = Number(readFileSync(join(f.root, 'orphan-pid'), 'utf8'));
    const snapshot = processSnapshot(leader.pid);
    const target = f.paths('orphan');
    f.writeManifest('orphan', {
      version: 1,
      gitSha: sha,
      worktree: f.root,
      port: 3103,
      baseUrl: 'http://127.0.0.1:3103',
      pid: leader.pid,
      pgid: snapshot.pgid,
      processIdentity: snapshot.identity,
      processPids: [leader.pid, orphanPid],
      command: `node ${leaderScript}`,
      mode: 'demo',
      launchEnv: { allowlist: [], overrides: {} },
      startedAt: '2026-09-10T06:00:00.000Z',
      logPath: join(target.evidenceDir, 'launch.log'),
      stateDir: target.stateDir,
      evidenceDir: target.evidenceDir,
    });
    await leaderExit;
    const cleanup = f.run('cleanup', '--run-id', 'orphan');
    assert.equal(cleanup.status, 0, cleanup.stderr);
    const report = JSON.parse(cleanup.stdout);
    assert.equal(report.stopped, true);
    assert.equal(report.portFree, true);
    assert.deepEqual(report.remainingPids, []);
    await waitForDead(orphanPid);
  } finally {
    killIfAlive(orphanPid);
    killIfAlive(leader?.pid);
    f.cleanup();
  }
});


test('launch refuses a listening port whose owner cannot be inspected', () => {
  const f = fixture();
  try {
    const bin = join(f.root, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'ss'), '#!/bin/sh\nprintf "LISTEN 0 511 127.0.0.1:3103 0.0.0.0:*\\n"\n', { mode: 0o755 });
    const result = f.runEnv({ ...process.env, PATH: `${bin}:${process.env.PATH}` }, 'launch', '--port', '3103');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Não foi possível inspecionar a porta/);
  } finally { f.cleanup(); }
});
