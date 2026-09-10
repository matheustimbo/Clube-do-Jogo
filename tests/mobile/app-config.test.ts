import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const mobileRoot = fileURLToPath(new URL('../../apps/mobile/', import.meta.url));
const expoBin = fileURLToPath(new URL('../../node_modules/expo/bin/cli', import.meta.url));
const projectId = '00000000-0000-4000-8000-000000000001';

function readConfig(variables: Record<string, string> = {}) {
  const env = { ...process.env };
  for (const key of ['APP_VARIANT', 'EAS_BUILD_PROFILE', 'EXPO_APPLICATION_ID', 'EXPO_EAS_PROJECT_ID']) {
    delete env[key];
  }
  return spawnSync(process.execPath, [expoBin, 'config', '--type', 'public', '--json'], {
    cwd: mobileRoot,
    env: { ...env, EXPO_NO_DOTENV: '1', EXPO_NO_TELEMETRY: '1', ...variables },
    encoding: 'utf8',
    timeout: 30_000,
  });
}

test('build local mantém identidade de desenvolvimento e usa somente o bundle embarcado', () => {
  const result = readConfig();
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(config.android.package, 'com.clubedojogo.mobile.dev');
  assert.equal(config.ios.bundleIdentifier, 'com.clubedojogo.mobile.dev');
  assert.equal(config.updates.enabled, false);
  assert.equal(config.updates.url, undefined);
  assert.deepEqual(config.runtimeVersion, { policy: 'fingerprint' });
});

test('preview conecta updates e push somente ao projeto explícito', () => {
  const result = readConfig({
    EAS_BUILD_PROFILE: 'preview-simulator',
    APP_VARIANT: 'preview',
    EXPO_APPLICATION_ID: 'com.example.club.preview',
    EXPO_EAS_PROJECT_ID: projectId,
  });
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(config.android.package, 'com.example.club.preview');
  assert.equal(config.ios.bundleIdentifier, 'com.example.club.preview');
  assert.equal(config.updates.enabled, true);
  assert.equal(config.updates.url, `https://u.expo.dev/${projectId}`);
  assert.equal(config.extra.eas.projectId, projectId);
});

test('produção não herda identificação local quando falta configuração de distribuição', () => {
  const result = readConfig({ EAS_BUILD_PROFILE: 'production' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EXPO_APPLICATION_ID e EXPO_EAS_PROJECT_ID/);
});

test('perfil de produção rejeita variante de desenvolvimento e UUID inválido', () => {
  const conflicting = readConfig({ EAS_BUILD_PROFILE: 'production', APP_VARIANT: 'development' });
  assert.notEqual(conflicting.status, 0);
  assert.match(conflicting.stderr, /corresponder ao perfil EAS/);
  const invalidProject = readConfig({ EXPO_EAS_PROJECT_ID: 'project-name' });
  assert.notEqual(invalidProject.status, 0);
  assert.match(invalidProject.stderr, /UUID/);
});
