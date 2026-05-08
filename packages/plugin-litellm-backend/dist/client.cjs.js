'use strict';

class LiteLLMClient {
  baseUrl;
  masterKey;
  constructor(config) {
    const litellmConfig = config.getOptional("litellm");
    this.baseUrl = litellmConfig?.baseUrl ?? "";
    this.masterKey = litellmConfig?.masterKey ?? "";
  }
  async request(endpoint, queryParams) {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.masterKey}`,
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LiteLLM API error (${response.status}): ${error}`);
    }
    return response.json();
  }
  async getUserInfo(userId) {
    return this.request("/user/info", { user_id: userId });
  }
  async listTeams() {
    return this.request("/team/list");
  }
  async getDailyActivity(userId, days = 7) {
    return this.request("/user/daily/activity", {
      user_id: userId,
      days: days.toString()
    });
  }
}

exports.LiteLLMClient = LiteLLMClient;
//# sourceMappingURL=client.cjs.js.map
