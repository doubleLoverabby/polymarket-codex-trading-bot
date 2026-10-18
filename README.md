# Polymarket CodeX CopyTrading Bot

Written and optimized by codex-6.1sol using TypeScript, it is capable of generating real profits.

- `npm run test` for simulated orders
- `npm start` for live market orders
- multiple followed wallets
- fixed USD or percentage-based copy sizing
- sell-following from the bot's locally tracked position
- local JSON state for seen trades, simulated/executed orders, and approximate positions

This is trading software. Run `npm run test` first, use tiny sizes, and review every config value before using `npm start`.

## Requirements

- Node.js `>=20.10`
- npm

The bot uses the non-beta CLOB package `@polymarket/clob-client-v2` for trading and the public Data API for wallet activity polling.

## Setup Copy Bot

```bash
git clone `https://github.com/doubleLoverabby/polymarket-codex-trading-bot`
cd polymarket-codex-trading-bot
npm install
cp .env.example .env
```

Edit `.env`:

```bash
WATCHED_WALLETS=0xabc...,0xdef...
POLYMARKET_PRIVATE_KEY=0x...
COPY_MODE=fixed
FIXED_BUY_AMOUNT_USD=5
FIXED_SELL_AMOUNT_USD=5
```

Run a simulated order test. This defaults to one polling pass and never posts a live order:

```bash
npm run test
```

Run live mode:

```bash
npm start
```

## Live Trading


```bash
POLYMARKET_CLOB_HOST=https://clob.polymarket.com
POLYMARKET_CHAIN_ID=137
POLYMARKET_SIGNATURE_TYPE=POLY_1271
POLYMARKET_PRIVATE_KEY=0x...
POLYMARKET_DEPOSIT_WALLET=0x...
```

`POLYMARKET_SIGNATURE_TYPE` accepts `EOA`, `POLY_PROXY`, `POLY_GNOSIS_SAFE`, or `POLY_1271`. For new deposit-wallet users, `POLY_1271` is usually the right value. For EOA trading, `POLYMARKET_DEPOSIT_WALLET` can be omitted.

You can also provide existing L2 credentials to avoid deriving them on startup:

```bash
CLOB_API_KEY=...
CLOB_SECRET=...
CLOB_PASS_PHRASE=...
```

The executor uses `createAndPostMarketOrder`. Before live trading, your trading wallet still needs funds and the required Polymarket approvals; this bot does not try to deploy wallets or auto-approve spending.

## Copy Modes

Fixed mode:

```bash
COPY_MODE=fixed
FIXED_BUY_AMOUNT_USD=5
FIXED_SELL_AMOUNT_USD=5
```

Percentage mode:

```bash
COPY_MODE=percentage
COPY_PERCENTAGE=0.10
```

For buys, percentage mode copies a percentage of the followed trade's USD notional. For sells, it copies a percentage of the followed sell shares, capped by your locally tracked position.

## Risk Controls

```bash
MIN_ORDER_USD=1
MAX_ORDER_USD=25
MAX_POSITION_USD_PER_TOKEN=100
DAILY_MAX_NOTIONAL_USD=250
ORDER_TYPE=FAK
PRICE_PROTECTION_BPS=0
```

`FAK` allows partial fills and cancels the rest. `FOK` requires the full order to fill or fail.

`PRICE_PROTECTION_BPS=0` lets the CLOB client estimate the marketable worst price. If set, buy orders get a worst-price limit above the followed fill price, and sells get one below it.

## State

State is stored in:

```text
./data/state.json
```

Positions are approximate because market orders can partially fill. For production use, add a periodic reconciliation job against the Data API `/positions` endpoint for `POLYMARKET_DEPOSIT_WALLET`.

## File Map

```text
src/config.ts                  .env parsing and safety checks
src/index.ts                   main polling loop
src/polymarket/dataApi.ts      direct public Data API reads
src/watchers/walletWatcher.ts  multi-wallet activity polling
src/polymarket/tradeParser.ts  activity event normalization
src/strategy/copyStrategy.ts   fixed/percentage copy sizing
src/strategy/riskManager.ts    min/max, daily, and position limits
src/polymarket/orderExecutor.ts dry-run/live execution
src/storage/stateStore.ts      local JSON state
```
