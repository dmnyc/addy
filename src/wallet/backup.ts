/**
 * Spark Wallet Backup to Nostr Relays
 *
 * Backs up the Spark mnemonic to Nostr using NIP-78 (kind 30078)
 * with NIP-44 encryption. Compatible with other Spark wallet apps.
 */

import { NDKEvent, NDKRelaySet } from "@nostr-dev-kit/ndk";
import { getNDK, ensureNDK } from "../nostr/client";
import { getEncryptionProvider } from "../nostr/encryption";
import { loadMnemonic } from "./storage";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import type { SparkBackupEntry } from "../types";

const NIP07_OPERATION_TIMEOUT = 30000;
const RELAY_FETCH_TIMEOUT = 15000;

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

const BACKUP_EVENT_KIND = 30078;
const BACKUP_D_TAG = "spark-wallet-backup";
const BACKUP_D_TAG_PREFIX = `${BACKUP_D_TAG}:`;

function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getSparkWalletId(mnemonic: string): string {
  const normalized = normalizeMnemonic(mnemonic);
  const hash = sha256(new TextEncoder().encode(normalized));
  return bytesToHex(hash).slice(0, 16);
}

function getBackupTag(walletId: string | null): string {
  return walletId ? `${BACKUP_D_TAG_PREFIX}${walletId}` : BACKUP_D_TAG;
}

function parseBackupTag(
  dTag: string,
): { isLegacy: boolean; walletId?: string } | null {
  if (dTag === BACKUP_D_TAG) {
    return { isLegacy: true };
  }
  if (dTag.startsWith(BACKUP_D_TAG_PREFIX)) {
    return {
      isLegacy: false,
      walletId: dTag.slice(BACKUP_D_TAG_PREFIX.length),
    };
  }
  return null;
}

export function hasEncryptionSupport(): boolean {
  // Check NIP-07 extension with NIP-44
  if (typeof window !== "undefined" && window.nostr?.nip44) return true;

  // Check if we have a private key signer (nostr-tools can handle NIP-44)
  try {
    const ndk = getNDK();
    const signer = ndk.signer as Record<string, unknown> | undefined;
    if (signer && typeof signer.privateKey === "string") {
      return true;
    }
  } catch {
    // Fall through
  }

  return false;
}

function detectEncryptionMethod(ciphertext: string): "nip44" | "nip04" {
  if (ciphertext.includes("?iv=")) return "nip04";
  return "nip44";
}

async function encrypt(pubkey: string, plaintext: string): Promise<string> {
  const provider = getEncryptionProvider();
  return await withTimeout(
    provider.encrypt(pubkey, plaintext),
    NIP07_OPERATION_TIMEOUT,
    "NIP-44 encryption",
  );
}

async function decrypt(pubkey: string, ciphertext: string): Promise<string> {
  const provider = getEncryptionProvider();
  return await withTimeout(
    provider.decrypt(pubkey, ciphertext),
    NIP07_OPERATION_TIMEOUT,
    "NIP-44 decryption",
  );
}

function isDeletedBackupEvent(event: NDKEvent): boolean {
  return (
    !!event.tags?.some((t) => t[0] === "deleted" && t[1] === "true") ||
    !event.content
  );
}

/**
 * Backup Spark mnemonic to Nostr relays.
 */
export async function backupSparkToNostr(
  pubkey: string,
  mnemonic?: string,
): Promise<NDKEvent> {
  const mnemonicToBackup = mnemonic || (await loadMnemonic(pubkey));

  if (!mnemonicToBackup) {
    throw new Error("No mnemonic to backup");
  }

  const ndk = await ensureNDK();
  const walletId = getSparkWalletId(mnemonicToBackup);

  console.log("[Backup] Encrypting mnemonic with NIP-44...");
  const encryptedContent = await encrypt(pubkey, mnemonicToBackup);

  const ndkEvent = new NDKEvent(ndk);
  ndkEvent.kind = BACKUP_EVENT_KIND;
  ndkEvent.content = encryptedContent;
  ndkEvent.tags = [
    ["d", getBackupTag(walletId)],
    ["client", "addy"],
    ["encryption", "nip44"],
  ];

  console.log("[Backup] Signing backup event...");
  await withTimeout(ndkEvent.sign(), NIP07_OPERATION_TIMEOUT, "Event signing");

  console.log("[Backup] Publishing backup to Nostr relays...");
  const relays = await withTimeout(
    ndkEvent.publish(),
    RELAY_FETCH_TIMEOUT,
    "Event publishing",
  );

  if (!relays || relays.size === 0) {
    throw new Error("Backup failed: no relays accepted the event. Check relay connections.");
  }

  console.log(`[Backup] Mnemonic backed up to ${relays.size} relay(s)`);
  return ndkEvent;
}

/**
 * List all Spark backups on Nostr relays (NIP-44 only).
 */
