import { useState, useCallback } from "react";
import { decode } from "nostr-tools/nip19";
import type { GeneratedKeys } from "../types";
import { BoltIcon, KeyIcon, LockIcon, ArrowRightIcon } from "./icons/LoginIcons";

interface LoginScreenProps {
  onNostrConnected: (pubkey: string) => void;
  onSkip: (identifier: string) => void;
  onImportWallet: (mnemonic: string) => void;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<string>;
  connectWithPrivateKey: (privateKeyHex: string) => Promise<string>;
  generateKeypair: () => GeneratedKeys;
}

type LoginView =
  | "main"
  | "nsec-login"
  | "create-keys"
  | "create-profile"
  | "import-phrase";

export function LoginScreen({
  onNostrConnected,
  onSkip,
  onImportWallet,
  isConnecting,
  error,
  connect,
  connectWithPrivateKey,
  generateKeypair,
}: LoginScreenProps) {
  const [view, setView] = useState<LoginView>("main");
  const [generatedKeys, setGeneratedKeys] = useState<GeneratedKeys | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [nsecInput, setNsecInput] = useState("");
  const [nsecError, setNsecError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [importPhrase, setImportPhrase] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const handleExtensionConnect = async () => {
    try {
      const pubkey = await connect();
      onNostrConnected(pubkey);
    } catch {
      // Error displayed via error prop
    }
  };

  const handleCreateAccount = useCallback(() => {
    const keys = generateKeypair();
    setGeneratedKeys(keys);
    setView("create-keys");
  }, [generateKeypair]);

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
    } catch {
      setNsecError("Invalid nsec key. Please check and try again.");
    }
  }, [nsecInput, connectWithPrivateKey, onNostrConnected]);

  const handleImportPhrase = useCallback(() => {
    const trimmed = importPhrase.trim().toLowerCase();
    if (!trimmed) return;
    setImportError(null);

    const words = trimmed.split(/\s+/);
    const validWordCounts = [12, 15, 18, 21, 24];
    if (!validWordCounts.includes(words.length)) {
      setImportError(`Expected 12 words, got ${words.length}. Separate each word with a space.`);
      return;
    }

    onImportWallet(words.join(" "));
  }, [importPhrase, onImportWallet]);

  const handleFinishCreate = useCallback(async () => {
    if (!generatedKeys) return;
    try {
      const pubkey = await connectWithPrivateKey(generatedKeys.secretKeyHex);
      onNostrConnected(pubkey);
    } catch {
      // Error handled by hook
    }
  }, [generatedKeys, connectWithPrivateKey, onNostrConnected]);

  const handleSkip = useCallback(() => {
    const identifier = `anon_${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem("addy_skip_identifier", identifier);
    onSkip(identifier);
  }, [onSkip]);

  const copyToClipboard = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const resetToMain = useCallback(() => {
    setView("main");
    setGeneratedKeys(null);
    setShowPrivateKey(false);
    setBackupConfirmed(false);
    setNsecInput("");
    setNsecError(null);
    setImportPhrase("");
    setImportError(null);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-base p-4">
      <div className="flex flex-col items-center">
      <div className="w-full max-w-md bg-surface-card rounded-2xl p-8 shadow-xl border border-border-subtle">
        <div className="text-center mb-8">
          <img src="/addy-logos/addy-logo-color.svg" alt="Addy" className="h-14 mx-auto mb-4" />
          <p className="text-pastel-blue text-sm font-medium">Quick Lightning Wallet Generator</p>
          <p className="text-gray-500 text-xs mt-3">Choose a Nostr login method</p>
        </div>

        {(error || nsecError) && view !== "import-phrase" && (
          <div className="bg-brand-orange/10 border border-brand-orange/40 text-pastel-orange rounded-lg px-4 py-3 mb-6 text-sm">
            {nsecError || error}
          </div>
        )}

        {/* Main View */}
        {view === "main" && (
          <div className="space-y-3">
            <button
              className="w-full flex items-center gap-4 bg-surface-raised hover:bg-surface-input border border-border-subtle rounded-xl px-5 py-4 text-left transition-colors"
              onClick={handleExtensionConnect}
              disabled={isConnecting}
            >
              <div className="w-10 h-10 rounded-full bg-brand-blue flex items-center justify-center shrink-0">
                <BoltIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-white font-medium">
                  {isConnecting ? "Connecting..." : "Sign in with Extension"}
                </div>
                <div className="text-gray-400 text-sm">
                  Alby, nos2x, or other NIP-07 extension
                </div>
              </div>
            </button>

            <button
              className="w-full flex items-center gap-4 bg-surface-raised hover:bg-surface-input border border-border-subtle rounded-xl px-5 py-4 text-left transition-colors"
              onClick={handleCreateAccount}
              disabled={isConnecting}
            >
              <div className="w-10 h-10 rounded-full bg-brand-green flex items-center justify-center shrink-0">
                <KeyIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-white font-medium">Create Nostr Account</div>
                <div className="text-gray-400 text-sm">
                  Generate a new key pair
                </div>
              </div>
            </button>

            <button
              className="w-full flex items-center gap-4 bg-surface-raised hover:bg-surface-input border border-border-subtle rounded-xl px-5 py-4 text-left transition-colors"
              onClick={() => setView("nsec-login")}
              disabled={isConnecting}
            >
              <div className="w-10 h-10 rounded-full bg-brand-orange flex items-center justify-center shrink-0">
                <LockIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-white font-medium">Sign in with nsec</div>
                <div className="text-gray-400 text-sm">
                  Paste an existing private key
                </div>
              </div>
            </button>

            <button
              className="w-full flex items-center gap-4 bg-surface-raised hover:bg-surface-input border border-border-subtle rounded-xl px-5 py-4 text-left transition-colors"
              onClick={handleSkip}
            >
              <div className="w-10 h-10 rounded-full bg-brand-purple flex items-center justify-center shrink-0">
                <ArrowRightIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-white font-medium">Skip Nostr</div>
                <div className="text-gray-400 text-sm">
                  Just create a wallet
                </div>
              </div>
            </button>

            <div className="pt-2 border-t border-border-subtle mt-1">
              <button
                className="w-full text-center text-pastel-blue text-sm hover:text-brand-blue transition-colors py-2"
                onClick={() => setView("import-phrase")}
              >
                Import existing wallet
              </button>
            </div>
          </div>
        )}

        {/* nsec Login */}
        {view === "nsec-login" && (
          <div className="space-y-4">
            <input
              type="password"
              className="w-full bg-surface-input border border-border-subtle rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-purple"
              placeholder="nsec1..."
              value={nsecInput}
              onChange={(e) => {
                setNsecInput(e.target.value);
                setNsecError(null);
              }}
            />
            <p className="text-gray-500 text-xs">
              Your key stays on this device and is never sent to any server
            </p>
            <div className="flex gap-3">
              <button
                className="flex-1 bg-surface-raised border border-border-subtle text-gray-300 rounded-lg px-4 py-3 hover:bg-surface-input transition-colors"
                onClick={resetToMain}
              >
                Cancel
              </button>
              <button
                className="flex-1 bg-brand-purple text-white rounded-lg px-4 py-3 hover:bg-brand-purple/80 transition-colors disabled:opacity-50"
                onClick={handleNsecLogin}
                disabled={!nsecInput.trim() || isConnecting}
              >
                {isConnecting ? "Connecting..." : "Sign In"}
              </button>
            </div>
          </div>
        )}

        {/* Create Account - Show Keys */}
        {view === "create-keys" && generatedKeys && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-gray-400 text-sm">Private Key</span>
                <button
                  className="text-pastel-purple text-xs hover:text-brand-purple"
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                >
                  {showPrivateKey ? "Hide" : "Show"}
                </button>
              </div>
              <div className="bg-surface-input border border-border-subtle rounded-lg px-4 py-3 text-sm font-mono break-all flex items-start gap-2">
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
              <span className="text-gray-400 text-sm mb-1 block">Public Key</span>
              <div className="bg-surface-input border border-border-subtle rounded-lg px-4 py-3 text-sm font-mono break-all text-white flex items-start gap-2">
                <span className="flex-1">{generatedKeys.npub}</span>
                <button
                  className="text-pastel-blue text-xs shrink-0 hover:text-brand-blue"
                  onClick={() => copyToClipboard(generatedKeys.npub, "npub")}
                >
                  {copied === "npub" ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <div className="bg-brand-orange/10 border border-brand-orange/30 rounded-lg px-4 py-3">
              <p className="text-pastel-orange text-xs">
                Write down your private key (nsec) and store it safely. Anyone with this key can access your Nostr identity.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={backupConfirmed}
                onChange={(e) => setBackupConfirmed(e.target.checked)}
                className="rounded border-gray-600 accent-brand-purple"
              />
              <span className="text-gray-300">I saved my keys securely</span>
            </label>

            <div className="flex gap-3">
              <button
                className="flex-1 bg-surface-raised border border-border-subtle text-gray-300 rounded-lg px-4 py-3 hover:bg-surface-input transition-colors"
                onClick={resetToMain}
              >
                Cancel
              </button>
              <button
                className="flex-1 bg-brand-orange text-white rounded-lg px-4 py-3 hover:bg-brand-orange/80 transition-colors disabled:opacity-50"
                onClick={handleFinishCreate}
                disabled={!backupConfirmed || isConnecting}
              >
                {isConnecting ? "Creating..." : "Continue"}
              </button>
            </div>
          </div>
        )}

        {/* Import Wallet */}
        {view === "import-phrase" && (
          <div className="space-y-4">
            <div>
              <label className="text-gray-400 text-sm mb-1 block">
                Enter your 12-word recovery phrase
              </label>
              <textarea
                className="w-full bg-surface-input border border-border-subtle rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-purple resize-none font-mono text-sm"
                placeholder="word1 word2 word3 ..."
                rows={3}
                value={importPhrase}
                onChange={(e) => {
                  setImportPhrase(e.target.value);
                  setImportError(null);
                }}
              />
              <p className="text-gray-500 text-xs mt-1">
                Separate each word with a space
              </p>
            </div>
            {importError && (
              <p className="text-pastel-orange text-xs">{importError}</p>
            )}
            <div className="flex gap-3">
              <button
                className="flex-1 bg-surface-raised border border-border-subtle text-gray-300 rounded-lg px-4 py-3 hover:bg-surface-input transition-colors"
                onClick={resetToMain}
              >
                Cancel
              </button>
              <button
                className="flex-1 bg-brand-purple text-white rounded-lg px-4 py-3 hover:bg-brand-purple/80 transition-colors disabled:opacity-50"
                onClick={handleImportPhrase}
                disabled={!importPhrase.trim()}
              >
                Import Wallet
              </button>
            </div>
          </div>
        )}
      </div>
      <p className="text-gray-500 text-xs text-center mt-4">Built with Breez SDK Spark</p>
      </div>
    </div>
  );
}
