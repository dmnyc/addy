import { useState, useCallback, useEffect, useRef } from "react";
import { useNostr } from "./hooks/useNostr";
import { useWallet } from "./hooks/useWallet";
import { LoginScreen } from "./components/LoginScreen";
import { MnemonicBackup } from "./components/MnemonicBackup";
import { WalletDashboard } from "./components/WalletDashboard";
import { SendPayment } from "./components/SendPayment";
import { ReceivePayment } from "./components/ReceivePayment";
import { TransactionHistory } from "./components/TransactionHistory";
import { BackupRestore } from "./components/BackupRestore";
import { registerLightningAddress } from "./wallet/spark";
import { deleteMnemonic, loadMnemonic, saveMnemonic } from "./wallet/storage";
import { restoreSparkFromNostr } from "./wallet/backup";
import type { AppView } from "./types";

function App() {
  const nostr = useNostr();
  const wallet = useWallet();
  const [view, setView] = useState<AppView>("login");
  const [pendingMnemonic, setPendingMnemonic] = useState<string | null>(null);
  const [walletIdentifier, setWalletIdentifier] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const isNewWallet = useRef(false);
  const isImporting = useRef(false);
  const isAutoLoading = useRef(false);

  // On mount, check if we have a stored skip identifier
  useEffect(() => {
    const skipId = localStorage.getItem("addy_skip_identifier");
    if (skipId) {
      setWalletIdentifier(skipId);
    }
  }, []);

  // Auto-load wallet when Nostr session is restored
  useEffect(() => {
    if (isImporting.current || isAutoLoading.current) return;
    if (nostr.isConnected && nostr.user?.pubkey && !wallet.initialized) {
      const pubkey = nostr.user.pubkey;
      setWalletIdentifier(pubkey);
      // Only auto-load if we have a local mnemonic (localStorage)
      if (wallet.hasWallet(pubkey)) {
        isAutoLoading.current = true;
        wallet.loadWallet(pubkey).then((loaded) => {
          if (loaded) {
            setView("dashboard");
          }
        }).catch(() => {}).finally(() => {
          isAutoLoading.current = false;
        });
      }
      // If no local wallet, don't auto-create — let user go through handleNostrConnected
    }
  }, [nostr.isConnected, nostr.user?.pubkey, wallet.initialized]);

  // Auto-load wallet for skip flow
  useEffect(() => {
    if (isImporting.current || isAutoLoading.current) return;
    if (walletIdentifier && !nostr.isConnected && !wallet.initialized) {
      const skipId = localStorage.getItem("addy_skip_identifier");
      if (skipId && wallet.hasWallet(skipId)) {
        isAutoLoading.current = true;
        wallet.loadWallet(skipId).then((loaded) => {
          if (loaded) {
            setView("dashboard");
          }
        }).catch(() => {}).finally(() => {
          isAutoLoading.current = false;
        });
      }
    }
  }, [walletIdentifier, nostr.isConnected, wallet.initialized]);

  const handleNostrConnected = useCallback(async (pubkey: string) => {
    setView("loading");

    // If wallet is already running (connecting Nostr from dashboard),
    // migrate the mnemonic from the skip identifier to the Nostr pubkey
    if (wallet.initialized) {
      const oldSkipId = localStorage.getItem("addy_skip_identifier");
      if (oldSkipId) {
        try {
          const mnemonic = await loadMnemonic(oldSkipId);
          if (mnemonic) {
            // Re-save under pubkey (will NIP-44 encrypt since Nostr user is now set)
            await saveMnemonic(pubkey, mnemonic);
            deleteMnemonic(oldSkipId);
            localStorage.removeItem("addy_skip_identifier");
            setWalletIdentifier(pubkey);
            setView("dashboard");
            return;
          }
        } catch (err) {
          console.error("[App] Failed to migrate wallet to Nostr identity:", err);
        }
      }
    }

    setWalletIdentifier(pubkey);

    // Check if wallet already exists locally
    if (wallet.hasWallet(pubkey)) {
      wallet.loadWallet(pubkey).then((loaded) => {
        if (loaded) {
          setView("dashboard");
        } else {
          startWalletCreation(pubkey);
        }
      }).catch((err) => {
        console.error("Failed to load wallet:", err);
        setWalletError(err instanceof Error ? err.message : "Failed to load wallet");
        setView("login");
      });
      return;
    }

    // No local wallet — check for Nostr backup before creating new
    try {
      setWalletError(null);
      const mnemonic = await restoreSparkFromNostr(pubkey);
      if (mnemonic) {
        isImporting.current = true;
        wallet.importWallet(pubkey, mnemonic).then((success) => {
          isImporting.current = false;
          if (success) {
            setView("dashboard");
          } else {
            setWalletError("Failed to restore wallet from backup");
            setView("login");
          }
        }).catch((err) => {
          isImporting.current = false;
          console.error("Failed to restore wallet:", err);
          setWalletError(err instanceof Error ? err.message : "Failed to restore wallet");
          setView("login");
        });
        return;
      }
    } catch {
      // Backup check failed — proceed to create new wallet
    }

    startWalletCreation(pubkey);
  }, [wallet]);

  const handleSkip = useCallback(
    (identifier: string) => {
      setWalletIdentifier(identifier);
      setView("loading");
      startWalletCreation(identifier);
    },
    [],
  );

  const handleImportWallet = useCallback(
    (mnemonic: string) => {
      isImporting.current = true;
      const identifier = `anon_${crypto.randomUUID().slice(0, 8)}`;
      localStorage.setItem("addy_skip_identifier", identifier);
      setWalletIdentifier(identifier);
      setWalletError(null);
      wallet
        .importWallet(identifier, mnemonic)
        .then((success) => {
          isImporting.current = false;
          if (success) {
            setView("dashboard");
          } else {
            setWalletError("Failed to import wallet");
          }
        })
        .catch((err) => {
          isImporting.current = false;
          console.error("Failed to import wallet:", err);
          setWalletError(err instanceof Error ? err.message : "Failed to import wallet");
        });
    },
    [wallet],
  );

  function startWalletCreation(id: string) {
    setWalletError(null);
    wallet
      .createWallet(id)
      .then((mnemonic) => {
        isNewWallet.current = true;
        setPendingMnemonic(mnemonic);
        setView("mnemonic-backup");
      })
      .catch((err) => {
        console.error("Failed to create wallet:", err);
        setWalletError(err instanceof Error ? err.message : "Failed to create wallet");
        setView("login");
      });
  }

  const handleMnemonicConfirmed = useCallback(() => {
    setPendingMnemonic(null);
    setView("dashboard");

    // Auto-register a default lightning address for new wallets
    if (isNewWallet.current) {
      isNewWallet.current = false;
      const defaultUsername = `addy${crypto.randomUUID().slice(0, 6)}`;
      registerLightningAddress(defaultUsername).catch(() => {
        // Non-critical — user can set it manually from dashboard
      });
    }
  }, []);

  const handleMnemonicCancel = useCallback(async () => {
    if (walletIdentifier) {
      deleteMnemonic(walletIdentifier);
    }
    await wallet.disconnect();
    localStorage.removeItem("addy_skip_identifier");
    isNewWallet.current = false;
    setPendingMnemonic(null);
    setWalletIdentifier(null);
    setView("login");
  }, [wallet, walletIdentifier]);

  const handleDisconnect = useCallback(async () => {
    if (walletIdentifier) {
      deleteMnemonic(walletIdentifier);
    }
    await wallet.disconnect();
    nostr.disconnect();
    localStorage.removeItem("addy_skip_identifier");
    setWalletIdentifier(null);
    setView("login");
  }, [wallet, nostr, walletIdentifier]);

  const handleDeleteWallet = useCallback(async () => {
    try { await wallet.disconnect(); } catch {}
    try { nostr.disconnect(); } catch {}
    localStorage.clear();
    sessionStorage.clear();
    // Clear IndexedDB (Breez SDK stores wallet data there)
    try {
      const databases = await indexedDB.databases();
      for (const db of databases) {
        if (db.name) {
          indexedDB.deleteDatabase(db.name);
        }
      }
    } catch {}
    // Clear all caches
    try {
      const keys = await caches.keys();
      for (const key of keys) {
        await caches.delete(key);
      }
    } catch {}
    window.location.reload();
  }, [wallet, nostr]);

  // Render based on current view
  switch (view) {
    case "login":
      return (
        <LoginScreen
          onNostrConnected={handleNostrConnected}
          onSkip={handleSkip}
          onImportWallet={handleImportWallet}
          isConnecting={nostr.isConnecting}
          error={walletError || nostr.error}
          connect={nostr.connect}
          connectWithPrivateKey={nostr.connectWithPrivateKey}
          generateKeypair={nostr.generateKeypair}
        />
      );

    case "loading":
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface-base">
          <div className="text-center">
            <img src="/addy-logos/addy-logo-color.svg" alt="Addy" className="h-14 mx-auto mb-4" />
            <p className="text-gray-400 text-sm">Loading wallet...</p>
          </div>
        </div>
      );

    case "mnemonic-backup":
      return pendingMnemonic ? (
        <MnemonicBackup
          mnemonic={pendingMnemonic}
          onConfirmed={handleMnemonicConfirmed}
          onCancel={handleMnemonicCancel}
        />
      ) : null;

    case "dashboard":
      return (
        <WalletDashboard
          balance={wallet.balance}
          loading={wallet.loading}
          lightningAddress={wallet.lightningAddress}
          authMethod={nostr.authMethod}
          user={nostr.user}
          onSend={() => setView("send")}
          onReceive={() => setView("receive")}
          onTransactions={() => setView("transactions")}
          onBackup={() => setView("backup")}
          onDisconnect={handleDisconnect}
          onRefreshBalance={wallet.refreshBalance}
          onNostrConnected={handleNostrConnected}
          connect={nostr.connect}
          connectWithPrivateKey={nostr.connectWithPrivateKey}
          generateKeypair={nostr.generateKeypair}
          isConnecting={nostr.isConnecting}
        />
      );

    case "send":
      return (
        <SendPayment
          balance={wallet.balance}
          onBack={() => setView("dashboard")}
        />
      );

    case "receive":
      return <ReceivePayment onBack={() => setView("dashboard")} />;

    case "transactions":
      return <TransactionHistory onBack={() => setView("dashboard")} />;

    case "backup":
      return (
        <BackupRestore
          identifier={walletIdentifier || ""}
          authMethod={nostr.authMethod}
          onBack={() => setView("dashboard")}
          onDeleteWallet={handleDeleteWallet}
        />
      );

    default:
      return null;
  }
}

export default App;
