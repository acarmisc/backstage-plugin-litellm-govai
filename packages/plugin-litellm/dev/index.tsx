import ReactDOM from 'react-dom/client';
import { TrendingUp as TrendingUpIcon } from '@mui/icons-material';
import { createApp } from '@backstage/frontend-defaults';
import { createFrontendPlugin, ApiBlueprint, PageBlueprint } from '@backstage/frontend-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { liteLlmApiRef } from '../src/api';
import { MockLiteLlmApi, MockCatalogApi } from './mockApi';

// A dev-only build of the plugin that swaps the real LiteLlmApi (which talks
// to a live backend) for MockLiteLlmApi, so the harness renders with
// realistic data without a running LiteLLM proxy or Backstage backend.
const mockLiteLlmApi = ApiBlueprint.make({
  name: 'litellm',
  params: defineParams =>
    defineParams({
      api: liteLlmApiRef,
      deps: {},
      factory: () => new MockLiteLlmApi(),
    }),
});

// The Members section's picker looks up catalog User entities — stand in a
// small fixed roster so it has something to search without a real catalog.
const mockCatalogApi = ApiBlueprint.make({
  name: 'catalog',
  params: defineParams =>
    defineParams({
      api: catalogApiRef,
      deps: {},
      factory: () => new MockCatalogApi() as any,
    }),
});

const liteLlmPage = PageBlueprint.make({
  params: {
    path: '/litellm',
    title: 'LiteLLM',
    icon: <TrendingUpIcon />,
    loader: async () => {
      const { LiteLLMPage } = await import('../src/components/LiteLLMPage');
      return <LiteLLMPage />;
    },
  },
});

const devLitellmPlugin = createFrontendPlugin({
  pluginId: 'litellm',
  extensions: [mockLiteLlmApi, mockCatalogApi, liteLlmPage],
});

const app = createApp({
  features: [devLitellmPlugin],
});

ReactDOM.createRoot(document.getElementById('root')!).render(app.createRoot());
