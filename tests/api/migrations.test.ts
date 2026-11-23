import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { CatalogSchemaError } from '../../src/lib/game-catalog';

const MIGRATIONS = path.join(process.cwd(), 'supabase/migrations');

test('every migration has a version of its own', () => {
  // A versão é a chave de supabase_migrations.schema_migrations: duas iguais e só uma aplica.
  const versions = readdirSync(MIGRATIONS).filter(name => name.endsWith('.sql')).map(name => name.split('_')[0]);
  const repeated = versions.filter((version, index) => versions.indexOf(version) !== index);
  assert.deepEqual(repeated, []);
});

test('the schema error points at a migration that exists', () => {
  const { message } = new CatalogSchemaError('rawg_id');
  const named = message.match(/supabase\/migrations\/(\S+\.sql)/)?.[1];
  assert.ok(named, message);
  assert.ok(existsSync(path.join(MIGRATIONS, named)), `${named} não existe em supabase/migrations`);
});
