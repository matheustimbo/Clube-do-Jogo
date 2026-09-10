#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(scriptDir, '..');
const rootDir = resolve(scriptDir, '../../../..');
const stateRoot = join(rootDir, 'state', 'verify-clube-do-jogo');
const evidenceRoot = join(rootDir, 'evidence', 'verify-clube-do-jogo');
const forbiddenPort = 3101;

function fail(message) {
  throw new Error(message);
}

function usage() {
  process.stdout.write(`Usage: verify-clube-do-jogo <launch|doctor|drive|evidence|cleanup|status|check> [feature] [--run-id id] [--port port]\n`);
}

function parseArgs(values) {
  const positional = [];
  const options = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--run-id' || value === '--port') {
      const next = values[index + 1];
      if (!next || next.startsWith('--')) fail(`${value} precisa de um valor`);
      options[value === '--run-id' ? 'runId' : 'port'] = next;
      index += 1;
    } else if (value.startsWith('--')) {
      fail(`Opção desconhecida: ${value}`);
    } else {
      positional.push(value);
    }
  }
  return { positional, options };
}

function ensurePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === forbiddenPort) {
    fail(`Use uma porta TCP válida diferente de ${forbiddenPort}; recebida: ${value}`);
  }
  return port;
}

function nowIso() {
  return new Date().toISOString();
}

function runText(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: rootDir, encoding: 'utf8', ...options });
  if (result.error) return '';
  return `${result.stdout || ''}${result.stderr || ''}`.trim();
}

function gitSha() {
  return runText('git', ['rev-parse', 'HEAD']).split('\n')[0] || 'unknown';
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function createRunId() {
  const stamp = nowIso().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${stamp}-${randomBytes(3).toString('hex')}`;
}

function pathsFor(runId) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runId)) fail(`RUN_ID inválido: ${runId}`);
  return {
    stateDir: join(stateRoot, runId),
    evidenceDir: join(evidenceRoot, runId),
    stateManifest: join(stateRoot, runId, 'manifest.json'),
    evidenceManifest: join(evidenceRoot, runId, 'manifest.json'),
  };
}

function listRunIds() {
  if (!existsSync(stateRoot)) return [];
  return readdirSync(stateRoot)
    .filter(name => existsSync(join(stateRoot, name, 'manifest.json')))
    .sort((left, right) => statSync(join(stateRoot, right, 'manifest.json')).mtimeMs - statSync(join(stateRoot, left, 'manifest.json')).mtimeMs);
}

function readManifest(runId) {
  const selected = runId || listRunIds()[0];
  if (!selected) fail('Nenhum run encontrado; execute launch primeiro');
  const paths = pathsFor(selected);
  if (!existsSync(paths.stateManifest)) fail(`Manifesto ausente para run ${selected}`);
  const manifest = readJson(paths.stateManifest);
  if (manifest.runId !== selected) fail(`Manifesto inconsistente para run ${selected}`);
  return manifest;
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid < 2) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function processInfo(pid) {
  if (!processAlive(pid)) return { alive: false, cwd: null, command: null };
  try {
    const cwd = realpathSync(`/proc/${pid}/cwd`);
    const command = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean).join(' ');
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const startTicks = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)[19];
    const bootId = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
    return { alive: true, cwd, command, identity: `${bootId}:${startTicks}` };
  } catch {
    return { alive: true, cwd: null, command: null };
  }
}

function processTree(pid) {
  const table = new Map();
  const lines = runText('ps', ['-eo', 'pid=,ppid=']).split('\n').filter(Boolean);
  for (const line of lines) {
    const fields = line.trim().split(/\s+/).map(Number);
    if (fields.length >= 2 && Number.isInteger(fields[0]) && Number.isInteger(fields[1])) table.set(fields[0], fields[1]);
  }
  const found = new Set([pid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [candidate, parent] of table) {
      if (found.has(parent) && !found.has(candidate)) {
        found.add(candidate);
        changed = true;
      }
    }
  }
  return found;
}

function portPids(port) {
  const lsof = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' });
  if (!lsof.error && lsof.status === 0) {
    return lsof.stdout.split(/\s+/).filter(Boolean).map(Number).filter(Number.isInteger);
  }
  const ss = spawnSync('ss', ['-ltnp', `sport = :${port}`], { encoding: 'utf8' });
  if (!ss.error && ss.status === 0) {
    return [...ss.stdout.matchAll(/pid=(\d+)/g)].map(match => Number(match[1]));
  }
  return [];
}

async function getHttp(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'manual' });
    return { status: response.status, body: await response.text() };
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForHttp(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'sem resposta';
  while (Date.now() < deadline) {
    try {
      const result = await getHttp(url);
      if (result.status >= 200 && result.status < 400) return result;
      lastError = `HTTP ${result.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 500));
  }
  fail(`Timeout aguardando ${url}: ${lastError}`);
}

