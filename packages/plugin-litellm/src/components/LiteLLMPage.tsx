import React, { useState, useCallback, useMemo } from 'react';
import { Box, Snackbar, Alert, CircularProgress, Typography, Paper, Tabs, Tab } from '@mui/material';
import { useAsync, useAsyncRetry } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import { DashboardHeader } from './DashboardHeader';
import { KeysTable } from './KeysTable';
import { UsageStats } from './UsageStats';
import { TeamUsage } from './TeamUsage';
import { AuditLog } from './AuditLog';
import { liteLlmApiRef } from '../api';
import { DateRange, GenerateKeyRequest, GenerateKeyResponse, UpdateKeyRequest, UsageMetrics } from '../types';

const PERIOD_LS_KEY = 'litellm_usage_period';

function initDateRange(): DateRange {
  let preset = '7d';
  try { preset = localStorage.getItem(PERIOD_LS_KEY) ?? '7d'; } catch { /* ignore */ }
  const end = new Date();
  const start = new Date();
  if (preset === 'today') start.setHours(0, 0, 0, 0);
  else if (preset === '24h') start.setHours(start.getHours() - 24);
  else if (preset === '30d') start.setDate(start.getDate() - 30);
  else start.setDate(start.getDate() - 7);
  return { start, end };
}

