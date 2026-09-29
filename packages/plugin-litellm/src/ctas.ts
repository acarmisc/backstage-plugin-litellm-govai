/** Preset action-bar buttons. `label` overrides the default copy. */
export type BudgetCtaKind = 'new-key' | 'module' | 'all-limits';
export interface BudgetCtaSpec {
  kind: BudgetCtaKind;
  /** Override the default label. */
  label?: string;
}
/** Either a bare kind (`'module'`) or a spec object (`{ kind: 'module' }`). */
export type BudgetCta = BudgetCtaKind | BudgetCtaSpec;

export const DEFAULT_CTAS: BudgetCtaKind[] = ['module', 'all-limits'];

/**
 * Resolves which action-bar buttons to render.
 *
 * - `new-key` is shown when explicitly listed, or automatically (first) when
 *   the user has no keys yet — but never while loading or when the profile
 *   errored / the user isn't provisioned (a generate flow would fail).
 * - `all-limits` is dropped when there are no limits to expand.
 */
export function resolveCtas(spec: {
  ctas?: BudgetCta[];
  hasKeys: boolean;
  viewState: { kind: string };
  limitCount: number;
}): Array<BudgetCtaSpec & { kind: BudgetCtaKind }> {
  const list = (spec.ctas ?? DEFAULT_CTAS).map(cta =>
    typeof cta === 'string' ? { kind: cta } : cta,
  );
  const canGenerate = spec.viewState.kind === 'ready';
  const out = list.filter(cta => {
    if (cta.kind === 'new-key') return canGenerate;
    if (cta.kind === 'all-limits') return spec.limitCount > 0;
    return true;
  });
  if (
    spec.ctas === undefined &&
    !spec.hasKeys &&
    canGenerate &&
    !out.some(c => c.kind === 'new-key')
  ) {
    out.unshift({ kind: 'new-key' });
  }
  return out;
}
