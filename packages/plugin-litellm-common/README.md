# @acarmisc/backstage-plugin-litellm-common

Shared code for the **Backstage LiteLLM Governance Plugin**: the `litellm.*`
permission definitions, the request schemas used to validate key creation and
updates, budget-status thresholds and the API types shared by the frontend and
backend packages.

You normally don't install it directly — it comes with
[`@acarmisc/backstage-plugin-litellm`](https://www.npmjs.com/package/@acarmisc/backstage-plugin-litellm)
and [`@acarmisc/backstage-plugin-litellm-backend`](https://www.npmjs.com/package/@acarmisc/backstage-plugin-litellm-backend).
Import it when you write a permission policy that refers to the plugin's
permissions:

```ts
import {
  litellmKeyCreatePermission,
  litellmTeamManagePermission,
} from '@acarmisc/backstage-plugin-litellm-common';
```

See the [project README](https://github.com/acarmisc/backstage-plugin-litellm-govai#permissions)
for what each permission guards.

## License

Apache-2.0
