import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createSupabaseNativePushStore,
  NATIVE_PUSH_SEND_CONCURRENCY,
  NATIVE_PUSH_STORE_WRITE_CONCURRENCY,
  runNativePushWorker,
  type ClaimedNativeDelivery,
  type ClaimedNativeReceipt,
  type NativePushStore,
  type NativeReceiptOutcome,
  type NativeTicketOutcome,
} from '../../src/lib/push-native';

class Deferred<T> {
  readonly promise: Promise<T>;
  resolve!: (value: T) => void;

  constructor() {
    this.promise = new Promise<T>(resolve => { this.resolve = resolve; });
  }
}

function delivery(index: number): ClaimedNativeDelivery {
  return {
    deliveryId: `delivery-${index}`,
    attemptId: `attempt-${index}`,
    attemptNumber: 1,
    installationId: `installation-${index}`,
    expoPushToken: `ExpoPushToken[token${String(index).padStart(12, '0')}]`,
    projectId: `project-${index}`,
    message: { title: 'Título', body: 'Corpo', url: '/ranking', tag: `tag-${index}` },
  };
}

const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test('claim com cem projetos limita a dez sends concorrentes e persiste todos antes de reclamar receipts', async () => {
  const deliveries = Array.from({ length: 100 }, (_, index) => delivery(index));
  const dueReceipt: ClaimedNativeReceipt = {
    deliveryId: 'receipt-delivery',
    attemptId: 'receipt-attempt',
    receiptAttemptNumber: 1,
    installationId: 'receipt-installation',
    expoPushToken: 'ExpoPushToken[receipttoken1234]',
    ticketId: 'receipt-ticket',
  };
  const tickets: NativeTicketOutcome[] = [];
  const receipts: NativeReceiptOutcome[] = [];
  const events: string[] = [];
  const store: NativePushStore = {
    claimDeliveries: async () => deliveries,
    recordTickets: async outcomes => {
      tickets.push(...outcomes);
      events.push(`tickets:${outcomes.length}`);
    },
    claimReceipts: async () => {
      assert.equal(tickets.length, deliveries.length);
      events.push('claim-receipts');
      return [dueReceipt];
    },
    recordReceipts: async outcomes => { receipts.push(...outcomes); },
  };

  let active = 0;
  let peak = 0;
  let sends = 0;
  const pending: Array<{ deferred: Deferred<unknown[]>; ticketId: string }> = [];
  const worker = runNativePushWorker(store, {
    send: async () => {
      sends += 1;
      active += 1;
      peak = Math.max(peak, active);
      const item = { deferred: new Deferred<unknown[]>(), ticketId: `ticket-${sends}` };
      pending.push(item);
      try {
        return await item.deferred.promise;
      } finally {
        active -= 1;
      }
    },
    getReceipts: async ids => {
      assert.deepEqual(ids, ['receipt-ticket']);
      return { 'receipt-ticket': { status: 'ok' } };
    },
  });

  await flush();
  assert.equal(NATIVE_PUSH_SEND_CONCURRENCY, 10);
  assert.equal(active, NATIVE_PUSH_SEND_CONCURRENCY);
  while (sends < deliveries.length || active > 0) {
    const wave = pending.splice(0);
    for (const item of wave) item.deferred.resolve([{ status: 'ok', id: item.ticketId }]);
    await flush();
  }

  const result = await worker;
  assert.equal(peak, NATIVE_PUSH_SEND_CONCURRENCY);
  assert.equal(sends, deliveries.length);
  assert.equal(tickets.length, deliveries.length);
  assert.equal(tickets.every(outcome => outcome.status === 'ticketed'), true);
  assert.equal(receipts[0].status, 'delivered');
  assert.equal(events.at(-1), 'claim-receipts');
  assert.deepEqual(result, {
    claimed: 100,
    ticketed: 100,
    delivered: 1,
    retried: 0,
    invalidTokens: 0,
    failed: 0,
    awaitingReceipt: 0,
  });
});

test('falha de persistência ocorre depois de todos os projetos reclamados serem enviados', async () => {
  const deliveries = Array.from({ length: 100 }, (_, index) => delivery(index));
  let sends = 0;
  let ticketWrites = 0;
  let receiptClaims = 0;
  const store: NativePushStore = {
    claimDeliveries: async () => deliveries,
    recordTickets: async outcomes => {
      ticketWrites += 1;
      assert.equal(outcomes.length, deliveries.length);
      throw new Error('lease perdida');
    },
    claimReceipts: async () => { receiptClaims += 1; return []; },
    recordReceipts: async () => undefined,
  };
  await assert.rejects(runNativePushWorker(store, {
    send: async () => [{ status: 'ok', id: `ticket-${sends++}` }],
    getReceipts: async () => ({}),
  }), /lease perdida/);
  assert.equal(sends, deliveries.length);
  assert.equal(ticketWrites, 1);
  assert.equal(receiptClaims, 0);
});

