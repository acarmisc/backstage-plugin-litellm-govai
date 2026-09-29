/**
 * Build a link to the keys tab on the LiteLLM page.
 * @param baseUrl - The base URL of the LiteLLM module (result from useRouteRef)
 * @returns The full URL to the keys tab, or undefined if baseUrl is not available
 */
export function buildKeysLink(baseUrl: string | undefined): string | undefined {
  if (!baseUrl) {
    return undefined;
  }
  return `${baseUrl}?tab=keys`;
}
