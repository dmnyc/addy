/**
 * Spark Wallet Module
 *
 * Self-custodial Lightning wallet using Breez SDK Spark.
 */

import {
  saveMnemonic,
  loadMnemonic,
  hasMnemonic,
  deleteMnemonic,
} from "./storage";
import type { SparkPayment } from "../types";

// --- State ---
let _sdkInstance: any = null;
let _wasmInitialized = false;
let _wasmInitPromise: Promise<void> | null = null;
let _sdkInitPromise: Promise<boolean> | null = null;
let _currentIdentifier: string | null = null;
let _eventListenerId: string | null = null;

type StateListener = () => void;
const stateListeners: Set<StateListener> = new Set();

let _walletBalance: number | null = null;
let _walletInitialized = false;
let _sparkLoading = false;
let _lightningAddress: string | null = null;
let _recentPayments: SparkPayment[] = [];
let _hasSynced = false;

function notifyListeners() {
  stateListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* ignore */
    }
  });
}

// --- Public State Accessors ---
export function getSparkState() {
  return {
    balance: _walletBalance,
    initialized: _walletInitialized,
    loading: _sparkLoading,
    lightningAddress: _lightningAddress,
    recentPayments: _recentPayments,
  };
}

export function subscribeToSparkState(listener: StateListener): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

// --- Event Callback System ---
type SparkEventCallback = (event: any) => void;
const _eventCallbacks: SparkEventCallback[] = [];

export function onSparkEvent(callback: SparkEventCallback): () => void {
  _eventCallbacks.push(callback);
  return () => {
    const index = _eventCallbacks.indexOf(callback);
    if (index > -1) _eventCallbacks.splice(index, 1);
  };
}

/**
 * Dynamically import bip39 with Buffer polyfill
 */
async function getBip39(): Promise<{
  generateMnemonic: (strength?: number) => string;
}> {
  if (typeof globalThis !== "undefined" && !(globalThis as any).Buffer) {
    const { Buffer } = await import("buffer");
    (globalThis as any).Buffer = Buffer;
  }
  const bip39 = await import("bip39");
  return bip39;
}

function validateMnemonic(mnemonic: string): boolean {
  const words = mnemonic.trim().split(/\s+/);
  const validWordCounts = [12, 15, 18, 21, 24];
  if (!validWordCounts.includes(words.length)) {
    console.warn("[Spark] Invalid mnemonic word count:", words.length);
    return false;
  }
  for (const word of words) {
    if (!/^[a-z]+$/.test(word)) {
      console.warn("[Spark] Invalid mnemonic word:", word);
      return false;
    }
  }
  return true;
}

async function initWasm(): Promise<void> {
  if (_wasmInitialized) return;
  if (_wasmInitPromise) return _wasmInitPromise;

  _wasmInitPromise = (async () => {
    try {
      const { default: init } = await import("@breeztech/breez-sdk-spark/web");
      await init();
      _wasmInitialized = true;
      console.log("[Spark] WASM module initialized");
    } catch (error) {
      _wasmInitPromise = null;
      console.error("[Spark] Failed to initialize WASM:", error);
      throw error;
    }
  })();

  return _wasmInitPromise;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(`${operation} timed out after ${timeoutMs / 1000}s`),
          ),
        timeoutMs,
      ),
    ),
  ]);
}

async function setupEventListener(): Promise<void> {
  if (!_sdkInstance) return;

  const listener = {
    onEvent: (event: any) => {
      if (event.type === "paymentSucceeded" && event.payment) {
        const payment = mapPayment(event.payment);
        _recentPayments = [payment, ..._recentPayments].slice(0, 20);
        refreshBalanceInternal();
        notifyListeners();
      }
      if (event.type === "synced") {
        _hasSynced = true;
        refreshBalanceInternal();
      }
      _eventCallbacks.forEach((callback) => {
        try {
          callback(event);
        } catch {
          /* ignore */
        }
      });
    },
  };

  _eventListenerId = await _sdkInstance.addEventListener(listener);
}

async function refreshBalanceInternal(): Promise<void> {
  if (!_sdkInstance) return;
  try {
    const info = await _sdkInstance.getInfo({ ensureSynced: false });
    const balanceValue =
      info.balanceSats ??
      info.balanceSat ??
      info.balance_sats ??
      info.balance ??
      0;
    const nextBalance = Number(balanceValue);
    if (!Number.isFinite(nextBalance)) return;
    if (nextBalance === 0 && !_hasSynced) return;
    _walletBalance = nextBalance;
    notifyListeners();
  } catch (error) {
    console.error("[Spark] Failed to refresh balance:", error);
  }
}

