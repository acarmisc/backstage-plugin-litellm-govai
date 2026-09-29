/**
 * Feedback message generation for toast notifications.
 * Maps action outcomes to appropriate toast messages and severity levels.
 */

export type AlertSeverity = 'success' | 'warning' | 'error' | 'info';

export interface AlertMessage {
  message: string;
  severity: AlertSeverity;
}

type ActionKind =
  | 'generateSuccess'
  | 'generateError'
  | 'updateSuccess'
  | 'updateError'
  | 'blockSuccess'
  | 'blockError'
  | 'unblockSuccess'
  | 'unblockError'
  | 'resetSpendSuccess'
  | 'resetSpendError'
  | 'deleteSuccess'
  | 'deleteError'
  | 'deleteAlreadyDeleted'
  | 'pruneSuccess'
  | 'prunePartial'
  | 'pruneError'
  | 'teamSaveSuccess'
  | 'teamSaveError'
  | 'knowledgeBaseSuccess'
  | 'mcpServerSuccess';

/**
 * Generate a toast alert message for an action outcome.
 * For inline dialog errors (e.g., key form validation), return null
 * to let the dialog handle it internally.
 */
export function toastFor(kind: ActionKind, errorMsg?: string): AlertMessage | null {
  switch (kind) {
    case 'generateSuccess':
      return { message: 'Key generated successfully', severity: 'success' };
    case 'generateError':
      return { message: `Failed to generate key: ${errorMsg}`, severity: 'error' };

    case 'updateSuccess':
      return { message: 'Key updated successfully', severity: 'success' };
    case 'updateError':
      return { message: `Failed to update key: ${errorMsg}`, severity: 'error' };

    case 'blockSuccess':
      return { message: 'Key blocked — requests will be rejected until unblocked', severity: 'warning' };
    case 'blockError':
      return { message: `Failed to block key: ${errorMsg}`, severity: 'error' };

    case 'unblockSuccess':
      return { message: 'Key unblocked', severity: 'success' };
    case 'unblockError':
      return { message: `Failed to unblock key: ${errorMsg}`, severity: 'error' };

    case 'resetSpendSuccess':
      return { message: 'Spend counter reset to $0', severity: 'success' };
    case 'resetSpendError':
      return { message: `Failed to reset spend: ${errorMsg}`, severity: 'error' };

    case 'deleteSuccess':
      return { message: 'Key revoked successfully', severity: 'success' };
    case 'deleteError':
      return { message: `Failed to revoke key: ${errorMsg}`, severity: 'error' };
    case 'deleteAlreadyDeleted':
      return { message: 'Key was already deleted', severity: 'warning' };

    case 'pruneSuccess':
      return { message: 'Pruned expired keys', severity: 'success' };
    case 'prunePartial':
      return { message: 'Pruned expired keys (some failed to delete)', severity: 'warning' };
    case 'pruneError':
      return { message: `Failed to prune expired keys: ${errorMsg}`, severity: 'error' };

    case 'teamSaveSuccess':
      return { message: 'Team saved', severity: 'success' };
    case 'teamSaveError':
      return { message: `Failed to save team: ${errorMsg}`, severity: 'error' };

    case 'knowledgeBaseSuccess':
      return { message: 'Knowledge bases updated', severity: 'success' };

    case 'mcpServerSuccess':
      return { message: 'MCP servers updated', severity: 'success' };

    default:
      return null;
  }
}
