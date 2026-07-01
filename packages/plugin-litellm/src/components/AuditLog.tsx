import React, { useState, useCallback } from 'react';
import {
  Paper,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  MenuItem,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  Alert,
} from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material';
import { useAsync } from 'react-use';
import { LiteLlmApiInterface } from '../api';
import { AuditLogEntry, AuditLogsParams } from '../types';

interface AuditLogProps {
  api: LiteLlmApiInterface;
}

const ACTION_COLORS: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
  created: 'success',
  deleted: 'error',
  updated: 'warning',
  blocked: 'error',
  unblocked: 'success',
};

function actionColor(action?: string): 'success' | 'error' | 'warning' | 'info' | 'default' {
  if (!action) return 'default';
  for (const [key, color] of Object.entries(ACTION_COLORS)) {
    if (action.toLowerCase().includes(key)) return color;
  }
  return 'info';
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const DetailRow: React.FC<{ entry: AuditLogEntry }> = ({ entry }) => {
  const [open, setOpen] = useState(false);
  const hasDetail = entry.before_value || entry.updated_values;

  return (
    <>
      <TableRow hover>
        <TableCell sx={{ width: 40, pr: 0 }}>
          {hasDetail && (
            <IconButton size="small" onClick={() => setOpen(o => !o)}>
              {open ? <KeyboardArrowUp fontSize="small" /> : <KeyboardArrowDown fontSize="small" />}
            </IconButton>
          )}
        </TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(entry.updated_at)}</TableCell>
        <TableCell>
          {entry.action && (
            <Chip label={entry.action} color={actionColor(entry.action)} size="small" />
          )}
        </TableCell>
        <TableCell>{entry.table_name ?? '-'}</TableCell>
        <TableCell>
          <Typography variant="body2" component="code" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
            {entry.object_id ? entry.object_id.slice(0, 20) + (entry.object_id.length > 20 ? '…' : '') : '-'}
          </Typography>
        </TableCell>
        <TableCell>{entry.changed_by ?? '-'}</TableCell>
      </TableRow>
      {hasDetail && (
        <TableRow>
          <TableCell colSpan={6} sx={{ py: 0 }}>
            <Collapse in={open} unmountOnExit>
              <Box p={2} display="flex" gap={2} flexWrap="wrap">
                {entry.before_value && (
                  <Box flex={1} minWidth={200}>
                    <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>Before</Typography>
                    <Typography component="pre" variant="caption" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {JSON.stringify(entry.before_value, null, 2)}
                    </Typography>
                  </Box>
                )}
                {entry.updated_values && (
                  <Box flex={1} minWidth={200}>
                    <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>After</Typography>
                    <Typography component="pre" variant="caption" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {JSON.stringify(entry.updated_values, null, 2)}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Collapse>
          </TableCell>
        </TableRow>
      )}
    </>
  );
};

export const AuditLog: React.FC<AuditLogProps> = ({ api }) => {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [filters, setFilters] = useState<Pick<AuditLogsParams, 'action' | 'table_name' | 'changed_by'>>({});

  const fetchParams: AuditLogsParams = useCallback(
    () => ({ page: page + 1, page_size: pageSize, ...filters }),
    [page, pageSize, filters],
  )();

  const { value, loading, error } = useAsync(
    () => api.getAuditLogs(fetchParams),
    [api, fetchParams],
  );

  const entries: AuditLogEntry[] = value?.audit_logs ?? [];
  const total = value?.total ?? 0;

  return (
    <Paper>
      <Box p={2} display="flex" gap={2} flexWrap="wrap" alignItems="center">
        <Typography variant="h6" sx={{ flex: '0 0 auto', mr: 1 }}>Audit Log</Typography>
        <TextField
          size="small"
          label="Action"
          select
          value={filters.action ?? ''}
          onChange={e => { setFilters(f => ({ ...f, action: e.target.value || undefined })); setPage(0); }}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All actions</MenuItem>
          <MenuItem value="created">Created</MenuItem>
          <MenuItem value="updated">Updated</MenuItem>
          <MenuItem value="deleted">Deleted</MenuItem>
          <MenuItem value="blocked">Blocked</MenuItem>
        </TextField>
        <TextField
          size="small"
          label="Table"
          select
          value={filters.table_name ?? ''}
          onChange={e => { setFilters(f => ({ ...f, table_name: e.target.value || undefined })); setPage(0); }}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All tables</MenuItem>
          <MenuItem value="LiteLLM_VerificationToken">Key</MenuItem>
          <MenuItem value="LiteLLM_TeamTable">Team</MenuItem>
          <MenuItem value="LiteLLM_UserTable">User</MenuItem>
        </TextField>
        <TextField
          size="small"
          label="Changed by"
          value={filters.changed_by ?? ''}
          onChange={e => { setFilters(f => ({ ...f, changed_by: e.target.value || undefined })); setPage(0); }}
          sx={{ minWidth: 200 }}
        />
      </Box>

      {error && (
        <Box px={2} pb={2}>
          <Alert severity="error">{error.message}</Alert>
        </Box>
      )}

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 40 }} />
              <TableCell>Time</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>Table</TableCell>
              <TableCell>Object ID</TableCell>
              <TableCell>Changed By</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">No audit events found</Typography>
                </TableCell>
              </TableRow>
            ) : (
              entries.map(entry => <DetailRow key={entry.id} entry={entry} />)
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={pageSize}
        onRowsPerPageChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
        rowsPerPageOptions={[10, 25, 50]}
      />
    </Paper>
  );
};