function mapPayment(p: any): SparkPayment {
  const paymentType = p.paymentType || p.payment_type || p.type || "";
  const isIncoming =
    paymentType === "received" ||
    paymentType === "RECEIVED" ||
    paymentType === "receive" ||
    paymentType === "incoming";

  const amountMsat = p.amountMsat || p.amount_msat || p.amountMSat || 0;
  const amountSats =
    p.amountSat ||
    p.amount_sat ||
    p.amountSats ||
    p.amount ||
    Math.floor(Number(amountMsat) / 1000);

  const feesMsat = p.feesMsat || p.fees_msat || p.feesMSat || 0;
  const feesSats =
    p.feesSat ||
    p.fees_sat ||
    p.feesSats ||
    (feesMsat ? Math.floor(Number(feesMsat) / 1000) : undefined);

  let timestamp = p.createdAt || p.created_at || p.timestamp || Date.now();
  if (timestamp > 4102444800) timestamp = Math.floor(timestamp / 1000);

  return {
    id: p.id || p.paymentHash || p.payment_hash || String(Date.now()),
    type: isIncoming ? "incoming" : "outgoing",
    amountSats: Number(amountSats),
    feesSats: feesSats !== undefined ? Number(feesSats) : undefined,
    description:
      p.description || p.details?.description || p.bolt11Description,
    preimage: p.preimage || p.details?.preimage,
    paymentHash: p.paymentHash || p.payment_hash || p.details?.paymentHash,
    createdAt: timestamp,
    settledAt: p.settledAt || p.settled_at,
    status:
      p.status === "succeeded" ||
      p.status === "complete" ||
      p.status === "completed"
        ? "succeeded"
        : p.status === "failed"
          ? "failed"
          : "pending",
  };
}

function extractLightningAddressString(addr: unknown): string | null {
  if (!addr) return null;
  if (typeof addr === "string") return addr;

  if (typeof addr === "object" && addr !== null) {
    const obj = addr as Record<string, unknown>;
    const possibleKeys = [
      "lightningAddress",
      "lightning_address",
      "address",
      "lnAddress",
    ];
    for (const key of possibleKeys) {
      if (typeof obj[key] === "string") return obj[key] as string;
    }
    for (const value of Object.values(obj)) {
      if (typeof value === "string" && value.includes("@")) {
        return value;
      }
    }
  }

  return null;
}

async function fetchLightningAddress(): Promise<void> {
  if (!_sdkInstance) return;
  try {
    const addr = await _sdkInstance.getLightningAddress();
    const address = extractLightningAddressString(addr);
    if (address) {
      _lightningAddress = address;
      notifyListeners();
      console.log("[Spark] Lightning address:", address);
    }
  } catch (error) {
    console.debug("[Spark] No lightning address available:", error);
  }
}

/**
 * Initialize the Breez SDK and connect the wallet
 */
export async function initializeSdk(
  identifier: string,
  mnemonic: string,
  apiKey: string,
): Promise<boolean> {
  if (_currentIdentifier === identifier && _sdkInstance) {
    console.log("[Spark] SDK already initialized for this identifier");
    return true;
  }

  // Prevent concurrent initialization
  if (_sdkInitPromise) {
    console.log("[Spark] SDK initialization already in progress, waiting...");
    return _sdkInitPromise;
  }

  _sdkInitPromise = _initializeSdkInternal(identifier, mnemonic, apiKey);
  try {
    return await _sdkInitPromise;
  } finally {
    _sdkInitPromise = null;
  }
}

async function _initializeSdkInternal(
  identifier: string,
  mnemonic: string,
  apiKey: string,
): Promise<boolean> {
  try {
    _sparkLoading = true;
    notifyListeners();

    await disconnectWallet();
    await initWasm();

    const { defaultConfig, SdkBuilder } = await import(
      "@breeztech/breez-sdk-spark/web"
    );

    const config = defaultConfig("mainnet") as unknown as Record<
      string,
      unknown
    >;
    config.apiKey = apiKey;
    (config as Record<string, unknown>).privateEnabledDefault = true;

    const cleanMnemonic = mnemonic.trim().toLowerCase().replace(/\s+/g, " ");

    let builder = (SdkBuilder as any).new(config, {
      type: "mnemonic",
      mnemonic: cleanMnemonic,
    });
    builder = await builder.withDefaultStorage("addy-spark");
    _sdkInstance = await withTimeout(builder.build(), 30000, "SDK connect");

    _currentIdentifier = identifier;

    await setupEventListener();
    await refreshBalanceInternal();

    _walletInitialized = true;
    console.log("[Spark] SDK initialized, starting background sync...");
    notifyListeners();

    // Background sync — balance updates reactively via synced event
    withTimeout(_sdkInstance.syncWallet({}), 10000, "Background sync")
      .then(() => {
        console.log("[Spark] Background sync completed");
        _hasSynced = true;
        refreshBalanceInternal();
      })
      .catch(() => {
        console.warn("[Spark] Background sync failed/timed out");
        // Even if sync timed out, the SDK may have partial state —
        // mark synced and refresh so we don't suppress a valid balance
        _hasSynced = true;
        refreshBalanceInternal();
      })
      ;

    fetchLightningAddress().catch(() => {});

    return true;
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error("[Spark] Failed to initialize SDK:", errorMessage);
    _walletInitialized = false;
    _sdkInstance = null;
    _currentIdentifier = null;
    notifyListeners();
    throw new Error(`Spark SDK initialization failed: ${errorMessage}`);
  } finally {
    _sparkLoading = false;
    notifyListeners();
  }
}

