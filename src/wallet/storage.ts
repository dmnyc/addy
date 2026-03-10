/**
 * Spark Wallet Mnemonic Storage
 *
 * Stores the Breez SDK mnemonic in localStorage, encrypted with NIP-44
 * (encrypt-to-self). Only the user's Nostr private key can decrypt it.
 *
 * When used without Nostr login ("skip" flow), stores mnemonic in plain
 * text under a random identifier.
 */

import { getEncryptionProvider } from "../nostr/encryption";
import { getCurrentUser } from "../nostr/client";

const LOCAL_STORAGE_KEY_PREFIX = "addy_wallet_";

interface EncryptedMnemonicV2 {
  version: 2;
  ciphertext: string;
}

interface PlainMnemonic {
  version: 0;
  mnemonic: string;
}

function isV2(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw);
    return parsed?.version === 2;
  } catch {
    return false;
  }
}

function isPlain(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw);
    return parsed?.version === 0;
  } catch {
    return false;
  }
}

/**
 * Save mnemonic to localStorage.
 * If logged in with Nostr, encrypts with NIP-44 encrypt-to-self.
 * If using skip flow, stores as plain text.
 */
export async function saveMnemonic(
  identifier: string,
  mnemonic: string,
): Promise<void> {
  const user = getCurrentUser();

  if (user?.pubkey) {
    // Nostr login: encrypt with NIP-44
    const provider = getEncryptionProvider();
    const ciphertext = await provider.encrypt(user.pubkey, mnemonic);
    const data: EncryptedMnemonicV2 = { version: 2, ciphertext };
    localStorage.setItem(
      `${LOCAL_STORAGE_KEY_PREFIX}${identifier}`,
      JSON.stringify(data),
    );
  } else {
    // Skip flow: store plain (no Nostr keys available)
    const data: PlainMnemonic = { version: 0, mnemonic };
    localStorage.setItem(
      `${LOCAL_STORAGE_KEY_PREFIX}${identifier}`,
      JSON.stringify(data),
    );
  }
}

/**
 * Load and decrypt mnemonic from localStorage.
 */
export async function loadMnemonic(
  identifier: string,
): Promise<string | null> {
  const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${identifier}`);
  if (!raw) return null;

  // Plain text (skip flow)
  if (isPlain(raw)) {
    try {
      const data: PlainMnemonic = JSON.parse(raw);
      return data.mnemonic;
    } catch {
      return null;
    }
  }

  // NIP-44 encrypted
  if (isV2(raw)) {
    try {
      const data: EncryptedMnemonicV2 = JSON.parse(raw);
      const user = getCurrentUser();
      if (!user?.pubkey) {
        console.error("[Storage] Not logged in, cannot decrypt mnemonic");
        return null;
      }
      const provider = getEncryptionProvider();
      return await provider.decrypt(user.pubkey, data.ciphertext);
    } catch (error) {
      console.error("[Storage] Failed to decrypt mnemonic:", error);
      return null;
    }
  }

  return null;
}

export function hasMnemonic(identifier: string): boolean {
  return (
    localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${identifier}`) !== null
  );
}

export function deleteMnemonic(identifier: string): void {
  localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}${identifier}`);
}

export function clearAllWallets(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(LOCAL_STORAGE_KEY_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}
