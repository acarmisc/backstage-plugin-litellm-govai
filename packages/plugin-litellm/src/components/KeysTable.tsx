import React, { useState, useMemo } from 'react';
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  IconButton,
  Box,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Chip,
  CircularProgress,
  Autocomplete,
  LinearProgress,
  InputAdornment,
} from '@mui/material';
import { ContentCopy, Delete, Add, Edit, Autorenew, Search, Warning, Lock, LockOpen } from '@mui/icons-material';
import { expiryStatus } from '../api';
import {
  VirtualKey,
  ModelInfo,
  TeamInfo,
  GenerateKeyRequest,
  GenerateKeyResponse,
  UpdateKeyRequest,
} from '../types';

interface KeysTableProps {
  keys: VirtualKey[];
  models: ModelInfo[];
  teams: TeamInfo[];
  loading: boolean;
  onGenerateKey: (request: GenerateKeyRequest) => Promise<GenerateKeyResponse>;
  onUpdateKey: (keyId: string, request: UpdateKeyRequest) => Promise<void>;
  onRotateKey: (keyId: string) => Promise<GenerateKeyResponse>;
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

function ExpiryChip({ expiresAt }: { expiresAt?: string }) {
  const status = expiryStatus(expiresAt);
  if (!status) return <Typography variant="body2" color="text.secondary">-</Typography>;
  const label = status === 'expired' ? 'Expired' : status === 'soon' ? `${Math.ceil((new Date(expiresAt!).getTime() - Date.now()) / 86400000)}d left` : formatDate(expiresAt!);
  const color = status === 'expired' ? 'error' : status === 'soon' ? 'warning' : 'default';
  const icon = (status === 'expired' || status === 'soon') ? <Warning fontSize="small" /> : undefined;
  return <Chip label={label} color={color} size="small" icon={icon} />;
}

function BudgetCell({ spend, maxBudget }: { spend: number; maxBudget?: number }) {
  if (!maxBudget) return <Typography variant="body2" color="text.secondary">-</Typography>;
  const pct = Math.min(100, (spend / maxBudget) * 100);
  const color = pct >= 100 ? 'error' : pct >= 80 ? 'warning' : 'primary';
  return (
    <Box minWidth={100}>
      <Box display="flex" justifyContent="space-between">
        <Typography variant="caption">${spend.toFixed(2)}</Typography>
        <Typography variant="caption" color="text.secondary">${maxBudget}</Typography>
      </Box>
      <LinearProgress variant="determinate" value={pct} color={color} sx={{ height: 5, borderRadius: 1, mt: 0.25 }} />
    </Box>
  );
}

function fmtCost(perToken?: number): string | null {
  if (!perToken) return null;
  const per1k = perToken * 1000;
  return per1k < 0.01 ? `$${(perToken * 1_000_000).toFixed(2)}/M` : `$${per1k.toFixed(3)}/1K`;
}

const emptyForm = (): GenerateKeyRequest => ({
  alias: '',
  models: [],
  duration: '30d',
  max_budget: 100,
  tpm_limit: undefined,
  rpm_limit: undefined,
  team_id: undefined,
  key_type: 'llm_api',
});

const keyToEditForm = (k: VirtualKey): UpdateKeyRequest => ({
  key_alias: k.key_alias ?? '',
  models: k.models ?? [],
  max_budget: k.max_budget,
  tpm_limit: k.tpm_limit,
  rpm_limit: k.rpm_limit,
});

export const KeysTable: React.FC<KeysTableProps> = ({
  keys,
  models,
  teams,
  loading,
  onGenerateKey,
  onUpdateKey,
  onRotateKey,
  onBlockKey,
  onUnblockKey,
  onResetKeySpend,
  onDeleteKey,
  onPruneExpiredKeys,
}) => {
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [formData, setFormData] = useState<GenerateKeyRequest>(emptyForm());
  const [submitting, setSubmitting] = useState(false);

  const [editingKey, setEditingKey] = useState<VirtualKey | null>(null);
  const [editForm, setEditForm] = useState<UpdateKeyRequest>({});
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Rotation
  const [rotatingKeyId, setRotatingKeyId] = useState<string | null>(null);
  const [rotatedKeyValue, setRotatedKeyValue] = useState<string | null>(null);

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

  const filteredKeys = useMemo(() => {
    if (!filterText.trim()) return keys;
    const q = filterText.toLowerCase();
    return keys.filter(k =>
      (k.key_alias ?? '').toLowerCase().includes(q) ||
      k.models?.some(m => m.toLowerCase().includes(q)),
    );
  }, [keys, filterText]);

  const selectedModels = models.filter(m => (formData.models || []).includes(m.model_name));
  const selectedTeam = teams.find(t => t.team_id === formData.team_id) ?? null;
  const editSelectedModels = models.filter(m => (editForm.models || []).includes(m.model_name));

  const handleGenerate = async () => {
    setSubmitting(true);
    try {
      const response = await onGenerateKey(formData);
      setNewKeyValue(response.key);
      setFormData(emptyForm());
    } catch (error) {
      console.error('Failed to generate key:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseModal = () => {
    setGenerateModalOpen(false);
    setNewKeyValue(null);
    setFormData(emptyForm());
  };

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
      console.error('Failed to update key:', error);
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleRotate = async (keyId: string) => {
    setRotatingKeyId(keyId);
    try {
      const response = await onRotateKey(keyId);
      setRotatedKeyValue(response.key);
    } catch (error) {
      console.error('Failed to rotate key:', error);
    } finally {
      setRotatingKeyId(null);
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
      console.error('Failed to prune expired keys:', error);
    } finally {
      setPruneSubmitting(false);
      setPruneConfirmCount(null);
    }
  };

  const modelOption = (m: ModelInfo) => {
    const inCost = fmtCost(m.input_cost_per_token);
    const outCost = fmtCost(m.output_cost_per_token);
    return (
      <Box>
        <span>{m.model_name}</span>
        {m.supports_function_calling && ' 🔧'}
        {m.supports_vision && ' 👁️'}
        {(inCost || outCost) && (
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            {inCost} in · {outCost} out
          </Typography>
        )}
      </Box>
    );
  };

  return (
    <>
      <Paper sx={{ mb: 2 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" p={2} gap={2}>
          <Typography variant="h6">Virtual Keys</Typography>
          <Box display="flex" gap={1} alignItems="center" flex={1} justifyContent="flex-end">
            <TextField
              size="small"
              placeholder="Filter by alias or model…"
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              sx={{ minWidth: 240 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            {expiredKeys.length > 0 && (
              <Button
                variant="outlined"
                color="error"
                startIcon={<Autorenew />}
                onClick={() => setPruneConfirmCount(expiredKeys.length)}
              >
                Prune expired ({expiredKeys.length})
              </Button>
            )}
            <Button
              variant="contained"
              color="primary"
              startIcon={<Add />}
              onClick={() => setGenerateModalOpen(true)}
            >
              Generate New Key
            </Button>
          </Box>
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Alias</TableCell>
                <TableCell>Key ID</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Expires</TableCell>
                <TableCell>Budget</TableCell>
                <TableCell>TPM / RPM</TableCell>
                <TableCell>Models</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : filteredKeys.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    <Typography color="text.secondary">
                      {filterText ? 'No keys match filter' : 'No keys found'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredKeys.map((key) => {
                  const keyId = key.token ?? key.key;
                  const isRotating = rotatingKeyId === keyId;
                  const isBlocking = blockingKeyId === keyId;
                  return (
                    <TableRow key={keyId} sx={key.blocked ? { bgcolor: 'action.disabledBackground' } : undefined}>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={0.5}>
                          {key.key_alias || '-'}
                          {key.blocked && <Chip label="Blocked" color="error" size="small" />}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <Typography
                            variant="body2"
                            component="code"
                            color="text.secondary"
                            title={keyId}
                            sx={{
                              fontFamily: 'monospace',
                              backgroundColor: 'background.default',
                              px: 1,
                              py: 0.5,
                              borderRadius: 1,
                            }}
                          >
                            {shortKeyId(keyId)}
                          </Typography>
                          <IconButton size="small" onClick={() => copyToClipboard(keyId)} title="Copy Key ID">
                            <ContentCopy fontSize="small" />
                          </IconButton>
                        </Box>
                      </TableCell>
                      <TableCell>{formatDate(key.created_at)}</TableCell>
                      <TableCell>
                        <ExpiryChip expiresAt={key.expires_at} />
                      </TableCell>
                      <TableCell>
                        <BudgetCell spend={key.spend ?? 0} maxBudget={key.max_budget} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{key.tpm_limit ?? '-'} / {key.rpm_limit ?? '-'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Box display="flex" gap={0.5} flexWrap="wrap">
                          {key.models?.slice(0, 2).map((model) => (
                            <Chip key={model} label={model} size="small" />
                          ))}
                          {(key.models?.length || 0) > 2 && (
                            <Chip label={`+${(key.models?.length || 0) - 2}`} size="small" variant="outlined" />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <IconButton onClick={() => handleOpenEdit(key)} title="Edit key">
                          <Edit fontSize="small" />
                        </IconButton>
                        <IconButton
                          onClick={() => handleRotate(keyId)}
                          disabled={isRotating}
                          title="Rotate key — generates a new secret, same settings"
                        >
                          {isRotating ? <CircularProgress size={18} /> : <Autorenew fontSize="small" />}
                        </IconButton>
                        <IconButton
                          onClick={() => handleToggleBlock(key)}
                          disabled={isBlocking}
                          color={key.blocked ? 'warning' : 'default'}
                          title={key.blocked ? 'Unblock key' : 'Block key — suspends without revoking'}
                        >
                          {isBlocking ? <CircularProgress size={18} /> : key.blocked ? <LockOpen fontSize="small" /> : <Lock fontSize="small" />}
                        </IconButton>
                        <IconButton
                          color="error"
                          onClick={() => setDeleteConfirmId(keyId)}
                          title="Revoke key"
                        >
                          <Delete />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Generate dialog */}
      <Dialog open={generateModalOpen} onClose={handleCloseModal} maxWidth="sm" fullWidth>
        <DialogTitle>{newKeyValue ? 'Key Generated' : 'Generate New Key'}</DialogTitle>
        <DialogContent>
          {newKeyValue ? (
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Copy this key now. You won't be able to see it again.
              </Typography>
              <Box
                display="flex"
                alignItems="center"
                gap={1}
                mt={2}
                p={2}
                sx={{
                  backgroundColor: 'action.hover',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                }}
              >
                <Typography
                  component="code"
                  color="text.primary"
                  sx={{ fontFamily: 'monospace', wordBreak: 'break-all', flex: 1 }}
                >
                  {newKeyValue}
                </Typography>
                <IconButton onClick={() => copyToClipboard(newKeyValue)}>
                  <ContentCopy />
                </IconButton>
              </Box>
            </Box>
          ) : (
            <Box display="flex" flexDirection="column" gap={2} mt={1}>
              <TextField
                label="Alias"
                value={formData.alias || ''}
                onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
                required
                fullWidth
              />
              <TextField
                select
                label="Duration"
                value={formData.duration || '30d'}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                fullWidth
              >
                <MenuItem value="1d">1 Day</MenuItem>
                <MenuItem value="7d">7 Days</MenuItem>
                <MenuItem value="30d">30 Days</MenuItem>
                <MenuItem value="90d">90 Days</MenuItem>
                <MenuItem value="1y">1 Year</MenuItem>
              </TextField>

              {teams.length > 0 && (
                <Autocomplete
                  options={teams}
                  getOptionLabel={t => t.team_alias || t.team_id}
                  value={selectedTeam}
                  onChange={(_e, team) =>
                    setFormData({ ...formData, team_id: team?.team_id })
                  }
                  renderInput={params => (
                    <TextField
                      {...params}
                      label="Team"
                      helperText="Optional: bind this key to a specific team for scoped access"
                      fullWidth
                    />
                  )}
                />
              )}

              {models.length > 0 && (
                <Autocomplete
                  multiple
                  options={models}
                  groupBy={m => m.mode || 'other'}
                  getOptionLabel={m => m.model_name}
                  value={selectedModels}
                  onChange={(_e, selected) =>
                    setFormData({ ...formData, models: selected.map(m => m.model_name) })
                  }
                  renderOption={(props, m) => <li {...props}>{modelOption(m)}</li>}
                  renderInput={params => (
                    <TextField {...params} label="Models" helperText="Leave empty to allow all models" fullWidth />
                  )}
                />
              )}

              <TextField
                label="Max Budget (USD)"
                type="number"
                value={formData.max_budget ?? ''}
                onChange={(e) =>
                  setFormData({ ...formData, max_budget: e.target.value ? Number(e.target.value) : undefined })
                }
                required
                fullWidth
              />
              <TextField
                label="TPM Limit"
                type="number"
                value={formData.tpm_limit ?? ''}
                onChange={(e) =>
                  setFormData({ ...formData, tpm_limit: e.target.value ? Number(e.target.value) : undefined })
                }
                fullWidth
              />
              <TextField
                label="RPM Limit"
                type="number"
                value={formData.rpm_limit ?? ''}
                onChange={(e) =>
                  setFormData({ ...formData, rpm_limit: e.target.value ? Number(e.target.value) : undefined })
                }
                fullWidth
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseModal}>{newKeyValue ? 'Done' : 'Cancel'}</Button>
          {!newKeyValue && (
            <Button
              onClick={handleGenerate}
              variant="contained"
              color="primary"
              disabled={submitting}
            >
              {submitting ? <CircularProgress size={24} /> : 'Generate'}
            </Button>
          )}
          {newKeyValue && (
            <Button onClick={handleCloseModal} variant="contained" color="success">
              Done
            </Button>
          )}
        </DialogActions>
      </Dialog>

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
                fullWidth
              />
              <TextField
                label="RPM Limit"
                type="number"
                value={editForm.rpm_limit ?? ''}
                onChange={(e) =>
                  setEditForm({ ...editForm, rpm_limit: e.target.value ? Number(e.target.value) : undefined })
                }
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

      {/* Rotate result dialog */}
      <Dialog open={!!rotatedKeyValue} onClose={() => setRotatedKeyValue(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Key Rotated</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            The old secret is now invalid. Copy the new one — you won't see it again.
          </Typography>
          <Box
            display="flex"
            alignItems="center"
            gap={1}
            mt={2}
            p={2}
            sx={{ backgroundColor: 'action.hover', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
          >
            <Typography
              component="code"
              sx={{ fontFamily: 'monospace', wordBreak: 'break-all', flex: 1 }}
            >
              {rotatedKeyValue}
            </Typography>
            <IconButton onClick={() => copyToClipboard(rotatedKeyValue!)}>
              <ContentCopy />
            </IconButton>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRotatedKeyValue(null)} variant="contained" color="success">
            Done
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
