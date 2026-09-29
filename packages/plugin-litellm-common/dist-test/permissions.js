"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.litellmPermissions = exports.litellmTeamDeletePermission = exports.litellmTeamMcpManagePermission = exports.litellmTeamKnowledgebaseManagePermission = exports.litellmTeamMembersManagePermission = exports.litellmTeamManagePermission = exports.litellmTeamCreatePermission = exports.litellmAuditReadPermission = exports.litellmKeyUnblockPermission = exports.litellmKeyResetSpendPermission = exports.litellmKeyManagePermission = exports.litellmKeyRevokePermission = exports.litellmKeyCreatePermission = void 0;
const plugin_permission_common_1 = require("@backstage/plugin-permission-common");
exports.litellmKeyCreatePermission = (0, plugin_permission_common_1.createPermission)({
    name: 'litellm.key.create',
    attributes: { action: 'create' },
});
exports.litellmKeyRevokePermission = (0, plugin_permission_common_1.createPermission)({
    name: 'litellm.key.revoke',
    attributes: { action: 'delete' },
});
exports.litellmKeyManagePermission = (0, plugin_permission_common_1.createPermission)({
    name: 'litellm.key.manage',
    attributes: { action: 'update' },
});
exports.litellmKeyResetSpendPermission = (0, plugin_permission_common_1.createPermission)({
    name: 'litellm.key.resetSpend',
    attributes: { action: 'update' },
});
exports.litellmKeyUnblockPermission = (0, plugin_permission_common_1.createPermission)({
    name: 'litellm.key.unblock',
    attributes: { action: 'update' },
});
exports.litellmAuditReadPermission = (0, plugin_permission_common_1.createPermission)({
    name: 'litellm.audit.read',
    attributes: { action: 'read' },
});
// Team-management permissions — delegated to litellm-team-admins group
exports.litellmTeamCreatePermission = (0, plugin_permission_common_1.createPermission)({
    name: 'litellm.team.create',
    attributes: { action: 'create' },
});
exports.litellmTeamManagePermission = (0, plugin_permission_common_1.createPermission)({
    name: 'litellm.team.manage',
    attributes: { action: 'update' },
});
exports.litellmTeamMembersManagePermission = (0, plugin_permission_common_1.createPermission)({
    name: 'litellm.team.members.manage',
    attributes: { action: 'update' },
});
exports.litellmTeamKnowledgebaseManagePermission = (0, plugin_permission_common_1.createPermission)({
    name: 'litellm.team.knowledgebase.manage',
    attributes: { action: 'update' },
});
exports.litellmTeamMcpManagePermission = (0, plugin_permission_common_1.createPermission)({
    name: 'litellm.team.mcp.manage',
    attributes: { action: 'update' },
});
exports.litellmTeamDeletePermission = (0, plugin_permission_common_1.createPermission)({
    name: 'litellm.team.delete',
    attributes: { action: 'delete' },
});
exports.litellmPermissions = [
    exports.litellmKeyCreatePermission,
    exports.litellmKeyRevokePermission,
    exports.litellmKeyManagePermission,
    exports.litellmKeyResetSpendPermission,
    exports.litellmKeyUnblockPermission,
    exports.litellmAuditReadPermission,
    exports.litellmTeamCreatePermission,
    exports.litellmTeamManagePermission,
    exports.litellmTeamMembersManagePermission,
    exports.litellmTeamKnowledgebaseManagePermission,
    exports.litellmTeamMcpManagePermission,
    exports.litellmTeamDeletePermission,
];
