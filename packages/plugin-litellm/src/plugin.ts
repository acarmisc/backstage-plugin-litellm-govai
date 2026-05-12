import React from 'react';
import {
  createFrontendPlugin,
  createApiExtension,
  createPageExtension,
  createApiFactory,
  fetchApiRef,
} from '@backstage/frontend-plugin-api';
import { liteLlmApiRef, LiteLlmApi } from './api';

export const litellmPlugin = createFrontendPlugin({
  id: 'litellm',
  extensions: [
    createApiExtension({
      factory: createApiFactory({
        api: liteLlmApiRef,
        deps: { fetchApi: fetchApiRef },
        factory: ({ fetchApi }) => new LiteLlmApi(fetchApi),
      }),
    }),
    createPageExtension({
      defaultPath: '/litellm',
      loader: async () => {
        const { LiteLLMPage } = await import('./components/LiteLLMPage');
        return React.createElement(LiteLLMPage);
      },
    }),
  ],
});
