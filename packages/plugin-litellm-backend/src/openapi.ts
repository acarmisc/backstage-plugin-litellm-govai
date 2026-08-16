// OpenAPI 3.1 contract for the plugin's own backend surface.
//
// Kept as a TypeScript object so the router can serve it at
// GET /api/litellm/openapi.json without a YAML parser dependency, and so
// a future tool can regenerate the README endpoint table from it.
//
// Conventions:
//   - Every UI route authenticates via a Backstage user bearer token
//     (Authorization: Bearer <backstage-token>). The bridge routes use a
//     raw Keycloak access token instead and are gated by
//     litellm.bridge.enabled.
//   - Key-mutation routes 403 when the target key does not belong to the
//     caller (ownership guard; see router.ts authorizeKeyAction).

export interface OpenApiSpec {
  openapi: string;
  info: { title: string; version: string; description: string };
  servers: { url: string; description: string }[];
  tags: { name: string; description: string }[];
  paths: Record<string, Record<string, any>>;
  components: { securitySchemes: Record<string, any> };
}

export const openApiSpec: OpenApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'LiteLLM Governance Plugin API',
    version: '0.1.0',
    description:
      'Backstage backend surface for the LiteLLM governance plugin. ' +
      'UI routes authenticate via the Backstage identity system; CLI bridge ' +
      'routes authenticate with a Keycloak access token.',
  },
  servers: [
    { url: '/api/litellm', description: 'Backstage backend plugin mount point' },
  ],
  tags: [
    { name: 'System', description: 'Health and configuration' },
    { name: 'User', description: 'Current user info and provisioning' },
    { name: 'Keys', description: 'Virtual key lifecycle' },
    { name: 'Models', description: 'Model catalogue' },
    { name: 'Teams', description: 'Team membership and usage' },
    { name: 'Usage', description: 'Spend and traffic analytics' },
    { name: 'Audit', description: 'Audit logs (RBAC-gated)' },
    { name: 'Provisioning', description: 'Provisioning dry-run (RBAC-gated)' },
    { name: 'Bridge', description: 'CLI bridge (Keycloak-token auth)' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        responses: {
          '200': {
            description: 'Plugin health',
            content: { 'application/json': { schema: { type: 'object', properties: {
              status: { type: 'string' },
              provisioning: { type: 'boolean' },
            } } } },
          },
        },
      },
    },
    '/config': {
      get: {
        tags: ['System'],
        summary: 'Public LiteLLM proxy base URL (for snippet generation)',
        responses: {
          '200': {
            description: 'Proxy URL',
            content: { 'application/json': { schema: { type: 'object', properties: {
              baseUrl: { type: 'string' },
            } } } },
          },
        },
      },
    },
    '/openapi.json': {
      get: {
        tags: ['System'],
        summary: 'This OpenAPI document',
        responses: { '200': { description: 'OpenAPI 3.1 JSON' } },
      },
    },
    '/user/info': {
      get: {
        tags: ['User'],
        summary: "Get the current user's info and quotas",
        responses: {
          '200': { description: 'User info' },
          '404': { description: 'User not found in LiteLLM (provisioning disabled)' },
        },
      },
    },
    '/keys': {
      get: {
        tags: ['Keys'],
        summary: "List the caller's virtual keys",
        responses: { '200': { description: 'Array of keys' } },
      },
    },
    '/keys/generate': {
      post: {
        tags: ['Keys'],
        summary: 'Generate a new virtual key',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: {
            alias: { type: 'string' },
            models: { type: 'array', items: { type: 'string' } },
            team_id: { type: 'string' },
            duration: { type: 'string' },
            max_budget: { type: 'number', nullable: true, description: 'Positive number caps spend; null = unlimited' },
            tpm_limit: { type: 'number' },
            rpm_limit: { type: 'number' },
            auto_rotate: { type: 'boolean' },
            rotation_interval_days: { type: 'number' },
          } } } },
        },
        responses: {
          '200': { description: 'Generated key (includes the raw secret — shown once)' },
          '400': { description: 'Missing required fields' },
        },
      },
    },
    '/keys/{keyId}': {
      delete: {
        tags: ['Keys'],
        summary: 'Revoke/delete a virtual key (caller must own it)',
        parameters: [{ name: 'keyId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Deleted' }, '403': { description: 'Not the key owner' } },
      },
    },
    '/keys/{keyId}/regenerate': {
      post: {
        tags: ['Keys'],
        summary: 'Rotate a key in place (caller must own it)',
        parameters: [{ name: 'keyId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'New secret' }, '403': { description: 'Not the key owner' } },
      },
    },
    '/keys/{keyId}/update': {
      post: {
        tags: ['Keys'],
        summary: 'Update alias / models / budget / limits (caller must own it)',
        parameters: [{ name: 'keyId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'Updated' }, '403': { description: 'Not the key owner' } },
      },
    },
    '/keys/{keyId}/block': {
      post: {
        tags: ['Keys'],
        summary: 'Suspend a key without revoking (caller must own it)',
        parameters: [{ name: 'keyId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Blocked' }, '403': { description: 'Not the key owner' } },
      },
    },
    '/keys/{keyId}/unblock': {
      post: {
        tags: ['Keys'],
        summary: 'Re-enable a blocked key (caller must own it)',
        parameters: [{ name: 'keyId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Unblocked' }, '403': { description: 'Not the key owner' } },
      },
    },
    '/keys/{keyId}/reset_spend': {
      post: {
        tags: ['Keys'],
        summary: 'Zero out a key spend counter (caller must own it)',
        parameters: [{ name: 'keyId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Spend reset' }, '403': { description: 'Not the key owner' } },
      },
    },
    '/models': {
      get: {
        tags: ['Models'],
        summary: 'List available LLM models',
        responses: { '200': { description: 'Model catalogue' } },
      },
    },
    '/teams': {
      get: {
        tags: ['Teams'],
        summary: 'List teams the current user belongs to',
        responses: { '200': { description: 'Array of teams' } },
      },
    },
    '/teams/{teamId}/usage': {
      get: {
        tags: ['Teams'],
        summary: 'Usage metrics for a team',
        parameters: [
          { name: 'teamId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'start_date', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'end_date', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Team usage' }, '400': { description: 'Missing date range' } },
      },
    },
    '/usage': {
      get: {
        tags: ['Usage'],
        summary: 'Usage metrics for the current user',
        parameters: [
          { name: 'start_date', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'end_date', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Usage metrics' }, '400': { description: 'Missing date range' } },
      },
    },
    '/audit': {
      get: {
        tags: ['Audit'],
        summary: 'Audit logs (gated by litellm.audit.group membership)',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'page_size', in: 'query', schema: { type: 'integer' } },
          { name: 'start_date', in: 'query', schema: { type: 'string' } },
          { name: 'end_date', in: 'query', schema: { type: 'string' } },
          { name: 'action', in: 'query', schema: { type: 'string' } },
          { name: 'table_name', in: 'query', schema: { type: 'string' } },
          { name: 'changed_by', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Paginated audit logs' }, '403': { description: 'Not configured or not authorized' } },
      },
    },
    '/provisioning/preview': {
      get: {
        tags: ['Provisioning'],
        summary: 'Resolve which role a Backstage group maps to (dry-run)',
        parameters: [
          { name: 'group', in: 'query', required: true, schema: { type: 'string' }, description: 'e.g. group:default/ai-platform' },
        ],
        responses: {
          '200': { description: 'Resolved role and effective defaults' },
          '400': { description: 'Missing group parameter' },
          '403': { description: 'Not configured or not authorized' },
        },
      },
    },
    '/bridge/health': {
      get: {
        tags: ['Bridge'],
        summary: 'Bridge health + configured clientId (no auth)',
        responses: { '200': { description: 'Bridge health' } },
      },
    },
    '/bridge/keys': {
      get: {
        tags: ['Bridge'],
        summary: 'List the caller virtual keys (Keycloak token auth)',
        responses: { '200': { description: 'Array of keys' }, '401': { description: 'Invalid token' } },
      },
      post: {
        tags: ['Bridge'],
        summary: 'Mint a virtual key for the caller (Keycloak token auth)',
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'Generated key' }, '401': { description: 'Invalid token' } },
      },
    },
    '/bridge/keys/regenerate': {
      post: {
        tags: ['Bridge'],
        summary: 'Rotate the caller key by alias (Keycloak token auth)',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { alias: { type: 'string' } } } } } },
        responses: { '200': { description: 'New secret' }, '401': { description: 'Invalid token' }, '404': { description: 'No key with that alias' } },
      },
    },
    '/bridge/models': {
      get: {
        tags: ['Bridge'],
        summary: 'List available LLM models (Keycloak token auth)',
        responses: { '200': { description: 'Model catalogue' }, '401': { description: 'Invalid token' } },
      },
    },
  },
  components: {
    securitySchemes: {
      backstageUserToken: {
        type: 'http',
        scheme: 'bearer',
        description: 'Backstage-issued user token (Authorization: Bearer <token>).',
      },
      keycloakAccessToken: {
        type: 'http',
        scheme: 'bearer',
        description: 'Raw Keycloak access token. Bridge routes only; verified against the realm JWKS.',
      },
    },
  },
};