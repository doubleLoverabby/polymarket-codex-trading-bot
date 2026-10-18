import type { FollowedTrade, RawActivity, TradeSide } from '../types.js';

export function activityToFollowedTrade(
  activity: RawActivity,
): FollowedTrade | null {
  if (activity.type && activity.type !== 'TRADE') {
    return null;
  }

  if (activity.isCombo) {
    return null;
  }

  const side = normalizeSide(activity.side);
  const wallet = activity.proxyWallet ?? activity.wallet;
  const tokenId = normalizeText(activity.asset);
  const conditionId = normalizeText(activity.conditionId);
  const transactionHash = normalizeText(activity.transactionHash);
  const timestamp = normalizeTimestamp(activity.timestamp);
  const shares = Number(activity.size);
  const amountUsd = Number(activity.usdcSize);
  const price = Number(activity.price);

  if (
    !side ||
    !wallet ||
    !tokenId ||
    !conditionId ||
    !transactionHash ||
    timestamp === undefined ||
    !Number.isFinite(shares) ||
    !Number.isFinite(amountUsd) ||
    !Number.isFinite(price)
  ) {
    return null;
  }

  return {
    id: [
      wallet,
      transactionHash,
      tokenId,
      side,
      shares,
      price,
      timestamp,
    ].join(':'),
    wallet,
    transactionHash,
    timestamp,
    side,
    tokenId,
    conditionId,
    title: normalizeText(activity.title) ?? 'Untitled market',
    slug: normalizeText(activity.slug) ?? '',
    outcome: normalizeText(activity.outcome) ?? '',
    shares,
    amountUsd,
    price,
  };
}

function normalizeSide(value: RawActivity['side']): TradeSide | undefined {
  if (value === 'BUY' || value === 'SELL') {
    return value;
  }

  return undefined;
}

function normalizeText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeTimestamp(
  value: number | string | null | undefined,
): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed < 1_000_000_000_000 ? parsed * 1000 : parsed;
}
