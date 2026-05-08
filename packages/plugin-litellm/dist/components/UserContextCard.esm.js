import { jsx, jsxs } from 'react/jsx-runtime';
import { InfoCard } from '@backstage/core-components';

function UserContextCard({ context }) {
  return /* @__PURE__ */ jsx(
    InfoCard,
    {
      title: "User Identity",
      children: /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: 8 }, children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("strong", { children: "User ID:" }),
          " ",
          context.userId
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("strong", { children: "Email:" }),
          " ",
          context.email
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("strong", { children: "Entity Ref:" }),
          " ",
          /* @__PURE__ */ jsx("code", { children: context.entityRef })
        ] })
      ] })
    }
  );
}

export { UserContextCard };
//# sourceMappingURL=UserContextCard.esm.js.map
