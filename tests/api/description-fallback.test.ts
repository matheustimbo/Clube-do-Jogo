import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

// O texto de jogo sem descrição mora em game-description.ts, junto da regra que lê o
// placeholder antigo como ausente. Uma tela que escreve o texto à mão mostra o
// placeholder gravado como se fosse descrição.
const ROOTS = ['src', 'apps/mobile/app', 'apps/mobile/src', 'packages/data/src'];
const TEXT = 'Sem descrição disponível.';

test('no screen writes the missing-description text by hand', () => {
  const offenders = ROOTS.flatMap(root => readdirSync(root, { withFileTypes: true, recursive: true })
    .filter(entry => entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts'))
    .map(entry => path.join(entry.parentPath, entry.name)))
    .filter(file => readFileSync(file, 'utf8').includes(TEXT));
  assert.deepEqual(offenders, []);
});
