import { createFrontendPlugin } from '@backstage/frontend-plugin-api';
import { PageExtension } from '@backstage/frontend-plugin-api';
import { LiteLLMPage } from './components/LiteLLMPage';

export const litellmPlugin = createFrontendPlugin({
  id: 'litellm',
  extensions: [
    PageExtension.create({
      id: 'litellm.page',
      defaultPath: '/litellm',
      title: 'LiteLLM',
      component: {
        loader: async () => LiteLLMPage,
      },
    }),
  ],
});