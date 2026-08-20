export interface Command {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  enabled?: boolean;
  run(): void | Promise<void>;
}

export function filterCommands(commands: Command[], query: string): Command[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return commands;
  return commands.filter((command) => {
    const haystack = `${command.label} ${command.category} ${command.id}`.toLocaleLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
