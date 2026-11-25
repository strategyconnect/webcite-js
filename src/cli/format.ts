/** Human-readable output. `--json` prints the full response instead. */

import type { Balance, ExtractResponse, VerifyResponse } from '../types.js';

const line = (label: string, value: unknown): string[] =>
  value === undefined || value === null || value === '' ? [] : [`${label}: ${String(value)}`];

export function formatVerify(result: VerifyResponse): string {
  const groups = (result.claim_groups ?? []).flatMap((group) => [
    ...line('Claim', group.claim),
    ...line('Verdict', group.verdict?.result),
    ...line('Summary', group.verdict?.summary),
    ...(group.citations ?? []).map((c) =>
      `  [${c.stance ?? c.status ?? 'source'}] ${c.title ?? ''} ${c.url ?? ''}`.trimEnd(),
    ),
    '',
  ]);
  return [...groups, ...line('Credits used', result.usage?.credits)].join('\n');
}

export function formatSearch(result: VerifyResponse): string {
  const citations = result.citations ?? result.claim_groups?.flatMap((g) => g.citations ?? []) ?? [];
  return citations.map((c, i) => `${i + 1}. ${c.title ?? ''}\n   ${c.url ?? ''}`).join('\n');
}

export function formatExtractSummary(doc: ExtractResponse): string {
  return [
    ...line('State', doc.state),
    ...line('Units', doc.units?.length),
    ...line('Credits used', doc.usage?.credits),
    ...line('Code', doc.code),
    ...line('Reason', doc.reason),
  ].join('\n');
}

export function formatBalance(balance: Balance): string {
  const c = balance.credits ?? {};
  return [...line('Remaining', c.remaining), ...line('Used', c.used), ...line('Total', c.total)].join('\n');
}
