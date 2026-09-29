import React, { useState, useEffect, useMemo, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import Autocomplete from '@mui/material/Autocomplete';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Alert from '@mui/material/Alert';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Tooltip from '@mui/material/Tooltip';
import InputAdornment from '@mui/material/InputAdornment';
import Chip from '@mui/material/Chip';
import { ContentCopy, Code, ExpandMore, Check } from '@mui/icons-material';
import { usePermission } from '@backstage/plugin-permission-react';
import { VirtualKey, ModelInfo, TeamInfo, GenerateKeyRequest, GenerateKeyResponse, UpdateKeyRequest, LiteLlmConfig } from '../types';
import { DEFAULT_KEY_DURATIONS, litellmKeyResetSpendPermission, formatDurationLabel } from '@acarmisc/backstage-plugin-litellm-common';
import { estimateTokensFromBudget, fmtInt } from '../format';
import { useCopyToClipboard } from '../hooks';
import { validateKeyForm, firstInvalidField, expiryPreview, priciestInputPrice } from '../keyFormValidation';

/**
 * Single form dialog for both key creation (`mode="create"`) and key editing
 * (`mode="edit"`).
 *
 * Create mode: alias (pre-filled), team, models, duration, budget (+unlimited
 * when gated on), TPM/RPM in the Advanced accordion, and the post-generation
 * screen with copyable key + starter snippets.
 *
 * Edit mode: the same shared fields but no duration (expiry is immutable after
 * creation) and no team switch (LiteLLM /key/update semantics); adds a masked
 * key header and the Danger Zone (reset spend). Budget validation, the
 * unlimited toggle and the team-scoped model filtering behave exactly as they
 * do at creation time.
 */
export type KeyFormDialogMode = 'create' | 'edit';

export interface KeyFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** `create` generates a new key; `edit` updates an existing one. */
  mode: KeyFormDialogMode;
  /** Key being edited (edit mode only). */
  keyToEdit?: VirtualKey | null;
  keys: VirtualKey[];
  models: ModelInfo[];
  modelsError?: Error;
  onRetryModels?: () => void;
  teams: TeamInfo[];
  /** Current user's LiteLLM user id, used to pre-fill a default key alias. */
  username?: string;
  /** Controls for the key form; see litellm.keyGeneration in app-config.yaml. */
  keyGenerationSettings?: { allowUnlimitedBudget: boolean; teamRequired: boolean };
  onCreateKey: (request: GenerateKeyRequest) => Promise<GenerateKeyResponse>;
  onUpdateKey: (keyId: string, request: UpdateKeyRequest) => Promise<void>;
  onResetKeySpend?: (keyId: string) => Promise<void>;
  onGetConfig: () => Promise<LiteLlmConfig>;
}

const generateDefaultAlias = (username?: string): string => {
  const base = (username || 'user')
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'user';
  const hash = Math.random().toString(36).slice(2, 8);
  return `${base}-${hash}`;
};

const createForm = (username?: string): GenerateKeyRequest => ({
  alias: generateDefaultAlias(username),
  models: [],
  duration: '30d',
  max_budget: 100,
  tpm_limit: undefined,
  rpm_limit: undefined,
  team_id: undefined,
  key_type: 'llm_api',
});

const editForm = (k: VirtualKey): UpdateKeyRequest => ({
  key_alias: k.key_alias ?? '',
  models: k.models ?? [],
  max_budget: k.max_budget,
  tpm_limit: k.tpm_limit,
  rpm_limit: k.rpm_limit,
});

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

// LiteLLM sentinel: a team's `models` list is `["all-proxy-models"]` when the
// team isn't restricted to specific models. A team's `models` entries can
// also be access-group names (see litellm model_info.access_groups) rather
// than literal model_name values. Treating either case as a literal
// model_name allowlist matches nothing, which previously made the whole
// "Models" field disappear for such teams.
const ALL_PROXY_MODELS = 'all-proxy-models';

function isModelAllowedByTeam(model: ModelInfo, teamModels?: string[]): boolean {
  if (!teamModels || teamModels.length === 0) return true;
  if (teamModels.includes(ALL_PROXY_MODELS)) return true;
  if (teamModels.includes(model.model_name)) return true;
  return !!model.access_groups?.some(group => teamModels.includes(group));
}

interface Snippets {
  curl: string;
  openai: string;
  opencode: string;
  pi: string;
  claudeCode: string;
  publicEndpoint: string;
}

