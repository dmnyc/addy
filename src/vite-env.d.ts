/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __BUILD_HASH__: string;

interface Window {
  nostr?: {
    getPublicKey(): Promise<string>;
    signEvent(event: unknown): Promise<unknown>;
    nip04?: {
      encrypt(pubkey: string, plaintext: string): Promise<string>;
      decrypt(pubkey: string, ciphertext: string): Promise<string>;
    };
    nip44?: {
      encrypt(pubkey: string, plaintext: string): Promise<string>;
      decrypt(pubkey: string, ciphertext: string): Promise<string>;
    };
  };
}
