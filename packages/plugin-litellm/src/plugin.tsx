import { TrendingUp as TrendingUpIcon } from '@mui/icons-material';
import {
  createFrontendPlugin,
  ApiBlueprint,
  PageBlueprint,
  fetchApiRef,
  discoveryApiRef,
} from '@backstage/frontend-plugin-api';
import { liteLlmApiRef, LiteLlmApi } from './api';
import { rootRouteRef } from './routes';

const liteLlmApi = ApiBlueprint.make({
  params: defineParams =>
    defineParams({
      api: liteLlmApiRef,
      deps: { fetchApi: fetchApiRef, discoveryApi: discoveryApiRef },
      factory: ({ fetchApi, discoveryApi }) => new LiteLlmApi(fetchApi, discoveryApi),
    }),
});

const liteLlmPage = PageBlueprint.make({
  params: {
    path: '/litellm',
    title: 'LiteLLM',
    icon: <TrendingUpIcon />,
    routeRef: rootRouteRef,
    loader: async () => {
      const { LiteLLMPage } = await import('./components/LiteLLMPage');
      return <LiteLLMPage />;
    },
  },
});

export const litellmPlugin = createFrontendPlugin({
  pluginId: 'litellm',
  routes: {
    root: rootRouteRef,
  },
  extensions: [liteLlmApi, liteLlmPage],
});
