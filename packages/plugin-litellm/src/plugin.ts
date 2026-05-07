import { createPlugin, createApiFactory } from '@backstage/core-plugin-api';
import { liteLLMRouteRef } from './routes';
import { litellmApiRef, DefaultLiteLLMApi } from './api';

export const litellmPlugin = createPlugin({
  id: 'litellm',
  routes: {
    root: liteLLMRouteRef,
  },
  apis: [
    createApiFactory({
      api: litellmApiRef,
      deps: {},
      factory: () => new DefaultLiteLLMApi(),
    }),
  ],
});