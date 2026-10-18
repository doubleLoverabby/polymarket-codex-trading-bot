import { Side, type OrderResponse } from '@polymarket/clob-client-v2';
import type { BotConfig } from '../config.js';
import type { SecurePolymarketClient } from './clients.js';
import type { ExecutionResult, FollowedTrade, PlannedOrder } from '../types.js';
import { Logger } from '../utils/logger.js';

export class OrderExecutor {
  private readonly logger = new Logger('order-executor');

  constructor(
    private readonly config: BotConfig,
    private readonly secureClient?: SecurePolymarketClient,
  ) {}

  async execute(
    plannedOrder: PlannedOrder,
    sourceTrade: FollowedTrade,
  ): Promise<ExecutionResult> {
    if (this.config.dryRun) {
      this.logger.info('Dry-run order', { plannedOrder, sourceTrade });
      return {
        mode: 'dry-run',
        ok: true,
        plannedOrder,
        sourceTrade,
        executedAt: new Date().toISOString(),
      };
    }

    if (!this.secureClient) {
      return {
        mode: 'live',
        ok: false,
        plannedOrder,
        sourceTrade,
        error: 'Secure client is not initialized.',
        executedAt: new Date().toISOString(),
      };
    }

    try {
      const marketOptions = {
        tickSize: await this.secureClient.getTickSize(plannedOrder.tokenId),
        negRisk: await this.secureClient.getNegRisk(plannedOrder.tokenId),
      };
      const response =
        plannedOrder.side === 'BUY'
          ? await this.secureClient.createAndPostMarketOrder(
              {
                tokenID: plannedOrder.tokenId,
                side: Side.BUY,
                amount: requireAmount(plannedOrder.amountUsd),
                orderType: plannedOrder.orderType,
                ...(plannedOrder.maxPrice === undefined
                  ? {}
                  : { price: plannedOrder.maxPrice }),
              },
              marketOptions,
              plannedOrder.orderType,
            )
          : await this.secureClient.createAndPostMarketOrder(
              {
                tokenID: plannedOrder.tokenId,
                side: Side.SELL,
                amount: requireAmount(plannedOrder.shares),
                orderType: plannedOrder.orderType,
                ...(plannedOrder.minPrice === undefined
                  ? {}
                  : { price: plannedOrder.minPrice }),
              },
              marketOptions,
              plannedOrder.orderType,
            );

      this.logger.info('Live order response', { plannedOrder, response });
      const normalizedResponse = response as OrderResponse;

      return {
        mode: 'live',
        ok: normalizedResponse.success,
        plannedOrder,
        sourceTrade,
        response: normalizedResponse,
        executedAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Live order failed', { plannedOrder, error: message });

      return {
        mode: 'live',
        ok: false,
        plannedOrder,
        sourceTrade,
        error: message,
        executedAt: new Date().toISOString(),
      };
    }
  }
}

function requireAmount(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid order amount: ${value}`);
  }

  return value;
}
