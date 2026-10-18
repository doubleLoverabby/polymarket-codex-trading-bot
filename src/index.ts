import process from 'node:process';
import { loadConfig } from './config.js';
import { makeSecureClient } from './polymarket/clients.js';
import { DataApiClient } from './polymarket/dataApi.js';
import { OrderExecutor } from './polymarket/orderExecutor.js';
import { CopyStrategy } from './strategy/copyStrategy.js';
import { RiskManager } from './strategy/riskManager.js';
import { StateStore } from './storage/stateStore.js';
import type { FollowedTrade, PlannedOrder } from './types.js';
import { Logger } from './utils/logger.js';
import { WalletWatcher } from './watchers/walletWatcher.js';

const logger = new Logger('main');

async function main(): Promise<void> {
  const config = loadConfig();
  const store = new StateStore(config.dataDir, config.stateFile);
  await store.load();

  const dataClient = new DataApiClient(config.dataApiBaseUrl);
  const secureClient = config.dryRun ? undefined : await makeSecureClient(config);
  const watcher = new WalletWatcher(dataClient, store, config);
  const strategy = new CopyStrategy(config);
  const riskManager = new RiskManager(config, store);
  const executor = new OrderExecutor(config, secureClient);
  const runOnce = parseRunOnce(config.mode);

  let stopping = false;
  const stop = (): void => {
    stopping = true;
    logger.info('Shutdown requested; finishing current tick.');
  };

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  logger.info('Copybot started', {
    mode: config.mode,
    dryRun: config.dryRun,
    watchedWallets: config.watchedWallets,
    copyMode: config.copyMode,
    orderType: config.orderType,
    dataApiBaseUrl: config.dataApiBaseUrl,
    clobHost: config.clobHost,
    stateFile: store.path,
  });

  while (!stopping) {
    await runTick({ watcher, strategy, riskManager, executor, store });

    if (runOnce) {
      logger.info('Single-run mode; exiting after one poll.');
      return;
    }

    await sleep(config.pollIntervalMs);
  }
}

async function runTick(deps: {
  watcher: WalletWatcher;
  strategy: CopyStrategy;
  riskManager: RiskManager;
  executor: OrderExecutor;
  store: StateStore;
}): Promise<void> {
  const trades = await deps.watcher.poll();

  if (trades.length === 0) {
    logger.debug('No new followed trades.');
    return;
  }

  logger.info('Processing followed trades', { count: trades.length });

  for (const trade of trades) {
    try {
      await processTrade(trade, deps);
    } catch (error) {
      logger.error('Unexpected trade processing failure', {
        trade,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await deps.store.markSeen(trade.wallet, trade.id);
    }
  }
}

async function processTrade(
  trade: FollowedTrade,
  deps: {
    strategy: CopyStrategy;
    riskManager: RiskManager;
    executor: OrderExecutor;
    store: StateStore;
  },
): Promise<void> {
  const decision = deps.strategy.decide(trade);

  if (decision.action === 'skip') {
    logger.info('Strategy skipped trade', {
      reason: decision.reason,
      trade: summarizeTrade(trade),
    });
    return;
  }

  const risk = await deps.riskManager.check(decision.order);

  if (!risk.allowed) {
    logger.info('Risk manager skipped order', {
      reason: risk.reason,
      trade: summarizeTrade(trade),
      plannedOrder: decision.order,
    });
    return;
  }

  const order = attachRiskNotes(risk.order, risk.notes);
  const result = await deps.executor.execute(order, trade);
  await deps.store.recordExecution(result);
}

function attachRiskNotes(order: PlannedOrder, notes: string[]): PlannedOrder {
  if (notes.length === 0) {
    return order;
  }

  return {
    ...order,
    reason: `${order.reason}; ${notes.join(' ')}`,
  };
}

function summarizeTrade(trade: FollowedTrade): Record<string, unknown> {
  return {
    wallet: trade.wallet,
    side: trade.side,
    title: trade.title,
    outcome: trade.outcome,
    amountUsd: trade.amountUsd,
    shares: trade.shares,
    price: trade.price,
    transactionHash: trade.transactionHash,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRunOnce(defaultMode: 'test' | 'live'): boolean {
  if (process.env.RUN_ONCE === undefined) {
    return defaultMode === 'test';
  }

  return ['1', 'true', 'yes', 'y'].includes(
    process.env.RUN_ONCE.toLowerCase(),
  );
}

main().catch((error) => {
  logger.error('Fatal startup/runtime error', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
