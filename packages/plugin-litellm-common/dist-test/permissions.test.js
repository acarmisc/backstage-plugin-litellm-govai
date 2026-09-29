"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const permissions_1 = require("./permissions");
(0, node_test_1.describe)('litellmPermissions', () => {
    (0, node_test_1.test)('all permission names are unique', () => {
        const names = permissions_1.litellmPermissions.map(p => p.name);
        const uniqueNames = new Set(names);
        node_assert_1.default.strictEqual(names.length, uniqueNames.size, `Expected all permission names to be unique, but found duplicates: ${names.join(', ')}`);
    });
    (0, node_test_1.test)('all permission names start with litellm.', () => {
        for (const perm of permissions_1.litellmPermissions) {
            node_assert_1.default.ok(perm.name.startsWith('litellm.'), `Expected permission name to start with "litellm.", got "${perm.name}"`);
        }
    });
    (0, node_test_1.test)('contains all 6 key/audit permissions', () => {
        const permNames = permissions_1.litellmPermissions.map(p => p.name);
        node_assert_1.default.ok(permNames.includes('litellm.key.create'));
        node_assert_1.default.ok(permNames.includes('litellm.key.revoke'));
        node_assert_1.default.ok(permNames.includes('litellm.key.manage'));
        node_assert_1.default.ok(permNames.includes('litellm.key.resetSpend'));
        node_assert_1.default.ok(permNames.includes('litellm.key.unblock'));
        node_assert_1.default.ok(permNames.includes('litellm.audit.read'));
    });
    (0, node_test_1.test)('contains all 6 new team-management permissions', () => {
        const permNames = permissions_1.litellmPermissions.map(p => p.name);
        node_assert_1.default.ok(permNames.includes('litellm.team.create'));
        node_assert_1.default.ok(permNames.includes('litellm.team.manage'));
        node_assert_1.default.ok(permNames.includes('litellm.team.members.manage'));
        node_assert_1.default.ok(permNames.includes('litellm.team.knowledgebase.manage'));
        node_assert_1.default.ok(permNames.includes('litellm.team.mcp.manage'));
        node_assert_1.default.ok(permNames.includes('litellm.team.delete'));
    });
    (0, node_test_1.test)('team.create has action "create"', () => {
        node_assert_1.default.strictEqual(permissions_1.litellmTeamCreatePermission.attributes.action, 'create');
    });
    (0, node_test_1.test)('team.manage has action "update"', () => {
        node_assert_1.default.strictEqual(permissions_1.litellmTeamManagePermission.attributes.action, 'update');
    });
    (0, node_test_1.test)('team.members.manage has action "update"', () => {
        node_assert_1.default.strictEqual(permissions_1.litellmTeamMembersManagePermission.attributes.action, 'update');
    });
    (0, node_test_1.test)('team.knowledgebase.manage has action "update"', () => {
        node_assert_1.default.strictEqual(permissions_1.litellmTeamKnowledgebaseManagePermission.attributes.action, 'update');
    });
    (0, node_test_1.test)('team.mcp.manage has action "update"', () => {
        node_assert_1.default.strictEqual(permissions_1.litellmTeamMcpManagePermission.attributes.action, 'update');
    });
    (0, node_test_1.test)('team.delete has action "delete"', () => {
        node_assert_1.default.strictEqual(permissions_1.litellmTeamDeletePermission.attributes.action, 'delete');
    });
    (0, node_test_1.test)('original key/audit permissions still have correct actions', () => {
        node_assert_1.default.strictEqual(permissions_1.litellmKeyCreatePermission.attributes.action, 'create');
        node_assert_1.default.strictEqual(permissions_1.litellmKeyRevokePermission.attributes.action, 'delete');
        node_assert_1.default.strictEqual(permissions_1.litellmKeyManagePermission.attributes.action, 'update');
        node_assert_1.default.strictEqual(permissions_1.litellmAuditReadPermission.attributes.action, 'read');
    });
    (0, node_test_1.test)('key.resetSpend has action "update"', () => {
        node_assert_1.default.strictEqual(permissions_1.litellmKeyResetSpendPermission.attributes.action, 'update');
    });
    (0, node_test_1.test)('key.unblock has action "update"', () => {
        node_assert_1.default.strictEqual(permissions_1.litellmKeyUnblockPermission.attributes.action, 'update');
    });
});