function buildSnippets(baseUrl: string | null, key: string, model: string): Snippets {
  if (!baseUrl) {
    throw new Error('baseUrl not configured');
  }
  const base = trimSlash(baseUrl);
  const apiBase = `${base}/v1`;
  return {
    publicEndpoint: apiBase,
    curl: `curl ${apiBase}/chat/completions \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model}",
    "messages": [{ "role": "user", "content": "Hello!" }]
  }'`,
    openai: `from openai import OpenAI

client = OpenAI(
  api_key="${key}",
  base_url="${apiBase}",
)

response = client.chat.completions.create(
  model="${model}",
  messages=[{ "role": "user", "content": "Hello!" }],
)
print(response.choices[0].message.content)`,
    opencode: `{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "litellm": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "LiteLLM",
      "options": {
        "baseURL": "${apiBase}",
        "apiKey": "${key}"
      },
      "models": {
        "${model}": {}
      }
    }
  }
}`,
    pi: `{
  "litellm": {
    "baseUrl": "${apiBase}",
    "apiKey": "${key}",
    "api": "openai-completions",
    "models": [
      { "id": "${model}", "name": "${model}" }
    ]
  }
}`,
    claudeCode: `# Option 1 — Static key (store in environment or .env)
export ANTHROPIC_AUTH_TOKEN="${key}"
export ANTHROPIC_BASE_URL="${base}"
claude --model ${model}

# Option 2 — Read from OS keychain (macOS or Linux)
# 1. Store this key in your system keychain:
#    macOS:
security add-generic-password -s litellm-api-key -a "$USER" -w '<paste key>'
#    Linux (secret-tool):
secret-tool store --label="LiteLLM" service litellm-api-key

# 2. Add to ~/.claude/settings.json (apiKeyHelper is a shell command whose
#    stdout is the key):
#    macOS:
#      { "apiKeyHelper": "security find-generic-password -s litellm-api-key -w" }
#    Linux:
#      { "apiKeyHelper": "secret-tool lookup service litellm-api-key" }

# 3. Optional: refresh interval in ms (default 1h):
export CLAUDE_CODE_API_KEY_HELPER_TTL_MS=3600000`,
  };
}

function aliasHelperText(aliasError: boolean, aliasDuplicate: boolean): string | undefined {
  if (aliasError) return 'Alias is required';
  if (aliasDuplicate) return 'This alias is already used by one of your keys — LiteLLM requires aliases to be unique across all keys';
  return undefined;
}

function teamHelperText(teamError: boolean, teamRequired: boolean): string {
  if (teamError) return 'Team is required';
  if (teamRequired) return 'Bind this key to a team for scoped access';
  return 'Optional: bind this key to a specific team for scoped access';
}

function budgetHelperText(budgetInvalid: boolean, budgetEstimate: number | null, unlimited: boolean): string | undefined {
  if (budgetInvalid && !unlimited) return 'Enter a positive budget or tick "Unlimited"';
  if (budgetEstimate !== null) return `≈ ${fmtInt(budgetEstimate)} tokens at the priciest selected model`;
  return 'Lifetime cap for this key. It never resets';
}

interface SnippetTabsProps {
  snippets: Snippets;
  model: string;
  copyState: { copy: (text: string) => Promise<boolean>; copied: boolean };
}

type SnippetTab = 'curl' | 'openai' | 'opencode' | 'pi' | 'claude-code';

const SNIPPET_FILE_HINTS: Partial<Record<SnippetTab, string>> = {
  opencode: 'Add to ~/.config/opencode/opencode.json',
  pi: 'Add to ~/.pi/agent/models.json',
  'claude-code': 'Store the key in your OS keychain and point apiKeyHelper at it in ~/.claude/settings.json',
};

