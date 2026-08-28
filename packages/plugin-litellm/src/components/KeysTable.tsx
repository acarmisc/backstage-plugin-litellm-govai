import React, { useState, useMemo } from 'react';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import Autocomplete from '@mui/material/Autocomplete';
import Skeleton from '@mui/material/Skeleton';
import InputAdornment from '@mui/material/InputAdornment';
import { alpha } from '@mui/material/styles';
import { ContentCopy, Delete, Add, Edit, Autorenew, Search, Lock, LockOpen } from '@mui/icons-material';
import { expiryStatus } from '../api';
import {
  VirtualKey,
  ModelInfo,
  UpdateKeyRequest,
} from '../types';
import {
  EmptyState,
  Meter,
  SectionCard,
  StatusPill,
  TagChip,
  Tone,
  dataTableSx,
  quietIconButtonSx,
} from './ui';

interface KeysTableProps {
  keys: VirtualKey[];
  models: ModelInfo[];
  /** Opens the shared "Generate New Key" dialog (rendered at page level). */
  onGenerateKeyClick: () => void;
  loading: boolean;
  onUpdateKey: (keyId: string, request: UpdateKeyRequest) => Promise<void>;
  onBlockKey: (keyId: string) => Promise<void>;
  onUnblockKey: (keyId: string) => Promise<void>;
  onResetKeySpend: (keyId: string) => Promise<void>;
  onDeleteKey: (keyId: string) => Promise<void>;
  onPruneExpiredKeys: () => Promise<{ pruned: number }>;
}

const maskKey = (key: string): string => {
  if (key.length <= 8) return '***';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
};

const shortKeyId = (token: string): string => {
  if (!token) return '-';
  if (token.length <= 16) return token;
  return `${token.slice(0, 12)}…`;
};

const formatDate = (dateStr: string): string => {
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return dateStr;
  }
};

function expiryChipLabel(status: 'expired' | 'soon' | 'ok', expiresAt: string): string {
  if (status === 'expired') return 'Expired';
  if (status === 'soon') return `${Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)}d left`;
  return formatDate(expiresAt);
}

function expiryTone(status: 'expired' | 'soon' | 'ok'): Tone {
  if (status === 'expired') return 'danger';
  if (status === 'soon') return 'warning';
  return 'neutral';
}

function ExpiryCell({ expiresAt }: { expiresAt?: string }) {
  const status = expiryStatus(expiresAt);
  if (!status) {
    return <Typography variant="body2" color="text.secondary">Never</Typography>;
  }
  // A key that is simply valid needs no badge — plain text keeps the column
  // quiet so the handful of expired/expiring rows actually stand out.
  if (status === 'ok') {
    return (
      <Typography variant="body2" color="text.secondary">
        {formatDate(expiresAt!)}
      </Typography>
    );
  }
  return (
    <StatusPill
      label={expiryChipLabel(status, expiresAt!)}
      tone={expiryTone(status)}
      title={`Expires ${formatDate(expiresAt!)}`}
    />
  );
}

function budgetTone(pct: number): Tone {
  if (pct >= 100) return 'danger';
  if (pct >= 80) return 'warning';
  return 'accent';
}

function keyBlockIcon(isBlocking: boolean, blocked?: boolean) {
  if (isBlocking) return <CircularProgress size={18} />;
  if (blocked) return <LockOpen fontSize="small" />;
  return <Lock fontSize="small" />;
}

function BudgetCell({ spend, maxBudget }: { spend: number; maxBudget?: number }) {
  if (!maxBudget) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        ${spend.toFixed(2)}
        <Typography component="span" variant="caption" sx={{ ml: 0.5, opacity: 0.7 }}>
          / ∞
        </Typography>
      </Typography>
    );
  }
  const pct = Math.min(100, (spend / maxBudget) * 100);
  return (
    <Box minWidth={104}>
      <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', mb: 0.5 }}>
        ${spend.toFixed(2)}
        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
          / ${maxBudget}
        </Typography>
      </Typography>
      <Meter value={pct} tone={budgetTone(pct)} height={4} />
    </Box>
  );
}

function fmtCost(perToken?: number): string | null {
  if (!perToken) return null;
  const per1k = perToken * 1000;
  return per1k < 0.01 ? `$${(perToken * 1_000_000).toFixed(2)}/M` : `$${per1k.toFixed(3)}/1K`;
}

