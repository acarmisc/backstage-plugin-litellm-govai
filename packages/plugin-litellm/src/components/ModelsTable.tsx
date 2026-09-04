import React, { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Tooltip from '@mui/material/Tooltip';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import { ModelInfo, TeamInfo } from '../types';
import { SectionCard, EmptyState, TagChip, dataTableSx, quietIconButtonSx } from './ui';
import { alpha, useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import { Search } from '@mui/icons-material';

interface ModelsTableProps {
  allModels: ModelInfo[];
  teams: TeamInfo[];
  loading: boolean;
}

const ALL_PROXY_MODELS = 'all-proxy-models';

function isModelAllowedByTeam(model: ModelInfo, teamModels?: string[]): boolean {
  if (!teamModels || teamModels.length === 0 || teamModels.includes(ALL_PROXY_MODELS)) return true;
  return teamModels.includes(model.model_name) ||
    !!model.access_groups?.some(group => teamModels.includes(group));
}

function fmtCostPerToken(cost?: number): string {
  if (cost === undefined || cost === null) return '—';
  if (cost === 0) return '$0';
  if (cost < 0.000001) return `$${(cost * 1_000_000).toFixed(2)}/M`;
  if (cost < 0.001) return `$${(cost * 1000).toFixed(3)}/K`;
  return `$${cost.toFixed(4)}`;
}

function fmtTokens(n?: number): string {
  if (n === undefined || n === null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export const ModelsTable: React.FC<ModelsTableProps> = ({ allModels, teams, loading }) => {
  const theme = useTheme();
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [filterText, setFilterText] = useState<string>('');
  const [copiedSnackbar, setCopiedSnackbar] = useState(false);

  const selectedTeam = useMemo(
    () => teams.find(t => t.team_id === selectedTeamId) ?? null,
    [teams, selectedTeamId],
  );

  const filteredModels = useMemo(() => {
    if (!selectedTeam) return [];
    let result = allModels.filter(model => isModelAllowedByTeam(model, selectedTeam.models));
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      result = result.filter(model =>
        model.model_name.toLowerCase().includes(q) ||
        (model.access_groups || []).some(group => group.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [allModels, selectedTeam, filterText]);

  const handleCopyModelId = useCallback((modelId: string) => {
    navigator.clipboard.writeText(modelId).then(() => setCopiedSnackbar(true));
  }, []);

  const modeColor = (mode: string): string => {
    switch (mode) {
      case 'chat': return theme.palette.info.main;
      case 'embedding': return theme.palette.success.main;
      case 'completion': return theme.palette.primary.main;
      case 'image': return theme.palette.warning.main;
      default: return theme.palette.info.main;
    }
  };

  return (
    <SectionCard
      title="Available Models"
      subtitle={selectedTeam ? `${filteredModels.length} model${filteredModels.length !== 1 ? 's' : ''} in ${selectedTeam.team_alias ?? selectedTeam.team_id}` : 'Select a team to view its models'}
    >
      <Box sx={{ px: 2.5, pb: 2.5, pt: 1 }}>
        <FormControl size="small" sx={{ minWidth: 240, mb: 2 }}>
          <InputLabel id="team-select-label">Team</InputLabel>
          <Select
            labelId="team-select-label"
            value={selectedTeamId}
            label="Team"
            onChange={e => setSelectedTeamId(e.target.value)}
          >
            {teams.map(t => (
              <MenuItem key={t.team_id} value={t.team_id}>
                {t.team_alias ?? t.team_id}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label="Filter Models"
          size="small"
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
          sx={{ minWidth: 240, mb: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {loading && (
        <EmptyState message="Loading models…" />
      )}

      {!loading && !selectedTeamId && (
        <EmptyState
          message="Select a team to see available models"
          hint="Each team may have a different set of models assigned"
        />
      )}

      {!loading && selectedTeamId && filteredModels.length === 0 && (
        <EmptyState
          message="No models available for this team"
          hint={allModels.length === 0 ? 'No models are configured in the system' : 'None of the team\'s assigned models were found in the catalog'}
        />
      )}

      {!loading && filteredModels.length > 0 && (
        <TableContainer>
          <Table size="small" sx={dataTableSx}>
            <TableHead>
              <TableRow>
                <TableCell>Model ID</TableCell>
                <TableCell>Mode</TableCell>
                <TableCell align="right">Input Cost</TableCell>
                <TableCell align="right">Output Cost</TableCell>
                <TableCell align="right">Max Input</TableCell>
                <TableCell align="right">Max Output</TableCell>
                <TableCell>Capabilities</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredModels.map(m => (
                <TableRow key={m.model_name} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <TagChip label={m.model_name} title={m.model_name} />
                      <Tooltip title="Copy model ID">
                        <Box
                          component="span"
                          role="button"
                          tabIndex={0}
                          onClick={() => handleCopyModelId(m.model_name)}
                          onKeyDown={e => e.key === 'Enter' && handleCopyModelId(m.model_name)}
                          sx={quietIconButtonSx('accent')}
                          style={{ cursor: 'pointer', display: 'inline-flex' }}
                        >
                          <ContentCopyIcon sx={{ fontSize: 14 }} />
                        </Box>
                      </Tooltip>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box
                      component="span"
                      sx={{
                        display: 'inline-block',
                        px: 0.75,
                        py: 0.25,
                        borderRadius: 1,
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'capitalize',
                        bgcolor: alpha(modeColor(m.mode), 0.1),
                        color: modeColor(m.mode),
                      }}
                    >
                      {m.mode}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {fmtCostPerToken(m.input_cost_per_token)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {fmtCostPerToken(m.output_cost_per_token)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {fmtTokens(m.max_input_tokens)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {fmtTokens(m.max_output_tokens)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {m.supports_function_calling && (
                        <TagChip label="Fn" title="Function calling" />
                      )}
                      {m.supports_vision && (
                        <TagChip label="👁" title="Vision" />
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Snackbar
        open={copiedSnackbar}
        autoHideDuration={2000}
        onClose={() => setCopiedSnackbar(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" sx={{ fontSize: 13 }}>
          Model ID copied to clipboard
        </Alert>
      </Snackbar>
    </SectionCard>
  );
};
