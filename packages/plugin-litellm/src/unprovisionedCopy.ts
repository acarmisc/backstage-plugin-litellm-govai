/**
 * Copy for unprovisioned users.
 */

export function getUnprovisionedTitle(): string {
  return 'Your LiteLLM account isn\'t set up yet';
}

export function getUnprovisionedMessage(supportContact?: string): string {
  const contact = supportContact?.trim();
  if (contact) {
    return `Contact ${contact}`;
  }
  return 'Contact your administrator';
}

export function getAdminDetailsTitle(): string {
  return 'Details for administrators';
}

export function getAdminDetailsMessage(): string {
  return 'Set litellm.provisioning.enabled: true in app-config.yaml to enable auto-provisioning, or ask your administrator to create the account manually.';
}