const SnippetTabs: React.FC<SnippetTabsProps> = ({ snippets, model, copyState }) => {
  const [tab, setTab] = useState<SnippetTab>('curl');
  const snippetKey = tab === 'claude-code' ? 'claudeCode' : tab;
  const code = snippets[snippetKey as keyof Snippets];
  const fileHint = SNIPPET_FILE_HINTS[tab];
  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v as SnippetTab)} sx={{ mb: 1 }} variant="scrollable">
        <Tab label="curl" value="curl" />
        <Tab label="OpenAI SDK" value="openai" />
        <Tab label="opencode" value="opencode" />
        <Tab label="pi" value="pi" />
        <Tab label="Claude Code" value="claude-code" />
      </Tabs>
      {fileHint && (
        <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
          {fileHint}
        </Typography>
      )}
      <Box
        position="relative"
        p={1.5}
        sx={{ backgroundColor: 'action.hover', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
      >
        <Tooltip title={copyState.copied ? 'Copied' : 'Copy snippet'} placement="top">
          <IconButton
            size="small"
            onClick={() => copyState.copy(code)}
            aria-label="Copy snippet"
            sx={{ position: 'absolute', top: 4, right: 4 }}
          >
            {copyState.copied ? <Check fontSize="small" /> : <ContentCopy fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Typography
          component="pre"
          sx={{
            fontFamily: 'monospace',
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            mb: 0,
            pr: 4,
          }}
        >
          {code}
        </Typography>
        {model && (
          <Typography variant="caption" color="text.secondary" display="block" mt={1}>
            Using model “{model}” — swap it for any model you have access to.
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export const KeyFormDialog: React.FC<KeyFormDialogProps> = ({
  open,
  onClose,
  mode,
  keyToEdit = null,
  keys,
  models,
  modelsError,
  onRetryModels,
  teams,
  username,
  keyGenerationSettings,
  onCreateKey,
  onUpdateKey,
  onResetKeySpend,
  onGetConfig,
}) => {
  const isCreate = mode === 'create';
  const [generateForm, setGenerateForm] = useState<GenerateKeyRequest>(createForm(username));
  const [editFormState, setEditFormState] = useState<UpdateKeyRequest>({});
  const [unlimitedBudget, setUnlimitedBudget] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [newKeySnippets, setNewKeySnippets] = useState<Snippets | null>(null);
  const [newKeyModel, setNewKeyModel] = useState<string>('');
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [resetSpendConfirm, setResetSpendConfirm] = useState(false);
  const [resetSpendSubmitting, setResetSpendSubmitting] = useState(false);
  const [config, setConfig] = useState<LiteLlmConfig | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [closeWithoutCopyConfirm, setCloseWithoutCopyConfirm] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Refs for focusing first invalid field
  const teamInputRef = useRef<HTMLInputElement>(null);
  const aliasInputRef = useRef<HTMLInputElement>(null);
  const budgetInputRef = useRef<HTMLInputElement>(null);

  // Clipboard hook for all copy operations
  const clipboardSecret = useCopyToClipboard();
  const clipboardSnippet = useCopyToClipboard();
  const clipboardEndpoint = useCopyToClipboard();

  // Permission check for reset spend
  const resetSpendPermission = usePermission({ permission: litellmKeyResetSpendPermission });
  const canResetSpend = !resetSpendPermission.loading && resetSpendPermission.allowed;

  // Re-arm the form each time the dialog opens so a stale result from a
  // previous run (or another user's session) is never shown.
  useEffect(() => {
    if (open) {
      if (isCreate) {
        setGenerateForm(createForm(username));
      } else if (keyToEdit) {
        setEditFormState(editForm(keyToEdit));
        setUnlimitedBudget(
          keyGenerationSettings?.allowUnlimitedBudget === true &&
            (keyToEdit.max_budget === null || keyToEdit.max_budget === undefined),
        );
      } else {
        setEditFormState({});
        setUnlimitedBudget(false);
      }
      setNewKeyValue(null);
      setNewKeySnippets(null);
      setNewKeyModel('');
      setGenerateError(null);
      setEditError(null);
      setResetSpendConfirm(false);
      setSecretCopied(false);
      setCloseWithoutCopyConfirm(false);
      setTouched({});
      setSubmitAttempted(false);
      // Fetch config to check key action capabilities
      onGetConfig().then(setConfig).catch(() => setConfig(null));
    }
  }, [open, isCreate, keyToEdit, username, keyGenerationSettings?.allowUnlimitedBudget, onGetConfig]);

  const allowUnlimitedBudget = keyGenerationSettings?.allowUnlimitedBudget ?? false;
  const teamRequired = keyGenerationSettings?.teamRequired ?? true;

  const formData = isCreate ? generateForm : editFormState;
  const setFormData = (patch: Partial<GenerateKeyRequest> & Partial<UpdateKeyRequest>) => {
    if (isCreate) {
      setGenerateForm(prev => ({ ...prev, ...patch }));
    } else {
      setEditFormState(prev => ({ ...prev, ...patch }));
    }
  };

  // Create mode names the field `alias`; edit mode `key_alias` (matching the
  // LiteLLM payload shapes). One accessor keeps the shared JSX mode-agnostic.
  const currentAlias = (isCreate ? generateForm.alias : editFormState.key_alias) ?? '';
  const setAliasField = (value: string) => {
    if (isCreate) setFormData({ alias: value });
    else setFormData({ key_alias: value });
  };

  const selectedTeam = teams.find(t => t.team_id === (isCreate ? generateForm.team_id : undefined)) ?? null;

  // In edit mode, filter models by the key's team_id (fixed after creation).
  // In create mode, filter by the currently selected team.
  const teamIdForModels = isCreate ? generateForm.team_id : keyToEdit?.team_id;
  const teamForModels = teams.find(t => t.team_id === teamIdForModels) ?? null;

  // Once a team is selected, only offer models that team is actually allowed
  // to use — `models` here is already scoped to what the user can access.
  // Applies on edit too, so a key can no longer drift out of its team's
  // allowlist via /key/update.
  const availableModels = useMemo(() => {
    return models.filter(m => isModelAllowedByTeam(m, teamForModels?.models));
  }, [models, teamForModels]);

  const selectedModels = availableModels.filter(m => (formData.models || []).includes(m.model_name));

  // ── Validation using the validation module ────────────────────────────────
  const validationErrors = validateKeyForm(formData, {
    teamRequired,
    unlimitedBudget,
    isCreate,
  });

  // Show errors only if the field was touched or submit was attempted
  const showError = (field: string) => touched[field] || submitAttempted;
  const aliasError = showError('alias') && !!validationErrors.alias;
  const teamError = showError('team') && !!validationErrors.team;
  const budgetInvalid = showError('budget') && !!validationErrors.budget;

  // Issue #35: warn (don't block) when the alias already matches one of the
  // user's loaded keys — LiteLLM enforces globally-unique aliases.
  const aliasDuplicate = !!currentAlias && keys.some(k => k.key_alias === currentAlias && k !== keyToEdit);

  // ── Budget estimate at the priciest selected model's input rate ──────────
  const budgetEstimate = useMemo(() => {
    if (unlimitedBudget || budgetInvalid) return null;
    const pricePerToken = priciestInputPrice(selectedModels);
    if (pricePerToken === null) return null;
    return estimateTokensFromBudget(formData.max_budget ?? 0, pricePerToken);
  }, [formData.max_budget, selectedModels, unlimitedBudget, budgetInvalid]);

  const handleGenerate = async () => {
    // Validate before submitting
    const errors = validateKeyForm(generateForm, {
      teamRequired,
      unlimitedBudget,
      isCreate: true,
    });

    if (Object.keys(errors).length > 0) {
      setSubmitAttempted(true);
      // Focus first invalid field
      const firstInvalid = firstInvalidField(errors, true);
      if (firstInvalid === 'team' && teamInputRef.current) {
        teamInputRef.current.focus();
      } else if (firstInvalid === 'alias' && aliasInputRef.current) {
        aliasInputRef.current.focus();
      } else if (firstInvalid === 'budget' && budgetInputRef.current) {
        budgetInputRef.current.focus();
      }
      return;
    }

    setSubmitting(true);
    setGenerateError(null);
    try {
      const request: GenerateKeyRequest = {
        ...(generateForm as GenerateKeyRequest),
        max_budget: unlimitedBudget ? null : generateForm.max_budget,
      };
      const response = await onCreateKey(request);
      // When the key allows all models (none explicitly picked), fall back to
      // the first model actually allowed for the chosen team so snippets show
      // a working example rather than an empty model name.
      const model = generateForm.models?.[0] ?? availableModels[0]?.model_name ?? '';
      setNewKeyValue(response.key);
      setNewKeyModel(model);
      setNewKeySnippets(null);
      try {
        const fetchedConfig = await onGetConfig();
        if (fetchedConfig.baseUrl) {
          setNewKeySnippets(buildSnippets(fetchedConfig.baseUrl, response.key, model));
        }
      } catch {
        // Snippets are a nice-to-have; the raw key is still shown.
      }
      setGenerateForm(createForm(username));
      setUnlimitedBudget(false);
    } catch (error: any) {
      setGenerateError(error?.message ?? 'Failed to generate key');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!keyToEdit) return;

    // Validate before submitting
    const errors = validateKeyForm(editFormState, {
      teamRequired,
      unlimitedBudget,
      isCreate: false,
    });

    if (Object.keys(errors).length > 0) {
      setSubmitAttempted(true);
      // Focus first invalid field
      const firstInvalid = firstInvalidField(errors, false);
      if (firstInvalid === 'alias' && aliasInputRef.current) {
        aliasInputRef.current.focus();
      } else if (firstInvalid === 'budget' && budgetInputRef.current) {
        budgetInputRef.current.focus();
      }
      return;
    }

    setSubmitting(true);
    setEditError(null);
    try {
      const request: UpdateKeyRequest = {
        ...editFormState,
        max_budget: unlimitedBudget ? null : editFormState.max_budget,
      };
      await onUpdateKey(keyToEdit.token ?? keyToEdit.key, request);
      onClose();
    } catch (error: any) {
      setEditError(error?.message ?? 'Failed to update key');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetSpend = async () => {
    if (!keyToEdit || !onResetKeySpend) return;
    setResetSpendSubmitting(true);
    try {
      await onResetKeySpend(keyToEdit.token ?? keyToEdit.key);
      setResetSpendConfirm(false);
      onClose();
    } finally {
      setResetSpendSubmitting(false);
    }
  };

  const handleCloseWithoutConfirm = () => {
    onClose();
    setGenerateError(null);
    setEditError(null);
    setNewKeyValue(null);
    setNewKeySnippets(null);
    setGenerateForm(createForm(username));
    setEditFormState({});
    setUnlimitedBudget(false);
    setResetSpendConfirm(false);
    setSecretCopied(false);
    setCloseWithoutCopyConfirm(false);
  };

  // Handle close when showing the secret — check if copied first
  const handleCloseSecretDialog = () => {
    if (newKeyValue && !secretCopied) {
      // Show confirmation before closing
      setCloseWithoutCopyConfirm(true);
    } else {
      handleCloseWithoutConfirm();
    }
  };

  const handleConfirmCloseWithoutCopy = () => {
    setCloseWithoutCopyConfirm(false);
    handleCloseWithoutConfirm();
  };

  // Handle Dialog close events (Escape, backdrop click)
  const handleDialogClose = (_event: unknown, reason: string) => {
    // If showing a secret, ignore backdrop and escape
    if (newKeyValue && (reason === 'backdropClick' || reason === 'escapeKeyDown')) {
      return;
    }
    handleCloseSecretDialog();
  };

  const modelOption = (m: ModelInfo) => {
    const inCost = fmtCost(m.input_cost_per_token);
    const outCost = fmtCost(m.output_cost_per_token);
    const ctx = formatContextWindow(m.max_input_tokens, m.max_output_tokens);
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
          <span>{m.model_name}</span>
          {m.supports_function_calling && <Chip size="small" variant="outlined" label="Tools" />}
          {m.supports_vision && <Chip size="small" variant="outlined" label="Vision" />}
        </Box>
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

  const renderTeamField = () => {
    if (teams.length > 0) {
      return (
        <Autocomplete
          options={teams}
          getOptionLabel={t => t.team_alias || t.team_id}
          value={selectedTeam}
          onChange={(_e, team) => {
            const restrictedModels = (formData.models || []).filter(name => {
              const model = models.find(m => m.model_name === name);
              return model ? isModelAllowedByTeam(model, team?.models) : false;
            });
            setFormData({ team_id: team?.team_id, models: restrictedModels });
          }}
          disabled={!isCreate}
          onBlur={() => setTouched(prev => ({ ...prev, team: true }))}
          renderInput={params => (
            <TextField
              {...params}
              inputRef={teamInputRef}
              label="Team"
              error={teamError}
              helperText={
                isCreate
                  ? teamHelperText(teamError, teamRequired)
                  : 'Team binding is fixed after creation — delete and recreate the key to change it'
              }
              required={isCreate && teamRequired}
              fullWidth
            />
          )}
        />
      );
    }
    if (teamRequired && isCreate) {
      return (
        <Typography variant="body2" color="error">
          Team selection is required, but you don't belong to any team yet — contact your administrator.
        </Typography>
      );
    }
    return null;
  };

  const editKeyId = keyToEdit?.token ?? keyToEdit?.key ?? '';

  const renderDangerZone = () => {
    if (isCreate || !onResetKeySpend) return null;
    // Hide the danger zone if allowOwnerResetSpend is false or permission not granted
    if (!config?.keyActions?.allowOwnerResetSpend || !canResetSpend) return null;
    return (
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
    );
  };

  const maskKey = (key: string): string => {
    if (key.length <= 8) return '***';
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  };

  let dialogTitle = 'Edit Key';
  if (newKeyValue) dialogTitle = 'Key Generated';
  else if (isCreate) dialogTitle = 'Generate New Key';

  const submitLabel = isCreate ? 'Generate' : 'Save';
  return (
    <Dialog
      open={open}
      onClose={handleDialogClose}
      disableEscapeKeyDown={!!newKeyValue}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>{dialogTitle}</DialogTitle>
      <DialogContent>
        {newKeyValue ? (
          <Box>
            <Alert severity="warning" sx={{ mb: 2 }}>
              Copy this key now. It will never be shown again.
            </Alert>
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
              <Tooltip title={clipboardSecret.copied ? 'Copied' : 'Copy API key'} placement="top">
                <IconButton
                  aria-label="Copy API key"
                  onClick={async () => {
                    const success = await clipboardSecret.copy(newKeyValue);
                    if (success) {
                      setSecretCopied(true);
                    }
                  }}
                >
                  {clipboardSecret.copied ? <Check /> : <ContentCopy />}
                </IconButton>
              </Tooltip>
            </Box>

            {newKeyValue && !newKeySnippets && (
              <Box mt={2}>
                <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                  Public endpoint
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Endpoint not configured
                </Typography>
              </Box>
            )}

            {newKeySnippets && (
              <Box mt={2}>
                <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                  Public endpoint — paste into any tool's base URL / API base field
                </Typography>
                <Box
                  display="flex"
                  alignItems="center"
                  gap={1}
                  p={1.5}
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
                    sx={{ fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all', flex: 1 }}
                  >
                    {newKeySnippets.publicEndpoint}
                  </Typography>
                  <Tooltip title={clipboardEndpoint.copied ? 'Copied' : 'Copy endpoint'} placement="top">
                    <IconButton
                      size="small"
                      aria-label="Copy endpoint"
                      onClick={() => clipboardEndpoint.copy(newKeySnippets.publicEndpoint)}
                    >
                      {clipboardEndpoint.copied ? <Check fontSize="small" /> : <ContentCopy fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            )}

            {newKeySnippets && (
              <Box mt={3}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <Code fontSize="small" color="action" />
                  <Typography variant="subtitle2">
                    Start calling the proxy — paste and run
                  </Typography>
                </Box>
                <SnippetTabs snippets={newKeySnippets} model={newKeyModel} copyState={clipboardSnippet} />
              </Box>
            )}
          </Box>
        ) : (
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            {!isCreate && (
              <Typography variant="body2" color="text.secondary">
                <code style={{ fontFamily: 'monospace', color: 'inherit' }}>{maskKey(editKeyId)}</code>
              </Typography>
            )}
            {generateError && (
              <Alert severity="error" onClose={() => setGenerateError(null)}>
                {generateError}
              </Alert>
            )}
            {editError && (
              <Alert severity="error" onClose={() => setEditError(null)}>
                {editError}
              </Alert>
            )}

            {/* Field order: Team → Models → Budget → Duration → Alias → Advanced */}
            {renderTeamField()}

            {(availableModels.length > 0 || modelsError) && (
              <>
                {modelsError ? (
                  <TextField
                    label="Models"
                    disabled
                    value=""
                    helperText="Couldn't load models. Retry"
                    fullWidth
                  />
                ) : (
                  <Autocomplete
                    multiple
                    options={availableModels}
                    groupBy={m => m.mode || 'other'}
                    getOptionLabel={m => m.model_name}
                    value={selectedModels}
                    onChange={(_e, selected) =>
                      setFormData({ models: selected.map(m => m.model_name) })
                    }
                    renderOption={(props, m) => <li {...props}>{modelOption(m)}</li>}
                    renderInput={params => (
                      <TextField
                        {...params}
                        label="Models"
                        helperText={
                          teamForModels
                            ? 'Leave empty to allow all models available to this team'
                            : 'Leave empty to allow all models'
                        }
                        fullWidth
                      />
                    )}
                  />
                )}
                {modelsError && onRetryModels && (
                  <Button size="small" onClick={onRetryModels}>
                    Retry
                  </Button>
                )}
              </>
            )}

            {allowUnlimitedBudget && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={unlimitedBudget}
                    onChange={(e) => {
                      setUnlimitedBudget(e.target.checked);
                      if (e.target.checked) {
                        setFormData({ max_budget: null });
                      } else {
                        setFormData({ max_budget: editFormState.max_budget ?? generateForm.max_budget ?? 100 });
                      }
                    }}
                  />
                }
                label="Unlimited budget"
              />
            )}
            <TextField
              inputRef={budgetInputRef}
              label="Max Budget"
              type="number"
              value={unlimitedBudget ? '' : formData.max_budget ?? ''}
              onChange={(e) => {
                setFormData({ max_budget: e.target.value ? Number(e.target.value) : undefined });
                setGenerateError(null);
                setEditError(null);
              }}
              onBlur={() => setTouched(prev => ({ ...prev, budget: true }))}
              error={budgetInvalid}
              helperText={budgetHelperText(budgetInvalid, budgetEstimate, unlimitedBudget)}
              disabled={unlimitedBudget}
              required
              fullWidth
              InputProps={{
                startAdornment: <InputAdornment position="start">$</InputAdornment>,
              }}
              inputProps={{ min: 0, step: 0.01 }}
            />

            {!isCreate ? null : (
              <>
                <TextField
                  select
                  label="Duration"
                  value={generateForm.duration || '30d'}
                  onChange={(e) => setFormData({ duration: e.target.value })}
                  fullWidth
                >
                  {DEFAULT_KEY_DURATIONS.map((duration) => (
                    <MenuItem key={duration} value={duration}>
                      {formatDurationLabel(duration)}
                    </MenuItem>
                  ))}
                </TextField>
                {generateForm.duration && (
                  <Typography variant="caption" color="text.secondary">
                    {expiryPreview(generateForm.duration)}
                  </Typography>
                )}
              </>
            )}

            <TextField
              inputRef={aliasInputRef}
              label="Alias"
              value={currentAlias}
              onChange={(e) => {
                setAliasField(e.target.value);
                setGenerateError(null);
                setEditError(null);
              }}
              onBlur={() => setTouched(prev => ({ ...prev, alias: true }))}
              error={aliasError}
              color={aliasDuplicate ? 'warning' : undefined}
              helperText={aliasHelperText(aliasError, aliasDuplicate)}
              required
              fullWidth
            />

            <Accordion disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography variant="body2" fontWeight={600}>Advanced</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  label="TPM Limit"
                  type="number"
                  value={formData.tpm_limit ?? ''}
                  onChange={(e) =>
                    setFormData({ tpm_limit: e.target.value ? Number(e.target.value) : undefined })
                  }
                  helperText="Max tokens per minute this key can consume across all models. Leave blank for no limit."
                  fullWidth
                />
                <TextField
                  label="RPM Limit"
                  type="number"
                  value={formData.rpm_limit ?? ''}
                  onChange={(e) =>
                    setFormData({ rpm_limit: e.target.value ? Number(e.target.value) : undefined })
                  }
                  helperText="Max requests per minute this key can make across all models. Leave blank for no limit."
                  fullWidth
                />
              </AccordionDetails>
            </Accordion>
            {renderDangerZone()}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {newKeyValue ? (
          <Button onClick={handleCloseSecretDialog} variant="contained" color="success">
            Done
          </Button>
        ) : (
          <>
            <Button onClick={handleCloseWithoutConfirm}>Cancel</Button>
            <Button
              onClick={isCreate ? handleGenerate : handleUpdate}
              variant="contained"
              color="primary"
              disabled={submitting}
            >
              {submitting ? <CircularProgress size={24} /> : submitLabel}
            </Button>
          </>
        )}
      </DialogActions>

      {/* Confirm close without copying the secret */}
      <Dialog open={closeWithoutCopyConfirm} onClose={() => setCloseWithoutCopyConfirm(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Close Without Copying?</DialogTitle>
        <DialogContent>
          <Typography>
            You haven't copied the key. Close anyway?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCloseWithoutCopyConfirm(false)}>
            Go back
          </Button>
          <Button
            onClick={handleConfirmCloseWithoutCopy}
            variant="contained"
            color="error"
          >
            Close anyway
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
};

export function fmtCost(perToken?: number): string | null {
  if (!perToken) return null;
  const per1k = perToken * 1000;
  return per1k < 0.01 ? `$${(perToken * 1_000_000).toFixed(2)}/M` : `$${per1k.toFixed(3)}/1K`;
}

export function formatContextWindow(
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