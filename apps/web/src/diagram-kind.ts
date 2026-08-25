import type { DiagramKind } from "./model";

const SEQUENCE_DECLARATION = /^\s*(?:participant|actor|boundary|control|entity|database|collections|queue)\b/im;
const SEQUENCE_STATEMENT =
  /^\s*(?:activate|deactivate|destroy|autoactivate|return|create\s+(?:participant|actor|boundary|control|entity|database|collections|queue)|alt|else|opt|loop|par|break|critical|group|partition|ref\s+over|note\s+(?:left|right|over|across)|hnote\b|rnote\b|==|\.\.\.|\|\|\d*\|\|)\b/im;
const SEQUENCE_MESSAGE =
  /^\s*(?:"[^"]+"|[\w.$:]+|\[|\?)[ \t]*(?:[ox<]?<?[-.\\/]+(?:\([^)]*\))?[ox>]+|[ox<]+[-.\\/]+(?:\([^)]*\))?>?)[ \t]*(?:"[^"]+"|[\w.$:]+|\]|\?)?(?:\s*(?:--|\+\+|\*\*|!!))*\s*(?::|$)/im;
const USECASE_DECLARATION = /^\s*(?:usecase\/?\b|\([^\n)]+\)\/?(?:\s+as\s+\S+)?\s*$)/im;
const USECASE_RELATION =
  /(?:<<\s*(?:include|extend)\s*>>|\([^\n)]+\)\s*(?:<?[-.]+|[-.]+>?)|(?:<?[-.]+|[-.]+>?)\s*\([^\n)]+\))/im;

export function detectDiagramKind(source: string): DiagramKind | undefined {
  if (/^\s*@startgantt\b/im.test(source)) return "gantt";
  if (!/^\s*@startuml\b/im.test(source)) return undefined;
  if (USECASE_DECLARATION.test(source) || USECASE_RELATION.test(source)) return "usecase";
  if (SEQUENCE_DECLARATION.test(source) || SEQUENCE_STATEMENT.test(source) || SEQUENCE_MESSAGE.test(source)) {
    return "sequence";
  }
  return undefined;
}

export function normalizeDiagramKind(value: unknown, source: string): DiagramKind {
  if (value === "gantt" || value === "sequence" || value === "usecase") return value;
  return detectDiagramKind(source) ?? "gantt";
}
