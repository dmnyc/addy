import { useState, useCallback, useEffect } from "react";
import type { NDKUser } from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";
import { decode } from "nostr-tools/nip19";
import {
  registerLightningAddress,
  deleteLightningAddress,
  checkLightningAddressAvailable,
} from "../wallet/spark";
import type { AuthMethod, GeneratedKeys } from "../types";
import { BoltIcon, KeyIcon, LockIcon } from "./icons/LoginIcons";

interface WalletDashboardProps {
  balance: number | null;
  loading: boolean;
  lightningAddress: string | null;
  authMethod: AuthMethod;
  user: NDKUser | null;
  onSend: () => void;
  onReceive: () => void;
  onTransactions: () => void;
  onBackup: () => void;
  onDisconnect: () => void;
  onRefreshBalance: (forceSync?: boolean) => Promise<void>;
  onNostrConnected: (pubkey: string) => void;
  connect: () => Promise<string>;
  connectWithPrivateKey: (privateKeyHex: string) => Promise<string>;
  generateKeypair: () => GeneratedKeys;
  isConnecting: boolean;
  seedBackedUp: boolean;
  restoredFromBackup: boolean;
  onDismissRestore: () => void;
}

type ConnectView = "none" | "options" | "nsec-login" | "create-keys";

export function WalletDashboard({
  balance,
  loading,
  lightningAddress,
  authMethod,
  user,
  onSend,
  onReceive,
  onTransactions,
  onBackup,
  onDisconnect,
  onRefreshBalance,
  onNostrConnected,
  connect,
  connectWithPrivateKey,
  generateKeypair,
  isConnecting,
  seedBackedUp,
  restoredFromBackup,
  onDismissRestore,
}: WalletDashboardProps) {
  const [addressCopied, setAddressCopied] = useState(false);
  const [npubCopied, setNpubCopied] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddressEditor, setShowAddressEditor] = useState(false);
  const [addressInput, setAddressInput] = useState("");
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [addressAvailable, setAddressAvailable] = useState<boolean | null>(null);
  const [connectView, setConnectView] = useState<ConnectView>("none");
  const [nsecInput, setNsecInput] = useState("");
  const [nsecError, setNsecError] = useState<string | null>(null);
  const [generatedKeys, setGeneratedKeys] = useState<GeneratedKeys | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copyAddress = useCallback(() => {
    if (!lightningAddress) return;
    navigator.clipboard.writeText(lightningAddress);
    setAddressCopied(true);
    setTimeout(() => setAddressCopied(false), 2000);
  }, [lightningAddress]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefreshBalance(true);
    } finally {
      setRefreshing(false);
    }
  }, [onRefreshBalance]);

  // Check availability as user types (debounced)
  useEffect(() => {
    if (!addressInput.trim()) {
      setAddressAvailable(null);
      return;
    }
    setAddressAvailable(null);
    const timer = setTimeout(async () => {
      try {
        const available = await checkLightningAddressAvailable(addressInput.trim());
        setAddressAvailable(available);
      } catch {
        setAddressAvailable(null);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [addressInput]);

  const handleRegisterAddress = useCallback(async () => {
    const username = addressInput.trim();
    if (!username) return;
    setAddressLoading(true);
    setAddressError(null);
    try {
      await registerLightningAddress(username);
      setShowAddressEditor(false);
      setAddressInput("");
    } catch (err) {
      setAddressError(err instanceof Error ? err.message : "Failed to register address");
    } finally {
      setAddressLoading(false);
    }
  }, [addressInput]);

  const handleDeleteAddress = useCallback(async () => {
    setAddressLoading(true);
    setAddressError(null);
    try {
      await deleteLightningAddress();
      setShowAddressEditor(false);
    } catch (err) {
      setAddressError(err instanceof Error ? err.message : "Failed to delete address");
    } finally {
      setAddressLoading(false);
    }
  }, []);

  const openAddressEditor = useCallback(() => {
    setShowAddressEditor(true);
    setAddressError(null);
    setAddressInput("");
    setAddressAvailable(null);
  }, []);

  const isNostrUser = authMethod === "nip07" || authMethod === "private-key";

  const profile = user?.profile;
  const displayName = profile?.displayName || profile?.name || null;
  const npub = user?.pubkey ? nip19.npubEncode(user.pubkey) : null;
  const avatarUrl = profile?.image || profile?.banner || null;

  const copyNpub = useCallback(() => {
    if (!npub) return;
    navigator.clipboard.writeText(npub);
    setNpubCopied(true);
    setTimeout(() => setNpubCopied(false), 2000);
  }, [npub]);

  const copyToClipboard = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const handleExtensionConnect = useCallback(async () => {
    try {
      const pubkey = await connect();
      onNostrConnected(pubkey);
      setConnectView("none");
    } catch {
      // Error displayed via parent
    }
  }, [connect, onNostrConnected]);

  const handleNsecLogin = useCallback(async () => {
    const trimmed = nsecInput.trim();
    if (!trimmed) return;
    setNsecError(null);

    if (trimmed.startsWith("npub1")) {
      setNsecError("That's a public key (npub). You need your private key (nsec).");
      return;
    }
    if (!trimmed.startsWith("nsec1")) {
      setNsecError("Invalid key format. Must start with nsec1...");
      return;
    }

    try {
      const { type, data } = decode(trimmed);
      if (type !== "nsec") {
        setNsecError("Invalid key format. Must be an nsec1... private key.");
        return;
      }
      const hexKey = Array.from(data as Uint8Array)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const pubkey = await connectWithPrivateKey(hexKey);
      onNostrConnected(pubkey);
      setConnectView("none");
      setNsecInput("");
    } catch {
      setNsecError("Invalid nsec key. Please check and try again.");
    }
  }, [nsecInput, connectWithPrivateKey, onNostrConnected]);

  const handleCreateAccount = useCallback(() => {
    const keys = generateKeypair();
    setGeneratedKeys(keys);
    setConnectView("create-keys");
  }, [generateKeypair]);

  const handleFinishCreate = useCallback(async () => {
    if (!generatedKeys) return;
    try {
      const pubkey = await connectWithPrivateKey(generatedKeys.secretKeyHex);
      onNostrConnected(pubkey);
      setConnectView("none");
      setGeneratedKeys(null);
      setBackupConfirmed(false);
    } catch {
      // Error handled by hook
    }
  }, [generatedKeys, connectWithPrivateKey, onNostrConnected]);

  const resetConnect = useCallback(() => {
    setConnectView("none");
    setNsecInput("");
    setNsecError(null);
    setGeneratedKeys(null);
    setShowPrivateKey(false);
    setBackupConfirmed(false);
  }, []);

  return (
    <div className="min-h-screen bg-surface-base p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 pt-4">
          <img src="/addy-logos/addy-logo-white.svg" alt="Addy" className="h-6" />
          {isNostrUser ? (
            <button
              className="text-gray-400 text-sm hover:text-brand-orange transition-colors"
              onClick={onDisconnect}
            >
              Disconnect
            </button>
          ) : (
            <button
              className="text-pastel-purple text-sm hover:text-brand-purple transition-colors"
              onClick={() => setConnectView(connectView === "none" ? "options" : "none")}
            >
              Connect to Nostr
            </button>
          )}
        </div>

        {/* Restored from backup toast */}
        {restoredFromBackup && (
          <div className="bg-brand-green/15 border border-brand-green/40 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
            <p className="text-pastel-green text-sm">Wallet restored from Nostr backup</p>
            <button
              className="text-pastel-green/60 hover:text-pastel-green text-xs ml-3 shrink-0"
              onClick={onDismissRestore}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Connect to Nostr Panel */}
        {!isNostrUser && connectView !== "none" && (
          <div className="bg-surface-card rounded-xl mb-6 border border-border-subtle p-4 space-y-3">
            {connectView === "options" && (
              <>
                <p className="text-gray-400 text-xs mb-2">Choose a Nostr login method</p>
                <button
                  className="w-full flex items-center gap-3 bg-surface-raised hover:bg-surface-input border border-border-subtle rounded-lg px-4 py-3 text-left transition-colors"
                  onClick={handleExtensionConnect}
                  disabled={isConnecting}
                >
                  <div className="w-8 h-8 rounded-full bg-brand-blue flex items-center justify-center shrink-0">
                    <BoltIcon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="text-white text-sm font-medium">
                      {isConnecting ? "Connecting..." : "Sign in with Extension"}
                    </div>
                    <div className="text-gray-500 text-xs">NIP-07 extension</div>
                  </div>
                </button>

                <button
                  className="w-full flex items-center gap-3 bg-surface-raised hover:bg-surface-input border border-border-subtle rounded-lg px-4 py-3 text-left transition-colors"
                  onClick={handleCreateAccount}
                  disabled={isConnecting}
                >
                  <div className="w-8 h-8 rounded-full bg-brand-green flex items-center justify-center shrink-0">
                    <KeyIcon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="text-white text-sm font-medium">Create Nostr Account</div>
                    <div className="text-gray-500 text-xs">Generate a new key pair</div>
                  </div>
                </button>

                <button
                  className="w-full flex items-center gap-3 bg-surface-raised hover:bg-surface-input border border-border-subtle rounded-lg px-4 py-3 text-left transition-colors"
                  onClick={() => setConnectView("nsec-login")}
                  disabled={isConnecting}
                >
                  <div className="w-8 h-8 rounded-full bg-brand-orange flex items-center justify-center shrink-0">
                    <LockIcon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="text-white text-sm font-medium">Sign in with nsec</div>
                    <div className="text-gray-500 text-xs">Paste an existing private key</div>
                  </div>
                </button>

                <button
                  className="w-full text-gray-500 text-xs hover:text-gray-300 transition-colors py-1"
                  onClick={resetConnect}
                >
                  Cancel
                </button>
              </>
            )}

            {connectView === "nsec-login" && (
              <>
                {nsecError && (
                  <div className="bg-brand-orange/10 border border-brand-orange/40 text-pastel-orange rounded-lg px-3 py-2 text-xs">
                    {nsecError}
                  </div>
                )}
                <input
                  type="password"
                  className="w-full bg-surface-input border border-border-subtle rounded-lg px-4 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-brand-purple"
                  placeholder="nsec1..."
                  value={nsecInput}
                  onChange={(e) => {
                    setNsecInput(e.target.value);
                    setNsecError(null);
                  }}
                  autoFocus
                />
                <p className="text-gray-500 text-xs">
                  Your key stays on this device and is never sent to any server
                </p>
                <div className="flex gap-2">
                  <button
                    className="flex-1 bg-surface-raised border border-border-subtle text-gray-300 rounded-lg px-3 py-2 text-sm hover:bg-surface-input transition-colors"
                    onClick={() => { setConnectView("options"); setNsecInput(""); setNsecError(null); }}
                  >
                    Back
                  </button>
                  <button
                    className="flex-1 bg-brand-purple text-white rounded-lg px-3 py-2 text-sm hover:bg-brand-purple/80 transition-colors disabled:opacity-50"
                    onClick={handleNsecLogin}
                    disabled={!nsecInput.trim() || isConnecting}
                  >
                    {isConnecting ? "Connecting..." : "Sign In"}
                  </button>
                </div>
              </>
            )}

            {connectView === "create-keys" && generatedKeys && (
              <>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-gray-400 text-xs">Private Key</span>
                    <button
                      className="text-pastel-purple text-xs hover:text-brand-purple"
                      onClick={() => setShowPrivateKey(!showPrivateKey)}
                    >
                      {showPrivateKey ? "Hide" : "Show"}
                    </button>
                  </div>
                  <div className="bg-surface-input border border-border-subtle rounded-lg px-3 py-2 text-xs font-mono break-all flex items-start gap-2">
                    <span className={`flex-1 ${showPrivateKey ? "text-white" : "text-gray-600"}`}>
                      {showPrivateKey
                        ? generatedKeys.nsec
                        : "••••••••••••••••••••••••••••••••••••••••"}
                    </span>
                    <button
                      className="text-pastel-blue text-xs shrink-0 hover:text-brand-blue"
                      onClick={() => copyToClipboard(generatedKeys.nsec, "nsec")}
                    >
                      {copied === "nsec" ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
                <div>
                  <span className="text-gray-400 text-xs mb-1 block">Public Key</span>
                  <div className="bg-surface-input border border-border-subtle rounded-lg px-3 py-2 text-xs font-mono break-all text-white flex items-start gap-2">
                    <span className="flex-1">{generatedKeys.npub}</span>
                    <button
                      className="text-pastel-blue text-xs shrink-0 hover:text-brand-blue"
                      onClick={() => copyToClipboard(generatedKeys.npub, "npub")}
                    >
                      {copied === "npub" ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
                <div className="bg-brand-orange/10 border border-brand-orange/30 rounded-lg px-3 py-2">
                  <p className="text-pastel-orange text-xs">
                    Write down your private key (nsec) and store it safely.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={backupConfirmed}
                    onChange={(e) => setBackupConfirmed(e.target.checked)}
                    className="rounded border-gray-600 accent-brand-purple"
                  />
                  <span className="text-gray-300 text-xs">I saved my keys securely</span>
                </label>
                <div className="flex gap-2">
                  <button
                    className="flex-1 bg-surface-raised border border-border-subtle text-gray-300 rounded-lg px-3 py-2 text-sm hover:bg-surface-input transition-colors"
                    onClick={resetConnect}
                  >
                    Cancel
                  </button>
                  <button
                    className="flex-1 bg-brand-orange text-white rounded-lg px-3 py-2 text-sm hover:bg-brand-orange/80 transition-colors disabled:opacity-50"
                    onClick={handleFinishCreate}
                    disabled={!backupConfirmed || isConnecting}
                  >
                    {isConnecting ? "Connecting..." : "Continue"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Nostr Profile */}
        {isNostrUser && npub && (
          <div className="bg-surface-card rounded-xl mb-6 border border-border-subtle overflow-hidden">
            <button
              className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-surface-raised transition-colors"
              onClick={() => setShowProfile(!showProfile)}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="w-9 h-9 rounded-full object-cover shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-brand-purple/30 flex items-center justify-center shrink-0">
                  <span className="text-pastel-purple text-sm font-bold">
                    {(displayName || "N")[0].toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                {displayName && (
                  <p className="text-white text-sm font-medium truncate">{displayName}</p>
                )}
                <p className="text-gray-500 text-xs font-mono truncate">
                  {npub.slice(0, 12)}...{npub.slice(-6)}
                </p>
              </div>
              <span className="text-gray-500 text-xs shrink-0">{showProfile ? "▲" : "▼"}</span>
            </button>
            {showProfile && (
              <div className="border-t border-border-subtle px-4 py-3 space-y-2">
                <div>
                  <p className="text-gray-500 text-xs mb-1">npub</p>
                  <div className="flex items-start gap-2">
                    <p className="text-gray-300 text-xs font-mono break-all flex-1">{npub}</p>
                    <button
                      className="text-pastel-blue text-xs shrink-0 hover:text-brand-blue"
                      onClick={copyNpub}
                    >
                      {npubCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
                {profile?.nip05 && (
                  <div>
                    <p className="text-gray-500 text-xs mb-0.5">NIP-05</p>
                    <p className="text-gray-300 text-xs">{profile.nip05}</p>
                  </div>
                )}
                {profile?.about && (
                  <div>
                    <p className="text-gray-500 text-xs mb-0.5">About</p>
                    <p className="text-gray-300 text-xs line-clamp-3">{profile.about}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Balance */}
        <div className="bg-surface-card rounded-2xl p-8 mb-6 text-center border border-border-subtle">
          <p className="text-pastel-blue text-sm mb-2">Balance</p>
          <div className="flex items-center justify-center gap-2">
            <p className="text-4xl font-bold text-white">
              {loading ? "..." : balance !== null ? balance.toLocaleString() : "0"}
            </p>
            <span className="text-pastel-orange text-lg">sats</span>
          </div>
          <button
            className="mt-3 text-gray-500 text-xs hover:text-pastel-blue transition-colors flex items-center gap-1.5 mx-auto"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing && (
              <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
            )}
            {refreshing ? "Syncing" : "Refresh"}
          </button>
        </div>

        {/* Lightning Address */}
        <div className="bg-surface-card rounded-xl mb-6 border border-border-subtle overflow-hidden">
          {lightningAddress && !showAddressEditor && (
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="cursor-pointer flex-1 min-w-0" onClick={copyAddress}>
                <p className="text-gray-400 text-xs mb-0.5">Lightning Address</p>
                <p className="text-white text-sm font-mono truncate">{lightningAddress}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-3">
                <button
                  className="text-pastel-blue text-xs hover:text-brand-blue"
                  onClick={copyAddress}
                >
                  {addressCopied ? "Copied!" : "Copy"}
                </button>
                <button
                  className="text-gray-500 text-xs hover:text-gray-300"
                  onClick={openAddressEditor}
                >
                  Change
                </button>
              </div>
            </div>
          )}
          {!lightningAddress && !showAddressEditor && (
            <button
              className="w-full px-4 py-3 text-left hover:bg-surface-raised transition-colors"
              onClick={openAddressEditor}
            >
              <p className="text-gray-400 text-xs mb-0.5">Lightning Address</p>
              <p className="text-pastel-blue text-sm">Set a lightning address</p>
            </button>
          )}
          {showAddressEditor && (
            <div className="px-4 py-4 space-y-3">
              <p className="text-gray-400 text-xs">
                {lightningAddress ? "Change lightning address" : "Choose a username"}
              </p>
              {addressError && (
                <p className="text-pastel-orange text-xs">{addressError}</p>
              )}
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center bg-surface-input border border-border-subtle rounded-lg overflow-hidden focus-within:border-brand-purple">
                  <input
                    type="text"
                    className="flex-1 bg-transparent px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none"
                    placeholder="username"
                    value={addressInput}
                    onChange={(e) => setAddressInput(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                    autoFocus
                  />
                  <span className="text-gray-500 text-sm pr-3">@breez.tips</span>
                </div>
              </div>
              {addressInput.trim() && addressAvailable !== null && (
                <p className={`text-xs ${addressAvailable ? "text-pastel-green" : "text-pastel-orange"}`}>
                  {addressAvailable ? "Available" : "Already taken"}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  className="flex-1 bg-surface-raised border border-border-subtle text-gray-300 rounded-lg px-3 py-2 text-sm hover:bg-surface-input transition-colors"
                  onClick={() => setShowAddressEditor(false)}
                >
                  Cancel
                </button>
                {lightningAddress && (
                  <button
                    className="bg-surface-raised border border-brand-orange/40 text-pastel-orange rounded-lg px-3 py-2 text-sm hover:bg-brand-orange/10 transition-colors disabled:opacity-50"
                    onClick={handleDeleteAddress}
                    disabled={addressLoading}
                  >
                    Delete
                  </button>
                )}
                <button
                  className="flex-1 bg-brand-purple text-white rounded-lg px-3 py-2 text-sm hover:bg-brand-purple/80 transition-colors disabled:opacity-50"
                  onClick={handleRegisterAddress}
                  disabled={!addressInput.trim() || addressLoading || addressAvailable === false}
                >
                  {addressLoading ? "Saving..." : "Register"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            className="bg-brand-orange hover:bg-brand-orange/80 text-white rounded-xl px-4 py-4 font-medium transition-colors"
            onClick={onSend}
          >
            Send
          </button>
          <button
            className="bg-brand-green hover:bg-brand-green/80 text-white rounded-xl px-4 py-4 font-medium transition-colors"
            onClick={onReceive}
          >
            Receive
          </button>
        </div>

        {/* Menu */}
        <div className="space-y-2">
          <button
            className="w-full bg-surface-card hover:bg-surface-raised border border-border-subtle rounded-xl px-5 py-4 text-left text-white transition-colors"
            onClick={onTransactions}
          >
            Transaction History
          </button>

          <button
            className="w-full bg-surface-card hover:bg-surface-raised border border-border-subtle rounded-xl px-5 py-4 text-left text-white transition-colors flex items-center justify-between"
            onClick={onBackup}
          >
            <span>Backup &amp; Recovery</span>
            {!seedBackedUp && <span title="Seed phrase not backed up">⚠️</span>}
          </button>

          {!isNostrUser && (
            <p className="text-gray-500 text-xs text-center pt-2">
              Connect to Nostr to enable cloud backup
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
