import NDK, {
  NDKEvent,
  NDKFilter,
  NDKRelay,
  NDKRelaySet,
  NDKRelayAuthPolicies,
  NDKUser,
  NDKNip07Signer,
  NDKPrivateKeySigner,
} from "@nostr-dev-kit/ndk";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";
import type { GeneratedKeys } from "../types";

const NIP07_SIGNER_TIMEOUT = 30000;
const RELAY_LIST_KIND = 10002;

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://nos.lol",
  "wss://purplepag.es",
];

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${operation} timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

let ndkInstance: NDK | null = null;
let currentUser: NDKUser | null = null;
const userRelayCache = new Map<string, string[]>();

export async function initializeNDK(): Promise<NDK> {
  if (ndkInstance) return ndkInstance;

  ndkInstance = new NDK({
    explicitRelayUrls: DEFAULT_RELAYS,
  });

  ndkInstance.connect().catch((err) => {
    console.warn("[NDK] Background relay connection failed:", err);
  });

  return ndkInstance;
}

export function getNDK(): NDK {
  if (!ndkInstance) {
    throw new Error("NDK not initialized. Call initializeNDK() first.");
  }
  return ndkInstance;
}

export async function ensureNDK(): Promise<NDK> {
  const ndk = ndkInstance ?? (await initializeNDK());

  for (const relay of ndk.pool.relays.values()) {
    if (relay.status === 1) return ndk;
  }

  await new Promise<void>((resolve) => {
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };
    for (const relay of ndk.pool.relays.values()) {
      relay.on("connect", done);
    }
    setTimeout(done, 5000);
  });

  return ndk;
}

export async function connectWithNip07(): Promise<NDKUser> {
  const ndk = getNDK();

  if (typeof window === "undefined" || !window.nostr) {
    throw new Error("No NIP-07 extension found. Please install Alby or nos2x.");
  }

  const signer = new NDKNip07Signer();
  ndk.signer = signer;
  ndk.relayAuthDefaultPolicy = NDKRelayAuthPolicies.signIn({ ndk });

  const user = await withTimeout(
    signer.user(),
    NIP07_SIGNER_TIMEOUT,
    "NIP-07 signer connection",
  );

  try {
    await withTimeout(user.fetchProfile(), 10000, "Profile fetch");
  } catch (err) {
    console.warn("Failed to fetch profile:", err);
  }

  currentUser = user;
  try {
    await withTimeout(loadUserRelays(user.pubkey), 8000, "User relay list load");
  } catch (err) {
    console.warn("Failed to load user relays:", err);
  }

  return user;
}

export async function connectWithPrivateKey(
  privateKeyHex: string,
): Promise<NDKUser> {
  const ndk = getNDK();

  const signer = new NDKPrivateKeySigner(privateKeyHex);
  ndk.signer = signer;
  ndk.relayAuthDefaultPolicy = NDKRelayAuthPolicies.signIn({ ndk });

  const user = await signer.user();

  try {
    await withTimeout(user.fetchProfile(), 10000, "Profile fetch");
  } catch (err) {
    console.warn("Failed to fetch profile:", err);
  }

  currentUser = user;
  try {
    await withTimeout(loadUserRelays(user.pubkey), 8000, "User relay list load");
  } catch (err) {
    console.warn("Failed to load user relays:", err);
  }

  return user;
}

export function generateKeypair(): GeneratedKeys {
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);
  const secretKeyHex = Array.from(secretKey)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return {
    secretKeyHex,
    pubkey,
    nsec: nip19.nsecEncode(secretKey),
    npub: nip19.npubEncode(pubkey),
  };
}

export function getCurrentUser(): NDKUser | null {
  return currentUser;
}

export function setCurrentUser(user: NDKUser | null): void {
  currentUser = user;
}

export function isConnected(): boolean {
  return currentUser !== null && ndkInstance !== null;
}

export function disconnect(): void {
  if (ndkInstance) {
    currentUser = null;
    ndkInstance.signer = undefined;
  }
  userRelayCache.clear();
}

async function fetchUserRelayList(pubkey: string): Promise<string[]> {
  const cached = userRelayCache.get(pubkey);
  if (cached) return cached;

  const ndk = getNDK();

  try {
    const events = await ndk.fetchEvents({
      kinds: [RELAY_LIST_KIND],
      authors: [pubkey],
      limit: 1,
    });

    if (events.size === 0) return [];

    const event = Array.from(events)[0];
    const writeRelays: string[] = [];

    event.tags.forEach((tag) => {
      if (tag[0] === "r") {
        const relay = tag[1];
        const permission = tag[2];
        if (!permission || permission === "write") {
          writeRelays.push(relay);
        }
      }
    });

    if (writeRelays.length > 0) {
      userRelayCache.set(pubkey, writeRelays);
    }

    return writeRelays;
  } catch (error) {
    console.error("Failed to fetch relay list:", error);
    return [];
  }
}

