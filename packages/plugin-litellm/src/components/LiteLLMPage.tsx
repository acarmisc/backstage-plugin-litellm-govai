import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Grid from '@mui/material/Grid';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useSearchParams } from 'react-router-dom';
import { useAsync, useAsyncRetry } from 'react-use';
import { useApi, alertApiRef } from '@backstage/core-plugin-api';
import { Content, Progress } from '@backstage/core-components';
import { usePermission } from '@backstage/plugin-permission-react';
import { DashboardHeader } from './DashboardHeader';
import { KeysTable } from './KeysTable';
import { KeyFormDialog } from './KeyFormDialog';
import { ManageTeamDialog } from './ManageTeamDialog';
import { UsageStats } from './UsageStats';
import { LiteLLMBudgetWidget } from './LiteLLMBudgetWidget';
import { TeamUsage } from './TeamUsage';
import { ModelsTable } from './ModelsTable';
import { AuditLog } from './AuditLog';
import { liteLlmApiRef } from '../api';
import { toLocalDay } from '../dates';
import {
  litellmTeamCreatePermission,
  litellmTeamManagePermission,
  litellmTeamMembersManagePermission,
  litellmTeamKnowledgebaseManagePermission,
  litellmTeamMcpManagePermission,
} from '../permissions';
import { DateRange, GenerateKeyRequest, GenerateKeyResponse, UpdateKeyRequest, UsageMetrics, CreateTeamRequest, UpdateTeamRequest, TeamInfo, VirtualKey } from '../types';
import { toastFor } from '../feedback';
import {
  getUnprovisionedTitle,
  getUnprovisionedMessage,
  getAdminDetailsTitle,
  getAdminDetailsMessage,
} from '../unprovisionedCopy';

const PERIOD_LS_KEY = 'litellm_usage_period';
type DatePreset = 'today' | '24h' | '7d' | '30d';

type PageTab = 'overview' | 'keys' | 'teams' | 'models' | 'audit';
const PAGE_TABS: readonly PageTab[] = ['overview', 'keys', 'teams', 'models', 'audit'];
const isPageTab = (v: string | null): v is PageTab =>
  !!v && (PAGE_TABS as readonly string[]).includes(v);

function initDateRange(): DateRange {
  let preset = '7d';
  try { preset = localStorage.getItem(PERIOD_LS_KEY) ?? '7d'; } catch { /* ignore */ }
  const end = new Date();
  const start = new Date();
  if (preset === 'today') start.setHours(0, 0, 0, 0);
  else if (preset === '24h') start.setHours(start.getHours() - 24);
  else if (preset === '30d') start.setDate(start.getDate() - 30);
  else start.setDate(start.getDate() - 7);
  return { start, end };
}

