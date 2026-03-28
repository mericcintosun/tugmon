# Tugmon — Cosmic tug-of-war on Monad

Tugmon is a mobile-first web arena: players tap to pull on-chain, a big screen shows the live board, and a faucet funds burner wallets so nobody installs a browser wallet for the demo.

**PRD vs this repo (one paragraph):** The original PRD described `Wallet.createRandom()` plus `localStorage` and a headline “TPS” tied to chain throughput. This app defaults to a **deterministic** session key derived from the display name (same name ⇒ same address on any device), with an optional **`NEXT_PUBLIC_BURNER_WALLET_MODE=random`** mode that matches the PRD-style random wallet stored in `localStorage`. The dashboard “activity” number is **estimated activity (events/s)** from contract events processed in the browser session, plus an optional **RPC snapshot** of transaction count in the latest block—not Monad’s global network TPS.

---

## Repo layout

| Path | Role |
|------|------|
| `web/` | Next.js App Router — play UI, dashboard, `/api/fund` |
| `contracts/` | Hardhat — `TugmonArena.sol`, deploy script, tests |

---

## Implemented features

- **Smart contract:** Team scores, `join`, `pull`, role-gated `boost` / `sabotage`, timed windows, `GameReset`, `resetGame`.
- **Burner funding:** `POST /api/fund` sends test MON to low-balance addresses using `FUNDING_PRIVATE_KEY`.
- **Rate limits:** Per-address cooldown; optional per-IP cap; **Upstash Redis** when `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are set (falls back to in-memory maps for local dev / single instance).
- **Play (`/play`):** Nickname flow, auto-fund, `join`, canvas + pump, haptics, role actions.
- **Dashboard (`/dashboard`):** Score bar, MVP-style top players, QR to play, TPS-style **event activity** + **last-block tx snapshot**.
- **Offline demo (`/play/offline`):** Local-only UI (no chain).
- **PWA:** `web/src/app/manifest.ts`, icons under `web/public/icons/`, `ServiceWorkerRegister` + `public/sw.js` (caches `/play/offline` after a successful visit in production).

---

## Environment variables

Copy examples and fill in secrets locally (never commit real keys):

```bash
cp web/.env.example web/.env.local
cp contracts/.env.example contracts/.env   # optional, for deploy
```

### `web/.env.example` (browser + server)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_RPC_URL` | Monad (or local) JSON-RPC |
| `NEXT_PUBLIC_CHAIN_ID` | e.g. `10143` (Monad testnet) |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | Deployed `TugmonArena` |
| `NEXT_PUBLIC_APP_URL` | Canonical URL for QR codes and links |
| `NEXT_PUBLIC_BURNER_WALLET_MODE` | `deterministic` (default) or `random` |
| `FUNDING_PRIVATE_KEY` | Faucet signer (server only) |
| `FUNDING_AMOUNT_ETH` | Amount to send per fund |
| `FUNDING_MIN_BALANCE_ETH` | Skip funding if balance ≥ this |
| `FUNDING_RATE_LIMIT_SECONDS` | Per-address cooldown |
| `FUNDING_IP_MAX_FUNDS` | Max successful funds per IP per window (`0` = off) |
| `FUNDING_IP_WINDOW_SECONDS` | IP window length |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Durable rate limits (optional) |

### `contracts/.env.example`

| Variable | Purpose |
|----------|---------|
| `PRIVATE_KEY` | Deployer key for `monadTestnet` |
| `MONAD_RPC_URL` | RPC for deploy |

---

## Local development

### 1. Contracts

```bash
cd contracts
npm install
npx hardhat test
```

Optional local node:

```bash
npx hardhat node
# another terminal:
npx hardhat run scripts/deploy.js --network localhost
```

Point `web/.env.local` at `http://127.0.0.1:8545` and set `NEXT_PUBLIC_CONTRACT_ADDRESS` to the deployed address.

### 2. Web app

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Use `/play` on a phone and `/dashboard` on a projector.

### 3. Production build

```bash
cd web && npm run build && npm start
```

---

## Deploy (Monad testnet)

1. Fund a deployer wallet with test MON.
2. Set `contracts/.env` with `PRIVATE_KEY` and `MONAD_RPC_URL`.
3. Deploy:

   ```bash
   cd contracts
   npx hardhat run scripts/deploy.js --network monadTestnet
   ```

4. Put the printed address into `web` as `NEXT_PUBLIC_CONTRACT_ADDRESS` (and matching `NEXT_PUBLIC_RPC_URL` / `NEXT_PUBLIC_CHAIN_ID`).
5. Configure `FUNDING_PRIVATE_KEY` on the host (Vercel, etc.) and optional Upstash for rate limits.
6. Set `NEXT_PUBLIC_APP_URL` to your public origin so QR codes resolve correctly.

---

## Scripts

| Location | Command | Meaning |
|----------|---------|---------|
| `web/` | `npm run dev` | Next.js dev server |
| `web/` | `npm run build` | Production build |
| `contracts/` | `npm test` | Hardhat tests |

---

## License

See project files; hackathon / demo use unless you add a explicit license.
