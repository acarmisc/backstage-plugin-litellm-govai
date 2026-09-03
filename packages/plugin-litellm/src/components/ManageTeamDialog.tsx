import React, { FC, useState, useEffect } from 'react';
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
import { TeamInfo, ModelInfo, LiteLlmConfig, CreateTeamRequest, UpdateTeamRequest } from '../types';

interface ManageTeamDialogProps {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  team?: TeamInfo;
  allModels: ModelInfo[];
  config?: LiteLlmConfig;
  onSubmit: (payload: CreateTeamRequest | UpdateTeamRequest) => Promise<void>;
}

export const ManageTeamDialog: FC<ManageTeamDialogProps> = ({
  open,
  onClose,
  mode,
  team,
  allModels,
  config,
  onSubmit,
}) => {
  const [alias, setAlias] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [maxBudget, setMaxBudget] = useState<string>('');
  const [unlimited, setUnlimited] = useState(false);
  const [budgetDuration, setBudgetDuration] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowUnlimitedBudget = config?.teamManagement?.allowUnlimitedBudget ?? false;
  const maxBudgetCeiling = config?.teamManagement?.maxBudgetCeiling;

  useEffect(() => {
    if (open) {
      if (mode === 'edit' && team) {
        setAlias(team.team_alias ?? '');
        setModels(team.models ?? []);
        setMaxBudget(team.max_budget ? String(team.max_budget) : '');
        setUnlimited(allowUnlimitedBudget && !team.max_budget);
        setBudgetDuration('');
      } else {
        setAlias('');
        setModels([]);
        setMaxBudget('');
        setUnlimited(allowUnlimitedBudget);
        setBudgetDuration('');
      }
      setError(null);
    }
  }, [open, mode, team, allowUnlimitedBudget]);

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
      if (maxBudgetCeiling !== null && maxBudgetCeiling !== undefined && budget > maxBudgetCeiling) {
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

  const modelNames = allModels.map(m => m.model_name);

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
          renderInput={params => <TextField {...params} label="Models" />}
        />

        <TextField
          label="Max Budget ($)"
          type="number"
          value={maxBudget}
          onChange={e => setMaxBudget(e.target.value)}
          disabled={submitting || unlimited}
          helperText={
            maxBudgetCeiling !== null && maxBudgetCeiling !== undefined
              ? `Maximum: $${maxBudgetCeiling}`
              : undefined
          }
          fullWidth
        />

        {allowUnlimitedBudget && (
          <FormControlLabel
            control={<Checkbox checked={unlimited} onChange={e => setUnlimited(e.target.checked)} disabled={submitting} />}
            label="Unlimited Budget"
          />
        )}

        <TextField
          label="Budget Duration"
          value={budgetDuration}
          onChange={e => setBudgetDuration(e.target.value)}
          placeholder="30d"
          disabled={submitting}
          fullWidth
        />
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
