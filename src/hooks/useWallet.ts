import { useState, useEffect, useCallback } from "react";
import {
  getSparkState,
  subscribeToSparkState,
  createAndConnectWallet,
  connectWallet,
  importAndConnectWallet,
  disconnectWallet,
  getSparkBalance,
  hasSparkMnemonic,
} from "../wallet/spark";
import type { SparkPayment } from "../types";

const BREEZ_API_KEY = import.meta.env.VITE_BREEZ_SPARK_API_KEY || "";

export interface UseWalletReturn {
  balance: number | null;
  initialized: boolean;
  loading: boolean;
  lightningAddress: string | null;
  recentPayments: SparkPayment[];
  hasWallet: (identifier: string) => boolean;
  createWallet: (identifier: string) => Promise<string>;
  loadWallet: (identifier: string) => Promise<boolean>;
  importWallet: (identifier: string, mnemonic: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
  refreshBalance: (forceSync?: boolean) => Promise<void>;
}

export function useWallet(): UseWalletReturn {
  const [state, setState] = useState(getSparkState());

  useEffect(() => {
    return subscribeToSparkState(() => {
      setState(getSparkState());
    });
  }, []);

  const hasWallet = useCallback((identifier: string): boolean => {
    return hasSparkMnemonic(identifier);
  }, []);

  const createWallet = useCallback(
    async (identifier: string): Promise<string> => {
      if (!BREEZ_API_KEY) {
        throw new Error("Breez API key not configured");
      }
      return createAndConnectWallet(identifier, BREEZ_API_KEY);
    },
    [],
  );

  const loadWallet = useCallback(
    async (identifier: string): Promise<boolean> => {
      if (!BREEZ_API_KEY) {
        throw new Error("Breez API key not configured");
      }
      return connectWallet(identifier, BREEZ_API_KEY);
    },
    [],
  );

  const importWallet = useCallback(
    async (identifier: string, mnemonic: string): Promise<boolean> => {
      if (!BREEZ_API_KEY) {
        throw new Error("Breez API key not configured");
      }
      return importAndConnectWallet(identifier, mnemonic, BREEZ_API_KEY);
    },
    [],
  );

  const disconnect = useCallback(async () => {
    await disconnectWallet();
  }, []);

  const refreshBalance = useCallback(async (forceSync = false) => {
    await getSparkBalance(forceSync);
  }, []);

  return {
    balance: state.balance,
    initialized: state.initialized,
    loading: state.loading,
    lightningAddress: state.lightningAddress,
    recentPayments: state.recentPayments,
    hasWallet,
    createWallet,
    loadWallet,
    importWallet,
    disconnect,
    refreshBalance,
  };
}
