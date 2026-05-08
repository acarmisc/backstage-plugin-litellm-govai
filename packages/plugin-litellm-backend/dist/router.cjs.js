'use strict';

var express = require('express');
var client = require('./client.cjs.js');

function _interopDefaultCompat (e) { return e && typeof e === 'object' && 'default' in e ? e : { default: e }; }

var express__default = /*#__PURE__*/_interopDefaultCompat(express);

async function createRouter(options) {
  const { config, httpAuth, logger } = options;
  const client$1 = new client.LiteLLMClient(config);
  const router = express__default.default.Router();
  router.get("/info", async (req, res) => {
    try {
      const userContext = await resolveUserContext(httpAuth, req);
      logger.info(`Fetching user info for: ${userContext.userId}`);
      const userInfo = await client$1.getUserInfo(userContext.userId);
      res.json({
        ...userInfo,
        context: userContext
      });
    } catch (error) {
      logger.error("Failed to fetch user info", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  });
  router.get("/teams", async (_req, res) => {
    try {
      const teams = await client$1.listTeams();
      res.json(teams);
    } catch (error) {
      logger.error("Failed to fetch teams", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  });
  router.get("/usage", async (req, res) => {
    try {
      const userContext = await resolveUserContext(httpAuth, req);
      const days = parseInt(req.query.days, 10) || 7;
      logger.info(`Fetching usage for: ${userContext.userId}, days: ${days}`);
      const usage = await client$1.getDailyActivity(userContext.userId, days);
      res.json({ usage });
    } catch (error) {
      logger.error("Failed to fetch usage", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  });
  router.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  return router;
}
async function resolveUserContext(httpAuth, req) {
  const credentials = await httpAuth.credentials(req);
  const principalRef = credentials.principal.userEntityRef ?? credentials.principal.subject ?? "";
  const email = principalRef ? principalRef.split(":").pop() || "user@unknown" : "user@unknown";
  return {
    userId: email,
    email,
    entityRef: principalRef
  };
}

exports.createRouter = createRouter;
//# sourceMappingURL=router.cjs.js.map
