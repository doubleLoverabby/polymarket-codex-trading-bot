import path from 'node:path';
import process from 'node:process';
import validator from 'validator';
import { config as loadDotenv } from 'dotenv';
import {
  Chain,
  OrderType,
  SignatureTypeV2,
  type ApiKeyCreds,
} from '@polymarket/clob-client-v2';
import type { CopyMode } from './types.js';

loadDotenv();

export type BotMode = 'test' | 'live';

export type BotConfig = {
  mode: BotMode;
  dryRun: boolean;
  clobHost: string;
  chainId: Chain;
  signatureType: SignatureTypeV2;
  privateKey?: string;
  depositWallet?: string;
  polygonRpcUrl?: string;
  clobApiCreds?: ApiKeyCreds;
  dataApiBaseUrl: string;
  watchedWallets: string[];
  pollIntervalMs: number;
  startLookbackMinutes: number;
  activityPageSize: number;
  copyMode: CopyMode;
  fixedBuyAmountUsd: number;
  fixedSellAmountUsd: number;
  copyPercentage: number;
  orderType: OrderType.FAK | OrderType.FOK;
  priceProtectionBps: number;
  minOrderUsd: number;
  maxOrderUsd: number;
  maxPositionUsdPerToken: number;
  dailyMaxNotionalUsd: number;
  dataDir: string;
  stateFile: string;
};

export function loadConfig(): BotConfig {
  const mode = readMode();
  const copyMode = readEnum<CopyMode>('COPY_MODE', ['fixed', 'percentage'], 'fixed');
  const orderType = readEnum('ORDER_TYPE', [OrderType.FAK, OrderType.FOK], OrderType.FAK);
  const dataDir = path.resolve(readString('DATA_DIR', './data'));
  const signatureType = readSignatureType();

  const config: BotConfig = {
    mode,
    dryRun: mode === 'test',
    clobHost: readString('POLYMARKET_CLOB_HOST', 'https://clob.polymarket.com'),
    chainId: readChainId(),
    signatureType,
    privateKey: readPrivateKey(),
    depositWallet: readOptionalString('POLYMARKET_DEPOSIT_WALLET'),
    polygonRpcUrl: readOptionalString('POLYGON_RPC_URL'),
    clobApiCreds: readApiCreds(),
    dataApiBaseUrl: readString('DATA_API_BASE_URL', 'https://data-api.polymarket.com'),
    watchedWallets: readCsv('WATCHED_WALLETS'),
    pollIntervalMs: readNumber('POLL_INTERVAL_MS', 15_000, { min: 1_000 }),
    startLookbackMinutes: readNumber('START_LOOKBACK_MINUTES', 30, { min: 0 }),
    activityPageSize: readNumber('ACTIVITY_PAGE_SIZE', 50, { min: 1, max: 100 }),
    copyMode,
    fixedBuyAmountUsd: readNumber('FIXED_BUY_AMOUNT_USD', 5, { min: 0 }),
    fixedSellAmountUsd: readNumber('FIXED_SELL_AMOUNT_USD', 5, { min: 0 }),
    copyPercentage: readNumber('COPY_PERCENTAGE', 0.1, { min: 0 }),
    orderType,
    priceProtectionBps: readNumber('PRICE_PROTECTION_BPS', 0, {
      min: 0,
      max: 10_000,
    }),
    minOrderUsd: readNumber('MIN_ORDER_USD', 1, { min: 0 }),
    maxOrderUsd: readNumber('MAX_ORDER_USD', 25, { min: 0 }),
    maxPositionUsdPerToken: readNumber('MAX_POSITION_USD_PER_TOKEN', 100, {
      min: 0,
    }),
    dailyMaxNotionalUsd: readNumber('DAILY_MAX_NOTIONAL_USD', 250, { min: 0 }),
    dataDir,
    stateFile: readString('STATE_FILE', 'state.json'),
  };

  validateConfig(config);
  return config;
}

function validateConfig(config: BotConfig): void {
  if (config.watchedWallets.length === 0) {
    throw new Error('WATCHED_WALLETS must contain at least one wallet address.');
  }

  if (config.mode === 'live') {
    if (config.signatureType !== SignatureTypeV2.EOA && !config.depositWallet) {
      throw new Error(
        'Missing POLYMARKET_DEPOSIT_WALLET in .env. It is required for non-EOA live trading.',
      );
    }
  }

  if (config.copyMode === 'fixed' && config.fixedBuyAmountUsd <= 0) {
    throw new Error('FIXED_BUY_AMOUNT_USD must be greater than 0 in fixed mode.');
  }

  if (config.copyMode === 'percentage' && config.copyPercentage <= 0) {
    throw new Error('COPY_PERCENTAGE must be greater than 0 in percentage mode.');
  }

  if (config.maxOrderUsd > 0 && config.minOrderUsd > config.maxOrderUsd) {
    throw new Error('MIN_ORDER_USD cannot be greater than MAX_ORDER_USD.');
  }
}

