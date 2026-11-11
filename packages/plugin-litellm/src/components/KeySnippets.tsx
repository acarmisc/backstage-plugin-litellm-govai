import { FC, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Tooltip from '@mui/material/Tooltip';
import ButtonBase from '@mui/material/ButtonBase';
import { ContentCopy, Check } from '@mui/icons-material';
import { useCopyToClipboard } from '../hooks';

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export type SnippetTab = 'office365' | 'opencode' | 'claude-code' | 'pi' | 'openai' | 'curl';

/** Default tab order; Office365 first. Mirrors the backend's litellm.display.keySnippets default. */
export const DEFAULT_SNIPPET_TABS: SnippetTab[] = ['office365', 'opencode', 'claude-code', 'pi', 'openai', 'curl'];

const SNIPPET_TAB_LABELS: Record<SnippetTab, string> = {
  office365: 'Office365',
  opencode: 'opencode',
  'claude-code': 'Claude Code',
  pi: 'pi',
  openai: 'OpenAI SDK',
  curl: 'curl',
};

/** Keeps the configured tabs that exist, in the configured order; falls back to the default set. */
export function resolveSnippetTabs(configured?: string[] | null): SnippetTab[] {
  const known = (configured ?? []).filter((t): t is SnippetTab => DEFAULT_SNIPPET_TABS.includes(t as SnippetTab));
  return known.length > 0 ? known : DEFAULT_SNIPPET_TABS;
}

export interface Snippets {
  curl: string;
  openai: string;
  opencode: string;
  pi: string;
  claudeCode: string;
  publicEndpoint: string;
  /** Gateway root without `/v1`, for connectors that append the path themselves. */
  gatewayUrl: string;
  apiKey: string;
  /** Tabs to render, in order. */
  tabs: SnippetTab[];
}

export function buildSnippets(
  baseUrl: string | null,
  key: string,
  model: string,
  configuredTabs?: string[] | null,
): Snippets {
  if (!baseUrl) {
    throw new Error('baseUrl not configured');
  }
  const base = trimSlash(baseUrl);
  const apiBase = `${base}/v1`;
  return {
    publicEndpoint: apiBase,
    gatewayUrl: base,
    apiKey: key,
    tabs: resolveSnippetTabs(configuredTabs),
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

interface SnippetTabsProps {
  snippets: Snippets;
  model: string;
  copyState: { copy: (text: string) => Promise<boolean>; copied: boolean };
}

const SNIPPET_FILE_HINTS: Partial<Record<SnippetTab, string>> = {
  opencode: 'Add to ~/.config/opencode/opencode.json',
  pi: 'Add to ~/.pi/agent/models.json',
  'claude-code': 'Store the key in your OS keychain and point apiKeyHelper at it in ~/.claude/settings.json',
  office365: 'Enter these two values in the Office 365 connector',
};

/** A labelled value that copies itself on click. */
const CopyField: FC<{ label: string; value: string }> = ({ label, value }) => {
  const clipboard = useCopyToClipboard();
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
        {label}
      </Typography>
      <ButtonBase
        onClick={() => clipboard.copy(value)}
        aria-label={`Copy Office365 ${label}`}
        sx={{
          display: 'flex',
          width: '100%',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 1,
          p: 1.5,
          textAlign: 'left',
          backgroundColor: 'action.hover',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
        }}
      >
        <Typography component="code" sx={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>
          {value}
        </Typography>
        {clipboard.copied ? <Check fontSize="small" /> : <ContentCopy fontSize="small" />}
      </ButtonBase>
    </Box>
  );
};

export const SnippetTabs: FC<SnippetTabsProps> = ({ snippets, model, copyState }) => {
  const [tab, setTab] = useState<SnippetTab>(snippets.tabs[0]);
  const snippetKey = tab === 'claude-code' ? 'claudeCode' : tab;
  const code = snippets[snippetKey as keyof Omit<Snippets, "tabs">];
  const fileHint = SNIPPET_FILE_HINTS[tab];
  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v as SnippetTab)} sx={{ mb: 1 }} variant="scrollable">
        {snippets.tabs.map(t => (
          <Tab key={t} label={SNIPPET_TAB_LABELS[t]} value={t} />
        ))}
      </Tabs>
      {fileHint && (
        <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
          {fileHint}
        </Typography>
      )}
      {tab === 'office365' ? (
        <Box display="flex" flexDirection="column" gap={2}>
          <CopyField label="Endpoint URL" value={snippets.gatewayUrl} />
          <CopyField label="API key" value={snippets.apiKey} />
        </Box>
      ) : (
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
      )}
    </Box>
  );
};

