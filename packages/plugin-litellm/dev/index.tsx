import { createDevApp } from '@backstage/dev-utils';
import { litellmPlugin, LiteLLMPage } from '../src';

createDevApp()
  .registerPlugin(litellmPlugin)
  .addPage({
    element: <LiteLLMPage />,
    title: 'LiteLLM',
    path: '/litellm',
  })
  .render();
