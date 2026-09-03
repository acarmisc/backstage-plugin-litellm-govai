import React, { FC, useState, useEffect, useMemo } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Autocomplete from '@mui/material/Autocomplete';
import CircularProgress from '@mui/material/CircularProgress';
import MenuItem from '@mui/material/MenuItem';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { Delete as DeleteIcon } from '@mui/icons-material';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef, UserEntity } from '@backstage/catalog-model';
import { useAsync } from 'react-use';
import { TeamInfo, ModelInfo, LiteLlmConfig, CreateTeamRequest, UpdateTeamRequest, VectorStoreInfo, McpServerInfo } from '../types';
import { StatusPill, dataTableSx } from './ui';

/** A catalog User entity flattened into what the member picker needs. */
interface UserOption {
  ref: string;
  label: string;
  email?: string;
}

/** Spend-reset periods offered for a team budget (LiteLLM `budget_duration`). */
const BUDGET_DURATION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '1d', label: 'Daily (1d)' },
  { value: '7d', label: 'Weekly (7d)' },
  { value: '30d', label: 'Monthly (30d)' },
  { value: '90d', label: 'Quarterly (90d)' },
  { value: '365d', label: 'Yearly (365d)' },
];
const DEFAULT_BUDGET_DURATION = '30d';
const FALLBACK_BUDGET_CEILING = 1000;

interface ManageTeamDialogProps {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  team?: TeamInfo;
  allModels: ModelInfo[];
  config?: LiteLlmConfig;
  onSubmit: (payload: CreateTeamRequest | UpdateTeamRequest) => Promise<void>;
  /** When true, the Members section (edit mode only) exposes add/remove controls. */
  canManageMembers?: boolean;
  /** Called to add a member; the parent is expected to refresh `team` on success. */
  onAddMember?: (userEntityRef: string, maxBudgetInTeam?: number) => Promise<void>;
  /** Called to remove a member; the parent is expected to refresh `team` on success. */
  onRemoveMember?: (userEntityRef: string) => Promise<void>;
  /** When true, the Knowledge Bases section (edit mode only) is shown. */
  canManageKnowledgeBases?: boolean;
  /** Vector stores the caller may attach (already allowlist-filtered server-side). */
  vectorStores?: VectorStoreInfo[];
  /** Called to replace the team's attached knowledge bases; parent refreshes `team`. */
  onSaveKnowledgeBases?: (vectorStoreIds: string[]) => Promise<void>;
  /** When true, the MCP Servers section (edit mode only) is shown. */
  canManageMcpServers?: boolean;
  /** MCP servers the caller may attach (already allowlist-filtered server-side). */
  mcpServers?: McpServerInfo[];
  /** Called to replace the team's attached MCP servers; parent refreshes `team`. */
  onSaveMcpServers?: (mcpServerIds: string[]) => Promise<void>;
}

