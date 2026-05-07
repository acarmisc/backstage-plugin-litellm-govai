import React, { useEffect, useState } from 'react';
import {
  Page,
  Content,
  Header,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { litellmApiRef, type LiteLLMUserInfo, type LiteLLMDailyActivity } from '../api';
import { UserContextCard } from './UserContextCard';
import { KeysTable } from './KeysTable';
import { UsageStats } from './UsageStats';

export function LiteLLMPage() {
  const api = useApi(litellmApiRef);

  const [userInfo, setUserInfo] = useState<LiteLLMUserInfo | null>(null);
  const [usage, setUsage] = useState<LiteLLMDailyActivity[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [userInfoData, usageData] = await Promise.all([
          api.getUserInfo(),
          api.getUsage(7),
        ]);
        setUserInfo(userInfoData);
        setUsage(usageData.usage);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e : new Error('Unknown error'));
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [api]);

  if (loading) {
    return (
      <Page>
        <Header title="My AI Management" subtitle="LiteLLM Governance" />
        <Content>
          <Progress />
        </Content>
      </Page>
    );
  }

  if (error) {
    return (
      <Page>
        <Header title="My AI Management" subtitle="LiteLLM Governance" />
        <Content>
          <ResponseErrorPanel error={error} />
        </Content>
      </Page>
    );
  }

  return (
    <Page>
      <Header title="My AI Management" subtitle="LiteLLM Governance" />
      <Content>
        {userInfo?.context && <UserContextCard context={userInfo.context} />}
        <div style={{ marginTop: 16 }}>
          <KeysTable keys={userInfo?.keys || []} totalSpend={userInfo?.spend || 0} />
        </div>
        {usage && usage.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <UsageStats usage={usage} />
          </div>
        )}
      </Content>
    </Page>
  );
}