export const LiteLLMPage: FC = () => {
  const api = useApi(liteLlmApiRef);
  const alertApi = useApi(alertApiRef);

  const [dateRange, setDateRange] = useState<DateRange>(initDateRange);
  const [currentPreset, setCurrentPreset] = useState<DatePreset>(() => {
    try { return (localStorage.getItem(PERIOD_LS_KEY) as DatePreset) ?? '7d'; } catch { return '7d'; }
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<PageTab>(() => {
    const t = searchParams.get('tab');
    return isPageTab(t) ? t : 'overview';
  });
  const [filter, setFilter] = useState<'expired' | 'expiring' | undefined>(() => {
    const f = searchParams.get('filter');
    return f === 'expired' || f === 'expiring' ? f : undefined;
  });

  // `?generate=1` (e.g. from a homepage budget card's "Generate New Key"
  // CTA) opens the generate-key dialog on arrival. The param is cleared once honoured so a
  // manual close doesn't immediately reopen it on the next render.
  const [generateDialogOpen, setGenerateDialogOpen] = useState(
    () => searchParams.get('generate') === '1',
  );
  useEffect(() => {
    if (searchParams.get('generate') !== '1') return;
    setGenerateDialogOpen(true);
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.delete('generate');
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  // Keep `?tab=` in sync so links (e.g. the budget widget's "more keys"
  // note pointing at `/litellm?tab=keys`) land on the right tab and the URL
  // stays shareable.
  const selectTab = useCallback(
    (tab: PageTab) => {
      setActiveTab(tab);
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          next.set('tab', tab);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Navigate to keys tab with a filter applied
  const navigateToFilter = useCallback(
    (f: 'expired' | 'expiring') => {
      setActiveTab('keys');
      setFilter(f);
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          next.set('tab', 'keys');
          next.set('filter', f);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Clear filter when explicitly requested
  const clearFilter = useCallback(() => {
    setFilter(undefined);
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.delete('filter');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const [manageTeam, setManageTeam] = useState<{ mode: 'create' | 'edit'; team?: TeamInfo } | null>(null);
  /** Which key is open in the shared key form dialog; null = create mode. */
  const [keyToEdit, setKeyToEdit] = useState<VirtualKey | null>(null);
  const keyFormOpen = generateDialogOpen || !!keyToEdit;

  // Team usage cache: teamId -> UsageMetrics
  const [teamUsageCache, setTeamUsageCache] = useState<Record<string, UsageMetrics | null>>({});
  const [teamUsageLoading, setTeamUsageLoading] = useState<Record<string, boolean>>({});

  const { value: userInfo, loading: userLoading, error: userError } = useAsync(
    () => api.getUserInfo(),
    [api],
  );

  const { value: keys, loading: keysLoading, error: keysError, retry: refreshKeys } = useAsyncRetry(
    () => api.listKeys(),
    [api],
  );

  const { value: allModels, loading: modelsLoading, error: modelsError, retry: refreshModels } = useAsyncRetry(
    () => api.listModels(),
    [api],
  );

  const { value: allTeams, loading: teamsLoading, error: teamsError, retry: refreshTeams } = useAsyncRetry(
    () => api.getTeams(),
    [api],
  );

  const { value: liteLlmConfig } = useAsync(() => api.getConfig(), [api]);

  // Teams the caller administers by group ownership (not membership). Only
  // fetched when team management is enabled; failures degrade to an empty list.
  const { value: managedTeams } = useAsync(
    async () =>
      liteLlmConfig?.teamManagement?.enabled
        ? api.getManagedTeams().catch(() => [])
        : [],
    [api, liteLlmConfig],
  );

  const { allowed: canCreateTeam } = usePermission({ permission: litellmTeamCreatePermission });
  const { allowed: canManageTeam } = usePermission({ permission: litellmTeamManagePermission });
  const { allowed: canManageMembers } = usePermission({ permission: litellmTeamMembersManagePermission });
  const { allowed: canManageKnowledgeBases } = usePermission({ permission: litellmTeamKnowledgebaseManagePermission });
  const { allowed: canManageMcpServers } = usePermission({ permission: litellmTeamMcpManagePermission });
  const teamMgmtEnabled = liteLlmConfig?.teamManagement?.enabled ?? false;
  const objectPermsEnabled = liteLlmConfig?.teamManagement?.objectPermissionsEnabled ?? false;

  const { value: vectorStores } = useAsync(
    async () =>
      objectPermsEnabled ? api.getVectorStores().catch(() => []) : [],
    [api, objectPermsEnabled],
  );
  const { value: mcpServers } = useAsync(
    async () =>
      objectPermsEnabled ? api.getMcpServers().catch(() => []) : [],
    [api, objectPermsEnabled],
  );

  // Filter to teams the current user belongs to
  const teams = useMemo(() => {
    if (!allTeams?.length) return [];
    if (!userInfo) return allTeams;
    const userId = userInfo.user_id;
    const memberOf = userInfo.teams;
    if (memberOf?.length) {
      return allTeams.filter(t => memberOf.includes(t.team_id));
    }
    // No team list on the profile: fall back to membership on the team records.
    // Never fall back to *all* teams — that would list teams the user isn't in.
    return allTeams.filter(t =>
      t.members_with_roles?.some(m => m.user_id === userId),
    );
  }, [allTeams, userInfo]);

  const { value: usage, loading: usageLoading, error: usageError, retry: refreshUsage } = useAsyncRetry(async () => {
    const startDate = toLocalDay(dateRange.start);
    const endDate = toLocalDay(dateRange.end);
    return api.getUsage(startDate, endDate);
  }, [api, dateRange]);

  // Invalidate team usage cache when date range changes so stale data isn't shown
  const handleDateRangeChange = useCallback((range: DateRange, preset?: DatePreset) => {
    setDateRange(range);
    if (preset) {
      setCurrentPreset(preset);
    }
    setTeamUsageCache({});
    setTeamUsageLoading({});
  }, [setDateRange, setCurrentPreset]);

  // Fetch team usage on demand when a team card is expanded
  const loadTeamUsage = useCallback(async (teamId: string) => {
    if (teamUsageCache[teamId] !== undefined || teamUsageLoading[teamId]) return;
    setTeamUsageLoading(prev => ({ ...prev, [teamId]: true }));
    try {
      const startDate = toLocalDay(dateRange.start);
      const endDate = toLocalDay(dateRange.end);
      const data = await api.getTeamUsage(teamId, startDate, endDate);
      setTeamUsageCache(prev => ({ ...prev, [teamId]: data }));
    } catch {
      setTeamUsageCache(prev => ({ ...prev, [teamId]: null }));
    } finally {
      setTeamUsageLoading(prev => ({ ...prev, [teamId]: false }));
    }
  }, [api, dateRange, teamUsageCache, teamUsageLoading]);

  // Models offered for key generation: when the user has a model restriction, the
  // UNION of their own allowed models and their teams' models (a team-bound key is
  // limited to its team's models, which the server enforces and the key form then
  // narrows to the selected team); with no restriction, every model. The server
  // (POST /keys/generate) is the source of truth for what is actually accepted.
  const allowedModels = useMemo(() => {
    if (!allModels?.length) return [];
    const userModels = userInfo?.models;
    const teamModels = teams?.flatMap(t => t.models ?? []);
    const hasUserRestriction = userModels && userModels.length > 0;
    const hasTeamRestriction = teamModels && teamModels.length > 0;
    if (!hasUserRestriction && !hasTeamRestriction) return allModels;
    const allowed = new Set([
      ...(hasUserRestriction ? userModels! : allModels.map(m => m.model_name)),
      ...(hasTeamRestriction ? teamModels! : []),
    ]);
    return allModels.filter(m => allowed.has(m.model_name));
  }, [allModels, userInfo, teams]);

  const getConfig = useCallback(() => api.getConfig(), [api]);

  const handleGenerateKey = useCallback(
    async (request: GenerateKeyRequest): Promise<GenerateKeyResponse> => {
      try {
        const response = await api.generateKey(request);
        const alert = toastFor('generateSuccess');
        if (alert) alertApi.post(alert);
        refreshKeys();
        return response;
      } catch (e: any) {
        // The dialog renders this error inline; don't toast it as well.
        throw e;
      }
    },
    [api, refreshKeys, alertApi],
  );

  const handleUpdateKey = useCallback(
    async (keyId: string, request: UpdateKeyRequest) => {
      try {
        await api.updateKey(keyId, request);
        const alert = toastFor('updateSuccess');
        if (alert) alertApi.post(alert);
        refreshKeys();
      } catch (e: any) {
        // The dialog renders this error inline; don't toast it as well.
        throw e;
      }
    },
    [api, refreshKeys, alertApi],
  );

  const handleBlockKey = useCallback(
    async (keyId: string) => {
      try {
        await api.blockKey(keyId);
        const alert = toastFor('blockSuccess');
        if (alert) alertApi.post(alert);
        refreshKeys();
      } catch (e: any) {
        const alert = toastFor('blockError', e.message);
        if (alert) alertApi.post(alert);
      }
    },
    [api, refreshKeys, alertApi],
  );

  const handleUnblockKey = useCallback(
    async (keyId: string) => {
      try {
        await api.unblockKey(keyId);
        const alert = toastFor('unblockSuccess');
        if (alert) alertApi.post(alert);
        refreshKeys();
      } catch (e: any) {
        const alert = toastFor('unblockError', e.message);
        if (alert) alertApi.post(alert);
      }
    },
    [api, refreshKeys, alertApi],
  );

  const handleResetKeySpend = useCallback(
    async (keyId: string) => {
      try {
        await api.resetKeySpend(keyId);
        const alert = toastFor('resetSpendSuccess');
        if (alert) alertApi.post(alert);
        refreshKeys();
      } catch (e: any) {
        // The key dialog renders this error inline; don't toast it as well.
        throw e;
      }
    },
    [api, refreshKeys, alertApi],
  );

  const handleDeleteKey = useCallback(
    async (keyId: string) => {
      try {
        await api.deleteKey(keyId);
        const alert = toastFor('deleteSuccess');
        if (alert) alertApi.post(alert);
        refreshKeys();
      } catch (e: any) {
        if (e.body?.success && (e.body?.message?.includes('already deleted') || e.body?.message?.includes('never existed'))) {
          const alert = toastFor('deleteAlreadyDeleted');
          if (alert) alertApi.post(alert);
          refreshKeys();
          return;
        }
        const alert = toastFor('deleteError', e.message);
        if (alert) alertApi.post(alert);
      }
    },
    [api, refreshKeys, alertApi],
  );

  const handlePruneExpiredKeys = useCallback(
    async () => {
      try {
        const result = await api.pruneExpiredKeys();
        const kind = result.failed > 0 ? 'prunePartial' : 'pruneSuccess';
        const alert = toastFor(kind);
        if (alert) alertApi.post(alert);
        refreshKeys();
      } catch (e: any) {
        const alert = toastFor('pruneError', e.message);
        if (alert) alertApi.post(alert);
      }
      return { pruned: 0, failed: 0 };
    },
    [api, refreshKeys, alertApi],
  ) as () => Promise<{ pruned: number; failed: number }>;

  const isInitialLoading = userLoading && !userInfo;

  if (isInitialLoading) {
    return <Progress />;
  }

  // User exists in Backstage but has no LiteLLM account
  if (userError || !userInfo) {
    const hint = (userError as any)?.body?.hint;
    return (
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box
          sx={{
            maxWidth: 600,
            mx: 'auto',
            py: 6,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            {getUnprovisionedTitle()}
          </Typography>
          <Typography color="text.secondary">
            {hint || getUnprovisionedMessage(liteLlmConfig?.supportContact)}
          </Typography>
          <Accordion sx={{ width: '100%', maxWidth: 500, mt: 2 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {getAdminDetailsTitle()}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="caption" color="text.secondary">
                {getAdminDetailsMessage()}
              </Typography>
            </AccordionDetails>
          </Accordion>
        </Box>
      </Box>
    );
  }

  const pageTabs = (
    <Tabs
      value={activeTab}
      onChange={(_, v) => selectTab(v as PageTab)}
      variant="scrollable"
      scrollButtons="auto"
      // Substring class matching so these survive a host MUI classname prefix
      // (Backstage renders `v5-MuiTabs-indicator`, not `MuiTabs-indicator`).
      sx={{
        minHeight: 44,
        '& [class*="MuiTabs-indicator"]': { height: 2, borderRadius: '2px 2px 0 0' },
        '& [class*="MuiTab-root"]': { minHeight: 44, textTransform: 'none', fontSize: 14 },
      }}
    >
      <Tab label="Overview" value="overview" />
      <Tab label="Keys" value="keys" />
      <Tab label="Teams" value="teams" />
      <Tab label="Models" value="models" />
      {userInfo.can_view_audit && <Tab label="Audit Log" value="audit" />}
    </Tabs>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ px: 3, pt: 3 }}>
        <DashboardHeader
          userInfo={userInfo}
          teams={teams ?? []}
          keys={keys ?? []}
          loading={userLoading || teamsLoading}
          keysError={keysError}
          onGenerateKeyClick={() => setGenerateDialogOpen(true)}
          onNavigateToFilter={navigateToFilter}
          tabs={pageTabs}
        />
      </Box>

      <Content>
        {activeTab === 'overview' && (() => {
        // Show onboarding when keys have loaded without error and list is empty
        if (!keysLoading && !keysError && keys?.length === 0) {
          return (
            <Box sx={{ maxWidth: 600, mx: 'auto', py: 4 }}>
              <Box
                sx={{
                  textAlign: 'center',
                  py: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <Typography variant="h5" sx={{ fontWeight: 600 }}>
                  Create your first API key
                </Typography>
                <Box
                  component="ol"
                  sx={{
                    textAlign: 'left',
                    pl: 3,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    '& li': { color: 'text.secondary' },
                  }}
                >
                  <li>Generate a key</li>
                  <li>Copy the endpoint</li>
                  <li>Make a call</li>
                </Box>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={() => setGenerateDialogOpen(true)}
                >
                  Generate API Key
                </Button>
              </Box>
            </Box>
          );
        }

        return (
          <Grid container spacing={2} alignItems="flex-start">
            <Grid item xs={12} lg={8}>
              <UsageStats
                usage={usage ?? null}
                usageError={usageError}
                onRetryUsage={refreshUsage}
                models={allModels ?? []}
                dateRange={dateRange}
                currentPreset={currentPreset}
                onDateRangeChange={handleDateRangeChange}
                loading={usageLoading}
                userInfo={userInfo}
              />
            </Grid>
            <Grid item xs={12} lg={4}>
              <LiteLLMBudgetWidget compact collapsible userInfo={userInfo ?? null} teams={teams} keys={keys ?? []} />
            </Grid>
          </Grid>
        );
      })()}

      {activeTab === 'keys' && (() => {
        if (keysError) {
          return (
            <Alert severity="error">
              Failed to load keys: {(keysError as any).message || 'Unknown error'}
              <Box sx={{ mt: 1 }}>
                <Button size="small" onClick={refreshKeys}>Retry</Button>
              </Box>
            </Alert>
          );
        }
        return (
          <KeysTable
            keys={keys ?? []}
            loading={keysLoading || modelsLoading}
            onGenerateKeyClick={() => setGenerateDialogOpen(true)}
            onEditKey={setKeyToEdit}
            onBlockKey={handleBlockKey}
            onUnblockKey={handleUnblockKey}
            onDeleteKey={handleDeleteKey}
            onPruneExpiredKeys={handlePruneExpiredKeys}
            filter={filter}
            onClearFilter={clearFilter}
          />
        );
      })()}

      {activeTab === 'teams' && (() => {
        if (teamsError) {
          return (
            <Alert severity="error">
              Failed to load teams: {(teamsError as any).message || 'Unknown error'}
              <Box sx={{ mt: 1 }}>
                <Button size="small" onClick={refreshTeams}>Retry</Button>
              </Box>
            </Alert>
          );
        }
        // Union of teams the user is a member of and teams their group owns,
        // de-duplicated by team_id (membership entries win on conflict).
        const teamsById = new Map<string, TeamInfo>();
        for (const t of managedTeams ?? []) teamsById.set(t.team_id, t);
        for (const t of teams ?? []) teamsById.set(t.team_id, t);
        const visibleTeams = Array.from(teamsById.values());
        return (
          <TeamUsage
            teams={visibleTeams}
            loading={teamsLoading}
            getTeamUsage={teamId => teamUsageCache[teamId] ?? null}
            getTeamUsageLoading={teamId => teamUsageLoading[teamId] ?? false}
            canManage={teamMgmtEnabled && canManageTeam}
            onEditTeam={t => setManageTeam({ mode: 'edit', team: t })}
            canCreate={teamMgmtEnabled && canCreateTeam}
            onCreateTeam={() => setManageTeam({ mode: 'create' })}
            onTeamExpand={team => loadTeamUsage(team.team_id)}
          />
        );
      })()}

      {activeTab === 'models' && (() => {
        if (modelsError) {
          return (
            <Alert severity="error">
              Failed to load models: {(modelsError as any).message || 'Unknown error'}
              <Box sx={{ mt: 1 }}>
                <Button size="small" onClick={refreshModels}>Retry</Button>
              </Box>
            </Alert>
          );
        }
        return (
          <ModelsTable
            allModels={allModels ?? []}
            teams={teams ?? []}
            loading={modelsLoading}
          />
        );
      })()}

      {activeTab === 'audit' && userInfo.can_view_audit && <AuditLog api={api} />}
      </Content>

      <KeyFormDialog
        open={keyFormOpen}
        onClose={() => {
          setGenerateDialogOpen(false);
          setKeyToEdit(null);
        }}
        mode={keyToEdit ? 'edit' : 'create'}
        keyToEdit={keyToEdit}
        keys={keys ?? []}
        models={allowedModels}
        modelsError={modelsError}
        onRetryModels={refreshModels}
        teams={teams ?? []}
        username={userInfo.user_id}
        keyGenerationSettings={liteLlmConfig?.keyGeneration}
        onCreateKey={handleGenerateKey}
        onUpdateKey={handleUpdateKey}
        onResetKeySpend={handleResetKeySpend}
        onGetConfig={getConfig}
      />

      <ManageTeamDialog
        open={!!manageTeam}
        onClose={() => setManageTeam(null)}
        mode={manageTeam?.mode ?? 'create'}
        team={manageTeam?.team}
        allModels={allModels ?? []}
        config={liteLlmConfig}
        onSubmit={async payload => {
          try {
            if (manageTeam?.mode === 'edit' && manageTeam.team) {
              const loadedAt = manageTeam.team.metadata?.updated_at_iso;
              await api.updateTeam(manageTeam.team.team_id, {
                ...(payload as UpdateTeamRequest),
                // Reject the edit if someone else changed the team since it was loaded.
                ...(typeof loadedAt === 'string' ? { expectedUpdatedAtIso: loadedAt } : {}),
              });
            } else {
              await api.createTeam(payload as CreateTeamRequest);
            }
            const alert = toastFor('teamSaveSuccess');
            if (alert) alertApi.post(alert);
            refreshTeams();
          } catch (e: any) {
            const alert = toastFor('teamSaveError', e.message);
            if (alert) alertApi.post(alert);
          }
        }}
        canManageMembers={teamMgmtEnabled && canManageMembers}
        onAddMember={async (userEntityRef, maxBudgetInTeam) => {
          if (!manageTeam?.team) return;
          const updated = await api.addTeamMember(manageTeam.team.team_id, {
            userEntityRef,
            ...(maxBudgetInTeam ? { maxBudgetInTeam } : {}),
          });
          setManageTeam(s => (s && s.team ? { ...s, team: updated } : s));
          refreshTeams();
        }}
        onRemoveMember={async userEntityRef => {
          if (!manageTeam?.team) return;
          const updated = await api.removeTeamMember(
            manageTeam.team.team_id,
            userEntityRef,
          );
          setManageTeam(s => (s && s.team ? { ...s, team: updated } : s));
          refreshTeams();
        }}
        canManageKnowledgeBases={
          teamMgmtEnabled && objectPermsEnabled && canManageKnowledgeBases
        }
        vectorStores={vectorStores ?? []}
        onSaveKnowledgeBases={async vectorStoreIds => {
          if (!manageTeam?.team) return;
          try {
            const updated = await api.setTeamKnowledgeBases(
              manageTeam.team.team_id,
              vectorStoreIds,
            );
            setManageTeam(s => (s && s.team ? { ...s, team: updated } : s));
            const alert = toastFor('knowledgeBaseSuccess');
            if (alert) alertApi.post(alert);
            refreshTeams();
          } catch (e: any) {
            const alert = toastFor('teamSaveError', e.message);
            if (alert) alertApi.post(alert);
          }
        }}
        canManageMcpServers={
          teamMgmtEnabled && objectPermsEnabled && canManageMcpServers
        }
        mcpServers={mcpServers ?? []}
        onSaveMcpServers={async mcpServerIds => {
          if (!manageTeam?.team) return;
          try {
            const updated = await api.setTeamMcpServers(
              manageTeam.team.team_id,
              mcpServerIds,
            );
            setManageTeam(s => (s && s.team ? { ...s, team: updated } : s));
            const alert = toastFor('mcpServerSuccess');
            if (alert) alertApi.post(alert);
            refreshTeams();
          } catch (e: any) {
            const alert = toastFor('teamSaveError', e.message);
            if (alert) alertApi.post(alert);
          }
        }}
      />

    </Box>
  );
};
