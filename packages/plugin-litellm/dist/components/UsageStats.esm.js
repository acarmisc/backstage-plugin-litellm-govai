import { jsxs, jsx } from 'react/jsx-runtime';
import { InfoCard } from '@backstage/core-components';
import { Grid, Typography } from '@material-ui/core';

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2
  }).format(amount);
}
function formatNumber(num) {
  return new Intl.NumberFormat("en-US").format(num);
}
function UsageStats({ usage }) {
  const totalSpend = usage.reduce((sum, day) => sum + day.spend, 0);
  const totalPromptTokens = usage.reduce((sum, day) => sum + day.prompt_tokens, 0);
  const totalCompletionTokens = usage.reduce((sum, day) => sum + day.completion_tokens, 0);
  const totalTokens = totalPromptTokens + totalCompletionTokens;
  return /* @__PURE__ */ jsxs(
    InfoCard,
    {
      title: "Usage (Last 7 Days)",
      children: [
        /* @__PURE__ */ jsxs(Grid, { container: true, spacing: 3, children: [
          /* @__PURE__ */ jsxs(Grid, { item: true, xs: 12, sm: 6, md: 3, children: [
            /* @__PURE__ */ jsx(Typography, { variant: "h6", children: formatCurrency(totalSpend) }),
            /* @__PURE__ */ jsx(Typography, { variant: "body2", color: "textSecondary", children: "Total Spend" })
          ] }),
          /* @__PURE__ */ jsxs(Grid, { item: true, xs: 12, sm: 6, md: 3, children: [
            /* @__PURE__ */ jsx(Typography, { variant: "h6", children: formatNumber(totalTokens) }),
            /* @__PURE__ */ jsx(Typography, { variant: "body2", color: "textSecondary", children: "Total Tokens" })
          ] }),
          /* @__PURE__ */ jsxs(Grid, { item: true, xs: 12, sm: 6, md: 3, children: [
            /* @__PURE__ */ jsx(Typography, { variant: "h6", children: formatNumber(totalPromptTokens) }),
            /* @__PURE__ */ jsx(Typography, { variant: "body2", color: "textSecondary", children: "Prompt Tokens" })
          ] }),
          /* @__PURE__ */ jsxs(Grid, { item: true, xs: 12, sm: 6, md: 3, children: [
            /* @__PURE__ */ jsx(Typography, { variant: "h6", children: formatNumber(totalCompletionTokens) }),
            /* @__PURE__ */ jsx(Typography, { variant: "body2", color: "textSecondary", children: "Completion Tokens" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { marginTop: 24 }, children: [
          /* @__PURE__ */ jsx(Typography, { variant: "subtitle2", gutterBottom: true, children: "Daily Breakdown" }),
          /* @__PURE__ */ jsx(TableSimple, { usage })
        ] })
      ]
    }
  );
}
function TableSimple({ usage }) {
  return /* @__PURE__ */ jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [
    /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
      /* @__PURE__ */ jsx("th", { style: { textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }, children: "Date" }),
      /* @__PURE__ */ jsx("th", { style: { textAlign: "right", padding: 8, borderBottom: "1px solid #ddd" }, children: "Spend" }),
      /* @__PURE__ */ jsx("th", { style: { textAlign: "right", padding: 8, borderBottom: "1px solid #ddd" }, children: "Prompt" }),
      /* @__PURE__ */ jsx("th", { style: { textAlign: "right", padding: 8, borderBottom: "1px solid #ddd" }, children: "Completion" }),
      /* @__PURE__ */ jsx("th", { style: { textAlign: "right", padding: 8, borderBottom: "1px solid #ddd" }, children: "Total" })
    ] }) }),
    /* @__PURE__ */ jsx("tbody", { children: usage.slice().reverse().map((day) => /* @__PURE__ */ jsxs("tr", { children: [
      /* @__PURE__ */ jsx("td", { style: { padding: 8, borderBottom: "1px solid #eee" }, children: day.date }),
      /* @__PURE__ */ jsx("td", { style: { textAlign: "right", padding: 8, borderBottom: "1px solid #eee" }, children: formatCurrency(day.spend) }),
      /* @__PURE__ */ jsx("td", { style: { textAlign: "right", padding: 8, borderBottom: "1px solid #eee" }, children: formatNumber(day.prompt_tokens) }),
      /* @__PURE__ */ jsx("td", { style: { textAlign: "right", padding: 8, borderBottom: "1px solid #eee" }, children: formatNumber(day.completion_tokens) }),
      /* @__PURE__ */ jsx("td", { style: { textAlign: "right", padding: 8, borderBottom: "1px solid #eee" }, children: formatNumber(day.total_tokens) })
    ] }, day.date)) })
  ] });
}

export { UsageStats };
//# sourceMappingURL=UsageStats.esm.js.map