function getExpandedRelayList(
  userRelays: string[],
  maxRelays = 12,
): string[] {
  const relaySet = new Set<string>();
  const pinnedRelays = [
    "wss://relay.damus.io",
    "wss://relay.primal.net",
    "wss://nos.lol",
  ];

  for (const relay of pinnedRelays) {
    relaySet.add(relay.trim().toLowerCase().replace(/\/+$/, ""));
  }

  for (const relay of userRelays) {
    if (relaySet.size >= maxRelays) break;
    const normalized = relay.trim().toLowerCase().replace(/\/+$/, "");
    if (normalized.startsWith("wss://") || normalized.startsWith("ws://")) {
      relaySet.add(normalized);
    }
  }

  for (const relay of DEFAULT_RELAYS) {
    if (relaySet.size >= maxRelays) break;
    relaySet.add(relay.trim().toLowerCase().replace(/\/+$/, ""));
  }

  return Array.from(relaySet);
}

async function addRelaysToPool(relays: string[]): Promise<void> {
  const ndk = getNDK();
  for (const relay of relays) {
    const normalized = relay.trim().toLowerCase().replace(/\/+$/, "");
    const existingRelay = ndk.pool.relays.get(normalized);
    if (!existingRelay) {
      try {
        const ndkRelay = ndk.pool.getRelay(normalized, true);
        if (ndkRelay) {
          await ndkRelay.connect();
        }
      } catch {
        // Ignore relay connection failures
      }
    }
  }
}

async function loadUserRelays(pubkey: string): Promise<string[]> {
  const userRelays = await fetchUserRelayList(pubkey);
  if (userRelays.length > 0) {
    const expandedRelays = getExpandedRelayList(userRelays);
    await addRelaysToPool(expandedRelays);
    return expandedRelays;
  }
  return DEFAULT_RELAYS;
}

export function getConnectedRelayCount(): number {
  if (!ndkInstance) return 0;
  try {
    return ndkInstance.pool.connectedRelays().length;
  } catch {
    return 0;
  }
}

export async function fetchEvents(filter: NDKFilter): Promise<NDKEvent[]> {
  const ndk = getNDK();
  return new Promise((resolve) => {
    const events = new Map<string, NDKEvent>();
    const subscription = ndk.subscribe(filter, { closeOnEose: true });
    let settled = false;

    const finalize = () => {
      if (settled) return;
      settled = true;
      subscription.stop();
      resolve(Array.from(events.values()));
    };

    const timeoutId = setTimeout(finalize, 10000);

    subscription.on("event", (event: NDKEvent) => {
      const dedupKey =
        typeof event.deduplicationKey === "function"
          ? event.deduplicationKey()
          : event.id;
      const existing = events.get(dedupKey);
      if (!existing || (event.created_at || 0) >= (existing.created_at || 0)) {
        events.set(dedupKey, event);
      }
    });

    subscription.on("eose", () => {
      clearTimeout(timeoutId);
      finalize();
    });
  });
}

export async function publishEvent(
  event: NDKEvent,
  options: { maxRetries?: number; additionalRelays?: string[] } = {},
): Promise<Set<NDKRelay>> {
  const { maxRetries = 2, additionalRelays } = options;
  const ndk = getNDK();
  event.ndk = ndk;
  await event.sign();

  let relaySet: NDKRelaySet | undefined;
  if (additionalRelays && additionalRelays.length > 0) {
    const poolRelayUrls = Array.from(ndk.pool.relays.values()).map((r) => r.url);
    const allRelayUrls = [...new Set([...poolRelayUrls, ...additionalRelays])];
    relaySet = NDKRelaySet.fromRelayUrls(allRelayUrls, ndk, true);
  }

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    try {
      const relays = await event.publish(relaySet);
      if (relays.size > 0) return relays;
      lastError = new Error("Event published but no relay acknowledged it");
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(
    `Failed to publish event after ${maxRetries + 1} attempts: ${lastError?.message ?? "unknown error"}`,
  );
}

export function createEvent(
  kind: number,
  content: string,
  tags: string[][] = [],
): NDKEvent {
  const ndk = getNDK();
  const event = new NDKEvent(ndk);
  event.kind = kind;
  event.content = content;
  event.tags = tags;
  return event;
}
