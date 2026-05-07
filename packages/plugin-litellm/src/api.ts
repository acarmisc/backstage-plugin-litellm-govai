import { createApiRef } from '@backstage/core-plugin-api';

export interface LiteLLMKey {
  key_alias: string;
  spend: number;
  models: string[];
  expires: string | null;
}

export interface LiteLLMUserInfo {
  user_id: string;
  spend: number;
  keys: LiteLLMKey[];
  context: {
    userId: string;
    email: string;
    entityRef: string;
  };
}

export interface LiteLLMTeam {
  team_id: string;
  team_alias: string;
}

export interface LiteLLMDailyActivity {
  date: string;
  spend: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface LiteLLMApi {
  getUserInfo(): Promise<LiteLLMUserInfo>;
  getTeams(): Promise<{ teams: LiteLLMTeam[] }>;
  getUsage(days?: number): Promise<{ usage: LiteLLMDailyActivity[] }>;
}

export const litellmApiRef = createApiRef<LiteLLMApi>({
  id: 'plugin.litellm.service',
});

export class DefaultLiteLLMApi implements LiteLLMApi {
  async getUserInfo(): Promise<LiteLLMUserInfo> {
    const response = await fetch('/api/litellm/info');
    if (!response.ok) {
      throw new Error(`Failed to fetch user info: ${response.statusText}`);
    }
    return response.json();
  }

  async getTeams(): Promise<{ teams: LiteLLMTeam[] }> {
    const response = await fetch('/api/litellm/teams');
    if (!response.ok) {
      throw new Error(`Failed to fetch teams: ${response.statusText}`);
    }
    return response.json();
  }

  async getUsage(days: number = 7): Promise<{ usage: LiteLLMDailyActivity[] }> {
    const response = await fetch(`/api/litellm/usage?days=${days}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch usage: ${response.statusText}`);
    }
    return response.json();
  }
}