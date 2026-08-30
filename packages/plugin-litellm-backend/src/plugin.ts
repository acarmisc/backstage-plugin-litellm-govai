import { coreServices, createBackendPlugin } from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { readBridgeConfig } from './bridge';
import { litellmPermissions } from './permissions';

export const litellmPlugin = createBackendPlugin({
  pluginId: 'litellm',
  register(reg) {
    reg.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        auth: coreServices.auth,
        discovery: coreServices.discovery,
        permissions: coreServices.permissions,
        permissionsRegistry: coreServices.permissionsRegistry,
      },
      async init({
        httpRouter,
        config,
        logger,
        auth,
        discovery,
        permissions,
        permissionsRegistry,
      }) {
        permissionsRegistry.addPermissions(litellmPermissions);
        const router = await createRouter({
          config,
          logger,
          auth,
          discovery,
          permissions,
        });
        httpRouter.use(router);

        // The CLI bridge verifies raw Keycloak JWTs itself (it does NOT use a
        // Backstage-issued token). Exempt its routes from the default auth
        // policy, otherwise the framework rejects the Keycloak Bearer with
        // "Illegal token" before the bridge verifier ever runs.
        if (readBridgeConfig(config).enabled) {
          for (const path of [
            '/bridge/health',
            '/bridge/keys',
            '/bridge/models',
          ]) {
            httpRouter.addAuthPolicy({ path, allow: 'unauthenticated' });
          }
        }
      },
    });
  },
});
