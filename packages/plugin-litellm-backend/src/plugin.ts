import { createBackendPlugin } from '@backstage/backend-plugin-api';
import { createRouter } from './router';

export const litellmPlugin = createBackendPlugin({
  pluginId: 'litellm',
  register(reg: any) {
    reg.registerInit({
      deps: {
        httpRouter: 'coreServices.httpRouter',
        config: 'coreServices.rootConfig',
        logger: 'coreServices.logger',
      },
      async init({ httpRouter, config, logger }) {
        const router = await createRouter({
          config,
          logger,
        });
        httpRouter.use(router);
      },
    });
  },
});