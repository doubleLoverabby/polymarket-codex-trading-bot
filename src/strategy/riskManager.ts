import type { BotConfig } from '../config.js';
import { StateStore } from '../storage/stateStore.js';
import type { PlannedOrder } from '../types.js';
import { roundSize } from '../utils/numbers.js';

export type RiskResult =
  | {
      allowed: true;
      order: PlannedOrder;
      notes: string[];
    }
  | {
      allowed: false;
      reason: string;
    };

export class RiskManager {
  constructor(
    private readonly config: BotConfig,
    private readonly store: StateStore,
  ) {}

  async check(order: PlannedOrder): Promise<RiskResult> {
    const notes: string[] = [];
    let adjusted = { ...order };

    if (adjusted.side === 'SELL') {
      const sellResult = await this.capSellToLocalPosition(adjusted);
      if (!sellResult.allowed) {
        return sellResult;
      }
      adjusted = sellResult.order;
      notes.push(...sellResult.notes);
    }

    const orderCapResult = this.applyOrderNotionalBounds(adjusted);
    if (!orderCapResult.allowed) {
      return orderCapResult;
    }
    adjusted = orderCapResult.order;
    notes.push(...orderCapResult.notes);

    const dailyResult = await this.checkDailyNotional(adjusted);
    if (!dailyResult.allowed) {
      return dailyResult;
    }
    adjusted = dailyResult.order;
    notes.push(...dailyResult.notes);

    if (adjusted.side === 'BUY') {
      const positionResult = await this.checkPositionLimit(adjusted);
      if (!positionResult.allowed) {
        return positionResult;
      }
      adjusted = positionResult.order;
      notes.push(...positionResult.notes);
    }

    return { allowed: true, order: adjusted, notes };
  }

  private applyOrderNotionalBounds(order: PlannedOrder): RiskResult {
    const notional = estimateNotionalUsd(order);

    if (notional < this.config.minOrderUsd) {
      return {
        allowed: false,
        reason: `Order notional ${notional.toFixed(4)} is below MIN_ORDER_USD.`,
      };
    }

    if (this.config.maxOrderUsd <= 0 || notional <= this.config.maxOrderUsd) {
      return { allowed: true, order, notes: [] };
    }

    const adjusted = resizeOrderByNotional(order, this.config.maxOrderUsd);
    return {
      allowed: true,
      order: adjusted,
      notes: [`Capped order notional to MAX_ORDER_USD=${this.config.maxOrderUsd}.`],
    };
  }

  private async checkDailyNotional(order: PlannedOrder): Promise<RiskResult> {
    if (this.config.dailyMaxNotionalUsd <= 0) {
      return { allowed: true, order, notes: [] };
    }

    const spentToday = await this.store.getDailyNotional();
    const notional = estimateNotionalUsd(order);
    const remaining = this.config.dailyMaxNotionalUsd - spentToday;

    if (remaining < this.config.minOrderUsd) {
      return {
        allowed: false,
        reason: 'Daily notional limit is already exhausted.',
      };
    }

    if (notional <= remaining) {
      return { allowed: true, order, notes: [] };
    }

    return {
      allowed: true,
      order: resizeOrderByNotional(order, remaining),
      notes: [`Capped order to remaining daily notional ${remaining.toFixed(4)} USD.`],
    };
  }

  private async checkPositionLimit(order: PlannedOrder): Promise<RiskResult> {
    if (this.config.maxPositionUsdPerToken <= 0) {
      return { allowed: true, order, notes: [] };
    }

    const current = await this.store.getPosition(order.tokenId);
    const currentNotional = current?.notionalUsd ?? 0;
    const remaining = this.config.maxPositionUsdPerToken - currentNotional;

    if (remaining < this.config.minOrderUsd) {
      return {
        allowed: false,
        reason: 'Token position limit is already exhausted.',
      };
    }

    const amountUsd = order.amountUsd ?? 0;
    if (amountUsd <= remaining) {
      return { allowed: true, order, notes: [] };
    }

    return {
      allowed: true,
      order: { ...order, amountUsd: roundSize(remaining) },
      notes: [`Capped buy to remaining per-token exposure ${remaining.toFixed(4)} USD.`],
    };
  }

  private async capSellToLocalPosition(order: PlannedOrder): Promise<RiskResult> {
    const current = await this.store.getPosition(order.tokenId);
    if (!current || current.shares <= 0) {
      return {
        allowed: false,
        reason: 'No local position recorded for sell follow.',
      };
    }

    const requestedShares = order.shares ?? 0;
    const shares = Math.min(requestedShares, current.shares);
    const adjusted = { ...order, shares: roundSize(shares) };
    const notes =
      shares < requestedShares
        ? [`Capped sell shares to local position ${current.shares.toFixed(6)}.`]
        : [];

    return { allowed: true, order: adjusted, notes };
  }
}

function estimateNotionalUsd(order: PlannedOrder): number {
  if (order.side === 'BUY') {
    return order.amountUsd ?? 0;
  }

  return (order.shares ?? 0) * order.targetPrice;
}

function resizeOrderByNotional(order: PlannedOrder, notionalUsd: number): PlannedOrder {
  if (order.side === 'BUY') {
    return { ...order, amountUsd: roundSize(notionalUsd) };
  }

  return {
    ...order,
    shares: roundSize(notionalUsd / order.targetPrice),
  };
}
