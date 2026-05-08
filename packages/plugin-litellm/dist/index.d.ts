import * as _backstage_core_plugin_api from '@backstage/core-plugin-api';
import * as _backstage_frontend_plugin_api from '@backstage/frontend-plugin-api';
import * as react_jsx_runtime from 'react/jsx-runtime';

declare const litellmPlugin: _backstage_core_plugin_api.BackstagePlugin<{
    root: _backstage_core_plugin_api.RouteRef<undefined>;
}, {}>;

declare const liteLLMRouteRef: _backstage_core_plugin_api.RouteRef<undefined>;

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
    context: {
        userId: string;
        email: string;
        entityRef: string;
    };
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
interface LiteLLMApi {
    getUserInfo(): Promise<LiteLLMUserInfo>;
    getTeams(): Promise<{
        teams: LiteLLMTeam[];
    }>;
    getUsage(days?: number): Promise<{
        usage: LiteLLMDailyActivity[];
    }>;
}
declare const litellmApiRef: _backstage_frontend_plugin_api.ApiRef<LiteLLMApi>;

declare function LiteLLMPage(): react_jsx_runtime.JSX.Element;

export { LiteLLMPage, litellmPlugin as default, liteLLMRouteRef, litellmApiRef, litellmPlugin };
export type { LiteLLMApi, LiteLLMDailyActivity, LiteLLMKey, LiteLLMTeam, LiteLLMUserInfo };
