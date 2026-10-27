import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  connect: vi.fn(),
  instances: [] as {
    url: string;
    publish: ReturnType<typeof vi.fn>;
    subscriptions: Record<string, unknown>[];
    filters: unknown[];
    openSubs: Map<string, { close: ReturnType<typeof vi.fn> }>;
  }[],
}));

vi.mock('nostr-tools/relay', () => ({ Relay: { connect: (...args: unknown[]) => harness.connect(...args) } }));

import { RELAYS, RelayLink } from '../src/online/relays';
import type { NostrEvent } from '@regolith/online';

function event(id: string, created_at = 1): NostrEvent {
  return { id, pubkey: '', created_at, kind: 4747, tags: [], content: '', sig: '' };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('online relay link', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn(), visibilityState: 'visible' });
    vi.stubGlobal('window', {
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (timer: number) => clearTimeout(timer),
    });
    harness.instances.length = 0;
    harness.connect.mockReset().mockImplementation(async (url: string) => {
      const relay = {
        url,
        connected: true,
        subscriptions: [] as Record<string, unknown>[],
        filters: [] as unknown[],
        openSubs: new Map<string, { close: ReturnType<typeof vi.fn> }>(),
        publish: vi.fn(),
        subscribe: vi.fn((filters: unknown, params: Record<string, unknown>) => {
          relay.filters.push(filters);
          relay.subscriptions.push(params);
          const sub = { close: vi.fn() };
          relay.openSubs.set(`sub-${relay.subscriptions.length}`, sub);
          return sub;
        }),
        close: vi.fn(),
        onclose: null as (() => void) | null,
      };
      harness.instances.push(relay);
      return relay;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('defers a transiently failed event behind newer events, then retries it', async () => {
    const target = RELAYS[0];
    let failures = 0;
    harness.connect.mockImplementation(async (url: string) => {
      const relay = {
        url,
        connected: true,
        subscriptions: [] as Record<string, unknown>[],
        filters: [] as unknown[],
        openSubs: new Map<string, { close: ReturnType<typeof vi.fn> }>(),
        publish: vi.fn((e: NostrEvent) => {
          if (url === target && e.id === 'older' && failures++ === 0) return Promise.reject(new Error('publish timed out'));
          return Promise.resolve('OK');
        }),
        subscribe: vi.fn((_filters: unknown, params: Record<string, unknown>) => {
          relay.subscriptions.push(params);
          const sub = { close: vi.fn() };
          relay.openSubs.set(`sub-${relay.subscriptions.length}`, sub);
          return sub;
        }),
        close: vi.fn(),
        onclose: null as (() => void) | null,
      };
      harness.instances.push(relay);
      return relay;
    });

    const link = new RelayLink('tag', () => [], vi.fn(), vi.fn());
    link.publish(event('older'));
    link.start();
    await flushPromises();
    const relay = harness.instances.find((r) => r.url === target)!;

    link.publish(event('newer'));
    await flushPromises();
    await vi.advanceTimersByTimeAsync(2100);
    await flushPromises();

    expect(relay.publish.mock.calls.map(([e]) => (e as NostrEvent).id)).toEqual(['older', 'newer', 'older']);
    link.close();
    await vi.runOnlyPendingTimersAsync();
  });

  it('does not skip relayed events before signature validation', async () => {
    const link = new RelayLink('tag', () => [], vi.fn(), vi.fn());
    link.start();
    await flushPromises();

    expect(harness.instances).toHaveLength(RELAYS.length);
    for (const relay of harness.instances) {
      expect(relay.subscriptions[0]).not.toHaveProperty('alreadyHaveEvent');
    }

    link.close();
    await vi.runOnlyPendingTimersAsync();
  });

  it('with `since`, asks only for events from about then on', async () => {
    const link = new RelayLink('tag', () => [], vi.fn(), vi.fn(), vi.fn(), 10_000);
    link.start();
    await flushPromises();
    expect(harness.instances[0].filters[0]).toEqual([expect.objectContaining({ '#t': ['tag'], since: 10_000 - 3600 })]);
    link.close();
    await vi.runOnlyPendingTimersAsync();
  });

  it('says when it asked, once a relay has sent everything', async () => {
    const onSynced = vi.fn();
    const link = new RelayLink('tag', () => [], vi.fn(), vi.fn(), onSynced);
    link.start();
    await flushPromises();
    (harness.instances[0].subscriptions[0].oneose as () => void)();
    await flushPromises();
    expect(onSynced).toHaveBeenCalledWith(expect.any(Number));
    link.close();
    await vi.runOnlyPendingTimersAsync();
  });
});