function writeManifest(manifest) {
  const paths = pathsFor(manifest.runId);
  mkdirSync(paths.stateDir, { recursive: true });
  mkdirSync(paths.evidenceDir, { recursive: true });
  writeJson(paths.stateManifest, manifest);
  writeJson(paths.evidenceManifest, manifest);
}

function launchManifest(options) {
  const port = ensurePort(options.port || process.env.PORT || '3102');
  const occupied = portPids(port);
  if (occupied.length) fail(`A porta ${port} já está ocupada pelos PIDs ${occupied.join(', ')}`);
  const runId = options.runId || process.env.RUN_ID || createRunId();
  if (!/^[A-Za-z0-9._-]+$/.test(runId)) fail(`RUN_ID inválido: ${runId}`);
  const paths = pathsFor(runId);
  mkdirSync(paths.stateDir, { recursive: true });
  mkdirSync(paths.evidenceDir, { recursive: true });
  if (existsSync(paths.stateManifest)) fail(`RUN_ID já existe: ${runId}`);
  const logPath = join(paths.evidenceDir, 'launch.log');
  const logFd = openSync(logPath, 'a');
  const command = ['npm', 'run', 'dev', '--', '--hostname', '127.0.0.1', '--port', String(port)];
  const child = spawn(command[0], command.slice(1), {
    cwd: rootDir,
    detached: true,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      NEXT_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE: 'false',
    },
    stdio: ['ignore', logFd, logFd],
  });
  closeSync(logFd);
  child.unref();
  const manifest = {
    version: 1,
    runId,
    gitSha: gitSha(),
    worktree: rootDir,
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    pid: child.pid,
    processIdentity: processInfo(child.pid).identity,
    command: command.join(' '),
    mode: 'demo',
    launchEnv: {
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      NEXT_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE: 'false',
    },
    startedAt: nowIso(),
    logPath,
    stateDir: paths.stateDir,
    evidenceDir: paths.evidenceDir,
  };
  if (!manifest.pid) fail('npm não retornou um PID');
  writeManifest(manifest);
  return manifest;
}

async function launch(options) {
  const manifest = launchManifest(options);
  try {
    const response = await waitForHttp(`${manifest.baseUrl}/jogo-do-mes`);
    const updated = { ...manifest, readyAt: nowIso(), readyStatus: response.status };
    writeManifest(updated);
    process.stdout.write(`${JSON.stringify({ runId: updated.runId, pid: updated.pid, port: updated.port, baseUrl: updated.baseUrl, evidenceDir: updated.evidenceDir }, null, 2)}\n`);
  } catch (error) {
    await terminateManifest(manifest, false).catch(() => undefined);
    throw error;
  }
}