export async function listSparkBackups(
  pubkey: string,
): Promise<SparkBackupEntry[]> {
  const ndk = await ensureNDK();

  const filter = {
    kinds: [BACKUP_EVENT_KIND],
    authors: [pubkey],
  };

  const events = await withTimeout(
    ndk.fetchEvents(filter, { closeOnEose: true }),
    RELAY_FETCH_TIMEOUT,
    "Relay fetch for backups",
  );

  if (!events || events.size === 0) {
    return [];
  }

  const latestByTag = new Map<string, SparkBackupEntry>();

  for (const event of events) {
    const dTag = event.tags?.find((t) => t[0] === "d")?.[1];
    if (!dTag) continue;

    const parsed = parseBackupTag(dTag);
    if (!parsed) continue;

    if (!event.content || isDeletedBackupEvent(event)) continue;

    const createdAt = event.created_at || 0;
    const encryptionTag = event.tags?.find((t) => t[0] === "encryption");
    const encryptionMethod =
      (encryptionTag?.[1] as "nip44" | "nip04") ||
      detectEncryptionMethod(event.content);

    if (encryptionMethod === "nip04") continue;

    const entry: SparkBackupEntry = {
      id: event.id || `${dTag}:${createdAt}`,
      dTag,
      content: event.content,
      createdAt,
      encryptionMethod,
      isLegacy: parsed.isLegacy,
      walletId: parsed.walletId,
    };

    const existing = latestByTag.get(dTag);
    if (!existing || createdAt > existing.createdAt) {
      latestByTag.set(dTag, entry);
    }
  }

  return Array.from(latestByTag.values()).sort(
    (a, b) => b.createdAt - a.createdAt,
  );
}

/**
 * Restore a specific Spark backup.
 */
export async function restoreSparkBackup(
  pubkey: string,
  backup: SparkBackupEntry,
): Promise<string> {
  if (backup.encryptionMethod === "nip04") {
    throw new Error("NIP-04 backups are not supported. Please use your recovery phrase.");
  }

  const mnemonic = await decrypt(pubkey, backup.content);

  if (!mnemonic) {
    throw new Error("Failed to decrypt backup.");
  }

  const words = mnemonic.trim().split(/\s+/);
  const validWordCounts = [12, 15, 18, 21, 24];
  if (!validWordCounts.includes(words.length)) {
    throw new Error("Decrypted data does not appear to be a valid mnemonic.");
  }

  return mnemonic;
}

/**
 * Restore most recent Spark backup from Nostr.
 */
export async function restoreSparkFromNostr(
  pubkey: string,
): Promise<string | null> {
  const backups = await listSparkBackups(pubkey);
  if (backups.length === 0) return null;
  return restoreSparkBackup(pubkey, backups[0]);
}

export async function hasSparkBackupOnNostr(pubkey: string): Promise<boolean> {
  try {
    const backups = await listSparkBackups(pubkey);
    return backups.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check which relays have the backup event for this pubkey.
 * Returns a map of relay URL -> boolean (has backup).
 */
export async function checkBackupRelays(
  pubkey: string,
): Promise<Map<string, boolean>> {
  const ndk = getNDK();
  const mnemonic = await loadMnemonic(pubkey);
  const walletId = mnemonic ? getSparkWalletId(mnemonic) : null;
  const dTag = getBackupTag(walletId);

  const results = new Map<string, boolean>();
  const relayUrls = Array.from(ndk.pool.relays.keys());

  const checks = relayUrls.map(async (url) => {
    try {
      const relay = ndk.pool.relays.get(url);
      if (!relay) {
        results.set(url, false);
        return;
      }

      const events = await withTimeout(
        ndk.fetchEvents(
          {
            kinds: [BACKUP_EVENT_KIND],
            authors: [pubkey],
            "#d": [dTag],
            limit: 1,
          },
          { closeOnEose: true },
          NDKRelaySet.fromRelayUrls([url], ndk),
        ),
        8000,
        `Check relay ${url}`,
      );

      const hasBackup =
        events.size > 0 &&
        Array.from(events).some((e) => !isDeletedBackupEvent(e));
      results.set(url, hasBackup);
    } catch {
      results.set(url, false);
    }
  });

  await Promise.allSettled(checks);
  return results;
}

export async function deleteSparkBackupFromNostr(
  pubkey: string,
): Promise<void> {
  const ndk = getNDK();
  const mnemonic = await loadMnemonic(pubkey);
  const walletId = mnemonic ? getSparkWalletId(mnemonic) : null;

  const ndkEvent = new NDKEvent(ndk);
  ndkEvent.kind = BACKUP_EVENT_KIND;
  ndkEvent.content = "";
  ndkEvent.tags = [
    ["d", getBackupTag(walletId)],
    ["deleted", "true"],
  ];

  await withTimeout(ndkEvent.sign(), NIP07_OPERATION_TIMEOUT, "Event signing");
  await withTimeout(
    ndkEvent.publish(),
    RELAY_FETCH_TIMEOUT,
    "Event publishing",
  );

  console.log("[Backup] Backup deleted");
}
