# Addy

A quick, self-custodial Lightning wallet that runs entirely in the browser. Built with [Breez SDK Spark](https://breez.technology/sdk/) and optionally integrated with [Nostr](https://nostr.com/) for identity and encrypted cloud backup.

**Live:** [addywallet.vercel.app](https://addywallet.vercel.app)

## Features

- **Instant wallet creation** — Generate a new Lightning wallet in seconds with a 12-word mnemonic seed
- **Send payments** — Pay BOLT11 invoices, Lightning addresses, and LNURL
- **Receive payments** — Create invoices with QR codes and preset amounts
- **Lightning address** — Register a `username@breez.tips` address with availability checking
- **Transaction history** — View incoming and outgoing payments
- **Recovery phrase** — View and back up your 12-word mnemonic
- **Nostr cloud backup** — Encrypt and back up your mnemonic to Nostr relays using NIP-44, with per-relay status checking
- **Cross-app restore** — Automatically detects and restores backups created by other compatible Spark wallet apps
- **Multiple sign-in methods** — NIP-07 browser extension, nsec private key, generate new Nostr keys, or skip Nostr entirely
- **Connect Nostr later** — Skipped users can connect a Nostr identity from the dashboard at any time
- **Nostr profile display** — Shows avatar, display name, npub, NIP-05, and bio for connected users
- **nsec export** — Private key users can view and copy their nsec from the backup screen
- **Full wallet deletion** — Clears localStorage, sessionStorage, IndexedDB, and browser caches

## Tech Stack

- **React 18** + **TypeScript** + **Vite**
- **Tailwind CSS v4**
- **Breez SDK Spark** (WASM) — self-custodial Lightning wallet
- **NDK** (Nostr Dev Kit) — relay management, event publishing, subscriptions
- **nostr-tools** — key generation, NIP-19 encoding, NIP-44 encryption
- **qrcode.react** — QR code generation for invoices and addresses
- **bip39** — mnemonic generation

## Nostr NIPs Used

| NIP | Usage |
|-----|-------|
| [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md) | Browser extension signing (Alby, nos2x, etc.) |
| [NIP-19](https://github.com/nostr-protocol/nips/blob/master/19.md) | Bech32 encoding for npub/nsec keys |
| [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md) | Versioned encryption for mnemonic backup |
| [NIP-65](https://github.com/nostr-protocol/nips/blob/master/65.md) | Relay list metadata (kind 10002) for user relay discovery |
| [NIP-78](https://github.com/nostr-protocol/nips/blob/master/78.md) | Application-specific data (kind 30078) for wallet backup storage |

## Backup Format

Wallet backups are stored as **kind 30078** replaceable events with:

- **`d` tag:** `spark-wallet-backup:<wallet-id>` where wallet ID is `SHA256(normalized_mnemonic).slice(0, 16)`
- **Content:** NIP-44 encrypted mnemonic (self-encrypted to the user's own pubkey)
- **Tags:** `["client", "addy"]`, `["encryption", "nip44"]`

This format is compatible with other Spark wallet apps that follow the same convention.

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env and add your Breez SDK Spark API key

# Start dev server
npm run dev

# Build for production
npm run build
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_BREEZ_SPARK_API_KEY` | Breez SDK API key ([get one here](https://breez.technology/sdk/)) |

## Default Relays

Addy connects to these relays by default, then expands to include the user's NIP-65 relay list:

- `wss://relay.damus.io`
- `wss://relay.primal.net`
- `wss://nos.lol`
- `wss://purplepag.es`

## License

MIT