test('store drena cem persistências de ticket com limite global de vinte após uma lease perdida', async () => {
  type RpcResult = { data: boolean; error: null };
  let active = 0;
  let peak = 0;
  let calls = 0;
  const pending: Array<{ index: number; deferred: Deferred<RpcResult> }> = [];
  const client = {
    rpc(name: string) {
      assert.equal(name, 'record_native_push_ticket');
      return {
        abortSignal() {
          const index = calls++;
          active += 1;
          peak = Math.max(peak, active);
          const deferred = new Deferred<RpcResult>();
          pending.push({ index, deferred });
          return deferred.promise.finally(() => { active -= 1; });
        },
      };
    },
  } as unknown as SupabaseClient;
  const store = createSupabaseNativePushStore(client, 'worker-budget');
  const outcomes: NativeTicketOutcome[] = Array.from({ length: 100 }, (_, index) => ({
    delivery: delivery(index),
    status: 'ticketed',
    ticketId: `ticket-${index}`,
  }));
  const persistence = store.recordTickets(outcomes).catch(error => error as Error);
  await flush();
  assert.equal(active, NATIVE_PUSH_STORE_WRITE_CONCURRENCY);
  for (let wave = 0; wave < 5; wave += 1) {
    assert.equal(calls, Math.min((wave + 1) * NATIVE_PUSH_STORE_WRITE_CONCURRENCY, outcomes.length));
    const current = pending.splice(0);
    current.forEach(item => item.deferred.resolve({ data: item.index !== 0, error: null }));
    await flush();
  }
  const error = await persistence;
  assert.match(error.message, /ticket outcome was not persisted/);
  assert.equal(calls, outcomes.length);
  assert.equal(peak, NATIVE_PUSH_STORE_WRITE_CONCURRENCY);
});

test('worker aplica o limite global de vinte RPCs aos tickets de dez projetos', async () => {
  type RpcResult = { data: boolean; error: null };
  const deliveries = Array.from({ length: 100 }, (_, index) => ({
    ...delivery(index),
    projectId: `project-${Math.floor(index / 10)}`,
  }));
  let active = 0;
  let peak = 0;
  let calls = 0;
  const pending: Array<Deferred<RpcResult>> = [];
  const client = {
    rpc(name: string) {
      return {
        abortSignal() {
          if (name === 'claim_native_push_deliveries') return Promise.resolve({
            data: deliveries.map(item => ({
              delivery_id: item.deliveryId,
              attempt_id: item.attemptId,
              attempt_number: item.attemptNumber,
              installation_id: item.installationId,
              expo_push_token: item.expoPushToken,
              project_id: item.projectId,
              message: item.message,
            })),
            error: null,
          });
          if (name === 'claim_native_push_receipts') return Promise.resolve({ data: [], error: null });
          assert.equal(name, 'record_native_push_ticket');
          calls += 1;
          active += 1;
          peak = Math.max(peak, active);
          const deferred = new Deferred<RpcResult>();
          pending.push(deferred);
          return deferred.promise.finally(() => { active -= 1; });
        },
      };
    },
  } as unknown as SupabaseClient;
  const worker = runNativePushWorker(createSupabaseNativePushStore(client, 'worker-budget'), {
    send: async messages => messages.map((_, index) => ({ status: 'ok', id: `ticket-${index}` })),
    getReceipts: async () => ({}),
  });
  await flush();
  assert.equal(active, NATIVE_PUSH_STORE_WRITE_CONCURRENCY);
  while (calls < deliveries.length || active > 0) {
    const wave = pending.splice(0);
    wave.forEach(item => item.resolve({ data: true, error: null }));
    await flush();
  }
  await worker;
  assert.equal(calls, deliveries.length);
  assert.equal(peak, NATIVE_PUSH_STORE_WRITE_CONCURRENCY);
});

test('store limita mil persistências de receipt e aplica deadline a cada RPC', async () => {
  type RpcResult = { data: true; error: null };
  let active = 0;
  let peak = 0;
  let calls = 0;
  const signals: AbortSignal[] = [];
  const pending: Array<Deferred<RpcResult>> = [];
  const client = {
    rpc(name: string) {
      assert.equal(name, 'record_native_push_receipt');
      return {
        abortSignal(signal: AbortSignal) {
          calls += 1;
          active += 1;
          peak = Math.max(peak, active);
          signals.push(signal);
          const deferred = new Deferred<RpcResult>();
          pending.push(deferred);
          return deferred.promise.finally(() => { active -= 1; });
        },
      };
    },
  } as unknown as SupabaseClient;
  const store = createSupabaseNativePushStore(client, 'worker-budget');
  const outcomes: NativeReceiptOutcome[] = Array.from({ length: 1000 }, (_, index) => ({
    receipt: {
      deliveryId: `delivery-${index}`,
      attemptId: `attempt-${index}`,
      receiptAttemptNumber: 1,
      installationId: `installation-${index}`,
      expoPushToken: `ExpoPushToken[token${String(index).padStart(12, '0')}]`,
      ticketId: `ticket-${index}`,
    },
    status: 'delivered',
  }));
  const persistence = store.recordReceipts(outcomes);
  await flush();
  assert.equal(active, NATIVE_PUSH_STORE_WRITE_CONCURRENCY);
  while (calls < outcomes.length || active > 0) {
    const wave = pending.splice(0);
    wave.forEach(item => item.resolve({ data: true, error: null }));
    await flush();
  }
  await persistence;
  assert.equal(calls, outcomes.length);
  assert.equal(peak, NATIVE_PUSH_STORE_WRITE_CONCURRENCY);
  assert.equal(signals.length, outcomes.length);
  assert.equal(signals.every(signal => !signal.aborted), true);
});
