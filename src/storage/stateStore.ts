import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  BotState,
  ExecutionResult,
  PlannedOrder,
  PositionState,
} from '../types.js';
import { todayKey } from '../utils/numbers.js';

const MAX_SEEN_EVENTS_PER_WALLET = 2_000;
const MAX_EXECUTIONS = 1_000;

export class StateStore {
  private state: BotState | undefined;
  private readonly filePath: string;

  constructor(dataDir: string, stateFile: string) {
    this.filePath = path.join(dataDir, stateFile);
  }

  get path(): string {
    return this.filePath;
  }

  async load(): Promise<BotState> {
    if (this.state) {
      return this.state;
    }

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      this.state = JSON.parse(raw) as BotState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }

      this.state = {
        seenEventIds: {},
        positions: {},
        dailyNotional: {},
        executions: [],
      };
      await this.save();
    }

    return this.state;
  }

  async save(): Promise<void> {
    if (!this.state) {
      return;
    }

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, `${JSON.stringify(this.state, null, 2)}\n`);
    await fs.rename(tmpPath, this.filePath);
  }

  async hasSeen(wallet: string, eventId: string): Promise<boolean> {
    const state = await this.load();
    return state.seenEventIds[wallet.toLowerCase()]?.includes(eventId) ?? false;
  }

  async markSeen(wallet: string, eventId: string): Promise<void> {
    const state = await this.load();
    const key = wallet.toLowerCase();
    const ids = state.seenEventIds[key] ?? [];

    if (!ids.includes(eventId)) {
      ids.unshift(eventId);
      state.seenEventIds[key] = ids.slice(0, MAX_SEEN_EVENTS_PER_WALLET);
      await this.save();
    }
  }

  async getPosition(tokenId: string): Promise<PositionState | undefined> {
    const state = await this.load();
    return state.positions[tokenId];
  }

  async recordExecution(execution: ExecutionResult): Promise<void> {
    const state = await this.load();
    state.executions.unshift(execution);
    state.executions = state.executions.slice(0, MAX_EXECUTIONS);

    if (execution.ok) {
      const notional = execution.plannedOrder.amountUsd
        ?? ((execution.plannedOrder.shares ?? 0) * execution.plannedOrder.targetPrice);
      const day = todayKey();
      state.dailyNotional[day] = (state.dailyNotional[day] ?? 0) + notional;
      this.applyPositionUpdate(state, execution.plannedOrder);
    }

    await this.save();
  }

  async getDailyNotional(day = todayKey()): Promise<number> {
    const state = await this.load();
    return state.dailyNotional[day] ?? 0;
  }

  private applyPositionUpdate(state: BotState, order: PlannedOrder): void {
    const current = state.positions[order.tokenId] ?? {
      tokenId: order.tokenId,
      title: order.title,
      outcome: order.outcome,
      shares: 0,
      averagePrice: 0,
      notionalUsd: 0,
      updatedAt: new Date().toISOString(),
    };

    if (order.side === 'BUY') {
      const amountUsd = order.amountUsd ?? 0;
      const shares = amountUsd / order.targetPrice;
      const newShares = current.shares + shares;
      const newNotional = current.notionalUsd + amountUsd;
      state.positions[order.tokenId] = {
        ...current,
        shares: newShares,
        averagePrice: newShares > 0 ? newNotional / newShares : 0,
        notionalUsd: newNotional,
        updatedAt: new Date().toISOString(),
      };
      return;
    }

    const sharesToSell = Math.min(current.shares, order.shares ?? 0);
    const remainingShares = Math.max(0, current.shares - sharesToSell);
    const remainingNotional = remainingShares * current.averagePrice;

    state.positions[order.tokenId] = {
      ...current,
      shares: remainingShares,
      notionalUsd: remainingNotional,
      updatedAt: new Date().toISOString(),
    };
  }
}