async function doctor(options) {
  const manifest = readManifest(options.runId);
  const info = processInfo(manifest.pid);
  const trackedTree = processTree(manifest.pid);
  const owners = portPids(manifest.port);
  let http = { status: 0, body: '' };
  let httpError = null;
  try {
    http = await getHttp(`${manifest.baseUrl}/jogo-do-mes`);
  } catch (error) {
    httpError = error instanceof Error ? error.message : String(error);
  }
  const checks = {
    pidAlive: info.alive,
    worktreeCwd: info.cwd === manifest.worktree,
    processIdentity: Boolean(manifest.processIdentity) && info.identity === manifest.processIdentity,
    portAllowed: manifest.port !== forbiddenPort,
    appResponds: http.status >= 200 && http.status < 400,
    appIdentity: http.body.includes('Clube do Jogo'),
    portOwnedByRun: owners.length > 0 && owners.every(pid => trackedTree.has(pid)),
  };
  const ok = Object.values(checks).every(value => value === true);
  const report = {
    runId: manifest.runId,
    checkedAt: nowIso(),
    ok,
    checks,
    pid: manifest.pid,
    pidInfo: info,
    port: manifest.port,
    portPids: owners,
    http: { status: http.status, error: httpError },
    mode: manifest.mode,
    localSupabase: 'disabled for demo',
  };
  writeJson(join(manifest.evidenceDir, 'doctor.json'), report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!ok) process.exitCode = 1;
}

async function ariaSnapshot(page) {
  const body = page.locator('body');
  if (typeof body.ariaSnapshot === 'function') return body.ariaSnapshot();
  return body.innerText();
}

