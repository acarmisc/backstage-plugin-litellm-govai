import { InfoCard } from '@backstage/core-components';

interface UserContext {
  userId: string;
  email: string;
  entityRef: string;
}

interface Props {
  context: UserContext;
}

export function UserContextCard({ context }: Props) {
  return (
    <InfoCard
      title="User Identity"
    >
      <div style={{ display: 'grid', gap: 8 }}>
        <div>
          <strong>User ID:</strong> {context.userId}
        </div>
        <div>
          <strong>Email:</strong> {context.email}
        </div>
        <div>
          <strong>Entity Ref:</strong> <code>{context.entityRef}</code>
        </div>
      </div>
    </InfoCard>
  );
}