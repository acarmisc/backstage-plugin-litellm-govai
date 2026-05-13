import { coreServices, createBackendPlugin } from '@backstage/backend-plugin-api';
import { createRouter } from './router';

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
      },
      async init({ httpRouter, config, logger, auth, discovery }) {
        const router = await createRouter({ config, logger, auth, discovery });
        httpRouter.use(router);
      },
    });
  },
});
