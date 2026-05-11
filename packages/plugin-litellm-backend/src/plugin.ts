import { createBackendPlugin, coreServices } from '@backstage/backend-plugin-api';
import { loggerToWinstonLogger } from '@backstage/backend-common';
import { createRouter } from './router';

export default createBackendPlugin({
  pluginId: 'litellm',
  register(env) {
    env.registerInit({
      deps: {
        config: coreServices.rootConfig,
        httpAuth: coreServices.httpAuth,
        http: coreServices.httpRouter,
        logger: coreServices.logger,
      },
      async init({ config, httpAuth, http, logger }) {
        const winstonLogger = loggerToWinstonLogger(logger);

        const router = await createRouter({
          config,
          httpAuth,
          logger: winstonLogger,
        });

        http.use(router);
      },
    });
  },
});