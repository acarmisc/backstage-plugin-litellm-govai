import { jsxs, jsx } from 'react/jsx-runtime';
import { useState, useEffect } from 'react';
import { Page, Header, Content, Progress, ResponseErrorPanel } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { litellmApiRef } from '../api.esm.js';
import { UserContextCard } from './UserContextCard.esm.js';
import { KeysTable } from './KeysTable.esm.js';
import { UsageStats } from './UsageStats.esm.js';

function LiteLLMPage() {
  const api = useApi(litellmApiRef);
  const [userInfo, setUserInfo] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [userInfoData, usageData] = await Promise.all([
          api.getUserInfo(),
          api.getUsage(7)
        ]);
        setUserInfo(userInfoData);
        setUsage(usageData.usage);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e : new Error("Unknown error"));
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [api]);
  if (loading) {
    return /* @__PURE__ */ jsxs(Page, { themeId: "tool", children: [
      /* @__PURE__ */ jsx(Header, { title: "My AI Management", subtitle: "LiteLLM Governance" }),
      /* @__PURE__ */ jsx(Content, { children: /* @__PURE__ */ jsx(Progress, {}) })
    ] });
  }
  if (error) {
    return /* @__PURE__ */ jsxs(Page, { themeId: "tool", children: [
      /* @__PURE__ */ jsx(Header, { title: "My AI Management", subtitle: "LiteLLM Governance" }),
      /* @__PURE__ */ jsx(Content, { children: /* @__PURE__ */ jsx(ResponseErrorPanel, { error }) })
    ] });
  }
  return /* @__PURE__ */ jsxs(Page, { themeId: "tool", children: [
    /* @__PURE__ */ jsx(Header, { title: "My AI Management", subtitle: "LiteLLM Governance" }),
    /* @__PURE__ */ jsxs(Content, { children: [
      userInfo?.context && /* @__PURE__ */ jsx(UserContextCard, { context: userInfo.context }),
      /* @__PURE__ */ jsx("div", { style: { marginTop: 16 }, children: /* @__PURE__ */ jsx(KeysTable, { keys: userInfo?.keys || [], totalSpend: userInfo?.spend || 0 }) }),
      usage && usage.length > 0 && /* @__PURE__ */ jsx("div", { style: { marginTop: 16 }, children: /* @__PURE__ */ jsx(UsageStats, { usage }) })
    ] })
  ] });
}

export { LiteLLMPage };
//# sourceMappingURL=LiteLLMPage.esm.js.map
