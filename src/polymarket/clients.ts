import { Chain, ClobClient, SignatureTypeV2 } from '@polymarket/clob-client-v2';
import type { BotConfig } from '../config.js';
import { createWalletClient, http, type WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon, polygonAmoy } from 'viem/chains';

export type SecurePolymarketClient = ClobClient;

export async function makeSecureClient(
  config: BotConfig,
): Promise<SecurePolymarketClient> {
  if (!config.privateKey) {
    throw new Error('Missing private key for live trading.');
  }

  const signer = makeWalletClient(config);
  const authClient = new ClobClient({
    host: config.clobHost,
    chain: config.chainId,
    signer,
    throwOnError: true,
  });
  const creds = config.clobApiCreds ?? (await authClient.createOrDeriveApiKey());

  return new ClobClient({
    host: config.clobHost,
    chain: config.chainId,
    signer,
    creds,
    signatureType: config.signatureType,
    ...(config.signatureType === SignatureTypeV2.EOA
      ? {}
      : { funderAddress: config.depositWallet }),
    retryOnError: true,
    throwOnError: true,
  });
}

function makeWalletClient(config: BotConfig): WalletClient {
  const account = privateKeyToAccount(toHexPrivateKey(config.privateKey));

  return createWalletClient({
    account,
    chain: config.chainId === Chain.AMOY ? polygonAmoy : polygon,
    transport: http(config.polygonRpcUrl),
  });
}

function toHexPrivateKey(value: string | undefined): `0x${string}` {
  if (!value?.startsWith('0x')) {
    throw new Error('POLYMARKET_PRIVATE_KEY must be a 0x-prefixed private key.');
  }

  return value as `0x${string}`;
}
