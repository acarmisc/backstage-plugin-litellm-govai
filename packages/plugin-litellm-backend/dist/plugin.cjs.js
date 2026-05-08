'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var backendPluginApi = require('@backstage/backend-plugin-api');
var backendCommon = require('@backstage/backend-common');
var router = require('./router.cjs.js');

var plugin = backendPluginApi.createBackendPlugin({
  pluginId: "litellm",
  register(env) {
    env.registerInit({
      deps: {
        config: backendPluginApi.coreServices.rootConfig,
        httpAuth: backendPluginApi.coreServices.httpAuth,
        http: backendPluginApi.coreServices.httpRouter,
        logger: backendPluginApi.coreServices.logger
      },
      async init({ config, httpAuth, http, logger }) {
        const winstonLogger = backendCommon.loggerToWinstonLogger(logger);
        const router$1 = await router.createRouter({
          config,
          httpAuth,
          logger: winstonLogger
        });
        http.use(router$1);
      }
    });
  }
});

exports.default = plugin;
//# sourceMappingURL=plugin.cjs.js.map
