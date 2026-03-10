import { useState, useEffect, useCallback } from "react";
import type { NDKUser } from "@nostr-dev-kit/ndk";
import {
  initializeNDK,
  connectWithNip07,
  connectWithPrivateKey as connectPrivateKey,
  generateKeypair as genKeypair,
  setCurrentUser,
  disconnect as ndkDisconnect,
} from "../nostr/client";
import type { GeneratedKeys, AuthMethod } from "../types";

const STORAGE_KEY_AUTH_METHOD = "addy_auth_method";
const STORAGE_KEY_PUBKEY = "addy_last_pubkey";
const STORAGE_KEY_PRIVATE_KEY = "addy_private_key";

export interface UseNostrReturn {
  user: NDKUser | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  authMethod: AuthMethod;
  connect: () => Promise<string>;
  connectWithPrivateKey: (privateKeyHex: string) => Promise<string>;
  generateKeypair: () => GeneratedKeys;
  disconnect: () => void;
}

export function useNostr(): UseNostrReturn {
  const [user, setUser] = useState<NDKUser | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authMethod, setAuthMethod] = useState<AuthMethod>(null);

  // Auto-restore session on mount
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const ndk = await initializeNDK();
        const storedAuthMethod = localStorage.getItem(
          STORAGE_KEY_AUTH_METHOD,
        ) as AuthMethod;
        const storedPubkey = localStorage.getItem(STORAGE_KEY_PUBKEY);

        if (!storedAuthMethod || !storedPubkey) return;

        if (storedAuthMethod === "nip07" && window.nostr) {
          // Fast restore: use cached pubkey immediately
          const quickUser = ndk.getUser({ pubkey: storedPubkey });
          if (!cancelled) {
            setCurrentUser(quickUser);
            setUser(quickUser);
            setAuthMethod("nip07");
          }

          // Verify in background
          connectWithNip07()
            .then((verifiedUser) => {
              if (!cancelled && verifiedUser.pubkey !== storedPubkey) {
                setUser(verifiedUser);
                localStorage.setItem(STORAGE_KEY_PUBKEY, verifiedUser.pubkey);
              }
            })
            .catch(() => {
              // Keep cached user
            });
        } else if (storedAuthMethod === "private-key") {
          const storedKey = localStorage.getItem(STORAGE_KEY_PRIVATE_KEY);
          if (storedKey) {
            const restoredUser = await connectPrivateKey(storedKey);
            if (!cancelled) {
              setUser(restoredUser);
              setAuthMethod("private-key");
            }
          }
        }
      } catch (err) {
        console.warn("Session restore failed:", err);
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async (): Promise<string> => {
    setIsConnecting(true);
    setError(null);
    try {
      await initializeNDK();
      const connectedUser = await connectWithNip07();
      setUser(connectedUser);
      setAuthMethod("nip07");
      localStorage.setItem(STORAGE_KEY_AUTH_METHOD, "nip07");
      localStorage.setItem(STORAGE_KEY_PUBKEY, connectedUser.pubkey);
      return connectedUser.pubkey;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to connect";
      setError(message);
      throw err;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const connectWithPrivateKey = useCallback(
    async (privateKeyHex: string): Promise<string> => {
      setIsConnecting(true);
      setError(null);
      try {
        await initializeNDK();
        const connectedUser = await connectPrivateKey(privateKeyHex);
        setUser(connectedUser);
        setAuthMethod("private-key");
        localStorage.setItem(STORAGE_KEY_AUTH_METHOD, "private-key");
        localStorage.setItem(STORAGE_KEY_PUBKEY, connectedUser.pubkey);
        localStorage.setItem(STORAGE_KEY_PRIVATE_KEY, privateKeyHex);
        return connectedUser.pubkey;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to connect";
        setError(message);
        throw err;
      } finally {
        setIsConnecting(false);
      }
    },
    [],
  );

  const generateKeypair = useCallback((): GeneratedKeys => {
    return genKeypair();
  }, []);

  const disconnect = useCallback(() => {
    ndkDisconnect();
    setUser(null);
    setAuthMethod(null);
    setError(null);
    localStorage.removeItem(STORAGE_KEY_AUTH_METHOD);
    localStorage.removeItem(STORAGE_KEY_PUBKEY);
    localStorage.removeItem(STORAGE_KEY_PRIVATE_KEY);
  }, []);

  return {
    user,
    isConnected: user !== null,
    isConnecting,
    error,
    authMethod,
    connect,
    connectWithPrivateKey,
    generateKeypair,
    disconnect,
  };
}
