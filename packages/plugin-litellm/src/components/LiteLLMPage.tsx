import React, { useState, useCallback, useMemo } from 'react';
import { Grid, Box, Snackbar, Alert, CircularProgress, Typography, Paper } from '@mui/material';
import { useAsync, useAsyncRetry } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import { DashboardHeader } from './DashboardHeader';
import { KeysTable } from './KeysTable';
import { UsageStats } from './UsageStats';
import { TeamUsage } from './TeamUsage';
import { liteLlmApiRef } from '../api';
import { DateRange, GenerateKeyRequest, GenerateKeyResponse, UsageMetrics } from '../types';

export const LiteLLMPage: React.FC = () => {
  const api = useApi(liteLlmApiRef);

  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    return { start, end };
  });

  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

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

  const { value: teams, loading: teamsLoading } = useAsync(
    () => api.getTeams().catch(() => []),
    [api],
  );

  const { value: usage, loading: usageLoading } = useAsync(async () => {
    const startDate = dateRange.start.toISOString().split('T')[0];
    const endDate = dateRange.end.toISOString().split('T')[0];
    return api.getUsage(startDate, endDate);
  }, [api, dateRange]);

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

  const handleDeleteKey = useCallback(
    async (keyId: string) => {
      try {
        await api.deleteKey(keyId);
        setSnackbar({ message: 'Key revoked successfully', severity: 'success' });
        refreshKeys();
      } catch (e: any) {
        setSnackbar({ message: `Failed to revoke key: ${e.message}`, severity: 'error' });
      }
    },
    [api, refreshKeys],
  );

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
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <DashboardHeader userInfo={userInfo} loading={userLoading} />
        </Grid>

        <Grid item xs={12}>
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
        </Grid>

        <Grid item xs={12}>
          <KeysTable
            keys={keys ?? []}
            models={allowedModels}
            loading={keysLoading || modelsLoading}
            onGenerateKey={handleGenerateKey}
            onDeleteKey={handleDeleteKey}
          />
        </Grid>

        <Grid item xs={12}>
          <UsageStats
            usage={usage ?? null}
            models={allModels ?? []}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            loading={usageLoading}
          />
        </Grid>
      </Grid>

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
