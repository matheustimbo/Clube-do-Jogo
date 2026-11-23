import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { voteChoiceOptions } from '../../apps/mobile/src/components/vote-choice-options';

// option.label é o rótulo curto do botão. O leitor de tela lê option.accessibilityName,
// a frase inteira (vote-choice-options.ts).
const MOBILE = path.join(process.cwd(), 'apps/mobile');

test('no screen reads the short preference label to the screen reader', () => {
  const offenders = ['app', 'src'].flatMap(dir => readdirSync(path.join(MOBILE, dir), { withFileTypes: true, recursive: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.tsx'))
    .map(entry => path.relative(MOBILE, path.join(entry.parentPath, entry.name))))
    .map(file => [file, readFileSync(path.join(MOBILE, file), 'utf8')] as const)
    // Outras listas (motivos do voto, modos do tema) também chamam o item de option.
    .filter(([, source]) => source.includes('voteChoiceOptions'))
    .flatMap(([file, source]) => source.split('\n')
      .flatMap((line, index) => (/accessibilityLabel=\{[^}]*option\.label/.test(line) ? [`${file}:${index + 1}`] : [])));
  assert.deepEqual(offenders, []);
});

test('each choice gives the screen reader its full name', () => {
  assert.deepEqual(voteChoiceOptions.map(option => option.accessibilityName), ['Não jogaria', 'Neutro', 'Jogaria']);
});