async function driveRanking(manifest) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, locale: 'pt-BR' });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText || 'unknown' }));
  const result = {
    runId: manifest.runId,
    feature: 'ranking-vote-reason',
    harness: 'Playwright',
    baseUrl: manifest.baseUrl,
    fixture: 'demo-user / Cocoon without an initial choice',
    startedAt: nowIso(),
    status: 'failed',
    actions: [],
    sideEffect: null,
    consoleErrors,
    pageErrors,
    failedRequests,
  };
  try {
    await page.goto(`${manifest.baseUrl}/jogo-do-mes`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const updateClose = page.getByRole('dialog').getByRole('button', { name: /Agora não|Fechar novidades/ }).first();
    await updateClose.click({ timeout: 2_000 }).catch(() => undefined);
    await page.getByRole('heading', { name: 'Hades', exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
    result.actions.push('opened /jogo-do-mes and dismissed optional product update');
    await page.getByRole('link', { name: 'Ranking', exact: true }).first().click();
    await page.waitForURL(url => new URL(url).pathname === '/ranking', { timeout: 10_000 });
    await page.getByRole('heading', { name: /Votação para/ }).waitFor({ state: 'visible', timeout: 30_000 });
    const card = page.locator('article.ranking-card').filter({ hasText: 'Cocoon' }).first();
    await card.waitFor({ state: 'visible', timeout: 30_000 });
    writeFileSync(join(manifest.evidenceDir, 'before-action.aria.txt'), `${await ariaSnapshot(page)}\n`, 'utf8');
    await page.screenshot({ path: join(manifest.evidenceDir, 'before-action.png'), fullPage: true });
    result.actions.push('opened Ranking and captured before state');
    await card.getByRole('button', { name: 'Não', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /Por que você não jogaria\?/ });
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });
    await dialog.getByRole('button', { name: 'Não consigo rodar', exact: true }).click();
    await dialog.getByRole('button', { name: 'Confirmar Não', exact: true }).click();
    await card.locator('button[data-choice="would_not_play"][aria-pressed="true"]').waitFor({ state: 'visible', timeout: 10_000 });
    await card.locator('button.preference-count[data-choice="would_not_play"]').click();
    const participants = page.getByRole('dialog', { name: 'Escolhas do clube' });
    await participants.waitFor({ state: 'visible', timeout: 5_000 });
    await participants.getByText('Não consigo rodar', { exact: true }).first().waitFor({ state: 'visible', timeout: 10_000 });
    result.actions.push('selected Não consigo rodar, confirmed the negative vote, and opened its participant reason');
    result.sideEffect = {
      selectors: {
        card: 'article.ranking-card:has-text("Cocoon") button[data-choice="would_not_play"][aria-pressed="true"]',
        participantDialog: 'getByRole(dialog, { name: "Escolhas do clube" }).getByText("Não consigo rodar")',
      },
      observed: 'Não consigo rodar',
      url: page.url(),
    };
    writeFileSync(join(manifest.evidenceDir, 'after-vote.aria.txt'), `${await ariaSnapshot(page)}\n`, 'utf8');
    await page.screenshot({ path: join(manifest.evidenceDir, 'after-vote.png'), fullPage: true });
    result.status = 'passed';
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    result.finishedAt = nowIso();
    result.consoleErrors = consoleErrors;
    result.pageErrors = pageErrors;
    result.failedRequests = failedRequests;
    writeJson(join(manifest.evidenceDir, 'drive-result.json'), result);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function drive(options, positional) {
  const feature = positional[0];
  if (feature !== 'ranking') fail(`Feature não suportada: ${feature || '(ausente)'}`);
  const manifest = readManifest(options.runId);
  await driveRanking(manifest);
  process.stdout.write(`${JSON.stringify(readJson(join(manifest.evidenceDir, 'drive-result.json')), null, 2)}\n`);
}

function hashFile(path) {
  const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
  return { path, bytes: statSync(path).size, sha256: hash };
}

function evidence(options) {
  const manifest = readManifest(options.runId);
  const required = ['manifest.json', 'launch.log', 'doctor.json', 'before-action.png', 'after-vote.png', 'before-action.aria.txt', 'after-vote.aria.txt', 'drive-result.json'];
  const missing = required.filter(name => !existsSync(join(manifest.evidenceDir, name)));
  if (missing.length) fail(`Evidência incompleta; ausentes: ${missing.join(', ')}`);
  const driveResult = readJson(join(manifest.evidenceDir, 'drive-result.json'));
  if (driveResult.status !== 'passed') fail(`drive-result.json não passou: ${driveResult.status}`);
  const doctorResult = readJson(join(manifest.evidenceDir, 'doctor.json'));
  if (doctorResult.ok !== true) fail('doctor.json não está aprovado');
  const files = readdirSync(manifest.evidenceDir)
    .filter(name => name !== 'evidence.json')
    .map(name => join(manifest.evidenceDir, name))
    .filter(path => statSync(path).isFile())
    .sort()
    .map(hashFile);
  const report = {
    runId: manifest.runId,
    createdAt: nowIso(),
    gitSha: manifest.gitSha,
    worktree: manifest.worktree,
    platform: 'web',
    mode: manifest.mode,
    feature: driveResult.feature,
    status: 'passed',
    files,
    sideEffect: driveResult.sideEffect,
    checks: { doctor: doctorResult.ok, drive: driveResult.status === 'passed', evidenceRetained: true },
  };
  writeJson(join(manifest.evidenceDir, 'evidence.json'), report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

async function waitForExit(pid, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processAlive(pid)) return true;
    await new Promise(resolvePromise => setTimeout(resolvePromise, 250));
  }
  return !processAlive(pid);
}

async function terminateManifest(manifest, writeCleanup = true) {
  const info = processInfo(manifest.pid);
  const owned = !info.alive || (info.cwd === manifest.worktree && manifest.processIdentity && info.identity === manifest.processIdentity);
  if (!owned) fail(`PID ${manifest.pid} não pertence ao worktree registrado; cleanup abortado`);
  let signal = null;
  let stopped = !info.alive;
  if (info.alive) {
    try {
      process.kill(-manifest.pid, 'SIGTERM');
      signal = 'SIGTERM process-group';
    } catch {
      process.kill(manifest.pid, 'SIGTERM');
      signal = 'SIGTERM pid';
    }
    stopped = await waitForExit(manifest.pid);
    if (!stopped) {
      try {
        process.kill(-manifest.pid, 'SIGKILL');
        signal = 'SIGKILL process-group';
      } catch {
        process.kill(manifest.pid, 'SIGKILL');
        signal = 'SIGKILL pid';
      }
      stopped = await waitForExit(manifest.pid, 5_000);
    }
  }
  const report = {
    runId: manifest.runId,
    cleanedAt: nowIso(),
    pid: manifest.pid,
    signal,
    stopped,
    evidenceRetained: existsSync(manifest.evidenceDir),
  };
  if (writeCleanup) writeJson(join(manifest.evidenceDir, 'cleanup.json'), report);
  if (!stopped) fail(`PID ${manifest.pid} continuou ativo após cleanup`);
  return report;
}

async function cleanup(options) {
  const manifest = readManifest(options.runId);
  const report = await terminateManifest(manifest, true);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function status(options) {
  process.stdout.write(`${JSON.stringify(readManifest(options.runId), null, 2)}\n`);
}

function check() {
  const validatorCandidates = [join(homedir(), '.codex', 'skills', '.system', 'skill-creator', 'scripts', 'quick_validate.py')];
  const validator = validatorCandidates.find(path => existsSync(path));
  let quickValidation = 'not-available';
  if (validator) {
    const validation = spawnSync('python3', [validator, skillDir], { cwd: rootDir, encoding: 'utf8' });
    if (validation.status !== 0) fail((validation.stdout || validation.stderr || 'quick_validate falhou').trim());
    quickValidation = (validation.stdout || validation.stderr || '').trim();
  } else {
    const content = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
    if (!content.startsWith('---\n') || !content.includes('\nname: verify-clube-do-jogo\n') || !content.includes('\ndescription:')) fail('SKILL.md sem frontmatter mínimo');
  }
  const source = resolve(skillDir);
  const claudeLink = resolve(rootDir, '.claude/skills/verify-clube-do-jogo');
  if (!existsSync(claudeLink) || realpathSync(claudeLink) !== source) fail('Symlink Claude não aponta para a fonte .agents');
  const wrapper = join(skillDir, 'scripts', 'verify-clube-do-jogo');
  const nodeHelper = join(skillDir, 'scripts', 'verify-clube-do-jogo.mjs');
  for (const path of [wrapper, nodeHelper]) {
    if ((statSync(path).mode & 0o111) === 0) fail(`Helper não executável: ${path}`);
  }
  const featureDir = join(skillDir, 'features');
  const featureFiles = readdirSync(featureDir).filter(name => name.endsWith('.md') && name !== 'README.md');
  if (featureFiles.length < 3 || featureFiles.length > 5) fail(`Quantidade de feature maps inválida: ${featureFiles.length}`);
  for (const name of featureFiles) {
    const content = readFileSync(join(featureDir, name), 'utf8');
    for (const heading of ['## Sub-features', '## How to get to it (user POV)', '## Driving it with ', '## Gotchas']) {
      if (!content.includes(heading)) fail(`${name} não contém ${heading}`);
    }
  }
  process.stdout.write(`${JSON.stringify({ valid: true, source, claudeLink, quickValidation, features: featureFiles.sort() }, null, 2)}\n`);
}

async function main() {
  const command = process.argv[2];
  if (!command) {
    usage();
    return;
  }
  const { positional, options } = parseArgs(process.argv.slice(3));
  if (process.env.RUN_ID && !options.runId) options.runId = process.env.RUN_ID;
  if (command === 'launch') return launch(options);
  if (command === 'doctor') return doctor(options);
  if (command === 'drive') return drive(options, positional);
  if (command === 'evidence') return evidence(options);
  if (command === 'cleanup') return cleanup(options);
  if (command === 'status') return status(options);
  if (command === 'check') return check();
  fail(`Comando desconhecido: ${command}`);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