export const LiteLLMPage: React.FC = () => {
  const api = useApi(liteLlmApiRef);

  const [dateRange, setDateRange] = useState<DateRange>(initDateRange);
  const [activeTab, setActiveTab] = useState<'overview' | 'keys' | 'teams' | 'audit'>('overview');

  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'warning' | 'error' } | null>(null);

  // Team usage cache: teamId -> UsageMetrics
  const [teamUsageCache, setTeamUsageCache] = useState<Record<string, UsageMetrics | null>>({});
  const [teamUsageLoading, setTeamUsageLoading] = useState<Record<string, boolean>>({});

  const { value: userInfo, loading: userLoading, error: userError } = useAsync(
    () => api.getUserInfo(),
    [api],
  );

  const { value: keys, loading: keysLoading, retry: refreshKeys } = useAsyncRetry(
    async () => {
      try {
        return await api.listKeys();
      } catch (e: any) {
        setSnackbar({ message: `Failed to load keys: ${e.message}`, severity: 'error' });
        return [];
      }
    },
    [api],
  );

  const { value: allModels, loading: modelsLoading } = useAsync(
    () => api.listModels().catch(() => []),
    [api],
  );

  const { value: allTeams, loading: teamsLoading } = useAsync(
    () => api.getTeams().catch(() => []),
    [api],
  );

  // Filter to teams the current user belongs to
  const teams = useMemo(() => {
    if (!allTeams?.length) return [];
    if (!userInfo) return allTeams;
    const userId = userInfo.user_id;
    if (userInfo.teams?.length) {
      return allTeams.filter(t => userInfo.teams!.includes(t.team_id));
    }
    const byMembership = allTeams.filter(t =>
      t.members_with_roles?.some(m => m.user_id === userId),
    );
    return byMembership.length > 0 ? byMembership : allTeams;
  }, [allTeams, userInfo]);

  const { value: usage, loading: usageLoading } = useAsync(async () => {
    const startDate = dateRange.start.toISOString().split('T')[0];
    const endDate = dateRange.end.toISOString().split('T')[0];
    return api.getUsage(startDate, endDate);
  }, [api, dateRange]);

  // Invalidate team usage cache when date range changes so stale data isn't shown
  const handleDateRangeChange = useCallback((range: DateRange) => {
    setDateRange(range);
    setTeamUsageCache({});
    setTeamUsageLoading({});
  }, [setDateRange]);

  // Fetch team usage on demand when a team card is expanded
  const loadTeamUsage = useCallback(async (teamId: string) => {
    if (teamUsageCache[teamId] !== undefined || teamUsageLoading[teamId]) return;
    setTeamUsageLoading(prev => ({ ...prev, [teamId]: true }));
    try {
      const startDate = dateRange.start.toISOString().split('T')[0];
      const endDate = dateRange.end.toISOString().split('T')[0];
      const data = await api.getTeamUsage(teamId, startDate, endDate);
      setTeamUsageCache(prev => ({ ...prev, [teamId]: data }));
    } catch {
      setTeamUsageCache(prev => ({ ...prev, [teamId]: null }));
    } finally {
      setTeamUsageLoading(prev => ({ ...prev, [teamId]: false }));
    }
  }, [api, dateRange, teamUsageCache, teamUsageLoading]);

  // Models available for key generation: intersection of all models with user-level
  // and team-level restrictions. If a user has no model restrictions, all models are allowed.
  const allowedModels = useMemo(() => {
    if (!allModels?.length) return [];
    const userModels = userInfo?.models;
    const teamModels = teams?.flatMap(t => t.models ?? []);
    const hasUserRestriction = userModels && userModels.length > 0;
    const hasTeamRestriction = teamModels && teamModels.length > 0;
    if (!hasUserRestriction && !hasTeamRestriction) return allModels;
    const allowed = new Set([
      ...(hasUserRestriction ? userModels! : allModels.map(m => m.model_name)),
      ...(hasTeamRestriction ? teamModels! : []),
    ]);
    return allModels.filter(m => allowed.has(m.model_name));
  }, [allModels, userInfo, teams]);

  const handleGenerateKey = useCallback(
    async (request: GenerateKeyRequest): Promise<GenerateKeyResponse> => {
      const response = await api.generateKey(request);
      setSnackbar({ message: 'Key generated successfully', severity: 'success' });
      refreshKeys();
      return response;
    },
    [api, refreshKeys],
  );

  const handleUpdateKey = useCallback(
    async (keyId: string, request: UpdateKeyRequest) => {
      try {
        await api.updateKey(keyId, request);
        setSnackbar({ message: 'Key updated successfully', severity: 'success' });
        refreshKeys();
      } catch (e: any) {
        setSnackbar({ message: `Failed to update key: ${e.message}`, severity: 'error' });
        throw e;
      }
    },
    [api, refreshKeys],
  );

  const handleBlockKey = useCallback(
    async (keyId: string) => {
      try {
        await api.blockKey(keyId);
        setSnackbar({ message: 'Key blocked — requests will be rejected until unblocked', severity: 'warning' });
        refreshKeys();
      } catch (e: any) {
        setSnackbar({ message: `Failed to block key: ${e.message}`, severity: 'error' });
      }
    },
    [api, refreshKeys],
  );

  const handleUnblockKey = useCallback(
    async (keyId: string) => {
      try {
        await api.unblockKey(keyId);
        setSnackbar({ message: 'Key unblocked', severity: 'success' });
        refreshKeys();
      } catch (e: any) {
        setSnackbar({ message: `Failed to unblock key: ${e.message}`, severity: 'error' });
      }
    },
    [api, refreshKeys],
  );

  const handleResetKeySpend = useCallback(
    async (keyId: string) => {
      try {
        await api.resetKeySpend(keyId);
        setSnackbar({ message: 'Spend counter reset to $0', severity: 'success' });
        refreshKeys();
      } catch (e: any) {
        setSnackbar({ message: `Failed to reset spend: ${e.message}`, severity: 'error' });
      }
    },
    [api, refreshKeys],
  );

  const handleRotateKey = useCallback(
    async (keyId: string): Promise<GenerateKeyResponse> => {
      const response = await api.rotateKey(keyId);
      setSnackbar({ message: 'Key rotated — copy the new secret now', severity: 'success' });
      refreshKeys();
      return response;
    },
    [api, refreshKeys],
  );

  const handleDeleteKey = useCallback(
    async (keyId: string) => {
      try {
        await api.deleteKey(keyId);
        setSnackbar({ message: 'Key revoked successfully', severity: 'success' });
        refreshKeys();
      } catch (e: any) {
        if (e.body?.success && (e.body?.message?.includes('already deleted') || e.body?.message?.includes('never existed'))) {
          setSnackbar({ message: 'Key was already deleted', severity: 'warning' });
          refreshKeys();
          return;
        }
        setSnackbar({ message: `Failed to revoke key: ${e.message}`, severity: 'error' });
      }
    },
    [api, refreshKeys],
  );

  const handlePruneExpiredKeys = useCallback(
    async () => {
      try {
        const result = await api.pruneExpiredKeys();
        setSnackbar({ message: `Pruned ${result.pruned} expired key${result.pruned !== 1 ? 's' : ''}`, severity: 'success' });
        refreshKeys();
      } catch (e: any) {
        setSnackbar({ message: `Failed to prune expired keys: ${e.message}`, severity: 'error' });
      }
      return { pruned: 0 };
    },
    [api, refreshKeys],
  ) as () => Promise<{ pruned: number }>;

  const isInitialLoading = userLoading && !userInfo;

  if (isInitialLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <CircularProgress />
      </Box>
    );
  }

  // User exists in Backstage but has no LiteLLM account
  if (userError || !userInfo) {
    const isProvisioningEnabled = (userError as any)?.body?.provisioning === true;
    const hint = (userError as any)?.body?.hint;
    return (
      <Box p={3}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Account not provisioned</Typography>
          <Typography color="text.secondary" paragraph>
            Your Backstage account is not linked to a LiteLLM user.
          </Typography>
          {hint ? (
            <Typography variant="body2" color="text.secondary">{hint}</Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {isProvisioningEnabled
                ? 'Auto-provisioning is enabled but failed. Check the backend logs.'
                : 'Set litellm.provisioning.enabled: true in app-config.yaml to enable auto-provisioning, or ask your administrator to create the account manually.'}
            </Typography>
          )}
        </Paper>
      </Box>
    );
  }

  return (
    <Box p={3}>
      <Box mb={2}>
        <DashboardHeader userInfo={userInfo} teams={teams ?? []} loading={userLoading || teamsLoading} />
      </Box>

      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="Overview" value="overview" />
        <Tab label="Keys" value="keys" />
        <Tab label="Teams" value="teams" />
        {userInfo.can_view_audit && <Tab label="Audit Log" value="audit" />}
      </Tabs>

      {activeTab === 'overview' && (
        <UsageStats
          usage={usage ?? null}
          models={allModels ?? []}
          dateRange={dateRange}
          onDateRangeChange={handleDateRangeChange}
          loading={usageLoading}
          userInfo={userInfo}
        />
      )}

      {activeTab === 'keys' && (
        <KeysTable
          keys={keys ?? []}
          models={allowedModels}
          teams={teams ?? []}
          loading={keysLoading || modelsLoading}
          onGenerateKey={handleGenerateKey}
          onUpdateKey={handleUpdateKey}
          onRotateKey={handleRotateKey}
          onBlockKey={handleBlockKey}
          onUnblockKey={handleUnblockKey}
          onResetKeySpend={handleResetKeySpend}
          onDeleteKey={handleDeleteKey}
          onPruneExpiredKeys={handlePruneExpiredKeys}
        />
      )}

      {activeTab === 'teams' && (
        <TeamUsage
          teams={teams ?? []}
          loading={teamsLoading}
          dateRange={dateRange}
          getTeamUsage={teamId => {
            if (teamUsageCache[teamId] === undefined) loadTeamUsage(teamId);
            return teamUsageCache[teamId] ?? null;
          }}
          getTeamUsageLoading={teamId => teamUsageLoading[teamId] ?? false}
        />
      )}

      {activeTab === 'audit' && userInfo.can_view_audit && <AuditLog api={api} />}

      <Snackbar
        open={!!snackbar}
        autoHideDuration={5000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {snackbar ? (
          <Alert severity={snackbar.severity} onClose={() => setSnackbar(null)}>
            {snackbar.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
};
