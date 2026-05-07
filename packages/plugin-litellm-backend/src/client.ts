import { Config } from './types';
import type {
  LiteLLMUserInfo,
  LiteLLMTeam,
  LiteLLMDailyActivity,
} from './types';

export class LiteLLMClient {
  private baseUrl: string;
  private masterKey: string;

  constructor(config: Config) {
    this.baseUrl = config.litellm.baseUrl;
    this.masterKey = config.litellm.masterKey;
  }

  private async request<T>(endpoint: string, queryParams?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.masterKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LiteLLM API error (${response.status}): ${error}`);
    }

    return response.json();
  }

  async getUserInfo(userId: string): Promise<LiteLLMUserInfo> {
    return this.request<LiteLLMUserInfo>('/user/info', { user_id: userId });
  }

  async listTeams(): Promise<{ teams: LiteLLMTeam[] }> {
    return this.request<{ teams: LiteLLMTeam[] }>('/team/list');
  }

  async getDailyActivity(userId: string, days: number = 7): Promise<LiteLLMDailyActivity[]> {
    return this.request<LiteLLMDailyActivity[]>('/user/daily/activity', {
      user_id: userId,
      days: days.toString(),
    });
  }
}