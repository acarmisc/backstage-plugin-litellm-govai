export interface Config {
  litellm: {
    /**
     * Base URL of the LiteLLM proxy instance.
     * @visibility backend
     */
    baseUrl: string;

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
    bridge?: {
      /**
       * When true, mount the /bridge/keys, /bridge/keys (POST), /bridge/models
       * routes and verify caller JWTs against the Keycloak realm JWKS.
       * @default false
       */
      enabled?: boolean;

      /**
       * Keycloak realm issuer used to fetch JWKS and verify the token issuer,
       * e.g. https://auth.ces.abssrv.it/realms/solution-innovation.
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
