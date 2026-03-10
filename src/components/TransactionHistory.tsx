import { useState, useEffect, useCallback } from "react";
import { listSparkPayments } from "../wallet/spark";
import type { SparkPayment } from "../types";

interface TransactionHistoryProps {
  onBack: () => void;
}

export function TransactionHistory({ onBack }: TransactionHistoryProps) {
  const [payments, setPayments] = useState<SparkPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listSparkPayments({ limit: 50 });
      setPayments(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  function formatDate(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="min-h-screen bg-surface-base p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6 pt-4">
          <div className="flex items-center gap-3">
            <button
              className="text-gray-400 hover:text-white transition-colors"
              onClick={onBack}
            >
              &larr; Back
            </button>
            <h2 className="text-xl font-bold text-white">Transactions</h2>
          </div>
          <button
            className="text-pastel-blue text-sm hover:text-brand-blue transition-colors"
            onClick={loadPayments}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="bg-brand-orange/10 border border-brand-orange/40 text-pastel-orange rounded-lg px-4 py-3 mb-4 text-sm">
            {error}
          </div>
        )}

        {loading && payments.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400">Loading transactions...</p>
          </div>
        ) : payments.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400">No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="bg-surface-card border border-border-subtle rounded-xl px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        payment.type === "incoming"
                          ? "text-pastel-green"
                          : "text-brand-orange"
                      }
                    >
                      {payment.type === "incoming" ? "+" : "-"}
                      {payment.amountSats.toLocaleString()} sats
                    </span>
                    {payment.status === "pending" && (
                      <span className="text-pastel-orange text-xs">(pending)</span>
                    )}
                    {payment.status === "failed" && (
                      <span className="text-brand-orange text-xs">(failed)</span>
                    )}
                  </div>
                  {payment.description && (
                    <p className="text-gray-500 text-xs mt-0.5 truncate max-w-[240px]">
                      {payment.description}
                    </p>
                  )}
                </div>
                <span className="text-gray-500 text-xs shrink-0">
                  {formatDate(payment.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