export const ManageTeamDialog: FC<ManageTeamDialogProps> = ({
  open,
  onClose,
  mode,
  team,
  allModels,
  config,
  onSubmit,
  canManageMembers,
  onAddMember,
  onRemoveMember,
  canManageKnowledgeBases,
  vectorStores,
  onSaveKnowledgeBases,
  canManageMcpServers,
  mcpServers,
  onSaveMcpServers,
}) => {
  const [alias, setAlias] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [maxBudget, setMaxBudget] = useState<string>('');
  const [unlimited, setUnlimited] = useState(false);
  const [budgetDuration, setBudgetDuration] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // memberQuery is the text shown in the picker; memberRef is the entity ref
  // that will actually be submitted (either a picked catalog user's ref, or
  // whatever was typed, as a fallback for catalog lookup failures).
  const [memberQuery, setMemberQuery] = useState('');
  const [memberRef, setMemberRef] = useState('');
  const [memberBudget, setMemberBudget] = useState('');
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);

  const [kbIds, setKbIds] = useState<string[]>([]);
  const [kbBusy, setKbBusy] = useState(false);
  const [kbError, setKbError] = useState<string | null>(null);

  const [mcpIds, setMcpIds] = useState<string[]>([]);
  const [mcpBusy, setMcpBusy] = useState(false);
  const [mcpError, setMcpError] = useState<string | null>(null);

  const allowUnlimitedBudget = config?.teamManagement?.allowUnlimitedBudget ?? false;
  const maxBudgetCeiling =
    config?.teamManagement?.maxBudgetCeiling ?? FALLBACK_BUDGET_CEILING;

  const members = useMemo(() => team?.members_with_roles ?? [], [team]);
  const showMembers = mode === 'edit' && !!canManageMembers;

  // Catalog users for the member picker, fetched only while the Members
  // section is actually visible. Failures degrade to an empty option list —
  // the field stays usable as a plain entity-ref input either way.
  const catalogApi = useApi(catalogApiRef);
  const { value: catalogUsers, loading: usersLoading } = useAsync(async () => {
    if (!open || !showMembers) return [] as UserEntity[];
    try {
      const { items } = await catalogApi.getEntities({
        filter: { kind: 'User' },
        fields: ['kind', 'metadata.namespace', 'metadata.name', 'metadata.title', 'spec.profile'],
      });
      return items as UserEntity[];
    } catch {
      return [] as UserEntity[];
    }
  }, [open, showMembers, catalogApi]);

  const userOptions = useMemo<UserOption[]>(() => {
    const existingEmails = new Set(
      members
        .map(m => m.user_email?.toLowerCase())
        .filter((e): e is string => !!e),
    );
    return (catalogUsers ?? [])
      .map(e => {
        const ref = stringifyEntityRef(e);
        const displayName =
          e.spec?.profile?.displayName || e.metadata.title || e.metadata.name;
        const email = e.spec?.profile?.email;
        return {
          ref,
          email,
          label: email ? `${displayName} (${email})` : displayName,
        };
      })
      .filter(o => !(o.email && existingEmails.has(o.email.toLowerCase())))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [catalogUsers, members]);

  useEffect(() => {
    if (open) {
      if (mode === 'edit' && team) {
        setAlias(team.team_alias ?? '');
        setModels(team.models ?? []);
        setMaxBudget(
          team.max_budget ? String(team.max_budget) : String(maxBudgetCeiling),
        );
        setUnlimited(allowUnlimitedBudget && !team.max_budget);
        setBudgetDuration(team.budget_duration ?? DEFAULT_BUDGET_DURATION);
      } else {
        setAlias('');
        setModels([]);
        // Default a new team's budget to the ceiling; the admin can lower it.
        setMaxBudget(String(maxBudgetCeiling));
        setUnlimited(allowUnlimitedBudget);
        setBudgetDuration(DEFAULT_BUDGET_DURATION);
      }
      setError(null);
      setMemberQuery('');
      setMemberRef('');
      setMemberBudget('');
      setMemberError(null);
      setKbIds(team?.object_permission?.vector_stores ?? []);
      setKbError(null);
      setMcpIds(team?.object_permission?.mcp_servers ?? []);
      setMcpError(null);
    }
  }, [open, mode, team, allowUnlimitedBudget, maxBudgetCeiling]);

  const handleSubmit = async () => {
    setError(null);

    if (!alias.trim()) {
      setError('Team alias is required');
      return;
    }

    if (models.length === 0) {
      setError('At least one model is required');
      return;
    }

    if (!unlimited) {
      if (!maxBudget) {
        setError('Budget is required when unlimited budgets are disabled');
        return;
      }
      const budget = parseFloat(maxBudget);
      if (isNaN(budget) || budget <= 0) {
        setError('Budget must be a positive number');
        return;
      }
      if (budget > maxBudgetCeiling) {
        setError(`Budget cannot exceed $${maxBudgetCeiling}`);
        return;
      }
    }

    try {
      setSubmitting(true);
      let payload: CreateTeamRequest | UpdateTeamRequest;

      if (mode === 'create') {
        payload = {
          team_alias: alias.trim(),
          models,
          ...(unlimited ? { max_budget: null } : { max_budget: parseFloat(maxBudget) }),
          ...(budgetDuration && { budget_duration: budgetDuration }),
        } as CreateTeamRequest;
      } else {
        payload = {
          team_alias: alias.trim(),
          models,
          ...(unlimited ? { max_budget: null } : { max_budget: parseFloat(maxBudget) }),
          ...(budgetDuration && { budget_duration: budgetDuration }),
        } as UpdateTeamRequest;
      }

      await onSubmit(payload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddMember = async () => {
    if (!onAddMember || !memberRef.trim()) return;
    setMemberError(null);
    const budget = memberBudget ? parseFloat(memberBudget) : undefined;
    if (budget !== undefined && (isNaN(budget) || budget <= 0)) {
      setMemberError('Max budget in team must be a positive number');
      return;
    }
    try {
      setMemberBusy(true);
      await onAddMember(memberRef.trim(), budget);
      setMemberQuery('');
      setMemberRef('');
      setMemberBudget('');
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setMemberBusy(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!onRemoveMember) return;
    setMemberError(null);
    try {
      setMemberBusy(true);
      await onRemoveMember(userId);
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setMemberBusy(false);
    }
  };

  const handleSaveKnowledgeBases = async () => {
    if (!onSaveKnowledgeBases) return;
    setKbError(null);
    try {
      setKbBusy(true);
      await onSaveKnowledgeBases(kbIds);
    } catch (err) {
      setKbError(err instanceof Error ? err.message : 'Failed to save knowledge bases');
    } finally {
      setKbBusy(false);
    }
  };

  const handleSaveMcpServers = async () => {
    if (!onSaveMcpServers) return;
    setMcpError(null);
    try {
      setMcpBusy(true);
      await onSaveMcpServers(mcpIds);
    } catch (err) {
      setMcpError(err instanceof Error ? err.message : 'Failed to save MCP servers');
    } finally {
      setMcpBusy(false);
    }
  };

  const modelNames = allModels.map(m => m.model_name);
  // Keep an unusual existing value (e.g. "14d", "1mo") selectable so editing a
  // team doesn't silently rewrite its duration.
  const durationOptions = BUDGET_DURATION_OPTIONS.some(o => o.value === budgetDuration)
    ? BUDGET_DURATION_OPTIONS
    : [...BUDGET_DURATION_OPTIONS, { value: budgetDuration, label: budgetDuration }];
  const showKnowledgeBases = mode === 'edit' && !!canManageKnowledgeBases;
  const kbOptions = (vectorStores ?? []).map(v => v.id);
  const kbLabel = (id: string) =>
    (vectorStores ?? []).find(v => v.id === id)?.name ?? id;
  const showMcpServers = mode === 'edit' && !!canManageMcpServers;
  const mcpOptions = (mcpServers ?? []).map(s => s.id);
  const mcpLabel = (id: string) =>
    (mcpServers ?? []).find(s => s.id === id)?.name ?? id;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{mode === 'create' ? 'Create Team' : 'Edit Team'}</DialogTitle>
      <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}

        <TextField
          label="Team Alias"
          value={alias}
          onChange={e => setAlias(e.target.value)}
          disabled={submitting}
          fullWidth
        />

        <Autocomplete
          multiple
          options={modelNames}
          value={models}
          onChange={(_, newValue) => setModels(newValue)}
          disabled={submitting}
          renderInput={params => (
            <TextField
              {...params}
              label="Models"
              required
              helperText="At least one model is required here — this delegated flow only grants access to models your admin has allow-listed for team creation, not every proxy model. (Teams with no model restriction shown elsewhere were configured directly in LiteLLM.)"
            />
          )}
        />

        <TextField
          label="Max Budget ($)"
          type="number"
          value={maxBudget}
          onChange={e => setMaxBudget(e.target.value)}
          disabled={submitting || unlimited}
          inputProps={{ min: 0, max: maxBudgetCeiling }}
          helperText={`Maximum: $${maxBudgetCeiling}`}
          fullWidth
        />

        {allowUnlimitedBudget && (
          <FormControlLabel
            control={<Checkbox checked={unlimited} onChange={e => setUnlimited(e.target.checked)} disabled={submitting} />}
            label="Unlimited Budget"
          />
        )}

        <TextField
          select
          label="Budget Duration"
          value={budgetDuration}
          onChange={e => setBudgetDuration(e.target.value)}
          disabled={submitting || unlimited}
          helperText="Spend-reset period for the team budget"
          fullWidth
        >
          {durationOptions.map(o => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>

        {showMembers && (
          <Box>
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Members
            </Typography>
            {memberError && (
              <Alert severity="error" sx={{ mb: 1 }} onClose={() => setMemberError(null)}>
                {memberError}
              </Alert>
            )}
            {members.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                No members yet.
              </Typography>
            ) : (
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1.5, mb: 1.5 }}>
                <Table size="small" sx={dataTableSx}>
                  <TableHead>
                    <TableRow>
                      <TableCell>User</TableCell>
                      <TableCell align="right">Role</TableCell>
                      <TableCell align="right" sx={{ width: 40 }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {members.map(m => (
                      <TableRow key={m.user_id}>
                        <TableCell>
                          {m.user_email ? (
                            <>
                              <Typography variant="body2">{m.user_email}</Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11 }}
                              >
                                {m.user_id}
                              </Typography>
                            </>
                          ) : (
                            <Typography
                              variant="body2"
                              sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                            >
                              {m.user_id}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <StatusPill label={m.role} tone={m.role === 'admin' ? 'accent' : 'neutral'} dot={false} />
                        </TableCell>
                        <TableCell align="right">
                          <IconButton
                            edge="end"
                            size="small"
                            aria-label={`remove ${m.user_id}`}
                            disabled={memberBusy}
                            onClick={() => handleRemoveMember(m.user_id)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <Autocomplete
                freeSolo
                autoHighlight
                options={userOptions}
                loading={usersLoading}
                inputValue={memberQuery}
                onInputChange={(_, newInputValue, reason) => {
                  setMemberQuery(newInputValue);
                  // 'reset' fires when a selection sets the input programmatically —
                  // memberRef is already set by onChange in that case, so only sync
                  // free typing (and clearing) back into the submitted ref here.
                  if (reason === 'input' || reason === 'clear') {
                    setMemberRef(newInputValue);
                  }
                }}
                onChange={(_, newValue) => {
                  if (newValue && typeof newValue !== 'string') {
                    setMemberQuery(newValue.label);
                    setMemberRef(newValue.ref);
                  }
                }}
                getOptionLabel={o => (typeof o === 'string' ? o : o.label)}
                isOptionEqualToValue={(o, v) => o.ref === (typeof v === 'string' ? v : v.ref)}
                disabled={memberBusy}
                sx={{ flex: 1, minWidth: 260 }}
                renderInput={params => (
                  <TextField
                    {...params}
                    label="Add member"
                    placeholder="Search by name or email…"
                    size="small"
                    helperText="Pick a catalog user, or paste a user entity ref"
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {usersLoading ? <CircularProgress color="inherit" size={14} /> : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
              />
              <TextField
                label="Max budget in team ($)"
                type="number"
                value={memberBudget}
                onChange={e => setMemberBudget(e.target.value)}
                disabled={memberBusy}
                size="small"
                sx={{ width: 160 }}
              />
              <Button
                onClick={handleAddMember}
                disabled={memberBusy || !memberRef.trim()}
                variant="outlined"
                sx={{ mt: 0.5 }}
              >
                Add
              </Button>
            </Box>
          </Box>
        )}

        {showKnowledgeBases && (
          <Box>
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Knowledge Bases
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Attaching a knowledge base exposes its documents to every key in
              this team.
            </Typography>
            {kbError && (
              <Alert severity="error" sx={{ mb: 1 }} onClose={() => setKbError(null)}>
                {kbError}
              </Alert>
            )}
            <Autocomplete
              multiple
              options={kbOptions}
              value={kbIds}
              getOptionLabel={kbLabel}
              onChange={(_, v) => setKbIds(v)}
              disabled={kbBusy}
              renderInput={params => (
                <TextField {...params} label="Attached knowledge bases" />
              )}
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
              <Button
                onClick={handleSaveKnowledgeBases}
                disabled={kbBusy}
                variant="outlined"
              >
                {kbBusy ? 'Saving…' : 'Save knowledge bases'}
              </Button>
            </Box>
          </Box>
        )}

        {showMcpServers && (
          <Box>
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              MCP Servers
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Attaching an MCP server lets every key in this team invoke that
              server's tools through the model — including any side effects
              those tools have.
            </Typography>
            {mcpError && (
              <Alert severity="error" sx={{ mb: 1 }} onClose={() => setMcpError(null)}>
                {mcpError}
              </Alert>
            )}
            <Autocomplete
              multiple
              options={mcpOptions}
              value={mcpIds}
              getOptionLabel={mcpLabel}
              onChange={(_, v) => setMcpIds(v)}
              disabled={mcpBusy}
              renderInput={params => (
                <TextField {...params} label="Attached MCP servers" />
              )}
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
              <Button
                onClick={handleSaveMcpServers}
                disabled={mcpBusy}
                variant="outlined"
              >
                {mcpBusy ? 'Saving…' : 'Save MCP servers'}
              </Button>
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={submitting} variant="contained">
          {submitting ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
