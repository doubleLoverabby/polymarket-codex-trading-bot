import type { BotConfig } from '../config.js';
import { activityToFollowedTrade } from '../polymarket/tradeParser.js';
import type { DataApiClient } from '../polymarket/dataApi.js';
import type { FollowedTrade } from '../types.js';
import { Logger } from '../utils/logger.js';
import { StateStore } from '../storage/stateStore.js';

export class WalletWatcher {
  private readonly logger = new Logger('wallet-watcher');

  constructor(
    private readonly client: DataApiClient,
    private readonly store: StateStore,
    private readonly config: BotConfig,
  ) {}

  async poll(): Promise<FollowedTrade[]> {
    const trades: FollowedTrade[] = [];
    const start = Math.floor(
      (Date.now() - this.config.startLookbackMinutes * 60_000) / 1000,
    );

    for (const wallet of this.config.watchedWallets) {
      try {
        const activities = await this.client.listTradeActivity({
          user: wallet,
          limit: this.config.activityPageSize,
          start,
        });

        for (const activity of activities) {
          const trade = activityToFollowedTrade(activity);
          if (!trade) {
            continue;
          }

          if (await this.store.hasSeen(wallet, trade.id)) {
            continue;
          }

          trades.push(trade);
        }
      } catch (error) {
        this.logger.error('Failed to poll wallet activity', {
          wallet,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return trades.sort((left, right) => left.timestamp - right.timestamp);
  }
}
