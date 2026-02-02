// Position and Market Types - Position caps and market management

export enum MarketStatus {
  OPEN = 'open',
  CLOSED = 'closed',
  SETTLED = 'settled',
}

export interface Market {
  id: string;
  externalId: string; // Kalshi market ticker
  title: string;
  category?: string;
  status: MarketStatus;
  closeTime?: Date;
  settlementTime?: Date;
  maxPositionSize: number;
  maxNotional: number;
  currentPosition: number;
  riskTier: number; // 1=low, 2=medium, 3=high
  createdAt: Date;
  updatedAt: Date;
}

export interface Position {
  id: string;
  marketId: string;
  side: 'yes' | 'no';
  quantity: number;
  avgPrice: number;
  realizedPnl: number;
  unrealizedPnl: number;
  createdAt: Date;
  updatedAt: Date;
}

export enum CapType {
  ABSOLUTE = 'absolute',     // Max number of contracts
  PERCENTAGE = 'percentage', // Max % of portfolio
  NOTIONAL = 'notional',     // Max dollar exposure
}

export interface PositionCap {
  id: string;
  marketId?: string; // null = global cap
  capType: CapType;
  softLimit: number;
  hardLimit: number;
  currentValue: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PositionCapCheckRequest {
  marketId: string;
  side: 'yes' | 'no';
  quantity: number;
  price: number;
}

export interface PositionCapCheckResult {
  allowed: boolean;
  reason?: string;
  caps: {
    type: CapType;
    current: number;
    softLimit: number;
    hardLimit: number;
    wouldExceedSoft: boolean;
    wouldExceedHard: boolean;
  }[];
}

// Risk tier multipliers for position sizing
export const RISK_TIER_MULTIPLIERS: Record<number, number> = {
  1: 1.0,   // Low risk - full position allowed
  2: 0.5,   // Medium risk - 50% position
  3: 0.25,  // High risk - 25% position
};

export interface CreateMarketRequest {
  externalId: string;
  title: string;
  category?: string;
  maxPositionSize?: number;
  maxNotional?: number;
  riskTier?: number;
}

export interface UpdateMarketRequest {
  maxPositionSize?: number;
  maxNotional?: number;
  riskTier?: number;
  status?: MarketStatus;
}
