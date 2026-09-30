export interface Config {
  litellm: {
    /**
     * Base URL of the LiteLLM proxy instance.
     */
    baseUrl: string;

    /**
     * Publicly reachable LiteLLM proxy URL. Used to build ready-to-paste
     * curl / OpenAI-SDK snippets in the frontend ("Key Generated" dialog).
     * The value is served to the frontend via GET /config. When omitted the
     * frontend shows "Endpoint not configured" — the internal baseUrl is
     * never exposed.
     */
    publicBaseUrl?: string;

    /**
     * Who end users should contact when their LiteLLM account isn't set up
     * (an email address, chat channel or URL). Served to the frontend via
     * GET /config and shown in the "account isn't set up" panel.
     */
    supportContact?: string;

    /**
     * LiteLLM master key for admin operations. Never exposed to the frontend.
     * @visibility secret
     */
    masterKey: string;

    /**
     * Email domain appended to the Backstage user entity name to form the
     * LiteLLM user_id. When set, a user named "john.doe" maps to
     * "john.doe@<userIdDomain>" in LiteLLM. Omit to use the bare entity name.
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
         * LiteLLM user role applied on /user/new (e.g. "internal_user").
         * @default "internal_user"
         */
        userRole?: string;

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
        /** LiteLLM user role for members of this group; falls back to defaults.userRole. */
        userRole?: string;
        metadata?: Record<string, string>;
      }>;
    };

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
     * Governance ceilings for individual key creation.
     * These are strict server-side limits; config flags (allowUnlimitedBudget,
     * teamRequired) control what users are allowed to do, but these limits
     * cap what they can specify.
     */
    keys?: {
      /**
       * Maximum USD budget a single key can have. Requests exceeding this
       * are rejected with a 400 error.
       * @default 100
       */
      maxBudget?: number;

      /**
       * Maximum tokens-per-minute a single key can request.
       * Requests exceeding this are rejected with a 400 error.
       * @default 100000
       */
      maxTpm?: number;

      /**
       * Maximum requests-per-minute a single key can request.
       * Requests exceeding this are rejected with a 400 error.
       * @default 1000
       */
      maxRpm?: number;

      /**
       * Allowed duration presets for keys (e.g. "1d", "7d", "30d", "90d").
       * Requests with a duration not in this list are rejected with a 400 error.
       * An empty array allows any duration matching the format /^\d+[smhdwy]$/.
       * @default ["1d", "7d", "30d", "90d"]
       */
      allowedDurations?: string[];

      /**
       * When true, key owners can reset their key's spend counter via the
       * "Reset Spend" button in the frontend, subject to the
       * litellm.key.resetSpend permission. When false (the default), reset
       * is only available to administrators, even if the permission is ALLOW.
       * Fail-closed: enforced before the permission check.
       * @default false
       */
      allowOwnerResetSpend?: boolean;
    };

    /**
     * OpenCode SSO-connect (GET/POST /opencode/connect). Lets the OpenCode
     * portal-auth plugin obtain a personal LiteLLM key after a browser
     * sign-in and confirmation. Disabled by default.
     */
    opencode?: {
      /**
       * When true the /opencode/connect routes are mounted.
       * @default false
       */
      enabled?: boolean;

      /**
       * Duration of freshly generated keys, in LiteLLM format (e.g. "30d").
       * @default "30d"
       */
      keyDuration?: string;

      /**
       * Max budget (USD) of keys created through the connect flow.
       * @default 50
       */
      maxBudget?: number;

      /**
       * When true a team must be supplied and the user must belong to it.
       * @default false
       */
      requireTeam?: boolean;

      /**
       * Extra metadata stamped on keys created through this flow.
       */
      metadata?: { [key: string]: string };
    };

    /**
     * Caching configuration for backend data fetches.
     */
    cache?: {
      /**
       * Time-to-live for cached getUserInfo results, in seconds.
       * When 0, caching is disabled.
       * Cached results are never stale within this window; mutations
       * invalidate the cache immediately to ensure consistency.
       * @default 10
       */
      userInfoTtlSeconds?: number;
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
       */
      group?: string;

      /**
       * LiteLLM model names an admin may assign to a team.
       * Empty array => none assignable (fail-closed).
       * @default []
       */
      allowedModels?: string[];

      /**
       * LiteLLM model access-group names an admin may assign to a team.
       * References access_groups defined in litellm.model_info configuration.
       * Empty array => none allowed.
       * @default []
       */
      allowedModelAccessGroups?: string[];

      /**
       * Hard USD ceiling for max_budget an admin may set on a team.
       * @default 1000
       */
      maxBudgetCeiling?: number;

      /**
       * Allow an admin to create a team with no budget cap.
       * @default false
       */
      allowUnlimitedBudget?: boolean;

      /**
       * Vector-store ids/names an admin may attach as team knowledge bases.
       * Empty array => none allowed.
       * @default []
       */
      allowedVectorStores?: string[];

      /**
       * MCP server ids/names an admin may attach to a team.
       * Empty array => none allowed.
       * @default []
       */
      allowedMcpServers?: string[];

      /**
       * MCP access-group names an admin may attach to a team.
       * References access_groups defined in litellm.mcp_info configuration.
       * Empty array => none allowed.
       * @default []
       */
      allowedMcpAccessGroups?: string[];

      /**
       * Allow an admin to delete a team (vs. only block/deactivate).
       * @default false
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
         */
        enabled?: boolean;
      };
    };

    /**
     * Display controls for team budget amounts in the frontend.
     * Each flag independently hides real dollar budgets while the backend
     * still exposes the consumption level (percent of cap + ok/near/over
     * status + reset window). Enforcement is server-side: the backend
     * redacts max_budget/spend from the corresponding endpoints, so the
     * dollars are not merely hidden in CSS.
     */
    display?: {
      /**
       * Hide dollar budgets from regular team members (GET /teams, Teams
       * cards, TEAM section of the budget widget). Team managers still see
       * dollars unless hideTeamBudgetForManagers is also set.
       * @default false
       */
      hideTeamBudgetForMembers?: boolean;

      /**
       * Hide dollar budgets even from team managers (GET /teams/managed,
       * team write responses, ManageTeamDialog budget field which becomes
       * write-only). Useful when budgets are finance-sensitive.
       * @default false
       */
      hideTeamBudgetForManagers?: boolean;
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

      /**
       * Email domains whose *verified* addresses may use the bridge. Defaults
       * to `litellm.userIdDomain` when that is set. With neither configured
       * the bridge rejects every caller. The LiteLLM user is then the same one
       * the UI addresses (the Keycloak `preferred_username`, with
       * `litellm.userIdDomain` applied when set) — the email is only the gate.
       */
      allowedEmailDomains?: string[];
    };
  };
}