/**
 * Create a new wallet with generated mnemonic
 */
export async function createAndConnectWallet(
  identifier: string,
  apiKey: string,
): Promise<string> {
  const { generateMnemonic } = await getBip39();
  const newMnemonic = generateMnemonic(128); // 12 words

  await saveMnemonic(identifier, newMnemonic);

  try {
    await initializeSdk(identifier, newMnemonic, apiKey);
  } catch (error) {
    deleteMnemonic(identifier);
    throw error;
  }

  return newMnemonic;
}

/**
 * Connect wallet using stored mnemonic
 */
export async function connectWallet(
  identifier: string,
  apiKey: string,
): Promise<boolean> {
  const mnemonic = await loadMnemonic(identifier);
  if (!mnemonic) {
    console.warn("[Spark] No mnemonic found for this identifier");
    return false;
  }

  if (!validateMnemonic(mnemonic)) {
    console.error("[Spark] Loaded mnemonic is invalid");
    deleteMnemonic(identifier);
    return false;
  }

  await initializeSdk(identifier, mnemonic, apiKey);
  return true;
}

/**
 * Import existing mnemonic and connect
 */
export async function importAndConnectWallet(
  identifier: string,
  mnemonic: string,
  apiKey: string,
): Promise<boolean> {
  if (!validateMnemonic(mnemonic)) {
    throw new Error("Invalid mnemonic phrase");
  }

  await saveMnemonic(identifier, mnemonic);

  try {
    await initializeSdk(identifier, mnemonic, apiKey);
  } catch (error) {
    deleteMnemonic(identifier);
    throw error;
  }

  return true;
}

export async function disconnectWallet(): Promise<void> {
  try {
    if (_sdkInstance) {
      if (_eventListenerId) {
        try {
          await _sdkInstance.removeEventListener(_eventListenerId);
        } catch {
          /* ignore */
        }
        _eventListenerId = null;
      }
      try {
        await _sdkInstance.disconnect();
      } catch {
        /* ignore */
      }
    }
  } finally {
    _sdkInstance = null;
    _currentIdentifier = null;
    _walletBalance = null;
    _walletInitialized = false;
    _lightningAddress = null;
    _recentPayments = [];
    _hasSynced = false;
    notifyListeners();
  }
}

export function isSparkInitialized(): boolean {
  return _walletInitialized && _sdkInstance !== null;
}

export async function getSparkBalance(
  forceSync = false,
): Promise<number | null> {
  if (!_sdkInstance) return _walletBalance ?? null;

  if (forceSync) {
    try {
      await withTimeout(_sdkInstance.syncWallet({}), 30000, "Force sync");
      _hasSynced = true;
    } catch (e) {
      console.warn("[Spark] Force sync failed:", e);
    }
  }

  await refreshBalanceInternal();
  return _walletBalance ?? null;
}

