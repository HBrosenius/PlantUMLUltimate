export function explicitTaskStartStatement(
  submittedStart: string,
  effectiveStart: string,
  hadExplicitStart: boolean,
): string | undefined {
  if (!submittedStart) return undefined;
  if (!hadExplicitStart && submittedStart === effectiveStart) return undefined;
  return `starts ${submittedStart}`;
}
