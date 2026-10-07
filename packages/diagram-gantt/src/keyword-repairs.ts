function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++)
      next.push(Math.min(next[j]! + 1, row[j + 1]! + 1, row[j]! + (a[i] === b[j] ? 0 : 1)));
    row = next;
  }
  return row[b.length]!;
}

/** Repair a single keyword only when the surrounding syntax identifies its role. */
export function ganttKeywordRepair(text: string): { replacement: string; label: string } | undefined {
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const taskPrefix = text.match(/^\s*(?:then\s+)?\[[^\]]+]\s+/i)?.[0];
  const taskBody = taskPrefix ? text.slice(taskPrefix.length) : "";
  // Match one separator character per side; adjacent whitespace stays in its
  // clause. This avoids backtracking across long runs of whitespace.
  if (taskPrefix && /\sand\s/i.test(taskBody)) {
    const parts = taskBody.split(/(\sand\s)/i);
    let offset = taskPrefix.length;
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index]!;
      if (index % 2 === 0) {
        const repair = ganttKeywordRepair(taskPrefix + part);
        if (repair)
          return {
            label: repair.label,
            replacement:
              text.slice(0, offset) + repair.replacement.slice(taskPrefix.length) + text.slice(offset + part.length),
          };
      }
      offset += part.length;
    }
    return undefined;
  }
  const rules: Array<[RegExp, readonly string[]]> = [
    [/^(\s*Project\s+)(\w+)(\s+\d{4}-\d{2}-\d{2}\s*)$/i, ["starts"]],
    [/^(\s*)(\w+)(\s+(?:is|are)\s+(?:closed|opened)\s*)$/i, weekdays],
    [new RegExp(`^(\\s*(?:${weekdays.join("|")})\\s+)(\\w+)(\\s+(?:closed|opened)\\s*)$`, "i"), ["is", "are"]],
    [new RegExp(`^(\\s*(?:${weekdays.join("|")})\\s+(?:is|are)\\s+)(\\w+)(\\s*)$`, "i"), ["closed", "opened"]],
    [
      /^(\s*(?:printscale|ganttscale|projectscale)\s+)(\w+)(\s*(?:zoom\s+\d+\s*)?)$/i,
      ["daily", "weekly", "monthly", "quarterly", "yearly"],
    ],
    [/^(\s*(?:then\s+)?\[[^\]]+]\s+(?:starts|ends)\s+)(\w+)(\s+\[[^\]]+]'s\s+(?:start|end)\s*)$/i, ["at"]],
    [/^(\s*(?:then\s+)?\[[^\]]+]\s+)(\w+)(\s+(?:\d{1,2}|100)%\s+completed\s*)$/i, ["is"]],
    [/^(\s*(?:then\s+)?\[[^\]]+]\s+is\s+(?:\d{1,2}|100)%\s+)(\w+)(\s*)$/i, ["completed"]],
    [/^(\s*(?:then\s+)?\[[^\]]+]\s+(?:starts|ends)\s+at\s+\[[^\]]+][’']s\s+)(\w+)(\s*)$/i, ["start", "end"]],
    [
      /^(\s*(?:then\s+)?\[[^\]]+]\s+(?:lasts|requires)\s+\d+\s+)(\w+)(\s*)$/i,
      ["day", "days", "week", "weeks", "month", "months"],
    ],
  ];
  for (const [pattern, keywords] of rules) {
    const match = text.match(pattern);
    if (!match) continue;
    const word = match[2]!.toLowerCase();
    if (keywords.includes(word)) continue;
    const ranked = keywords
      .map((keyword) => ({ keyword, distance: distance(word, keyword) }))
      .sort((a, b) => a.distance - b.distance);
    const best = ranked[0]!;
    // A one-letter remnant of "at" is unambiguous inside a dependency clause.
    const partialAt = best.keyword === "at" && (word === "a" || word === "t");
    if (best.distance > 2 || (!partialAt && best.distance >= word.length) || ranked[1]?.distance === best.distance)
      continue;
    return { replacement: `${match[1]}${best.keyword}${match[3]}`, label: `Use ${best.keyword}` };
  }
  return undefined;
}
