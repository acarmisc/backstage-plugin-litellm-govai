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

export interface UserContext {
  userId: string;
  email: string;
  entityRef: string;
}