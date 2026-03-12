import { useState, useCallback, useEffect } from "react";
import { nip19 } from "nostr-tools";
import { hexToBytes } from "@noble/hashes/utils";
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
  onConnectNostr?: () => void;
}

type SubView = "main" | "show-mnemonic" | "import-phrase" | "nostr-backups";

export function BackupRestore({
  identifier,
  authMethod,
  onBack,
  onDeleteWallet,
  onConnectNostr,
}: BackupRestoreProps) {
  const [subView, setSubView] = useState<SubView>("main");
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [importPhrase, setImportPhrase] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteBackupConfirm, setShowDeleteBackupConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [backups, setBackups] = useState<SparkBackupEntry[]>([]);
  const [relayStatus, setRelayStatus] = useState<Map<string, boolean> | null>(null);
  const [relayStatusOpen, setRelayStatusOpen] = useState(false);
  const [checkingRelays, setCheckingRelays] = useState(false);

  const [showNsec, setShowNsec] = useState(false);
  const [nsecCopied, setNsecCopied] = useState(false);
  const [nsecSeen, setNsecSeen] = useState(localStorage.getItem("addy_nsec_seen") === "true");
  const [backupConfirmed, setBackupConfirmed] = useState(false);

  const isNostrUser = authMethod === "nip07" || authMethod === "private-key";
  const isPrivateKeyUser = authMethod === "private-key";

  // Auto-check relay status on mount for Nostr users
  useEffect(() => {
    if (!isNostrUser) return;
    const user = getCurrentUser();
    if (!user?.pubkey) return;
    checkBackupRelays(user.pubkey).then((status) => {
      setRelayStatus(status);
    }).catch(() => {});
  }, [isNostrUser]);
  const apiKey = import.meta.env.VITE_BREEZ_SPARK_API_KEY || "";

  const storedPrivateKey = isPrivateKeyUser
    ? localStorage.getItem("addy_private_key")
    : null;
  const nsecKey = storedPrivateKey
    ? nip19.nsecEncode(hexToBytes(storedPrivateKey))
    : null;

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

  const handleBackupToNostr = useCallback(async () => {
    if (!isNostrUser) return;
    setLoading(true);
    setError(null);
    try {
      const user = getCurrentUser();
      if (!user?.pubkey) throw new Error("Not logged in");
      await backupSparkToNostr(user.pubkey);
      localStorage.setItem("addy_seed_backed_up", "true");
      localStorage.setItem("addy_nostr_backed_up", "true");
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
      localStorage.removeItem("addy_nostr_backed_up");
      setSuccess("Backup deleted from Nostr");
      setTimeout(() => setSuccess(null), 3000);
      // Refresh relay status after delete
      checkBackupRelays(user.pubkey).then((status) => {
        setRelayStatus(status);
      }).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setLoading(false);
    }
  }, [isNostrUser]);

  return (
    <div className="min-h-screen bg-surface-base p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6 pt-4">
          <img src="/addy-logos/addy-logo-white.svg" alt="Addy" className="h-6 cursor-pointer" onClick={onBack} />
          <button
            className="text-gray-400 text-sm hover:text-white transition-colors"
            onClick={subView === "main" ? onBack : () => setSubView("main")}
          >
            &larr; Back
          </button>
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
              className="w-full bg-surface-card hover:bg-surface-raised border border-border-subtle rounded-xl px-5 py-4 text-left text-white transition-colors flex items-center justify-between"
              onClick={handleShowMnemonic}
            >
              <span>Show Recovery Phrase</span>
              {localStorage.getItem("addy_seed_backed_up") !== "true" && <span title="Seed phrase not backed up">⚠️</span>}
            </button>

            {isPrivateKeyUser && nsecKey && (
              <div className="bg-surface-card border border-border-subtle rounded-xl overflow-hidden">
                <button
                  className="w-full px-5 py-4 text-left text-white hover:bg-surface-raised transition-colors flex items-center justify-between"
                  onClick={() => {
                    if (!showNsec) {
                      localStorage.setItem("addy_nsec_seen", "true");
                      setNsecSeen(true);
                    }
                    setShowNsec(!showNsec);
                  }}
                >
                  <span>Show Nostr Private Key (nsec)</span>
                  {!nsecSeen && <span title="Nsec not yet viewed">⚠️</span>}
                </button>
                {showNsec && (
                  <div className="border-t border-border-subtle px-5 py-4 space-y-3">
                    <div className="bg-brand-orange/10 border border-brand-orange/30 rounded-lg px-3 py-2">
                      <p className="text-pastel-orange text-xs">
                        Never share your nsec with anyone. It gives full access to your Nostr identity.
                      </p>
                    </div>
                    <div className="bg-surface-input rounded-lg px-3 py-2 break-all">
                      <code className="text-white text-xs font-mono">{nsecKey}</code>
                    </div>
                    <button
                      className="text-pastel-blue text-sm hover:text-brand-blue transition-colors"
                      onClick={() => {
                        navigator.clipboard.writeText(nsecKey);
                        setNsecCopied(true);
                        setTimeout(() => {
                          setNsecCopied(false);
                          setShowNsec(false);
                        }, 1500);
                      }}
                    >
                      {nsecCopied ? "Copied!" : "Copy to clipboard"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {!isNostrUser && (
              <div className="bg-surface-card border border-border-subtle rounded-xl px-5 py-4">
                <p className="text-gray-400 text-sm mb-3">
                  Connect to Nostr to back up your wallet to relays and restore it on any device.
                </p>
                <button
                  className="w-full bg-brand-purple text-white rounded-lg px-4 py-3 hover:bg-brand-purple/80 transition-colors font-medium text-sm"
                  onClick={onConnectNostr || onBack}
                >
                  Connect to Nostr
                </button>
              </div>
            )}

            {isNostrUser && (
              <>
                <button
                  className="w-full bg-surface-card hover:bg-surface-raised border border-border-subtle rounded-xl px-5 py-4 text-left text-white transition-colors disabled:opacity-50 flex items-center justify-between"
                  onClick={handleBackupToNostr}
                  disabled={loading}
                >
                  <span>{loading ? "Backing up..." : "Backup to Nostr"}</span>
                  {localStorage.getItem("addy_nostr_backed_up") !== "true" && <span title="Not backed up to relays">⚠️</span>}
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
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${!relayStatus ? "bg-gray-600" : Array.from(relayStatus.values()).every(v => v) ? "bg-brand-green" : Array.from(relayStatus.values()).some(v => v) ? "bg-yellow-500" : "bg-gray-600"}`} />
                  </button>
                  {relayStatusOpen && relayStatus && (
                    <div className="border-t border-border-subtle px-5 py-3 space-y-2">
                      {Array.from(relayStatus.entries()).map(([url, hasBackup]) => (
                        <div key={url} className="flex items-center gap-2 text-sm">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${hasBackup ? "bg-brand-green" : "bg-gray-600"}`} />
                          <span className="text-gray-400 truncate">
                            {url.replace("wss://", "")}
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

              </>
            )}

            {/* Danger Zone */}
            <div className="pt-4 border-t border-red-900/30 mt-6 space-y-2">
              <p className="text-red-400/60 text-xs font-medium mb-2">Danger Zone</p>

              {isNostrUser && (
                !showDeleteBackupConfirm ? (
                  <button
                    className="w-full bg-surface-card hover:bg-red-950/30 border border-red-900/30 rounded-xl px-5 py-4 text-left text-red-400 transition-colors disabled:opacity-50"
                    onClick={() => setShowDeleteBackupConfirm(true)}
                    disabled={loading}
                  >
                    Delete Nostr Backup
                  </button>
                ) : (
                  <div className="bg-red-950/20 border border-red-900/40 rounded-xl px-5 py-4 space-y-3">
                    <p className="text-red-400 text-sm font-medium">Delete relay backup?</p>
                    <p className="text-red-400/70 text-xs">
                      This will remove your wallet backup from Nostr relays. You won't be able to restore from relays until you back up again.
                    </p>
                    <div className="flex gap-2">
                      <button
                        className="flex-1 bg-surface-raised border border-border-subtle text-gray-300 rounded-lg px-3 py-2 text-sm hover:bg-surface-input transition-colors"
                        onClick={() => setShowDeleteBackupConfirm(false)}
                      >
                        Cancel
                      </button>
                      <button
                        className="flex-1 bg-red-600 text-white rounded-lg px-3 py-2 text-sm hover:bg-red-700 transition-colors disabled:opacity-50"
                        onClick={() => { handleDeleteBackup(); setShowDeleteBackupConfirm(false); }}
                        disabled={loading}
                      >
                        Delete Backup
                      </button>
                    </div>
                  </div>
                )
              )}

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

            <div className="pt-6 text-center space-y-1">
              <p className="text-gray-500 text-xs">Built with Breez SDK Spark</p>
              <p className="text-gray-600 text-xs">
                v{__APP_VERSION__} ({__BUILD_HASH__})
              </p>
              <a
                href="https://github.com/dmnyc/addy/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 text-xs hover:text-gray-400 transition-colors"
              >
                Report a bug
              </a>
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
              <>
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
                <div className="bg-brand-orange/10 border border-brand-orange/30 rounded-lg px-4 py-3">
                  <p className="text-pastel-orange text-xs">
                    Do not screenshot or share with anyone. Anyone with these words can access your wallet funds.
                  </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={backupConfirmed}
                    onChange={(e) => setBackupConfirmed(e.target.checked)}
                    className="accent-brand-purple"
                  />
                  <span className="text-gray-300 text-sm">I have saved my recovery phrase</span>
                </label>
                <button
                  className="w-full bg-brand-purple text-white rounded-lg px-4 py-3 hover:bg-brand-purple/80 transition-colors disabled:opacity-50 font-medium"
                  disabled={!backupConfirmed}
                  onClick={() => {
                    localStorage.setItem("addy_seed_backed_up", "true");
                    setSubView("main");
                    setShowMnemonic(false);
                    setBackupConfirmed(false);
                  }}
                >
                  Done
                </button>
              </>
            ) : (
              <button
                className="w-full bg-surface-raised border border-border-subtle rounded-lg px-4 py-8 text-gray-400 hover:text-white transition-colors"
                onClick={() => setShowMnemonic(true)}
              >
                Tap to reveal recovery phrase
              </button>
            )}

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
