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

test('falha de persistência espera operações concorrentes terminarem e não inicia receipts', async () => {
  const deliveries = [delivery(0), delivery(1), delivery(2)];
  const sends = [new Deferred<unknown[]>(), new Deferred<unknown[]>(), new Deferred<unknown[]>()];
  const persistence = [new Deferred<void>(), new Deferred<void>()];
  let sendIndex = 0;
  let persistenceIndex = 0;
  let receiptClaims = 0;
  const store: NativePushStore = {
    claimDeliveries: async () => deliveries,
    recordTickets: async outcomes => {
      if (outcomes[0].delivery.deliveryId === 'delivery-0') throw new Error('lease perdida');
      await persistence[persistenceIndex++].promise;
    },
    claimReceipts: async () => { receiptClaims += 1; return []; },
    recordReceipts: async () => undefined,
  };
  const worker = runNativePushWorker(store, {
    send: () => sends[sendIndex++].promise,
    getReceipts: async () => ({}),
  });
  let settled = false;
  void worker.then(() => { settled = true; }, () => { settled = true; });
  await flush();
  sends.forEach((send, index) => send.resolve([{ status: 'ok', id: `ticket-${index}` }]));
  await flush();
  assert.equal(settled, false);
  persistence.forEach(item => item.resolve());
  await assert.rejects(worker, /lease perdida/);
  assert.equal(receiptClaims, 0);
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
