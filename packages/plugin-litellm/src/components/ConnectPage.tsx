import { FC, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useSearchParams } from 'react-router-dom';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import { Content, Progress } from '@backstage/core-components';
import { liteLlmApiRef } from '../api';
import { initialTeams, isLoopbackCallback, postToLoopback } from '../connect';

/**
 * Confirmation page for local clients (abby-desktop installer, OpenCode plugins): mints one
 * key per selected team through fetchApi, so the Backstage session authenticates the call,
 * then hands the keys back to the client's loopback listener.
 */
export const ConnectPage: FC = () => {
  const api = useApi(liteLlmApiRef);
  const [params] = useSearchParams();
  const redirectUri = params.get('redirect_uri');
  const state = params.get('state') ?? '';
  const client = params.get('client') || 'a local application';
  // Teams the client already holds keys for: left unticked, so only missing teams get a new key.
  const have = new Set((params.get('have') ?? '').split(',').filter(Boolean));
  const teams = useAsync(() => api.getTeams(), [api]);
  const [selected, setSelected] = useState<Set<string> | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!isLoopbackCallback(redirectUri)) {
    return (
      <Content>
        <Alert severity="error">
          Invalid connection link: redirect_uri must be http://localhost:&lt;port&gt;/callback.
        </Alert>
      </Content>
    );
  }
  if (teams.loading) return <Progress />;

  const all = teams.value ?? [];
  const chosen = selected ?? initialTeams(all.map(t => t.team_id), have);
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (!next.delete(id)) next.add(id);
    setSelected(next);
  };

  const connect = async () => {
    setBusy(true);
    setError(undefined);
    try {
      // No team membership: one personal key, as the backend allows.
      const ids = all.length ? all.filter(t => chosen.has(t.team_id)).map(t => t.team_id) : [undefined];
      const keys: [string, string][] = [];
      for (const id of ids) keys.push(['key', (await api.connectLocalClient(redirectUri, id)).key]);
      postToLoopback(redirectUri, [['state', state], ...keys]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Content>
      <Box maxWidth={520} mx="auto" mt={4}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h5" gutterBottom>
            Connect {client}
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            {client} will receive an API key for each selected team. Selecting a team that is
            already connected replaces its key, also on your other devices.
          </Typography>
          {teams.error && <Alert severity="error">Could not load your teams: {teams.error.message}</Alert>}
          {all.length > 0 && (
            <FormGroup sx={{ mb: 2 }}>
              {all.map(t => (
                <FormControlLabel
                  key={t.team_id}
                  control={<Checkbox checked={chosen.has(t.team_id)} onChange={() => toggle(t.team_id)} />}
                  label={`${t.team_alias ?? t.team_id}${have.has(t.team_id) ? ' (already connected)' : ''}`}
                />
              ))}
            </FormGroup>
          )}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Button
            variant="contained"
            onClick={connect}
            disabled={busy || !!teams.error || (all.length > 0 && chosen.size === 0)}
          >
            {busy ? 'Connecting…' : 'Connect'}
          </Button>
        </Paper>
      </Box>
    </Content>
  );
};
