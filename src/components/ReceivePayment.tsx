import { useState, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createSparkInvoice, getSparkLightningAddress } from "../wallet/spark";

interface ReceivePaymentProps {
  onBack: () => void;
}

const PRESET_AMOUNTS = [1000, 5000, 10000, 21000];

const ADDY_LOGO_DATA_URI =
  "data:image/svg+xml,%3Csvg width='150' height='150' viewBox='0 0 150 150' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='150' height='150' fill='black'/%3E%3Cpath d='M81.2385 39H120.413V111.4H115.942C103.641 111.4 94.7933 109.247 89.3998 104.941C83.9589 100.587 81.2385 93.3945 81.2385 83.3626V39ZM30 76.0517C30 70.8464 30.686 66.0198 32.0581 61.5717C33.4301 57.0763 35.5591 53.1487 38.4451 49.789C44.6903 42.5963 53.6322 39 65.2708 39H70.7353V111.4H67.045C55.1225 111.4 45.8967 108.135 39.3677 101.605C33.1226 95.3583 30 86.8407 30 76.0517Z' fill='%23FF6644'/%3E%3C/svg%3E";

const QR_IMAGE_SETTINGS = {
  src: ADDY_LOGO_DATA_URI,
  x: undefined as undefined,
  y: undefined as undefined,
  height: 40,
  width: 40,
  excavate: true,
};

export function ReceivePayment({ onBack }: ReceivePaymentProps) {
  const [amount, setAmount] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [invoice, setInvoice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);

  const lightningAddress = getSparkLightningAddress();

  const handlePresetClick = useCallback((preset: number) => {
    setSelectedPreset(preset);
    setAmount(String(preset));
  }, []);

  const handleCreateInvoice = useCallback(async () => {
    const amountSats = parseInt(amount, 10);
    if (isNaN(amountSats) || amountSats <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await createSparkInvoice(amountSats, description || undefined);
      setInvoice(result.invoice);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setLoading(false);
    }
  }, [amount, description]);

  const copyInvoice = useCallback(() => {
    if (!invoice) return;
    navigator.clipboard.writeText(invoice);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [invoice]);

  const copyAddress = useCallback(() => {
    if (!lightningAddress) return;
    navigator.clipboard.writeText(lightningAddress);
    setAddressCopied(true);
    setTimeout(() => setAddressCopied(false), 2000);
  }, [lightningAddress]);

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
          <h2 className="text-xl font-bold text-white">Receive</h2>
        </div>

        {error && (
          <div className="bg-brand-orange/10 border border-brand-orange/40 text-pastel-orange rounded-lg px-4 py-3 mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Lightning Address */}
        {lightningAddress && !invoice && (
          <div className="mb-6 space-y-3">
            <div className="bg-white rounded-xl p-4 flex items-center justify-center">
              <QRCodeSVG
                value={lightningAddress}
                size={200}
                bgColor="#ffffff"
                fgColor="#000000"
                level="H"
                imageSettings={QR_IMAGE_SETTINGS}
              />
            </div>
            <div
              className="bg-surface-card rounded-xl px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-surface-raised border border-border-subtle transition-colors"
              onClick={copyAddress}
            >
              <div>
                <p className="text-gray-400 text-xs mb-0.5">Lightning Address</p>
                <p className="text-white text-sm font-mono">{lightningAddress}</p>
              </div>
              <span className="text-pastel-blue text-xs shrink-0">
                {addressCopied ? "Copied!" : "Copy"}
              </span>
            </div>
          </div>
        )}

        {/* Invoice */}
        {invoice ? (
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-4 flex items-center justify-center">
              <QRCodeSVG
                value={invoice}
                size={240}
                bgColor="#ffffff"
                fgColor="#000000"
                level="H"
                imageSettings={QR_IMAGE_SETTINGS}
              />
            </div>

            <div className="bg-surface-raised rounded-lg px-4 py-3">
              <p className="text-gray-400 text-xs mb-1">Invoice</p>
              <p className="text-white text-xs font-mono break-all">
                {invoice.substring(0, 60)}...
              </p>
            </div>

            <button
              className="w-full bg-brand-blue text-white rounded-lg px-4 py-3 hover:bg-brand-blue/80 transition-colors"
              onClick={copyInvoice}
            >
              {copied ? "Copied!" : "Copy Invoice"}
            </button>

            <button
              className="w-full bg-surface-raised border border-border-subtle text-gray-300 rounded-lg px-4 py-3 hover:bg-surface-input transition-colors"
              onClick={() => {
                setInvoice(null);
                setAmount("");
                setSelectedPreset(null);
                setDescription("");
              }}
            >
              Create New Invoice
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-gray-400 text-sm mb-2 block">Amount (sats)</label>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {PRESET_AMOUNTS.map((preset) => (
                  <button
                    key={preset}
                    className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                      selectedPreset === preset
                        ? "bg-brand-purple text-white"
                        : "bg-surface-raised border border-border-subtle text-gray-300 hover:bg-surface-input"
                    }`}
                    onClick={() => handlePresetClick(preset)}
                  >
                    {preset >= 1000 ? `${preset / 1000}k` : preset}
                  </button>
                ))}
              </div>
              <input
                type="number"
                className="w-full bg-surface-input border border-border-subtle rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-green"
                placeholder="Custom amount"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setSelectedPreset(null);
                }}
              />
            </div>

            <div>
              <label className="text-gray-400 text-sm mb-1 block">
                Description (optional)
              </label>
              <input
                type="text"
                className="w-full bg-surface-input border border-border-subtle rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-green"
                placeholder="What's this for?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <button
              className="w-full bg-brand-green text-white rounded-lg px-4 py-3 hover:bg-brand-green/80 transition-colors disabled:opacity-50 font-medium"
              onClick={handleCreateInvoice}
              disabled={!amount || loading}
            >
              {loading ? "Creating Invoice..." : "Create Invoice"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
