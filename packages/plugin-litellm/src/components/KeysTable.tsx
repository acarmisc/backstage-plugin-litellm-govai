import React, { useState } from 'react';
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
} from '@mui/material';
import { ContentCopy, Delete, Add, Edit } from '@mui/icons-material';
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
  onDeleteKey: (keyId: string) => Promise<void>;
}

const maskKey = (key: string): string => {
  if (key.length <= 8) return '***';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
};

// The Key ID is the hashed `token` LiteLLM uses internally to identify a key.
// We display a short prefix so the row stays compact, but copy the full hash.
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

const emptyForm = (): GenerateKeyRequest => ({
  alias: '',
  models: [],
  duration: '30d',
  max_budget: 100,
  tpm_limit: undefined,
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
  onDeleteKey,
}) => {
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [formData, setFormData] = useState<GenerateKeyRequest>(emptyForm());
  const [submitting, setSubmitting] = useState(false);

  const canGenerate = true; // Always allow generation regardless of team selection

  const [editingKey, setEditingKey] = useState<VirtualKey | null>(null);
  const [editForm, setEditForm] = useState<UpdateKeyRequest>({});
  const [editSubmitting, setEditSubmitting] = useState(false);

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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <>
      <Paper sx={{ mb: 2 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" p={2}>
          <Typography variant="h6">Virtual Keys</Typography>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Add />}
            onClick={() => setGenerateModalOpen(true)}
          >
            Generate New Key
          </Button>
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Alias</TableCell>
                <TableCell>Key ID</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Spend</TableCell>
                <TableCell>Budget</TableCell>
                <TableCell>TPM Limit</TableCell>
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
              ) : keys.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    <Typography color="text.secondary">No keys found</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                keys.map((key) => {
                  const keyId = key.token ?? key.key;
                  return (
                  <TableRow key={keyId}>
                    <TableCell>{key.key_alias || '-'}</TableCell>
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
                    <TableCell>${key.spend?.toFixed(4) || '0.00'}</TableCell>
                    <TableCell>{key.max_budget ? `$${key.max_budget}` : '-'}</TableCell>
                    <TableCell>{key.tpm_limit || '-'}</TableCell>
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
                      <IconButton onClick={() => handleOpenEdit(key)}>
                        <Edit fontSize="small" />
                      </IconButton>
                      <IconButton color="error" onClick={() => onDeleteKey(keyId)}>
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
                  renderOption={(props, m) => (
                    <li {...props}>
                      {m.model_name}
                      {m.supports_function_calling && ' 🔧'}
                      {m.supports_vision && ' 👁️'}
                    </li>
                  )}
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
              disabled={submitting || !canGenerate}
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
    </>
  );
};
