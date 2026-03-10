import { useState, useCallback } from "react";
import { loadMnemonic } from "../wallet/storage";
import {
  backupSparkToNostr,
  listSparkBackups,
  restoreSparkBackup,
  deleteSparkBackupFromNostr,
  checkBackupRelays,
} from "../wallet/backup";
import { importAndConnectWallet } from "../wallet/spark";
import { getCurrentUser } from "../nostr/client";
import type { AuthMethod, SparkBackupEntry } from "../types";

interface BackupRestoreProps {
  identifier: string;
  authMethod: AuthMethod;
  onBack: () => void;
  onDeleteWallet: () => void;
}

type SubView = "main" | "show-mnemonic" | "import-phrase" | "nostr-backups";

export function BackupRestore({
  identifier,
  authMethod,
  onBack,
  onDeleteWallet,
}: BackupRestoreProps) {
  const [subView, setSubView] = useState<SubView>("main");
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [importPhrase, setImportPhrase] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [backups, setBackups] = useState<SparkBackupEntry[]>([]);
  const [relayStatus, setRelayStatus] = useState<Map<string, boolean> | null>(null);
  const [relayStatusOpen, setRelayStatusOpen] = useState(false);
  const [checkingRelays, setCheckingRelays] = useState(false);

  const isNostrUser = authMethod === "nip07" || authMethod === "private-key";
  const apiKey = import.meta.env.VITE_BREEZ_SPARK_API_KEY || "";

  const handleShowMnemonic = useCallback(async () => {
    setError(null);
    try {
      const loaded = await loadMnemonic(identifier);
      if (!loaded) {
        setError("Could not load mnemonic from storage");
        return;
      }
      setMnemonic(loaded);
      setSubView("show-mnemonic");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load mnemonic");
    }
  }, [identifier]);

  const handleDownloadBackup = useCallback(async () => {
    const loaded = mnemonic || (await loadMnemonic(identifier));
    if (!loaded) {
      setError("Could not load mnemonic");
      return;
    }

    const date = new Date().toISOString().split("T")[0];
    const words = loaded.split(" ");
    const content = `Addy - Wallet Recovery Phrase
Generated: ${new Date().toLocaleString()}

Recovery Phrase (${words.length} words):
${words.map((w, i) => `${i + 1}. ${w}`).join("\n")}

WARNING: Never share these words with anyone.
Anyone with this phrase can access your wallet funds.`;

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `addy-wallet-backup-${date}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setSuccess("Backup file downloaded");
    setTimeout(() => setSuccess(null), 3000);
  }, [identifier, mnemonic]);

  const handleBackupToNostr = useCallback(async () => {
    if (!isNostrUser) return;
    setLoading(true);
    setError(null);
    try {
      const user = getCurrentUser();
      if (!user?.pubkey) throw new Error("Not logged in");
      await backupSparkToNostr(user.pubkey);
      setSuccess("Wallet backed up to Nostr relays");
      setTimeout(() => setSuccess(null), 3000);
      // Refresh relay status after backup
      checkBackupRelays(user.pubkey).then((status) => {
        setRelayStatus(status);
        setRelayStatusOpen(true);
      }).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backup failed");
    } finally {
      setLoading(false);
    }
  }, [isNostrUser]);

  const handleListBackups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const user = getCurrentUser();
      if (!user?.pubkey) throw new Error("Not logged in");
      const found = await listSparkBackups(user.pubkey);
      setBackups(found);
      setSubView("nostr-backups");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch backups");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRestoreBackup = useCallback(
    async (backup: SparkBackupEntry) => {
      setLoading(true);
      setError(null);
      try {
        const user = getCurrentUser();
        if (!user?.pubkey) throw new Error("Not logged in");
        const restored = await restoreSparkBackup(user.pubkey, backup);
        await importAndConnectWallet(identifier, restored, apiKey);
        setSuccess("Wallet restored successfully!");
        setTimeout(() => {
          setSuccess(null);
          onBack();
        }, 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Restore failed");
      } finally {
        setLoading(false);
      }
    },
    [identifier, apiKey, onBack],
  );

  const handleImportPhrase = useCallback(async () => {
    const trimmed = importPhrase.trim().toLowerCase();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      await importAndConnectWallet(identifier, trimmed, apiKey);
      setSuccess("Wallet imported successfully!");
      setTimeout(() => {
        setSuccess(null);
        onBack();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }, [importPhrase, identifier, apiKey, onBack]);

  const handleCheckRelays = useCallback(async () => {
    setCheckingRelays(true);
    setError(null);
    try {
      const user = getCurrentUser();
      if (!user?.pubkey) throw new Error("Not logged in");
      const status = await checkBackupRelays(user.pubkey);
      setRelayStatus(status);
      setRelayStatusOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check relays");
    } finally {
      setCheckingRelays(false);
    }
  }, []);

  const handleDeleteBackup = useCallback(async () => {
    if (!isNostrUser) return;
    setLoading(true);
    setError(null);
    try {
      const user = getCurrentUser();
      if (!user?.pubkey) throw new Error("Not logged in");
      await deleteSparkBackupFromNostr(user.pubkey);
      setSuccess("Backup deleted from Nostr");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setLoading(false);
    }
  }, [isNostrUser]);

  return (
    <div className="min-h-screen bg-surface-base p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-6 pt-4">
          <button
            className="text-gray-400 hover:text-white transition-colors"
            onClick={subView === "main" ? onBack : () => setSubView("main")}
          >
            &larr; Back
          </button>
          <h2 className="text-xl font-bold text-white">Backup &amp; Recovery</h2>
        </div>

        {error && (
          <div className="bg-brand-orange/10 border border-brand-orange/40 text-pastel-orange rounded-lg px-4 py-3 mb-4 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-brand-green/15 border border-brand-green/40 text-pastel-green rounded-lg px-4 py-3 mb-4 text-sm">
            {success}
          </div>
        )}

        {/* Main menu */}
        {subView === "main" && (
          <div className="space-y-2">
            <button
              className="w-full bg-surface-card hover:bg-surface-raised border border-border-subtle rounded-xl px-5 py-4 text-left text-white transition-colors"
              onClick={handleShowMnemonic}
            >
              Show Recovery Phrase
            </button>

            <button
              className="w-full bg-surface-card hover:bg-surface-raised border border-border-subtle rounded-xl px-5 py-4 text-left text-white transition-colors"
              onClick={handleDownloadBackup}
            >
              Download Backup File
            </button>

            {isNostrUser && (
              <>
                <button
                  className="w-full bg-surface-card hover:bg-surface-raised border border-border-subtle rounded-xl px-5 py-4 text-left text-white transition-colors disabled:opacity-50"
                  onClick={handleBackupToNostr}
                  disabled={loading}
                >
                  {loading ? "Backing up..." : "Backup to Nostr"}
                </button>

                <div className="bg-surface-card border border-border-subtle rounded-xl overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-5 py-4 text-left text-gray-300 hover:text-white transition-colors disabled:opacity-50"
                    onClick={() => {
                      if (!relayStatusOpen && !relayStatus) {
                        handleCheckRelays();
                      } else {
                        setRelayStatusOpen(!relayStatusOpen);
                      }
                    }}
                    disabled={checkingRelays}
                  >
                    <span>{checkingRelays ? "Checking relays..." : "Relay Backup Status"}</span>
                    <span className="text-gray-500 text-sm">{relayStatusOpen ? "▲" : "▼"}</span>
                  </button>
                  {relayStatusOpen && relayStatus && (
                    <div className="border-t border-border-subtle px-5 py-3 space-y-2">
                      {Array.from(relayStatus.entries()).map(([url, hasBackup]) => (
                        <div key={url} className="flex items-center justify-between text-sm">
                          <span className="text-gray-400 truncate mr-3">
                            {url.replace("wss://", "")}
                          </span>
                          <span className={hasBackup ? "text-pastel-green" : "text-gray-600"}>
                            {hasBackup ? "backed up" : "no backup"}
                          </span>
                        </div>
                      ))}
                      <button
                        className="text-pastel-blue text-xs hover:text-brand-blue mt-1"
                        onClick={handleCheckRelays}
                        disabled={checkingRelays}
                      >
                        {checkingRelays ? "Checking..." : "Refresh"}
                      </button>
                    </div>
                  )}
                </div>

                <button
                  className="w-full bg-surface-card hover:bg-surface-raised border border-border-subtle rounded-xl px-5 py-4 text-left text-white transition-colors disabled:opacity-50"
                  onClick={handleListBackups}
                  disabled={loading}
                >
                  Restore from Nostr
                </button>

                <button
                  className="w-full bg-surface-card hover:bg-surface-raised border border-border-subtle rounded-xl px-5 py-4 text-left text-brand-orange transition-colors disabled:opacity-50"
                  onClick={handleDeleteBackup}
                  disabled={loading}
                >
                  Delete Nostr Backup
                </button>
              </>
            )}

            <div className="pt-2 border-t border-border-subtle mt-4">
              <button
                className="w-full bg-surface-card hover:bg-surface-raised border border-border-subtle rounded-xl px-5 py-4 text-left text-white transition-colors"
                onClick={() => setSubView("import-phrase")}
              >
                Import Recovery Phrase
              </button>
            </div>

            {/* Danger Zone */}
            <div className="pt-4 border-t border-red-900/30 mt-6">
              <p className="text-red-400/60 text-xs font-medium mb-2">Danger Zone</p>
              {!showDeleteConfirm ? (
                <button
                  className="w-full bg-surface-card hover:bg-red-950/30 border border-red-900/30 rounded-xl px-5 py-4 text-left text-red-400 transition-colors"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  Delete Wallet &amp; Reset App
                </button>
              ) : (
                <div className="bg-red-950/20 border border-red-900/40 rounded-xl px-5 py-4 space-y-3">
                  <p className="text-red-400 text-sm font-medium">Are you sure?</p>
                  <p className="text-red-400/70 text-xs">
                    This will permanently delete your wallet data from this device. If you haven't backed up your recovery phrase, your funds will be lost forever.
                  </p>
                  <div className="flex gap-2">
                    <button
                      className="flex-1 bg-surface-raised border border-border-subtle text-gray-300 rounded-lg px-3 py-2 text-sm hover:bg-surface-input transition-colors"
                      onClick={() => setShowDeleteConfirm(false)}
                    >
                      Cancel
                    </button>
                    <button
                      className="flex-1 bg-red-600 text-white rounded-lg px-3 py-2 text-sm hover:bg-red-700 transition-colors"
                      onClick={onDeleteWallet}
                    >
                      Delete Everything
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Show Mnemonic */}
        {subView === "show-mnemonic" && mnemonic && (
          <div className="space-y-4">
            <div className="bg-brand-orange/10 border border-brand-orange/30 rounded-lg px-4 py-3">
              <p className="text-pastel-orange text-xs">
                Do not share these words with anyone.
              </p>
            </div>

            {showMnemonic ? (
              <div className="grid grid-cols-3 gap-2">
                {mnemonic.split(" ").map((word, i) => (
                  <div
                    key={i}
                    className="bg-surface-raised border border-border-subtle rounded-lg px-3 py-2 text-center"
                  >
                    <span className="text-pastel-purple text-xs mr-1">{i + 1}.</span>
                    <span className="text-white text-sm font-mono">{word}</span>
                  </div>
                ))}
              </div>
            ) : (
              <button
                className="w-full bg-surface-raised border border-border-subtle rounded-lg px-4 py-8 text-gray-400 hover:text-white transition-colors"
                onClick={() => setShowMnemonic(true)}
              >
                Tap to reveal recovery phrase
              </button>
            )}

            <button
              className="w-full bg-surface-raised border border-border-subtle text-gray-300 rounded-lg px-4 py-3 hover:bg-surface-input transition-colors"
              onClick={handleDownloadBackup}
            >
              Download Backup File
            </button>
          </div>
        )}

        {/* Import Phrase */}
        {subView === "import-phrase" && (
          <div className="space-y-4">
            <div>
              <label className="text-gray-400 text-sm mb-1 block">
                Enter your 12-word recovery phrase
              </label>
              <textarea
                className="w-full bg-surface-input border border-border-subtle rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-purple resize-none"
                placeholder="word1 word2 word3 ..."
                rows={3}
                value={importPhrase}
                onChange={(e) => setImportPhrase(e.target.value)}
              />
              <p className="text-gray-500 text-xs mt-1">
                Separate each word with a space
              </p>
            </div>

            <button
              className="w-full bg-brand-purple text-white rounded-lg px-4 py-3 hover:bg-brand-purple/80 transition-colors disabled:opacity-50 font-medium"
              onClick={handleImportPhrase}
              disabled={!importPhrase.trim() || loading}
            >
              {loading ? "Importing..." : "Import Wallet"}
            </button>
          </div>
        )}

        {/* Nostr Backups List */}
        {subView === "nostr-backups" && (
          <div className="space-y-2">
            {backups.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400">No backups found on Nostr relays</p>
              </div>
            ) : (
              backups.map((backup) => (
                <button
                  key={backup.id}
                  className="w-full bg-surface-card hover:bg-surface-raised border border-border-subtle rounded-xl px-5 py-4 text-left transition-colors disabled:opacity-50"
                  onClick={() => handleRestoreBackup(backup)}
                  disabled={loading}
                >
                  <div className="text-white text-sm font-medium">
                    Wallet {backup.walletId ? backup.walletId.slice(0, 8) + "..." : "(legacy)"}
                  </div>
                  <div className="text-gray-400 text-xs mt-1">
                    {new Date(backup.createdAt * 1000).toLocaleDateString()} &middot;{" "}
                    {backup.encryptionMethod.toUpperCase()}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
