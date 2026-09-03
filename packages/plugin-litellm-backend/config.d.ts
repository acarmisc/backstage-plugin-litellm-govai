export interface Config {
  litellm: {
    /**
     * Base URL of the LiteLLM proxy instance.
     * @visibility backend
     */
    baseUrl: string;

    /**
     * Publicly reachable LiteLLM proxy URL. Used to build ready-to-paste
     * curl / OpenAI-SDK snippets in the frontend ("Key Generated" dialog).
     * When omitted, the internal baseUrl is used instead.
     * @visibility backend
     */
    publicBaseUrl?: string;

    /**
     * LiteLLM master key for admin operations. Never exposed to the frontend.
     * @visibility secret
     */
    masterKey: string;

    /**
     * Email domain appended to the Backstage user entity name to form the
     * LiteLLM user_id. When set, a user named "john.doe" maps to
     * "john.doe@<userIdDomain>" in LiteLLM. Omit to use the bare entity name.
     * @visibility backend
     */
    userIdDomain?: string;

    provisioning?: {
      /**
       * When true the backend automatically creates a LiteLLM user on first
       * access if the Backstage user is not yet known to LiteLLM.
       * Disabled by default — enable explicitly when you are ready.
       * @default false
       */
      enabled?: boolean;

      defaults?: {
        /**
         * Max lifetime spend in USD before the account is blocked.
         * Set a conservative value; null means no hard cap.
         * @default 10
         */
        maxBudget?: number;

        /**
         * Spend-reset period for maxBudget (e.g. "30d", "7d", "1h").
         * After this period the spend counter resets.
         * @default "30d"
         */
        budgetDuration?: string;

        /**
         * LiteLLM model IDs the new user is allowed to call.
         * Empty array means all models configured in the proxy are allowed.
         * @default []
         */
        models?: string[];

        /**
         * LiteLLM team IDs to add the new user to automatically.
         * The user inherits team-level model and budget restrictions.
         * @default []
         */
        teams?: string[];

        /**
         * Tokens per minute hard cap across all models.
         * Omit for no limit (team or global limits still apply).
         */
        tpmLimit?: number;

        /**
         * Requests per minute hard cap across all models.
         * Omit for no limit.
         */
        rpmLimit?: number;

        /**
         * Arbitrary key-value metadata stored on the LiteLLM user record.
         * Useful for tracking source, cost centre, department, etc.
         */
        metadata?: Record<string, string>;
      };

      /**
       * Role-based provisioning overrides. Evaluated in order — first match wins.
       * When a Backstage user belongs to the listed group, these settings override
       * the defaults above. Fields omitted here fall back to defaults.
       */
      roles?: Array<{
        /**
         * Backstage group entity ref, e.g. "group:default/ai-power-users".
         * Matched against the user's memberOf relations in the catalog.
         */
        group: string;
        maxBudget?: number;
        budgetDuration?: string;
        models?: string[];
        teams?: string[];
        tpmLimit?: number;
        rpmLimit?: number;
        metadata?: Record<string, string>;
      }>;
    };

    /**
     * CLI bridge — exposes /api/litellm/bridge/* for CLI clients (Abby) that
     * authenticate with a Keycloak access token (JWKS-verified). Lets them
     * list/mint virtual keys without holding the master key. Disabled by
     * default; enable explicitly when the CLI is in use.
     */
    /**
     * Audit log access control. When set, the /audit tab in the plugin is
     * only visible to members of the specified Backstage group.
     */
    audit?: {
      /**
       * Backstage group entity ref whose members can view the audit log.
       * The plugin ships a ready-made group at catalog/litellm-admins.yaml —
       * register the root catalog-info.yaml and set this to
       * "group:default/litellm-admins", then add members there.
       * When omitted the audit tab is hidden for all users.
       */
      group?: string;
    };

    /**
     * Controls for the "Generate New Key" form in the frontend.
     */
    keyGeneration?: {
      /**
       * When true, users can tick an "Unlimited budget" checkbox that skips
       * the max-budget cap entirely. The checkbox is hidden from the form
       * when this is false, so a budget is always required.
       * @default false
       */
      allowUnlimitedBudget?: boolean;

      /**
       * When true (the default), a team must be selected before a key can
       * be generated. Set to false to let users generate personal,
       * team-less keys.
       * @default true
       */
      teamRequired?: boolean;
    };

    /**
     * Team administration governance. Allows a designated Backstage group to
     * create and manage LiteLLM teams. The feature is disabled (fail-closed)
     * when unset — all fields default to empty/false to prevent accidental
     * delegation of capabilities. Set this block only when you have reviewed
     * the governance policy and are ready to enable the feature.
     */
    teamAdmin?: {
      /**
       * Backstage group entity ref whose members may manage teams,
       * e.g. "group:default/litellm-team-admins".
       * The plugin ships a group template at catalog/litellm-team-admins.yaml.
       * When omitted the feature is disabled entirely.
       * @visibility backend
       */
      group?: string;

      /**
       * LiteLLM model names an admin may assign to a team.
       * Empty array => none assignable (fail-closed).
       * @default []
       * @visibility backend
       */
      allowedModels?: string[];

      /**
       * LiteLLM model access-group names an admin may assign to a team.
       * References access_groups defined in litellm.model_info configuration.
       * Empty array => none allowed.
       * @default []
       * @visibility backend
       */
      allowedModelAccessGroups?: string[];

      /**
       * Hard USD ceiling for max_budget an admin may set on a team.
       * @default 1000
       * @visibility backend
       */
      maxBudgetCeiling?: number;

      /**
       * Allow an admin to create a team with no budget cap.
       * @default false
       * @visibility backend
       */
      allowUnlimitedBudget?: boolean;

      /**
       * Vector-store ids/names an admin may attach as team knowledge bases.
       * Empty array => none allowed.
       * @default []
       * @visibility backend
       */
      allowedVectorStores?: string[];

      /**
       * MCP server ids/names an admin may attach to a team.
       * Empty array => none allowed.
       * @default []
       * @visibility backend
       */
      allowedMcpServers?: string[];

      /**
       * MCP access-group names an admin may attach to a team.
       * References access_groups defined in litellm.mcp_info configuration.
       * Empty array => none allowed.
       * @default []
       * @visibility backend
       */
      allowedMcpAccessGroups?: string[];

      /**
       * Allow an admin to delete a team (vs. only block/deactivate).
       * @default false
       * @visibility backend
       */
      allowTeamDelete?: boolean;

      /**
       * Object-permission management (attaching knowledge bases / MCP servers
       * to a team). This is the highest-risk surface — attaching a vector store
       * exposes its documents to every team key, and attaching an MCP server
       * grants tool execution. Keep disabled unless a real permission policy
       * (@backstage-community/plugin-rbac or a custom PermissionPolicy) is
       * installed and the allowedVectorStores / allowedMcpServers allowlists
       * are set.
       */
      objectPermissions?: {
        /**
         * When true, mount the knowledge-base and MCP management routes.
         * Still gated by the permission framework and the allowlists.
         * @default false
         * @visibility backend
         */
        enabled?: boolean;
      };
    };

    bridge?: {
      /**
       * When true, mount the /bridge/keys, /bridge/keys (POST), /bridge/models
       * routes and verify caller JWTs against the Keycloak realm JWKS.
       * @default false
       */
      enabled?: boolean;

      /**
       * Keycloak realm issuer used to fetch JWKS and verify the token issuer,
       * e.g. https://auth.example.com/realms/solution-innovation.
       * Required when enabled.
       */
      issuer?: string;

      /**
       * OIDC public client the CLI uses (default "abby-cli"). The token's
       * azp (or aud) must equal this.
       * @default "abby-cli"
       */
      clientId?: string;
    };
  };
}
