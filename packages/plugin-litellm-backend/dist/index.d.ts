import * as _backstage_backend_plugin_api from '@backstage/backend-plugin-api';
import { HttpAuthService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import express from 'express';
import { Logger } from 'winston';

declare const _default: _backstage_backend_plugin_api.BackendFeature;

interface RouterOptions {
    config: Config;
    httpAuth: HttpAuthService;
    logger: Logger;
}
declare function createRouter(options: RouterOptions): Promise<express.Router>;

interface LiteLLMKey {
    key_alias: string;
    spend: number;
    models: string[];
    expires: string | null;
}
interface LiteLLMUserInfo {
    user_id: string;
    spend: number;
    keys: LiteLLMKey[];
}
interface LiteLLMTeam {
    team_id: string;
    team_alias: string;
}
interface LiteLLMDailyActivity {
    date: string;
    spend: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}
interface UserContext {
    userId: string;
    email: string;
    entityRef: string;
}

declare class LiteLLMClient {
    private baseUrl;
    private masterKey;
    constructor(config: Config);
    private request;
    getUserInfo(userId: string): Promise<LiteLLMUserInfo>;
    listTeams(): Promise<{
        teams: LiteLLMTeam[];
    }>;
    getDailyActivity(userId: string, days?: number): Promise<LiteLLMDailyActivity[]>;
}

export { LiteLLMClient, createRouter, _default as default };
export type { LiteLLMDailyActivity, LiteLLMKey, LiteLLMTeam, LiteLLMUserInfo, RouterOptions, UserContext };
