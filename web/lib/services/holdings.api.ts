import { baseAPI, ApiError } from './base.api';
import type { HoldingsResponse } from '../../src/types/api';

export async function holdingsApi(signal?: AbortSignal): Promise<HoldingsResponse> {
  const data = await baseAPI<HoldingsResponse>('/api/holdings', 'GET', undefined, { signal });
  if (!data.holdings || !['gold', 'silver', 'platinum'].every(asset => {
    const value = data.holdings[asset as keyof HoldingsResponse['holdings']];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  })) throw new ApiError('Unable to load portfolio holdings. Invalid server response.', 502);
  return data;
}
