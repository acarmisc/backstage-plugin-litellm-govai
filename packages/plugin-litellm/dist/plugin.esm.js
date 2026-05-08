import { createPlugin, createApiFactory } from '@backstage/core-plugin-api';
import { liteLLMRouteRef } from './routes.esm.js';
import { DefaultLiteLLMApi, litellmApiRef } from './api.esm.js';

const litellmPlugin = createPlugin({
  id: "litellm",
  routes: {
    root: liteLLMRouteRef
  },
  apis: [
    createApiFactory({
      api: litellmApiRef,
      deps: {},
      factory: () => new DefaultLiteLLMApi()
    })
  ]
});

export { litellmPlugin };
//# sourceMappingURL=plugin.esm.js.map
