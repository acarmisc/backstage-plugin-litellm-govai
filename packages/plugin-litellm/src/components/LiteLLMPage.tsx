import React, { useState, useCallback } from 'react';
import { Grid, Box, Snackbar, Alert, CircularProgress } from '@mui/material';
import { useAsync, useAsyncRetry } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import { DashboardHeader } from './DashboardHeader';
import { KeysTable } from './KeysTable';
import { UsageStats } from './UsageStats';
import { liteLlmApiRef } from '../api';
import { DateRange, GenerateKeyRequest, GenerateKeyResponse } from '../types';

export const LiteLLMPage: React.FC = () => {
  const api = useApi(liteLlmApiRef);

  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    return { start, end };
  });

  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  const { value: userInfo, loading: userLoading } = useAsync(async () => {
    try {
      return await api.getUserInfo();
    } catch (e: any) {
      setSnackbar({ message: `Failed to load user info: ${e.message}`, severity: 'error' });
      return null;
    }
  }, [api]);

  const {
    value: keys,
    loading: keysLoading,
    retry: refreshKeys,
  } = useAsyncRetry(async () => {
    try {
      return await api.listKeys();
    } catch (e: any) {
      setSnackbar({ message: `Failed to load keys: ${e.message}`, severity: 'error' });
      return [];
    }
  }, [api]);

  const { value: models, loading: modelsLoading } = useAsync(async () => {
    try {
      return await api.listModels();
    } catch {
      return [];
    }
  }, [api]);

  const { value: usage, loading: usageLoading } = useAsync(async () => {
    const startDate = dateRange.start.toISOString().split('T')[0];
    const endDate = dateRange.end.toISOString().split('T')[0];
    return api.getUsage(startDate, endDate);
  }, [api, dateRange]);

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

  if ((userLoading || keysLoading || modelsLoading) && !userInfo && !keys) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box p={3}>
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <DashboardHeader userInfo={userInfo ?? null} loading={userLoading} />
        </Grid>
        <Grid item xs={12}>
          <KeysTable
            keys={keys ?? []}
            models={models ?? []}
            loading={keysLoading}
            onGenerateKey={handleGenerateKey}
            onDeleteKey={handleDeleteKey}
          />
        </Grid>
        <Grid item xs={12}>
          <UsageStats
            usage={usage ?? null}
            models={models ?? []}
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
