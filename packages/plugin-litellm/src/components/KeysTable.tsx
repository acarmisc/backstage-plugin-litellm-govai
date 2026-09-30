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
import Skeleton from '@mui/material/Skeleton';
import InputAdornment from '@mui/material/InputAdornment';
import Tooltip from '@mui/material/Tooltip';
import Chip from '@mui/material/Chip';
import { alpha } from '@mui/material/styles';
import { ContentCopy, Delete, Edit, Autorenew, Search, Lock, LockOpen, Check, Close } from '@mui/icons-material';
import { usePermission } from '@backstage/plugin-permission-react';
import {
  litellmKeyManagePermission,
  litellmKeyRevokePermission,
} from '@acarmisc/backstage-plugin-litellm-common';
import { useCopyToClipboard } from '../hooks';
import { expiryStatus } from '../api';
import { keyDisplayLabel, keyLast4, pruneCopy } from '../keyLabels';
import { fmtUsd, fmtLimits } from '../format';
import { filterKeysByStatus, type KeyFilterType } from '../keyFilter';
import { GenerateKeyButton } from './GenerateKeyButton';
import {
  VirtualKey,
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
  /** Opens the shared key form dialog in create mode (rendered at page level). */
  onGenerateKeyClick: () => void;
  /** Opens the shared key form dialog in edit mode for the given key. */
  onEditKey: (key: VirtualKey) => void;
  loading: boolean;
  onBlockKey: (keyId: string) => Promise<void>;
  onUnblockKey: (keyId: string) => Promise<void>;
  onDeleteKey: (keyId: string) => Promise<void>;
  onPruneExpiredKeys: () => Promise<{ pruned: number }>;
  filter?: KeyFilterType;
  onClearFilter?: () => void;
}

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
        {fmtUsd(spend)}
        <Typography component="span" variant="caption" sx={{ ml: 0.5, opacity: 0.7 }}>
          / Unlimited
        </Typography>
      </Typography>
    );
  }
  const pct = Math.min(100, (spend / maxBudget) * 100);
  return (
    <Box minWidth={104}>
      <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', mb: 0.5 }}>
        {fmtUsd(spend)}
        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
          / {fmtUsd(maxBudget)}
        </Typography>
      </Typography>
      <Meter value={pct} tone={budgetTone(pct)} height={4} />
    </Box>
  );
}

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
  loading,
  onGenerateKeyClick,
  onEditKey,
  onBlockKey,
  onUnblockKey,
  onDeleteKey,
  onPruneExpiredKeys,
  filter,
  onClearFilter,
}) => {
  // Permission checks
  const managePermission = usePermission({ permission: litellmKeyManagePermission });
  const revokePermission = usePermission({ permission: litellmKeyRevokePermission });
  const canManageKeys = !managePermission.loading && managePermission.allowed;
  const canRevokeKeys = !revokePermission.loading && revokePermission.allowed;
  // Only claim "no permission" after a real denial, not while still checking.
  const manageDenied = !managePermission.loading && !managePermission.allowed;
  const revokeDenied = !revokePermission.loading && !revokePermission.allowed;

  // Block confirmation
  const [blockConfirmKey, setBlockConfirmKey] = useState<VirtualKey | null>(null);
  const [blockSubmitting, setBlockSubmitting] = useState(false);

  // Delete confirmation
  const [deleteConfirmKey, setDeleteConfirmKey] = useState<VirtualKey | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Reset spend moved into the shared KeyFormDialog (edit mode)

  // Clipboard
  const clipboard = useCopyToClipboard();

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
    // Apply status filter (expired/expiring)
    result = filterKeysByStatus(result, filter);
    // Apply text filter
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      result = result.filter(k =>
        (k.key_alias ?? '').toLowerCase().includes(q) ||
        k.models?.some(m => m.toLowerCase().includes(q)),
      );
    }
    return [...result].sort((a, b) => {
      const comparison = compareKeys(a, b, sortKey);
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [keys, filterText, sortKey, sortDirection, filter]);

  const handleOpenEdit = (k: VirtualKey) => {
    onEditKey(k);
  };

  const performUnblock = async (key: VirtualKey) => {
    const keyId = key.token ?? key.key;
    setBlockSubmitting(true);
    try {
      await onUnblockKey(keyId);
    } finally {
      setBlockSubmitting(false);
    }
  };

  const performBlock = async (key: VirtualKey) => {
    if (!blockConfirmKey) return;
    const keyId = key.token ?? key.key;
    setBlockSubmitting(true);
    try {
      await onBlockKey(keyId);
    } finally {
      setBlockSubmitting(false);
      setBlockConfirmKey(null);
    }
  };

  const handleToggleBlock = (key: VirtualKey) => {
    if (key.blocked) {
      // Unblock is safe (one-click) — no confirmation
      performUnblock(key);
    } else {
      // Block requires confirmation
      setBlockConfirmKey(key);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmKey) return;
    setDeleteSubmitting(true);
    try {
      const keyId = deleteConfirmKey.token ?? deleteConfirmKey.key;
      await onDeleteKey(keyId);
    } finally {
      setDeleteSubmitting(false);
      setDeleteConfirmKey(null);
    }
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
                  <GenerateKeyButton
                    size="small"
                    label="Generate Your First Key"
                    onClick={onGenerateKeyClick}
                  />
                }
              />
            )}
          </TableCell>
        </TableRow>
      );
    }
    return filteredKeys.map((key) => {
      const keyId = key.token ?? key.key;
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
              <Tooltip title={clipboard.copied ? 'Copied' : 'Copy Key ID'} placement="top">
                <IconButton
                  size="small"
                  onClick={() => clipboard.copy(keyId)}
                  aria-label="Copy key ID"
                  sx={quietIconButtonSx('accent')}
                >
                  {clipboard.copied ? <Check sx={{ fontSize: 15 }} /> : <ContentCopy sx={{ fontSize: 15 }} />}
                </IconButton>
              </Tooltip>
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
              {fmtLimits(key.tpm_limit, key.rpm_limit)}
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
              <Tooltip describeChild title={manageDenied ? 'No permission to edit keys' : 'Edit key'} placement="top">
                <span>
                  <IconButton
                    size="small"
                    onClick={() => handleOpenEdit(key)}
                    disabled={!canManageKeys}
                    aria-label={manageDenied ? 'No permission to edit keys' : 'Edit key'}
                    sx={quietIconButtonSx('accent')}
                  >
                    <Edit fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip describeChild title={(() => {
                if (manageDenied) return 'No permission to block keys';
                return key.blocked ? 'Unblock key' : 'Block key — suspends without revoking';
              })()} placement="top">
                <span>
                  <IconButton
                    size="small"
                    onClick={() => handleToggleBlock(key)}
                    disabled={blockSubmitting || !canManageKeys}
                    aria-label={(() => {
                      if (manageDenied) return 'No permission to block keys';
                      return key.blocked ? 'Unblock key' : 'Block key — suspends without revoking';
                    })()}
                    sx={quietIconButtonSx('warning')}
                  >
                    {keyBlockIcon(blockSubmitting, key.blocked)}
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip describeChild title={revokeDenied ? 'No permission to revoke keys' : 'Revoke key'} placement="top">
                <span>
                  <IconButton
                    size="small"
                    onClick={() => setDeleteConfirmKey(key)}
                    disabled={!canRevokeKeys}
                    aria-label={revokeDenied ? 'No permission to revoke keys' : 'Revoke key'}
                    sx={quietIconButtonSx('danger')}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
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
          </>
        }
      >
        {filter && (
          <Box sx={{ px: 2, py: 1, borderBottom: theme => `1px solid ${theme.palette.divider}` }}>
            <Chip
              size="small"
              label={`Showing: ${filter === 'expired' ? 'expired' : 'expiring'} keys`}
              onDelete={onClearFilter}
              deleteIcon={<Close />}
              variant="outlined"
            />
          </Box>
        )}
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
                  <TableSortLabel active={sortKey === 'limits'} direction={sortKey === 'limits' ? sortDirection : 'asc'} onClick={() => handleSort('limits')}>TPM / RPM (per min)</TableSortLabel>
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

      {/* Block confirmation dialog */}
      <Dialog
        open={!!blockConfirmKey}
        onClose={() => !blockSubmitting && setBlockConfirmKey(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Block key?</DialogTitle>
        <DialogContent>
          <Typography>
            Block <strong>{keyDisplayLabel(blockConfirmKey ?? ({} as VirtualKey))}</strong>? Integrations using it will fail immediately.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setBlockConfirmKey(null)}
            disabled={blockSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={() => blockConfirmKey && performBlock(blockConfirmKey)}
            variant="contained"
            color="warning"
            disabled={blockSubmitting}
          >
            {blockSubmitting ? <CircularProgress size={20} /> : 'Block'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteConfirmKey}
        onClose={() => !deleteSubmitting && setDeleteConfirmKey(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          Revoke <strong>{deleteConfirmKey ? keyDisplayLabel(deleteConfirmKey) : ''}</strong>{deleteConfirmKey && keyLast4(deleteConfirmKey) ? ` (sk-…${keyLast4(deleteConfirmKey)})` : ''}?
        </DialogTitle>
        <DialogContent>
          <Typography>
            This will permanently revoke the key. Any integrations using it will stop working immediately.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmKey(null)} disabled={deleteSubmitting}>
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
      <Dialog
        open={pruneConfirmCount !== null}
        onClose={() => !pruneSubmitting && setPruneConfirmCount(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Prune Expired Keys?</DialogTitle>
        <DialogContent>
          <Typography>
            {pruneConfirmCount !== null && pruneCopy(pruneConfirmCount)}
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
