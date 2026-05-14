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
import { ContentCopy, Delete, Add, Visibility, VisibilityOff } from '@mui/icons-material';
import { VirtualKey, ModelInfo, TeamInfo, GenerateKeyRequest, GenerateKeyResponse } from '../types';

interface KeysTableProps {
  keys: VirtualKey[];
  models: ModelInfo[];
  teams: TeamInfo[];
  loading: boolean;
  onGenerateKey: (request: GenerateKeyRequest) => Promise<GenerateKeyResponse>;
  onDeleteKey: (keyId: string) => Promise<void>;
}

const maskKey = (key: string): string => {
  if (key.length <= 8) return '***';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
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
  max_budget: undefined,
  tpm_limit: undefined,
  team_id: undefined,
});

export const KeysTable: React.FC<KeysTableProps> = ({
  keys,
  models,
  teams,
  loading,
  onGenerateKey,
  onDeleteKey,
}) => {
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [showKeyValue, setShowKeyValue] = useState<string | null>(null);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [formData, setFormData] = useState<GenerateKeyRequest>(emptyForm());
  const [submitting, setSubmitting] = useState(false);

  const selectedModels = models.filter(m => (formData.models || []).includes(m.model_name));
  const selectedTeam = teams.find(t => t.team_id === formData.team_id) ?? null;

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
                <TableCell>Key</TableCell>
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
                keys.map((key) => (
                  <TableRow key={key.key}>
                    <TableCell>{key.key_alias || '-'}</TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <Typography variant="body2" component="code" sx={{ fontFamily: 'monospace' }}>
                          {showKeyValue === key.key ? key.key : maskKey(key.key)}
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={() => setShowKeyValue(showKeyValue === key.key ? null : key.key)}
                        >
                          {showKeyValue === key.key ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                        <IconButton size="small" onClick={() => copyToClipboard(key.key)}>
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
                      <IconButton color="error" onClick={() => onDeleteKey(key.key)}>
                        <Delete />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
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
                sx={{ backgroundColor: 'action.hover', borderRadius: 1 }}
              >
                <Typography
                  component="code"
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
                    <TextField {...params} label="Team (optional)" fullWidth />
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
                    <TextField {...params} label="Models" fullWidth />
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
            <Button onClick={handleGenerate} variant="contained" color="primary" disabled={submitting}>
              {submitting ? <CircularProgress size={24} /> : 'Generate'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
};
