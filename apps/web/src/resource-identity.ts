/** Resource names are labels, not verified contacts. Match consistently with workloads. */
export function resourceIdentity(name: string): string {
  return name.trim().toLowerCase();
}
