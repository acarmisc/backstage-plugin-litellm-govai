import { GROUP_MANAGERS_ANNOTATION } from './provisioning';

/**
 * Keycloak catalog-provider `groupTransformer` that copies a group attribute
 * (default `managers`, values = usernames or emails, one per value or comma-separated)
 * into the `govai.litellm/managers` annotation read by Users Monitoring.
 * Structural types, so no dependency on the keycloak module.
 *
 *   keycloakTransformerExtensionPoint.setGroupTransformer(managersGroupTransformer());
 */
export function managersGroupTransformer(attribute = 'managers') {
  return async <E extends { metadata: { annotations?: Record<string, string> } }>(
    entity: E,
    group: { attributes?: Record<string, string[] | string> },
    _realm?: string,
  ): Promise<E> => {
    const raw = group.attributes?.[attribute];
    const managers = (Array.isArray(raw) ? raw : raw ? [raw] : [])
      .flatMap(v => v.split(','))
      .map(v => v.trim().split('@')[0]) // Keycloak usernames are emails; catalog names are the local part
      .filter(Boolean);
    if (!managers.length) return entity;
    return {
      ...entity,
      metadata: {
        ...entity.metadata,
        annotations: { ...entity.metadata.annotations, [GROUP_MANAGERS_ANNOTATION]: managers.join(',') },
      },
    };
  };
}
