import React, { useState, useEffect, useCallback } from 'react';
import { Grid, Box, Snackbar, Alert, CircularProgress } from '@material-ui/core';
import { useAsync } from 'react-use';
import { DashboardHeader } from './DashboardHeader';
import { KeysTable } from './KeysTable';
import { UsageStats } from './UsageStats';
import { LiteLlmApi } from '../api';
import { FetchApi } from '@backstage/core-plugin-api';
import { DateRange, GenerateKeyRequest, GenerateKeyResponse } from '../types';

interface LiteLLMPageProps {
  fetchApi: FetchApi;
}

export const LiteLLMPage: React.FC<LiteLLMPageProps> = ({ fetchApi }) => {
  const api = new LiteLlmApi(fetchApi);

  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    return { start, end };
  });

  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  const {
    value: userInfo,
    loading: userLoading,
    error: userError,
  } = useAsync(async () => {
    try {
      return await api.getUserInfo();
    } catch (e: any) {
      setSnackbar({ message: `Failed to load user info: ${e.message}`, severity: 'error' });
      return null;
    }
  }, []);

  const {
    value: keys,
    loading: keysLoading,
    error: keysError,
    refresh: refreshKeys,
  } = useAsync(async () => {
    try {
      return await api.listKeys();
    } catch (e: any) {
      setSnackbar({ message: `Failed to load keys: ${e.message}`, severity: 'error' });
      return [];
    }
  }, []);

  const {
    value: models,
    loading: modelsLoading,
  } = useAsync(async () => {
    try {
      return await api.listModels();
    } catch {
      return [];
    }
  }, []);

  const {
    value: usage,
    loading: usageLoading,
  } = useAsync(async () => {
    const startDate = dateRange.start.toISOString().split('T')[0];
    const endDate = dateRange.end.toISOString().split('T')[0];
    return api.getUsage(startDate, endDate);
  }, [dateRange]);

  useEffect(() => {
    if (userError) {
      setSnackbar({ message: `Error: ${userError.message}`, severity: 'error' });
    }
    if (keysError) {
      setSnackbar({ message: `Error: ${keysError.message}`, severity: 'error' });
    }
  }, [userError, keysError]);

  const handleGenerateKey = useCallback(async (request: GenerateKeyRequest): Promise<GenerateKeyResponse> => {
    const response = await api.generateKey(request);
    setSnackbar({ message: 'Key generated successfully', severity: 'success' });
    refreshKeys();
    return response;
  }, [api, refreshKeys]);

  const handleDeleteKey = useCallback(async (keyId: string) => {
    try {
      await api.deleteKey(keyId);
      setSnackbar({ message: 'Key revoked successfully', severity: 'success' });
      refreshKeys();
    } catch (e: any) {
      setSnackbar({ message: `Failed to revoke key: ${e.message}`, severity: 'error' });
    }
  }, [api, refreshKeys]);

  const isLoading = userLoading || keysLoading || modelsLoading;

  if (isLoading && !userInfo && !keys) {
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
          <DashboardHeader userInfo={userInfo} loading={userLoading} />
        </Grid>
        <Grid item xs={12}>
          <KeysTable
            keys={keys || []}
            models={models || []}
            loading={keysLoading}
            onGenerateKey={handleGenerateKey}
            onDeleteKey={handleDeleteKey}
          />
        </Grid>
        <Grid item xs={12}>
          <UsageStats
            usage={usage || null}
            models={models || []}
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
        {snackbar && (
          <Alert severity={snackbar.severity} onClose={() => setSnackbar(null)}>
            {snackbar.message}
          </Alert>
        )}
      </Snackbar>
    </Box>
  );
};