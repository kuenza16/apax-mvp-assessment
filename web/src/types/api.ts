export const METAL_ASSET_TYPES = ["gold", "silver", "platinum"] as const;
export type MetalAssetType = typeof METAL_ASSET_TYPES[number];
export type Holdings = Record<MetalAssetType, number>;

export interface HoldingsResponse {
  success: true;
  holdings: Holdings;
}

export interface Deposit {
  id: number;
  user: string;
  amount: number;
  date: string;
}

export interface Withdrawal {
  id: number;
  user: string;
  amount: number;
  date: string;
}
