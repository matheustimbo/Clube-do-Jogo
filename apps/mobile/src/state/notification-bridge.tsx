import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useRouter } from 'expo-router';
import { createMobileApiTransport, getMobileSupabaseClient, nativeStorage } from '@/platform';
import { createExpoNotificationsAdapter } from '@/platform/notifications';
import { createNativePushApi } from '@/platform/push-api';
import {
  createPushController,
  type PushController,
  type PushNotificationsSnapshot,
} from '@/platform/push-controller';
import { PushResponseInbox, resolvePushDestination } from '@/platform/push-navigation';
import { useAppInternal } from './app-provider';
import { registerPushSignOutHandler } from './push-session';

export type PushNotificationsValue = PushNotificationsSnapshot & {
  requestPermission(): Promise<void>;
  retry(): Promise<void>;
};

const PushNotificationsContext = React.createContext<PushNotificationsValue | null>(null);

export function NotificationBridge({ children }: { children: React.ReactNode }): React.ReactElement {
  const { ready, userId, isDemo, sessionEpoch, dataClient } = useAppInternal();
  const router = useRouter();
  const adapter = useMemo(() => createExpoNotificationsAdapter(), []);
  const controller = useMemo<PushController>(() => {
    const client = getMobileSupabaseClient();
    return createPushController({
      adapter,
      api: createNativePushApi(createMobileApiTransport(client)),
      storage: nativeStorage,
    });
  }, [adapter]);
  const inbox = useMemo(() => new PushResponseInbox(), []);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const navigationGeneration = useRef(0);
  const previousUser = useRef<string | null>(null);
  const [responseVersion, responseCaptured] = React.useReducer(value => value + 1, 0);

  useEffect(() => {
    let disposed = false;
    let stop: () => void = () => undefined;
    void controller.start().then(dispose => {
      if (disposed) dispose();
      else stop = dispose;
    });
    return () => {
      disposed = true;
      stop();
    };
  }, [controller]);

  useEffect(() => registerPushSignOutHandler(controller), [controller]);

  useEffect(() => {
    void controller.setSession(ready && userId && !isDemo ? { userId, epoch: sessionEpoch } : null);
  }, [controller, isDemo, ready, sessionEpoch, userId]);

  useEffect(() => {
    const capture = (response: Parameters<typeof inbox.capture>[0]) => {
      if (inbox.capture(response)) {
        navigationGeneration.current += 1;
        responseCaptured();
      }
    };
    const stopReceived = adapter.subscribeReceived(() => undefined);
    const stopResponses = adapter.subscribeResponses(capture);
    void adapter.getLastResponse().then(response => {
      if (response) capture(response);
      return response ? adapter.clearLastResponse() : undefined;
    }).catch(() => undefined);
    return () => {
      stopReceived();
      stopResponses();
    };
  }, [adapter, inbox]);

  useEffect(() => {
    if (!ready) return;
    if (!userId || isDemo) {
      inbox.clearPending();
      previousUser.current = null;
      return;
    }
    if (previousUser.current && previousUser.current !== userId) inbox.clearPending();
    previousUser.current = userId;
    const pending = inbox.peek();
    if (!pending) return;
    const generation = ++navigationGeneration.current;
    void resolvePushDestination(pending.data.url, {
      game: async id => Boolean(await dataClient.readGame({ userId, isDemo: false, gameId: id })),
      profile: async id => Boolean(await dataClient.readProfile(id, false)),
    }).then(intent => {
      if (navigationGeneration.current !== generation || !inbox.peek()) return;
      inbox.consume();
      router.push(intent);
    }).catch(() => {
      if (navigationGeneration.current !== generation || !inbox.peek()) return;
      inbox.consume();
      router.push('/(app)/(tabs)/jogo-do-mes');
    });
  }, [dataClient, inbox, isDemo, ready, responseVersion, router, sessionEpoch, userId]);

  const requestPermission = useCallback(
    () => isDemo ? Promise.resolve() : controller.requestPermission(),
    [controller, isDemo],
  );
  const retry = useCallback(() => controller.retry(), [controller]);
  const value = useMemo<PushNotificationsValue>(() => ({
    ...(isDemo ? { status: 'unavailable' as const, registered: false, remoteUnlinkPending: false, error: null } : snapshot),
    requestPermission,
    retry,
  }), [isDemo, requestPermission, retry, snapshot]);

  return <PushNotificationsContext.Provider value={value}>{children}</PushNotificationsContext.Provider>;
}

export function usePushNotifications(): PushNotificationsValue {
  const value = React.useContext(PushNotificationsContext);
  if (!value) throw new Error('usePushNotifications precisa estar dentro de NotificationBridge.');
  return value;
}
