import React from 'react';
import { GenerateKeyRequest, GenerateKeyResponse, LiteLlmConfig, ModelInfo, TeamInfo, VirtualKey } from '../types';
import { KeyFormDialog } from './KeyFormDialog';

/**
 * @deprecated Use {@link KeyFormDialog} with `mode="create"` instead — this
 * wrapper only forwards props for backwards compatibility with the public
 * entrypoint and will be removed in a future release.
 */
export const GenerateKeyDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  keys: VirtualKey[];
  models: ModelInfo[];
  teams: TeamInfo[];
  username?: string;
  keyGenerationSettings?: { allowUnlimitedBudget: boolean; teamRequired: boolean };
  onGenerateKey: (request: GenerateKeyRequest) => Promise<GenerateKeyResponse>;
  onGetConfig: () => Promise<LiteLlmConfig>;
}> = props => (
  <KeyFormDialog
    open={props.open}
    onClose={props.onClose}
    mode="create"
    keys={props.keys}
    models={props.models}
    teams={props.teams}
    username={props.username}
    keyGenerationSettings={props.keyGenerationSettings}
    onCreateKey={props.onGenerateKey}
    onUpdateKey={async () => {}}
    onGetConfig={props.onGetConfig}
  />
);