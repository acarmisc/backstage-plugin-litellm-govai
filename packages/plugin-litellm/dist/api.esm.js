import { createApiRef } from '@backstage/core-plugin-api';

const litellmApiRef = createApiRef({
  id: "plugin.litellm.service"
});
class DefaultLiteLLMApi {
  async getUserInfo() {
    const response = await fetch("/api/litellm/info");
    if (!response.ok) {
      throw new Error(`Failed to fetch user info: ${response.statusText}`);
    }
    return response.json();
  }
  async getTeams() {
    const response = await fetch("/api/litellm/teams");
    if (!response.ok) {
      throw new Error(`Failed to fetch teams: ${response.statusText}`);
    }
    return response.json();
  }
  async getUsage(days = 7) {
    const response = await fetch(`/api/litellm/usage?days=${days}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch usage: ${response.statusText}`);
    }
    return response.json();
  }
}

export { DefaultLiteLLMApi, litellmApiRef };
//# sourceMappingURL=api.esm.js.map