function formatContextWindow(
  maxInput?: number,
  maxOutput?: number,
): string | null {
  if (!maxInput && !maxOutput) return null;
  const fmt = (n?: number) => {
    if (!n) return null;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1000)}K`;
    return String(n);
  };
  const inPart = fmt(maxInput);
  const outPart = fmt(maxOutput);
  if (inPart && outPart) return `ctx ${inPart} in / ${outPart} out`;
  if (inPart) return `ctx ${inPart}`;
  if (outPart) return `ctx ${outPart} out`;
  return null;
}

const keyToEditForm = (k: VirtualKey): UpdateKeyRequest => ({
  key_alias: k.key_alias ?? '',
  models: k.models ?? [],
  max_budget: k.max_budget,
  tpm_limit: k.tpm_limit,
  rpm_limit: k.rpm_limit,
});

type SortKey = 'alias' | 'created' | 'expires' | 'budget' | 'limits' | 'models';
type SortDirection = 'asc' | 'desc';

function compareKeys(a: VirtualKey, b: VirtualKey, sortKey: SortKey): number {
  switch (sortKey) {
    case 'alias': return (a.key_alias ?? '').localeCompare(b.key_alias ?? '');
    case 'created': return a.created_at.localeCompare(b.created_at);
    case 'expires': return (a.expires_at ?? '').localeCompare(b.expires_at ?? '');
    case 'budget': return (a.max_budget ?? Infinity) - (b.max_budget ?? Infinity);
    case 'limits': return (a.tpm_limit ?? Infinity) - (b.tpm_limit ?? Infinity) || (a.rpm_limit ?? Infinity) - (b.rpm_limit ?? Infinity);
    case 'models': return (a.models ?? []).join(',').localeCompare((b.models ?? []).join(','));
    default: return 0;
  }
}

export const KeysTable: React.FC<KeysTableProps> = ({
  keys,
  models,
  loading,
  onGenerateKeyClick,
  onUpdateKey,
  onBlockKey,
  onUnblockKey,
  onResetKeySpend,
  onDeleteKey,
  onPruneExpiredKeys,
}) => {
  const [editingKey, setEditingKey] = useState<VirtualKey | null>(null);
  const [editForm, setEditForm] = useState<UpdateKeyRequest>({});
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Block/unblock
  const [blockingKeyId, setBlockingKeyId] = useState<string | null>(null);

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Reset spend (lives inside edit dialog)
  const [resetSpendConfirm, setResetSpendConfirm] = useState(false);
  const [resetSpendSubmitting, setResetSpendSubmitting] = useState(false);

  // Filter
  const [filterText, setFilterText] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (nextSortKey: SortKey) => {
    if (sortKey === nextSortKey) {
      setSortDirection(current => current === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(nextSortKey);
      setSortDirection('asc');
    }
  };

  const filteredKeys = useMemo(() => {
    let result = keys;
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      result = keys.filter(k =>
        (k.key_alias ?? '').toLowerCase().includes(q) ||
        k.models?.some(m => m.toLowerCase().includes(q)),
      );
    }
    return [...result].sort((a, b) => {
      const comparison = compareKeys(a, b, sortKey);
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [keys, filterText, sortKey, sortDirection]);

  const editSelectedModels = models.filter(m => (editForm.models || []).includes(m.model_name));

  const handleOpenEdit = (k: VirtualKey) => {
    setEditingKey(k);
    setEditForm(keyToEditForm(k));
  };

  const handleCloseEdit = () => {
    setEditingKey(null);
    setEditForm({});
    setResetSpendConfirm(false);
  };

  const handleUpdate = async () => {
    if (!editingKey) return;
    setEditSubmitting(true);
    try {
      await onUpdateKey(editingKey.token ?? editingKey.key, editForm);
      handleCloseEdit();
    } catch (error) {
      // eslint-disable-next-line no-console -- TODO: surface via a snackbar/alert instead of console-only
      console.error('Failed to update key:', error);
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleToggleBlock = async (key: VirtualKey) => {
    const keyId = key.token ?? key.key;
    setBlockingKeyId(keyId);
    try {
      if (key.blocked) {
        await onUnblockKey(keyId);
      } else {
        await onBlockKey(keyId);
      }
    } finally {
      setBlockingKeyId(null);
    }
  };

  const handleResetSpend = async () => {
    if (!editingKey) return;
    setResetSpendSubmitting(true);
    try {
      await onResetKeySpend(editingKey.token ?? editingKey.key);
      setResetSpendConfirm(false);
      handleCloseEdit();
    } finally {
      setResetSpendSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmId) return;
    setDeleteSubmitting(true);
    try {
      await onDeleteKey(deleteConfirmId);
    } finally {
      setDeleteSubmitting(false);
      setDeleteConfirmId(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Prune expired keys
  const [pruneConfirmCount, setPruneConfirmCount] = useState<number | null>(null);
  const [pruneSubmitting, setPruneSubmitting] = useState(false);

  const expiredKeys = useMemo(() => {
    return keys.filter(k => expiryStatus(k.expires_at) === 'expired');
  }, [keys]);

  const handlePruneExpired = async () => {
    if (pruneConfirmCount === null || pruneConfirmCount === 0) return;
    setPruneSubmitting(true);
    try {
      await onPruneExpiredKeys();
    } catch (error) {
      // eslint-disable-next-line no-console -- TODO: surface via a snackbar/alert instead of console-only
      console.error('Failed to prune expired keys:', error);
    } finally {
      setPruneSubmitting(false);
      setPruneConfirmCount(null);
    }
  };

  const modelOption = (m: ModelInfo) => {
    const inCost = fmtCost(m.input_cost_per_token);
    const outCost = fmtCost(m.output_cost_per_token);
    const ctx = formatContextWindow(m.max_input_tokens, m.max_output_tokens);
    return (
      <Box>
        <span>{m.model_name}</span>
        {m.supports_function_calling && ' 🔧'}
        {m.supports_vision && ' 👁️'}
        {ctx && (
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            {ctx}
          </Typography>
        )}
        {(inCost || outCost) && (
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            {inCost} in · {outCost} out
          </Typography>
        )}
      </Box>
    );
  };

  const renderTableBody = () => {
    if (loading) {
      return (
        <TableRow>
          <TableCell colSpan={8} sx={{ py: 2 }}>
            <Skeleton variant="rounded" height={140} />
          </TableCell>
        </TableRow>
      );
    }
    if (filteredKeys.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={8}>
            {filterText ? (
              <EmptyState
                message="No keys match that filter"
                hint="Try a different alias or model name."
              />
            ) : (
              <EmptyState
                message="No keys yet"
                hint="Generate your first key to start calling models."
                action={
                  <Button
                    variant="contained"
                    color="primary"
                    size="small"
                    disableElevation
                    startIcon={<Add />}
                    onClick={onGenerateKeyClick}
                    sx={{ mt: 1 }}
                  >
                    Generate Your First Key
                  </Button>
                }
              />
            )}
          </TableCell>
        </TableRow>
      );
    }
    return filteredKeys.map((key) => {
      const keyId = key.token ?? key.key;
      const isBlocking = blockingKeyId === keyId;
      const keyModels = key.models ?? [];
      return (
        <TableRow
          key={keyId}
          sx={
            key.blocked
              ? theme => ({
                  // A left rule reads as "suspended" without greying the row into
                  // illegibility the way a full background tint does.
                  boxShadow: `inset 3px 0 0 0 ${theme.palette.error.main}`,
                  '& td': { color: theme.palette.text.secondary },
                })
              : undefined
          }
        >
          <TableCell>
            <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
              <Typography variant="body2">
                {key.key_alias || '—'}
              </Typography>
              {key.blocked && <StatusPill label="Blocked" tone="danger" />}
            </Box>
          </TableCell>
          <TableCell>
            <Box display="flex" alignItems="center" gap={0.5}>
              <Typography
                variant="body2"
                component="code"
                color="text.secondary"
                title={keyId}
                sx={theme => ({
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 12,
                  bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.08 : 0.05),
                  px: 0.75,
                  py: 0.375,
                  borderRadius: '5px',
                })}
              >
                {shortKeyId(keyId)}
              </Typography>
              <IconButton
                size="small"
                onClick={() => copyToClipboard(keyId)}
                title="Copy Key ID"
                sx={quietIconButtonSx('accent')}
              >
                <ContentCopy sx={{ fontSize: 15 }} />
              </IconButton>
            </Box>
          </TableCell>
          <TableCell>
            <Typography variant="body2" color="text.secondary">{formatDate(key.created_at)}</Typography>
          </TableCell>
          <TableCell>
            <ExpiryCell expiresAt={key.expires_at} />
          </TableCell>
          <TableCell>
            <BudgetCell spend={key.spend ?? 0} maxBudget={key.max_budget} />
          </TableCell>
          <TableCell>
            <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {key.tpm_limit ?? '∞'} / {key.rpm_limit ?? '∞'}
            </Typography>
          </TableCell>
          <TableCell>
            {keyModels.length === 0 ? (
              <Typography variant="body2" color="text.secondary">All models</Typography>
            ) : (
              <Box display="flex" gap={0.5} flexWrap="wrap">
                {keyModels.slice(0, 2).map((model) => (
                  <TagChip key={model} label={model} title={model} />
                ))}
                {keyModels.length > 2 && (
                  <TagChip
                    label={`+${keyModels.length - 2}`}
                    mono={false}
                    title={keyModels.slice(2).join(', ')}
                  />
                )}
              </Box>
            )}
          </TableCell>
          <TableCell align="right">
            <Box display="flex" justifyContent="flex-end" gap={0.25}>
              <IconButton
                size="small"
                onClick={() => handleOpenEdit(key)}
                title="Edit key"
                sx={quietIconButtonSx('accent')}
              >
                <Edit fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => handleToggleBlock(key)}
                disabled={isBlocking}
                title={key.blocked ? 'Unblock key' : 'Block key — suspends without revoking'}
                sx={quietIconButtonSx('warning')}
              >
                {keyBlockIcon(isBlocking, key.blocked)}
              </IconButton>
              <IconButton
                size="small"
                onClick={() => setDeleteConfirmId(keyId)}
                title="Revoke key"
                sx={quietIconButtonSx('danger')}
              >
                <Delete fontSize="small" />
              </IconButton>
            </Box>
          </TableCell>
        </TableRow>
      );
    });
  };

  return (
    <>
      <SectionCard
        title="Virtual Keys"
        subtitle={
          loading
            ? 'Loading…'
            : `${filteredKeys.length}${filterText ? ` of ${keys.length}` : ''} key${filteredKeys.length === 1 ? '' : 's'}`
        }
        flush
        actions={
          <>
            <TextField
              size="small"
              label="Search alias or model"
              placeholder="Search alias or model…"
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              sx={{ minWidth: 240 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search fontSize="small" color="disabled" />
                  </InputAdornment>
                ),
              }}
            />
            {expiredKeys.length > 0 && (
              <Button
                variant="outlined"
                color="inherit"
                startIcon={<Autorenew />}
                onClick={() => setPruneConfirmCount(expiredKeys.length)}
                sx={theme => ({
                  color: theme.palette.text.secondary,
                  borderColor: theme.palette.divider,
                  '&:hover': {
                    color: theme.palette.error.main,
                    borderColor: alpha(theme.palette.error.main, 0.5),
                    bgcolor: alpha(theme.palette.error.main, 0.06),
                  },
                })}
              >
                Prune expired ({expiredKeys.length})
              </Button>
            )}
            <Button
              variant="contained"
              color="primary"
              disableElevation
              startIcon={<Add />}
              onClick={onGenerateKeyClick}
            >
              Generate New Key
            </Button>
          </>
        }
      >
        <TableContainer>
          <Table size="small" sx={dataTableSx}>
            <TableHead>
              <TableRow>
                <TableCell sortDirection={sortKey === 'alias' ? sortDirection : false}>
                  <TableSortLabel active={sortKey === 'alias'} direction={sortKey === 'alias' ? sortDirection : 'asc'} onClick={() => handleSort('alias')}>Alias</TableSortLabel>
                </TableCell>
                <TableCell>Key ID</TableCell>
                <TableCell sortDirection={sortKey === 'created' ? sortDirection : false}>
                  <TableSortLabel active={sortKey === 'created'} direction={sortKey === 'created' ? sortDirection : 'asc'} onClick={() => handleSort('created')}>Created</TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sortKey === 'expires' ? sortDirection : false}>
                  <TableSortLabel active={sortKey === 'expires'} direction={sortKey === 'expires' ? sortDirection : 'asc'} onClick={() => handleSort('expires')}>Expires</TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sortKey === 'budget' ? sortDirection : false}>
                  <TableSortLabel active={sortKey === 'budget'} direction={sortKey === 'budget' ? sortDirection : 'asc'} onClick={() => handleSort('budget')}>Budget</TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sortKey === 'limits' ? sortDirection : false}>
                  <TableSortLabel active={sortKey === 'limits'} direction={sortKey === 'limits' ? sortDirection : 'asc'} onClick={() => handleSort('limits')}>TPM / RPM</TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sortKey === 'models' ? sortDirection : false}>
                  <TableSortLabel active={sortKey === 'models'} direction={sortKey === 'models' ? sortDirection : 'asc'} onClick={() => handleSort('models')}>Models</TableSortLabel>
                </TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {renderTableBody()}
            </TableBody>
          </Table>
        </TableContainer>
      </SectionCard>


      {/* Edit dialog */}
      <Dialog open={!!editingKey} onClose={handleCloseEdit} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Key</DialogTitle>
        <DialogContent>
          {editingKey && (
            <Box display="flex" flexDirection="column" gap={2} mt={1}>
              <Typography variant="body2" color="text.secondary">
                <code style={{ fontFamily: 'monospace', color: 'inherit' }}>{maskKey(editingKey.key)}</code>
              </Typography>
              <TextField
                label="Alias"
                value={editForm.key_alias || ''}
                onChange={(e) => setEditForm({ ...editForm, key_alias: e.target.value })}
                fullWidth
              />

              {models.length > 0 && (
                <Autocomplete
                  multiple
                  options={models}
                  groupBy={m => m.mode || 'other'}
                  getOptionLabel={m => m.model_name}
                  value={editSelectedModels}
                  onChange={(_e, selected) =>
                    setEditForm({ ...editForm, models: selected.map(m => m.model_name) })
                  }
                  renderOption={(props, m) => <li {...props}>{modelOption(m)}</li>}
                  renderInput={params => (
                    <TextField {...params} label="Models" fullWidth />
                  )}
                />
              )}

              <TextField
                label="Max Budget (USD)"
                type="number"
                value={editForm.max_budget ?? ''}
                onChange={(e) =>
                  setEditForm({ ...editForm, max_budget: e.target.value ? Number(e.target.value) : undefined })
                }
                fullWidth
              />
              <TextField
                label="TPM Limit"
                type="number"
                value={editForm.tpm_limit ?? ''}
                onChange={(e) =>
                  setEditForm({ ...editForm, tpm_limit: e.target.value ? Number(e.target.value) : undefined })
                }
                helperText="Max tokens per minute this key can consume across all models. Leave blank for no limit."
                fullWidth
              />
              <TextField
                label="RPM Limit"
                type="number"
                value={editForm.rpm_limit ?? ''}
                onChange={(e) =>
                  setEditForm({ ...editForm, rpm_limit: e.target.value ? Number(e.target.value) : undefined })
                }
                helperText="Max requests per minute this key can make across all models. Leave blank for no limit."
                fullWidth
              />

              <Box mt={1} pt={2} borderTop="1px solid" sx={{ borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                  Danger Zone
                </Typography>
                {!resetSpendConfirm ? (
                  <Button
                    size="small"
                    color="warning"
                    variant="outlined"
                    onClick={() => setResetSpendConfirm(true)}
                  >
                    Reset Spend to $0
                  </Button>
                ) : (
                  <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                    <Typography variant="body2" color="warning.main">
                      Zero out spend counter?
                    </Typography>
                    <Button
                      size="small"
                      color="warning"
                      variant="contained"
                      disabled={resetSpendSubmitting}
                      onClick={handleResetSpend}
                    >
                      {resetSpendSubmitting ? <CircularProgress size={16} /> : 'Confirm'}
                    </Button>
                    <Button size="small" onClick={() => setResetSpendConfirm(false)}>
                      Cancel
                    </Button>
                  </Box>
                )}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEdit}>Cancel</Button>
          <Button onClick={handleUpdate} variant="contained" color="primary" disabled={editSubmitting}>
            {editSubmitting ? <CircularProgress size={24} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Revoke Key?</DialogTitle>
        <DialogContent>
          <Typography>
            This will permanently revoke the key. Any integrations using it will stop working immediately.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmId(null)} disabled={deleteSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDelete}
            variant="contained"
            color="error"
            disabled={deleteSubmitting}
          >
            {deleteSubmitting ? <CircularProgress size={20} /> : 'Revoke'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Prune expired keys confirmation dialog */}
      <Dialog open={pruneConfirmCount !== null} onClose={() => setPruneConfirmCount(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Prune Expired Keys?</DialogTitle>
        <DialogContent>
          <Typography>
            This will permanently delete {pruneConfirmCount} expired key{pruneConfirmCount !== 1 ? 's' : ''} from LiteLLM.
            Any integrations using them will stop working immediately.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPruneConfirmCount(null)} disabled={pruneSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handlePruneExpired}
            variant="contained"
            color="error"
            disabled={pruneSubmitting}
          >
            {pruneSubmitting ? <CircularProgress size={20} /> : 'Prune'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
