import { useState, useEffect } from "react";

const MNEMONIC_DELAY_SECONDS = 5;

interface MnemonicBackupProps {
  mnemonic: string;
  onConfirmed: () => void;
  onCancel: () => void;
}

export function MnemonicBackup({
  mnemonic,
  onConfirmed,
  onCancel,
}: MnemonicBackupProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(MNEMONIC_DELAY_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const canConfirm = secondsLeft === 0;
  const canProceed = confirmed && canConfirm;

  const words = mnemonic.split(" ");

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-base p-4">
      <div className="w-full max-w-md bg-surface-card rounded-2xl p-8 shadow-xl border border-border-subtle">
        <h2 className="text-xl font-bold text-white mb-2 text-center">
          Save Your Recovery Phrase
        </h2>
        <p className="text-gray-400 text-sm text-center mb-6">
          Write these 12 words down and store them safely
        </p>

        <div className="grid grid-cols-3 gap-2 mb-6">
          {words.map((word, i) => (
            <div
              key={i}
              className="bg-surface-raised border border-border-subtle rounded-lg px-3 py-2 text-center"
            >
              <span className="text-pastel-purple text-xs mr-1">{i + 1}.</span>
              <span className="text-white text-sm font-mono">{word}</span>
            </div>
          ))}
        </div>

        <div className="bg-brand-orange/10 border border-brand-orange/30 rounded-lg px-4 py-3 mb-6">
          <p className="text-pastel-orange text-xs">
            Do not screenshot or share with anyone. Anyone with these words can
            access your wallet funds.
          </p>
        </div>

        <div className="space-y-3 mb-6">
          <label
            className={`flex items-center gap-2 text-sm ${
              !canConfirm ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              disabled={!canConfirm}
              className="rounded border-gray-600 accent-brand-purple"
            />
            <span className="text-gray-300">
              I have saved my recovery phrase
            </span>
          </label>
        </div>

        <div className="flex gap-3">
          <button
            className="flex-1 bg-surface-raised border border-border-subtle text-gray-300 rounded-lg px-4 py-3 hover:bg-surface-input transition-colors"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="flex-1 bg-brand-purple text-white rounded-lg px-4 py-3 hover:bg-brand-purple/80 transition-colors disabled:opacity-50"
            onClick={onConfirmed}
            disabled={!canProceed}
          >
            {!canConfirm
              ? `Please read carefully (${secondsLeft}s)`
              : "Create My Wallet"}
          </button>
        </div>
      </div>
    </div>
  );
}
