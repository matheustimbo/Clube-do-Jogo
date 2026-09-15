import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authenticatedUserId } from '../../src/lib/supabase/auth';

const MEMBER = '8f14e45f-ceea-467a-9e2f-4c0bd5a6a111';

function fakeClient(reply: unknown, seen?: { jwt?: string | undefined }): SupabaseClient {
  return {
    auth: {
      async getClaims(jwt?: string) {
        if (seen) seen.jwt = jwt;
        return reply;
      },
    },
  } as unknown as SupabaseClient;
}

test('o token do header é o que vai para a conferência', async () => {
  const seen: { jwt?: string } = {};
  const id = await authenticatedUserId(fakeClient({ data: { claims: { sub: MEMBER } }, error: null }, seen), 'Bearer abc.def.ghi');
  assert.equal(seen.jwt, 'abc.def.ghi');
  assert.equal(id, MEMBER);
});

test('sem header o cookie da sessão continua valendo', async () => {
  const seen: { jwt?: string } = {};
  await authenticatedUserId(fakeClient({ data: { claims: { sub: MEMBER } }, error: null }, seen), null);
  assert.equal(seen.jwt, undefined);
});

test('token recusado não vira membro', async () => {
  assert.equal(await authenticatedUserId(fakeClient({ data: null, error: new Error('jwt expired') }), 'Bearer x.y.z'), null);
  assert.equal(await authenticatedUserId(fakeClient({ data: { claims: {} }, error: null }), 'Bearer x.y.z'), null);
  assert.equal(await authenticatedUserId(fakeClient({ data: { claims: { sub: '' } }, error: null }), 'Bearer x.y.z'), null);
});

test('header malformado não passa como token', async () => {
  const seen: { jwt?: string } = {};
  await authenticatedUserId(fakeClient({ data: null, error: new Error('no jwt') }, seen), 'Basic abc');
  assert.equal(seen.jwt, undefined);
});

// A troca só se sustenta se a conferência local de fato recusar token vencido e
// assinatura errada. Assina de verdade com ES256 e entrega o JWKS na mão, sem rede.
test('a conferência local recusa token vencido e assinatura trocada', async () => {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await webcrypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'chave-do-teste', alg: 'ES256', use: 'sig', key_ops: ['verify'] };

  const sign = async (exp: number) => {
    const body = `${encode({ alg: 'ES256', kid: 'chave-do-teste', typ: 'JWT' })}.${encode({ sub: MEMBER, exp })}`;
    const signature = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(body));
    return `${body}.${Buffer.from(signature).toString('base64url')}`;
  };

  const supabase = createClient('https://projeto.supabase.co', 'sb_publishable_teste');
  const check = (token: string) => supabase.auth.getClaims(token, { keys: [jwk as never] });

  const valido = await check(await sign(Math.floor(Date.now() / 1000) + 3600));
  assert.equal(valido.error, null);
  assert.equal(valido.data?.claims.sub, MEMBER);

  const vencido = await check(await sign(Math.floor(Date.now() / 1000) - 60));
  assert.ok(vencido.error, 'token vencido tem que ser recusado');

  const fresco = await sign(Math.floor(Date.now() / 1000) + 3600);
  const adulterado = `${fresco.slice(0, -4)}${fresco.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA'}`;
  assert.ok((await check(adulterado)).error, 'assinatura trocada tem que ser recusada');
});
