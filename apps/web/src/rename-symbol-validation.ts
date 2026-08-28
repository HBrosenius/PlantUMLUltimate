export interface RenameValidationOptions {
  label: string;
  currentIdentity?: string;
  identities?: readonly string[];
  identifier?: RegExp;
  identifierMessage?: string;
  forbidden?: RegExp;
  forbiddenMessage?: string;
  normalize?(value: string): string;
}

export function validateRenameValue(value: string, options: RenameValidationOptions): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return `${options.label} is required`;
  if (options.forbidden?.test(trimmed))
    return options.forbiddenMessage ?? `${options.label} contains invalid characters`;
  if (options.identifier && !options.identifier.test(trimmed))
    return options.identifierMessage ?? `${options.label} is not a valid identifier`;
  const normalize = options.normalize ?? ((item: string) => item.trim().toLocaleLowerCase());
  const candidate = normalize(trimmed);
  const current = options.currentIdentity === undefined ? undefined : normalize(options.currentIdentity);
  if (candidate !== current && options.identities?.some((item) => normalize(item) === candidate))
    return `${options.label} “${trimmed}” is already used`;
  return undefined;
}
