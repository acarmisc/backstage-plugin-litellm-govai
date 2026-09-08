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

// A side-by-side of the LiteLLMBudgetWidget variants so every mode — full,
// compact, collapsible, and the `action` slot — is eyeball-able without
// digging through the LiteLLM page's Overview tab.
const budgetWidgetsPage = PageBlueprint.make({
  name: 'budget-widgets',
  params: {
    path: '/budget-widgets',
    title: 'Budget widgets',
    icon: <TrendingUpIcon />,
    loader: async () => {
      const { default: Box } = await import('@mui/material/Box');
      const { default: Button } = await import('@mui/material/Button');
      const { LiteLLMBudgetWidget } = await import(
        '../src/components/LiteLLMBudgetWidget'
      );
      return (
        <Box
          sx={{
            p: 3,
            display: 'grid',
            gap: 3,
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
            alignItems: 'start',
          }}
        >
          <LiteLLMBudgetWidget />
          <LiteLLMBudgetWidget compact collapsible />
          <LiteLLMBudgetWidget
            compact
            action={
              <Button variant="contained" fullWidth>
                Create LiteLLM key
              </Button>
            }
          />
        </Box>
      );
    },
  },
});

const devLitellmPlugin = createFrontendPlugin({
  pluginId: 'litellm',
  extensions: [mockLiteLlmApi, mockCatalogApi, liteLlmPage, budgetWidgetsPage],
});

const app = createApp({
  features: [devLitellmPlugin],
});

ReactDOM.createRoot(document.getElementById('root')!).render(app.createRoot());
