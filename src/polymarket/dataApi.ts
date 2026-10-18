import type { RawActivity } from '../types.js';

export class DataApiClient {
  constructor(private readonly baseUrl: string) {}

  async listTradeActivity(params: {
    user: string;
    limit: number;
    start: number;
  }): Promise<RawActivity[]> {
    const url = new URL('/activity', this.baseUrl);
    url.searchParams.set('user', params.user);
    url.searchParams.set('limit', String(params.limit));
    url.searchParams.set('sortBy', 'TIMESTAMP');
    url.searchParams.set('sortDirection', 'DESC');
    url.searchParams.set('type', 'TRADE');

    if (params.start > 0) {
      url.searchParams.set('start', String(params.start));
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Data API ${response.status}: ${await response.text()}`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error('Data API returned a non-array activity payload.');
    }

    return payload as RawActivity[];
  }
}
