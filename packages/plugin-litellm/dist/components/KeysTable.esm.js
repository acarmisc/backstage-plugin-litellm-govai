import { jsx, jsxs } from 'react/jsx-runtime';
import { WarningPanel, Table } from '@backstage/core-components';
import { Chip, Typography } from '@material-ui/core';

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(amount);
}
function formatDate(dateStr) {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString();
}
function isExpiringSoon(dateStr) {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const now = /* @__PURE__ */ new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1e3);
  return date <= sevenDaysFromNow && date > now;
}
function isExpired(dateStr) {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  return date < /* @__PURE__ */ new Date();
}
const columns = [
  {
    title: "Key Alias",
    field: "key_alias",
    highlight: true
  },
  {
    title: "Spend (USD)",
    field: "spend",
    render: (row) => formatCurrency(row.spend),
    align: "right"
  },
  {
    title: "Models",
    field: "models",
    render: (row) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: 4 }, children: [
      row.models.slice(0, 3).map((model) => /* @__PURE__ */ jsx(Chip, { label: model, size: "small" }, model)),
      row.models.length > 3 && /* @__PURE__ */ jsx(Chip, { label: `+${row.models.length - 3}`, size: "small", variant: "outlined" })
    ] })
  },
  {
    title: "Expires",
    field: "expires",
    render: (row) => {
      const isExpiredVal = isExpired(row.expires);
      const isExpiring = isExpiringSoon(row.expires);
      return /* @__PURE__ */ jsxs(
        Typography,
        {
          style: {
            color: isExpiredVal ? "#d32f2f" : isExpiring ? "#ed6c02" : void 0
          },
          children: [
            formatDate(row.expires),
            isExpiredVal && " (Expired)",
            isExpiring && !isExpiredVal && " (Expiring soon)"
          ]
        }
      );
    }
  }
];
function KeysTable({ keys, totalSpend }) {
  if (keys.length === 0) {
    return /* @__PURE__ */ jsx(
      WarningPanel,
      {
        title: "No API Keys Found",
        message: "You don't have any LiteLLM virtual keys. Keys will appear here once generated."
      }
    );
  }
  return /* @__PURE__ */ jsx(
    Table,
    {
      title: `Virtual Keys (Total: ${formatCurrency(totalSpend)})`,
      options: { search: false, paging: false },
      columns,
      data: keys
    }
  );
}

export { KeysTable };
//# sourceMappingURL=KeysTable.esm.js.map
