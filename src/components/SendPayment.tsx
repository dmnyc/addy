import { useState, useCallback } from "react";
import { sendSparkPayment } from "../wallet/spark";

interface SendPaymentProps {
  balance: number | null;
  onBack: () => void;
}

export function SendPayment({ balance, onBack }: SendPaymentProps) {
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isLightningAddress =
    destination.trim() &&
    !destination.trim().toLowerCase().startsWith("lnbc") &&
    destination.includes("@");

  const isLnurl =
    destination.trim().toLowerCase().startsWith("lnurl");

  const needsAmount = isLightningAddress || isLnurl;

  const handleSend = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const amountSats = needsAmount ? parseInt(amount, 10) : undefined;
      if (needsAmount && (!amountSats || amountSats <= 0)) {
        setError("Please enter a valid amount");
        setLoading(false);
        return;
      }
      await sendSparkPayment(destination.trim(), amountSats);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setLoading(false);
    }
  }, [destination, amount, needsAmount]);

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-base p-4">
        <div className="w-full max-w-md bg-surface-card rounded-2xl p-8 shadow-xl text-center border border-border-subtle">
          <div className="text-5xl mb-4">&#9889;</div>
          <h2 className="text-xl font-bold text-white mb-2">Payment Sent!</h2>
          <p className="text-gray-400 text-sm mb-6">
            Your payment has been sent successfully.
          </p>
          <button
            className="w-full bg-brand-blue text-white rounded-lg px-4 py-3 hover:bg-brand-blue/80 transition-colors"
            onClick={onBack}
          >
            Back to Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-base p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-6 pt-4">
          <button
            className="text-gray-400 hover:text-white transition-colors"
            onClick={onBack}
          >
            &larr; Back
          </button>
          <h2 className="text-xl font-bold text-white">Send</h2>
        </div>

        {error && (
          <div className="bg-brand-orange/10 border border-brand-orange/40 text-pastel-orange rounded-lg px-4 py-3 mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="text-gray-400 text-sm mb-1 block">
              Invoice, Lightning Address, or LNURL
            </label>
            <textarea
              className="w-full bg-surface-input border border-border-subtle rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-blue resize-none"
              placeholder="lnbc... or user@domain.com"
              rows={3}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
          </div>

          {needsAmount && (
            <div>
              <label className="text-gray-400 text-sm mb-1 block">
                Amount (sats)
              </label>
              <input
                type="number"
                className="w-full bg-surface-input border border-border-subtle rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-blue"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {balance !== null && (
                <p className="text-gray-500 text-xs mt-1">
                  Available: {balance.toLocaleString()} sats
                </p>
              )}
            </div>
          )}

          <button
            className="w-full bg-brand-orange text-white rounded-lg px-4 py-3 hover:bg-brand-orange/80 transition-colors disabled:opacity-50 font-medium"
            onClick={handleSend}
            disabled={!destination.trim() || loading}
          >
            {loading ? "Sending..." : "Send Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}
