import { Response, Request } from 'express';
import { AuthService, PermissionsService } from '@backstage/backend-plugin-api';
import { BasicPermission } from '@backstage/plugin-permission-common';
import { CatalogClient } from '@backstage/catalog-client';
import { LiteLLMClient } from '../client';
import {
  ProvisioningDefaults,
  RoleConfig,
  VirtualKey,
  TeamInfo,
} from '../types';
import { TeamAdminConfig } from '../teamAdmin';
import type { KeyValidationConfig } from '@acarmisc/backstage-plugin-litellm-common';
import { TeamBudgetVisibility } from '../teamBudgetVisibility';
import { OpencodeConfig } from '../opencode';

/**
 * Shared runtime context for all route handlers. Holds config-derived
 * constants, service clients, and helper functions needed by routes.
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

  // Helper functions
  authorizeKeyAction(
    req: Request,
    keyId: string,
  ): Promise<{ tokenEntityRef: string; userId: string; key: VirtualKey }>;

  sendOwnershipError(err: any, res: Response): boolean;

  assertPermission(
    req: Request,
    permission: BasicPermission,
  ): Promise<boolean>;

  sendPermissionDenied(res: Response, permission: BasicPermission): void;

  requireTeamMgmt(res: Response): boolean;

  requireObjectPerms(res: Response): boolean;

  sendTeamError(err: any, res: Response): void;

  authorizeTeamSubresource(
    req: Request,
    res: Response,
    permission: BasicPermission,
  ): Promise<
    | { teamId: string; owningGroup: string; actor: string; team: TeamInfo }
    | null
  >;
}
