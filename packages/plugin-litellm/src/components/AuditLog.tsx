import React, { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TablePagination from '@mui/material/TablePagination';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Alert from '@mui/material/Alert';
import { alpha } from '@mui/material/styles';
import { KeyboardArrowDown } from '@mui/icons-material';
import { useAsync } from 'react-use';
import { LiteLlmApiInterface } from '../api';
import { AuditLogEntry, AuditLogsParams } from '../types';
import { EmptyState, SectionCard, StatusPill, Tone, dataTableSx } from './ui';

interface AuditLogProps {
  api: LiteLlmApiInterface;
}

const ACTION_TONES: Record<string, Tone> = {
  created: 'success',
  deleted: 'danger',
  updated: 'warning',
  blocked: 'danger',
  unblocked: 'success',
};

function actionTone(action?: string): Tone {
  if (!action) return 'neutral';
  for (const [key, tone] of Object.entries(ACTION_TONES)) {
    if (action.toLowerCase().includes(key)) return tone;
  }
  return 'info';
}

/** `LiteLLM_VerificationToken` → `Key`; falls back to the raw table name. */
const TABLE_LABELS: Record<string, string> = {
  LiteLLM_VerificationToken: 'Key',
  LiteLLM_TeamTable: 'Team',
  LiteLLM_UserTable: 'User',
};

function prettyTableName(name?: string | null): string {
  if (!name) return '—';
  return TABLE_LABELS[name] ?? name;
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
      <TableRow>
        <TableCell sx={{ width: 40, pr: 0 }}>
          {hasDetail && (
            <IconButton
              size="small"
              onClick={() => setOpen(o => !o)}
              aria-label={open ? 'Hide changes' : 'Show changes'}
              aria-expanded={open}
              sx={theme => ({
                color: theme.palette.text.secondary,
                transform: open ? 'rotate(180deg)' : 'none',
                transition: theme.transitions.create('transform'),
              })}
            >
              <KeyboardArrowDown fontSize="small" />
            </IconButton>
          )}
        </TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>
          <Typography variant="body2" color="text.secondary">{formatDateTime(entry.updated_at)}</Typography>
        </TableCell>
        <TableCell>
          {entry.action && <StatusPill label={entry.action} tone={actionTone(entry.action)} />}
        </TableCell>
        <TableCell>
          <Typography variant="body2">{prettyTableName(entry.table_name)}</Typography>
        </TableCell>
        <TableCell>
          <Typography
            variant="body2"
            component="code"
            color="text.secondary"
            title={entry.object_id ?? undefined}
            sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}
          >
            {entry.object_id ? entry.object_id.slice(0, 20) + (entry.object_id.length > 20 ? '…' : '') : '—'}
          </Typography>
        </TableCell>
        <TableCell>{entry.changed_by ?? '—'}</TableCell>
      </TableRow>
      {/* The `&&` selectors below double specificity so they beat the
          table-level `tbody td` rules in dataTableSx — otherwise the collapsed
          row keeps its cell padding and border, leaving an empty stripe
          between entries. */}
      {hasDetail && (
        <TableRow sx={{ '&&:hover': { bgcolor: 'transparent' } }}>
          <TableCell colSpan={6} sx={{ '&&': { py: 0, border: 0 } }}>
            <Collapse in={open} unmountOnExit>
              <Box
                display="flex"
                gap={2}
                flexWrap="wrap"
                sx={theme => ({
                  p: 2,
                  mb: 1.5,
                  borderRadius: 1.5,
                  bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.05 : 0.03),
                })}
              >
                {entry.before_value && (
                  <Box flex={1} minWidth={200}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                      mb={0.75}
                      sx={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' }}
                    >
                      Before
                    </Typography>
                    <Typography component="pre" variant="caption" sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', m: 0 }}>
                      {JSON.stringify(entry.before_value, null, 2)}
                    </Typography>
                  </Box>
                )}
                {entry.updated_values && (
                  <Box flex={1} minWidth={200}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                      mb={0.75}
                      sx={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' }}
                    >
                      After
                    </Typography>
                    <Typography component="pre" variant="caption" sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', m: 0 }}>
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

function renderAuditLogBody(loading: boolean, entries: AuditLogEntry[]) {
  if (loading) {
    return (
      <TableRow>
        <TableCell colSpan={6} sx={{ py: 2 }}>
          <Skeleton variant="rounded" height={160} />
        </TableCell>
      </TableRow>
    );
  }
  if (entries.length === 0) {
    return (
      <TableRow>
        <TableCell colSpan={6}>
          <EmptyState
            message="No audit events found"
            hint="Try widening the filters or a different time window."
          />
        </TableCell>
      </TableRow>
    );
  }
  return entries.map(entry => <DetailRow key={entry.id} entry={entry} />);
}

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
    <SectionCard
      title="Audit Log"
      subtitle={loading ? 'Loading…' : `${total.toLocaleString()} event${total === 1 ? '' : 's'}`}
      flush
      actions={
        <>
          <TextField
            size="small"
            label="Action"
            select
            value={filters.action ?? ''}
            onChange={e => { setFilters(f => ({ ...f, action: e.target.value || undefined })); setPage(0); }}
            sx={{ minWidth: 150 }}
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
            sx={{ minWidth: 150 }}
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
            sx={{ minWidth: 180 }}
          />
        </>
      }
    >
      {error && (
        <Box px={2.5} pb={2}>
          <Alert severity="error">{error.message}</Alert>
        </Box>
      )}

      <TableContainer>
        <Table size="small" sx={dataTableSx}>
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
            {renderAuditLogBody(loading, entries)}
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
        sx={theme => ({ borderTop: `1px solid ${theme.palette.divider}` })}
      />
    </SectionCard>
  );
};
