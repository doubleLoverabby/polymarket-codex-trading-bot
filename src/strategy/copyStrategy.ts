import type { BotConfig } from '../config.js';
import type { CopyDecision, FollowedTrade, PlannedOrder } from '../types.js';
import { clamp, isPositiveFinite, roundPrice, roundSize } from '../utils/numbers.js';

export class CopyStrategy {
  constructor(private readonly config: BotConfig) {}

  decide(sourceTrade: FollowedTrade): CopyDecision {
    if (sourceTrade.side === 'BUY') {
      return this.planBuy(sourceTrade);
    }

    return this.planSell(sourceTrade);
  }

  private planBuy(sourceTrade: FollowedTrade): CopyDecision {
    const rawAmountUsd =
      this.config.copyMode === 'fixed'
        ? this.config.fixedBuyAmountUsd
        : sourceTrade.amountUsd * this.config.copyPercentage;

    if (!isPositiveFinite(rawAmountUsd)) {
      return {
        action: 'skip',
        reason: `Calculated buy amount is not positive: ${rawAmountUsd}`,
        sourceTrade,
      };
    }

    const order: PlannedOrder = {
      side: 'BUY',
      tokenId: sourceTrade.tokenId,
      title: sourceTrade.title,
      outcome: sourceTrade.outcome,
      amountUsd: roundSize(rawAmountUsd),
      targetPrice: sourceTrade.price,
      orderType: this.config.orderType,
      reason:
        this.config.copyMode === 'fixed'
          ? `Fixed buy amount ${rawAmountUsd} USD`
          : `${this.config.copyPercentage * 100}% of followed buy notional`,
    };

    return {
      action: 'order',
      sourceTrade,
      order: this.applyPriceProtection(order),
    };
  }

  private planSell(sourceTrade: FollowedTrade): CopyDecision {
    const rawShares =
      this.config.copyMode === 'fixed'
        ? this.config.fixedSellAmountUsd / sourceTrade.price
        : sourceTrade.shares * this.config.copyPercentage;

    if (!isPositiveFinite(rawShares)) {
      return {
        action: 'skip',
        reason: `Calculated sell shares is not positive: ${rawShares}`,
        sourceTrade,
      };
    }

    const order: PlannedOrder = {
      side: 'SELL',
      tokenId: sourceTrade.tokenId,
      title: sourceTrade.title,
      outcome: sourceTrade.outcome,
      shares: roundSize(rawShares),
      targetPrice: sourceTrade.price,
      orderType: this.config.orderType,
      reason:
        this.config.copyMode === 'fixed'
          ? `Fixed sell notional ${this.config.fixedSellAmountUsd} USD`
          : `${this.config.copyPercentage * 100}% of followed sell shares`,
    };

    return {
      action: 'order',
      sourceTrade,
      order: this.applyPriceProtection(order),
    };
  }

  private applyPriceProtection(order: PlannedOrder): PlannedOrder {
    if (this.config.priceProtectionBps <= 0) {
      return order;
    }

    const multiplier = this.config.priceProtectionBps / 10_000;

    if (order.side === 'BUY') {
      return {
        ...order,
        maxPrice: roundPrice(clamp(order.targetPrice * (1 + multiplier), 0.01, 0.99)),
      };
    }

    return {
      ...order,
      minPrice: roundPrice(clamp(order.targetPrice * (1 - multiplier), 0.01, 0.99)),
    };
  }
}