export async function sendSparkPayment(
  destination: string,
  amountSats?: number,
  comment?: string,
): Promise<{ preimage: string }> {
  if (!_sdkInstance) throw new Error("Spark SDK not initialized");

  try {
    _sparkLoading = true;
    notifyListeners();

    const parsedInput = await _sdkInstance.parse(destination);

    if (
      parsedInput.type === "lightningAddress" ||
      parsedInput.type === "lnurlPay"
    ) {
      if (!amountSats)
        throw new Error("Amount is required for Lightning address payments");

      const payRequest = (parsedInput as any).payRequest;
      const prepareResponse = await _sdkInstance.prepareLnurlPay({
        payRequest,
        amountSats,
      });
      const lnurlPayRequest: any = { prepareResponse };
      if (comment) lnurlPayRequest.comment = comment;

      const payment = await withTimeout(
        _sdkInstance.lnurlPay(lnurlPayRequest),
        20000,
        "LNURL payment",
      );

      await refreshBalanceInternal();
      return { preimage: (payment as any)?.preimage || "" };
    }

    // BOLT11 invoice
    const prepareRequest: any = { paymentRequest: destination };
    if (amountSats) prepareRequest.amountSat = amountSats;

    const prepareResponse =
      await _sdkInstance.prepareSendPayment(prepareRequest);
    const payment = await withTimeout(
      _sdkInstance.sendPayment({ prepareResponse }),
      20000,
      "Invoice payment",
    );

    await refreshBalanceInternal();
    return { preimage: (payment as any)?.preimage || "" };
  } catch (error) {
    console.error("[Spark] Payment failed:", error);
    throw error;
  } finally {
    _sparkLoading = false;
    notifyListeners();
  }
}

export async function createSparkInvoice(
  amountSats: number,
  description?: string,
): Promise<{ invoice: string; paymentHash?: string }> {
  if (!_sdkInstance) throw new Error("Spark SDK not initialized");

  try {
    _sparkLoading = true;
    notifyListeners();

    const request = {
      paymentMethod: {
        type: "bolt11Invoice",
        amountSats,
        description: description || "Addy Lightning payment",
      },
    };

    const response = await withTimeout(
      _sdkInstance.receivePayment(request),
      20000,
      "Create invoice",
    );

    const resp = response as any;
    const invoice = resp?.paymentRequest || resp?.invoice || resp?.bolt11;
    if (!invoice) {
      throw new Error("SDK did not return an invoice");
    }

    return {
      invoice,
      paymentHash: resp?.paymentHash,
    };
  } catch (error) {
    console.error("[Spark] Failed to create invoice:", error);
    throw error;
  } finally {
    _sparkLoading = false;
    notifyListeners();
  }
}

export function getSparkLightningAddress(): string | null {
  return _lightningAddress;
}

export async function refreshSparkLightningAddress(): Promise<string | null> {
  if (!_sdkInstance) return null;
  try {
    const addr = await _sdkInstance.getLightningAddress();
    const address = extractLightningAddressString(addr);
    _lightningAddress = address;
    notifyListeners();
    return address;
  } catch {
    _lightningAddress = null;
    notifyListeners();
    return null;
  }
}

export async function checkLightningAddressAvailable(
  username: string,
): Promise<boolean> {
  if (!_sdkInstance) throw new Error("Spark SDK not initialized");
  return await _sdkInstance.checkLightningAddressAvailable({ username });
}

export async function registerLightningAddress(
  username: string,
): Promise<string> {
  if (!_sdkInstance) throw new Error("Spark SDK not initialized");

  try {
    _sparkLoading = true;
    notifyListeners();

    const result = await _sdkInstance.registerLightningAddress({
      username,
      description: "Addy Lightning wallet",
    });

    const address = extractLightningAddressString(result);
    if (address) {
      _lightningAddress = address;
      notifyListeners();
    }

    return address || `${username}@breez.tips`;
  } catch (error) {
    console.error("[Spark] Failed to register lightning address:", error);
    throw error;
  } finally {
    _sparkLoading = false;
    notifyListeners();
  }
}

export async function deleteLightningAddress(): Promise<void> {
  if (!_sdkInstance) throw new Error("Spark SDK not initialized");

  try {
    _sparkLoading = true;
    notifyListeners();
    await _sdkInstance.deleteLightningAddress();
    _lightningAddress = null;
    notifyListeners();
  } catch (error) {
    console.error("[Spark] Failed to delete lightning address:", error);
    throw error;
  } finally {
    _sparkLoading = false;
    notifyListeners();
  }
}

export async function listSparkPayments(
  options: { limit?: number; offset?: number } = {},
): Promise<SparkPayment[]> {
  if (!_sdkInstance) throw new Error("Spark SDK not initialized");

  try {
    const response: any = await withTimeout(
      _sdkInstance.listPayments({
        limit: options.limit || 20,
        offset: options.offset || 0,
      }),
      10000,
      "listPayments",
    );

    return (response?.payments || []).map(mapPayment);
  } catch (error) {
    console.error("[Spark] Failed to list payments:", error);
    return _recentPayments;
  }
}

export function hasSparkMnemonic(identifier: string): boolean {
  return hasMnemonic(identifier);
}

export function deleteSparkMnemonic(identifier: string): void {
  deleteMnemonic(identifier);
}
