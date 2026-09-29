import { AuthService, PermissionsService } from '@backstage/backend-plugin-api';
import { CatalogClient } from '@backstage/catalog-client';
import { LiteLLMClient } from '../client';
import {
  ProvisioningDefaults,
  RoleConfig,
} from '../types';
import { TeamAdminConfig } from '../teamAdmin';
import type { KeyValidationConfig } from '@acarmisc/backstage-plugin-litellm-common';
import { TeamBudgetVisibility } from '../teamBudgetVisibility';
import { OpencodeConfig } from '../opencode';

/**
 * Shared runtime context for all route handlers. Holds config-derived
 * constants and Backstage/LiteLLM service clients that would otherwise be
 * repeated across many route definitions.
 *
 * Helper functions are NOT included here; each route module implements its own
 * logic using the context data. This keeps the context focused on config/services
 * and avoids circular dependencies.
 */
export interface RouterContext {
  // Backstage and LiteLLM services
  client: LiteLLMClient;
  catalogClient: CatalogClient;
  auth: AuthService;
  permissions: PermissionsService;
  logger: any;

  // Config-derived values
  baseUrl: string;
  publicBaseUrl: string | null;
  userIdDomain: string | undefined;
  provisioningEnabled: boolean;
  provisioningDefaults: ProvisioningDefaults;
  roleConfigs: RoleConfig[];
  auditGroup: string | undefined;
  allowUnlimitedBudget: boolean;
  teamRequired: boolean;
  allowOwnerResetSpend: boolean;
  keyValidationConfig: KeyValidationConfig;
  teamMgmtEnabled: boolean;
  objectPermsEnabled: boolean;
  teamAdminCfg: TeamAdminConfig;
  teamBudgetVisibility: TeamBudgetVisibility;
  opencodeCfg: OpencodeConfig;
}
