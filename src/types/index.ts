export interface SparkPayment {
  id: string;
  type: "incoming" | "outgoing";
  amountSats: number;
  feesSats?: number;
  description?: string;
  preimage?: string;
  paymentHash?: string;
  createdAt: number;
  settledAt?: number;
  status: "succeeded" | "failed" | "pending";
}

export interface SparkBackupEntry {
  id: string;
  dTag: string;
  content: string;
  createdAt: number;
  encryptionMethod: "nip44" | "nip04";
  isLegacy: boolean;
  walletId?: string;
}

export interface GeneratedKeys {
  nsec: string;
  npub: string;
  secretKeyHex: string;
  pubkey: string;
}

export type AuthMethod = "nip07" | "private-key" | null;

export type AppView =
  | "login"
  | "loading"
  | "dashboard"
  | "send"
  | "receive"
  | "backup"
  | "transactions";