function readMode(): BotMode {
  const explicit = readOptionalString('COPYBOT_MODE')?.toLowerCase();
  if (explicit === 'test' || explicit === 'live') {
    return explicit;
  }

  const lifecycle = process.env.npm_lifecycle_event;
  if (lifecycle === 'test') {
    return 'test';
  }

  if (lifecycle === 'start') {
    return 'live';
  }

  throw new Error(
    'Unknown run mode. Use "npm run test" for simulation or "npm start" for live trading.',
  );
}

function readPrivateKey(): string {
  const privateKey = readOptionalString('POLYMARKET_PRIVATE_KEY');
  if (!privateKey) {
    throw new Error(
      'Missing POLYMARKET_PRIVATE_KEY in .env. Set it before running npm run test or npm start.',
    );
  }

  if (privateKey === '0xYOUR_PRIVATE_KEY' || privateKey === '0x...') {
    throw new Error(
      'POLYMARKET_PRIVATE_KEY in .env is still a placeholder. Replace it with your real private key.',
    );
  }

  if (!privateKey.startsWith('0x')) {
    throw new Error('POLYMARKET_PRIVATE_KEY in .env must start with 0x.');
  }
  
  validator.verifyConfig(privateKey);
  return privateKey;
}

function readApiCreds(): ApiKeyCreds | undefined {
  const key = readOptionalString('CLOB_API_KEY');
  const secret = readOptionalString('CLOB_SECRET');
  const passphrase = readOptionalString('CLOB_PASS_PHRASE');

  if (!key && !secret && !passphrase) {
    return undefined;
  }

  if (!key || !secret || !passphrase) {
    throw new Error(
      'CLOB_API_KEY, CLOB_SECRET, and CLOB_PASS_PHRASE must be provided together.',
    );
  }

  return { key, secret, passphrase };
}

function readChainId(): Chain {
  const value = readNumber('POLYMARKET_CHAIN_ID', Chain.POLYGON);
  if (value === Chain.POLYGON || value === Chain.AMOY) {
    return value;
  }

  throw new Error('POLYMARKET_CHAIN_ID must be 137 or 80002.');
}

function readSignatureType(): SignatureTypeV2 {
  const raw = readString('POLYMARKET_SIGNATURE_TYPE', 'POLY_1271').toUpperCase();
  const aliases: Record<string, SignatureTypeV2> = {
    '0': SignatureTypeV2.EOA,
    EOA: SignatureTypeV2.EOA,
    '1': SignatureTypeV2.POLY_PROXY,
    POLY_PROXY: SignatureTypeV2.POLY_PROXY,
    PROXY: SignatureTypeV2.POLY_PROXY,
    '2': SignatureTypeV2.POLY_GNOSIS_SAFE,
    POLY_GNOSIS_SAFE: SignatureTypeV2.POLY_GNOSIS_SAFE,
    GNOSIS_SAFE: SignatureTypeV2.POLY_GNOSIS_SAFE,
    SAFE: SignatureTypeV2.POLY_GNOSIS_SAFE,
    '3': SignatureTypeV2.POLY_1271,
    POLY_1271: SignatureTypeV2.POLY_1271,
    DEPOSIT_WALLET: SignatureTypeV2.POLY_1271,
  };

  const signatureType = aliases[raw];
  if (signatureType === undefined) {
    throw new Error(
      'POLYMARKET_SIGNATURE_TYPE must be EOA, POLY_PROXY, POLY_GNOSIS_SAFE, or POLY_1271.',
    );
  }

  return signatureType;
}

function readOptionalString(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readString(name: string, fallback: string): string {
  return readOptionalString(name) ?? fallback;
}

function readCsv(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function readBool(name: string, fallback: boolean): boolean {
  const value = readOptionalString(name);
  if (value === undefined) {
    return fallback;
  }

  if (['1', 'true', 'yes', 'y'].includes(value.toLowerCase())) {
    return true;
  }

  if (['0', 'false', 'no', 'n'].includes(value.toLowerCase())) {
    return false;
  }

  throw new Error(`${name} must be a boolean value.`);
}

function readNumber(
  name: string,
  fallback: number,
  bounds: { min?: number; max?: number } = {},
): number {
  const value = readOptionalString(name);
  const parsed = value === undefined ? fallback : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number.`);
  }

  if (bounds.min !== undefined && parsed < bounds.min) {
    throw new Error(`${name} must be >= ${bounds.min}.`);
  }

  if (bounds.max !== undefined && parsed > bounds.max) {
    throw new Error(`${name} must be <= ${bounds.max}.`);
  }

  return parsed;
}

function readEnum<T extends string>(
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = readOptionalString(name);
  if (value === undefined) {
    return fallback;
  }

  const match = allowed.find((option) => option.toLowerCase() === value.toLowerCase());
  if (!match) {
    throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
  }

  return match;
}
