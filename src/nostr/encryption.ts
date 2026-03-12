import { nip44 } from "nostr-tools";
import { hexToBytes } from "@noble/hashes/utils";
import { NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";
import { getCurrentUser, getNDK } from "./client";

export interface EncryptionProvider {
  encrypt(pubkey: string, plaintext: string): Promise<string>;
  decrypt(pubkey: string, ciphertext: string): Promise<string>;
}

export function getEncryptionProvider(): EncryptionProvider {
  // If signed in with private key, use it directly (avoids triggering NIP-07 extension)
  try {
    const ndk = getNDK();
    const signer = ndk.signer;
    if (signer instanceof NDKPrivateKeySigner) {
      const privKeyHex = signer.privateKey;
      if (privKeyHex) {
        const privKeyBytes = hexToBytes(privKeyHex);
        return {
          encrypt: async (pubkey: string, plaintext: string) => {
            const key = nip44.v2.utils.getConversationKey(privKeyBytes, pubkey);
            return nip44.v2.encrypt(plaintext, key);
          },
          decrypt: async (pubkey: string, ciphertext: string) => {
            const key = nip44.v2.utils.getConversationKey(privKeyBytes, pubkey);
            return nip44.v2.decrypt(ciphertext, key);
          },
        };
      }
    }
  } catch {
    // NDK not initialized, fall through
  }

  // Fall back to NIP-07 extension with NIP-44 support
  if (typeof window !== "undefined" && window.nostr?.nip44) {
    return {
      encrypt: (pubkey: string, plaintext: string) =>
        window.nostr!.nip44!.encrypt(pubkey, plaintext),
      decrypt: (pubkey: string, ciphertext: string) =>
        window.nostr!.nip44!.decrypt(pubkey, ciphertext),
    };
  }

  throw new Error(
    "NIP-44 encryption requires a browser extension with NIP-44 support or sign in with a private key",
  );
}

export async function encryptMessage(
  recipientPubkey: string,
  plaintext: string,
): Promise<string> {
  const provider = getEncryptionProvider();
  return provider.encrypt(recipientPubkey, plaintext);
}

export async function decryptMessage(
  senderPubkey: string,
  ciphertext: string,
): Promise<string> {
  const provider = getEncryptionProvider();
  return provider.decrypt(senderPubkey, ciphertext);
}

export async function encryptToSelf(data: string): Promise<string> {
  const user = getCurrentUser();
  if (!user?.pubkey) {
    throw new Error("Must be logged in to encrypt to self");
  }
  return encryptMessage(user.pubkey, data);
}

export async function decryptFromSelf(ciphertext: string): Promise<string> {
  const user = getCurrentUser();
  if (!user?.pubkey) {
    throw new Error("Must be logged in to decrypt from self");
  }
  return decryptMessage(user.pubkey, ciphertext);
}
