import { createBackendPlugin, coreServices } from '@backstage/backend-plugin-api';
import { loggerToWinstonLogger } from '@backstage/backend-common';
import { createRouter } from './router';

export default createBackendPlugin({
  pluginId: 'litellm',
  register(env) {
    env.registerInit({
      deps: {
        config: coreServices.rootConfig,
        identity: coreServices.identity,
        http: coreServices.httpRouter,
        logger: coreServices.logger,
      },
      async init({ config, identity, http, logger }) {
        const winstonLogger = loggerToWinstonLogger(logger);

        const router = await createRouter({
          config,
          identity,
          logger: winstonLogger,
        });

        http.use(router);
      },
    });
  },
});