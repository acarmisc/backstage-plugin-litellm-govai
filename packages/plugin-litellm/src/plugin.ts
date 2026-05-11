import { createFrontendPlugin } from '@backstage/frontend-plugin-api';
import { PageExtension } from '@backstage/frontend-plugin-api';
import { LiteLLMPage } from './components/LiteLLMPage';
import { fetchApiRef } from '@backstage/core-plugin-api';

export const litellmPlugin = createFrontendPlugin({
  id: 'litellm',
  extensions: [
    PageExtension.create({
      id: 'litellm.page',
      defaultPath: '/litellm',
      title: 'LiteLLM',
      component: {
        loader: async () => {
          const { fetchApi } = await import('@backstage/core-plugin-api');
          return function LiteLLMRoot() {
            return <LiteLLMPage fetchApi={fetchApi} />;
          };
        },
      },
    }),
  ],
});