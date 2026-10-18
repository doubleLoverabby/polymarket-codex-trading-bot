import type { OrderResponse, OrderType } from '@polymarket/clob-client-v2';

export type CopyMode = 'fixed' | 'percentage';

export type TradeSide = 'BUY' | 'SELL';

export type FollowedTrade = {
  id: string;
  wallet: string;
  transactionHash: string;
  timestamp: number;
  side: TradeSide;
  tokenId: string;
  conditionId: string;
  title: string;
  slug: string;
  outcome: string;
  shares: number;
  amountUsd: number;
  price: number;
};

export type RawActivity = {
  proxyWallet?: string | null;
  wallet?: string | null;
  timestamp?: number | string | null;
  conditionId?: string | null;
  type?: string | null;
  size?: number | string | null;
  usdcSize?: number | string | null;
  transactionHash?: string | null;
  price?: number | string | null;
  asset?: string | null;
  side?: TradeSide | string | null;
  isCombo?: boolean | null;
  outcomeIndex?: number | null;
  title?: string | null;
  slug?: string | null;
  icon?: string | null;
  eventSlug?: string | null;
  outcome?: string | null;
};

export type CopyDecision =
  | {
      action: 'skip';
      reason: string;
      sourceTrade: FollowedTrade;
    }
  | {
      action: 'order';
      sourceTrade: FollowedTrade;
      order: PlannedOrder;
    };

export type PlannedOrder = {
  side: TradeSide;
  tokenId: string;
  title: string;
  outcome: string;
  amountUsd?: number;
  shares?: number;
  targetPrice: number;
  maxPrice?: number;
  minPrice?: number;
  orderType: OrderType.FAK | OrderType.FOK;
  reason: string;
};

export type ExecutionMode = 'dry-run' | 'live';

export type ExecutionResult = {
  mode: ExecutionMode;
  ok: boolean;
  plannedOrder: PlannedOrder;
  sourceTrade: FollowedTrade;
  response?: OrderResponse;
  error?: string;
  executedAt: string;
};

export type PositionState = {
  tokenId: string;
  title: string;
  outcome: string;
  shares: number;
  averagePrice: number;
  notionalUsd: number;
  updatedAt: string;
};

export type BotState = {
  seenEventIds: Record<string, string[]>;
  positions: Record<string, PositionState>;
  dailyNotional: Record<string, number>;
  executions: ExecutionResult[];
};
