import React from 'react';
import { TrendingUp as TrendingUpIcon } from '@mui/icons-material';
import {
  createFrontendPlugin,
  createApiExtension,
  createPageExtension,
  createApiFactory,
  createSidebarExtension,
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
    createSidebarExtension({
      id: 'root',
      title: 'LiteLLM',
      icon: <TrendingUpIcon />,
      defaultPath: '/litellm',
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
