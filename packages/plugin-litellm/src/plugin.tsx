import React from 'react';
import { TrendingUp as TrendingUpIcon } from '@mui/icons-material';
import {
  createFrontendPlugin,
  ApiBlueprint,
  PageBlueprint,
  fetchApiRef,
} from '@backstage/frontend-plugin-api';
import { liteLlmApiRef, LiteLlmApi } from './api';

const liteLlmApi = ApiBlueprint.make({
  params: defineParams =>
    defineParams({
      api: liteLlmApiRef,
      deps: { fetchApi: fetchApiRef },
      factory: ({ fetchApi }) => new LiteLlmApi(fetchApi),
    }),
});

const liteLlmPage = PageBlueprint.make({
  params: {
    path: '/litellm',
    title: 'LiteLLM',
    icon: <TrendingUpIcon />,
    loader: async () => {
      const { LiteLLMPage } = await import('./components/LiteLLMPage');
      return <LiteLLMPage />;
    },
  },
});

export const litellmPlugin = createFrontendPlugin({
  pluginId: 'litellm',
  extensions: [liteLlmApi, liteLlmPage],
});
