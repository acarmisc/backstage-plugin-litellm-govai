"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const budgets_1 = require("./budgets");
(0, node_test_1.describe)('budgets', () => {
    (0, node_test_1.describe)('BUDGET_WARNING_PCT', () => {
        (0, node_test_1.test)('equals 80', () => {
            node_assert_1.default.strictEqual(budgets_1.BUDGET_WARNING_PCT, 80);
        });
    });
    (0, node_test_1.describe)('BUDGET_DANGER_PCT', () => {
        (0, node_test_1.test)('equals 100', () => {
            node_assert_1.default.strictEqual(budgets_1.BUDGET_DANGER_PCT, 100);
        });
    });
    (0, node_test_1.describe)('budgetStatusForPct', () => {
        (0, node_test_1.test)('returns "ok" when under 80%', () => {
            node_assert_1.default.strictEqual((0, budgets_1.budgetStatusForPct)(0), 'ok');
            node_assert_1.default.strictEqual((0, budgets_1.budgetStatusForPct)(50), 'ok');
            node_assert_1.default.strictEqual((0, budgets_1.budgetStatusForPct)(79.9), 'ok');
        });
        (0, node_test_1.test)('returns "near" when 80-99%', () => {
            node_assert_1.default.strictEqual((0, budgets_1.budgetStatusForPct)(80), 'near');
            node_assert_1.default.strictEqual((0, budgets_1.budgetStatusForPct)(90), 'near');
            node_assert_1.default.strictEqual((0, budgets_1.budgetStatusForPct)(99.9), 'near');
        });
        (0, node_test_1.test)('returns "over" when at or above 100%', () => {
            node_assert_1.default.strictEqual((0, budgets_1.budgetStatusForPct)(100), 'over');
            node_assert_1.default.strictEqual((0, budgets_1.budgetStatusForPct)(120), 'over');
            node_assert_1.default.strictEqual((0, budgets_1.budgetStatusForPct)(Infinity), 'over');
        });
    });
    (0, node_test_1.describe)('formatDurationLabel', () => {
        (0, node_test_1.test)('formats single units correctly', () => {
            node_assert_1.default.strictEqual((0, budgets_1.formatDurationLabel)('1s'), '1 Second');
            node_assert_1.default.strictEqual((0, budgets_1.formatDurationLabel)('1m'), '1 Minute');
            node_assert_1.default.strictEqual((0, budgets_1.formatDurationLabel)('1h'), '1 Hour');
            node_assert_1.default.strictEqual((0, budgets_1.formatDurationLabel)('1d'), '1 Day');
            node_assert_1.default.strictEqual((0, budgets_1.formatDurationLabel)('1w'), '1 Week');
            node_assert_1.default.strictEqual((0, budgets_1.formatDurationLabel)('1y'), '1 Year');
        });
        (0, node_test_1.test)('formats plural units correctly', () => {
            node_assert_1.default.strictEqual((0, budgets_1.formatDurationLabel)('2s'), '2 Seconds');
            node_assert_1.default.strictEqual((0, budgets_1.formatDurationLabel)('7d'), '7 Days');
            node_assert_1.default.strictEqual((0, budgets_1.formatDurationLabel)('30d'), '30 Days');
            node_assert_1.default.strictEqual((0, budgets_1.formatDurationLabel)('90d'), '90 Days');
            node_assert_1.default.strictEqual((0, budgets_1.formatDurationLabel)('5w'), '5 Weeks');
        });
        (0, node_test_1.test)('returns the input unchanged for invalid formats', () => {
            node_assert_1.default.strictEqual((0, budgets_1.formatDurationLabel)('invalid'), 'invalid');
            node_assert_1.default.strictEqual((0, budgets_1.formatDurationLabel)(''), '');
            node_assert_1.default.strictEqual((0, budgets_1.formatDurationLabel)('d7'), 'd7');
        });
    });
});
