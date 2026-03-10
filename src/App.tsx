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
import { clearAllWallets, deleteMnemonic } from "./wallet/storage";
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

  const handleNostrConnected = useCallback((pubkey: string) => {
    setWalletIdentifier(pubkey);

    // Check if wallet already exists
    if (wallet.hasWallet(pubkey)) {
      wallet.loadWallet(pubkey).then((loaded) => {
        if (loaded) {
          setView("dashboard");
        } else {
          // Wallet exists but failed to load — create new
          startWalletCreation(pubkey);
        }
      }).catch(() => {
        startWalletCreation(pubkey);
      });
    } else {
      startWalletCreation(pubkey);
    }
  }, [wallet]);

  const handleSkip = useCallback(
    (identifier: string) => {
      setWalletIdentifier(identifier);
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

  const handleMnemonicCancel = useCallback(() => {
    setPendingMnemonic(null);
    setView("login");
  }, []);

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
    await wallet.disconnect();
    nostr.disconnect();
    clearAllWallets();
    localStorage.removeItem("addy_skip_identifier");
    setWalletIdentifier(null);
    setWalletError(null);
    setView("login");
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
