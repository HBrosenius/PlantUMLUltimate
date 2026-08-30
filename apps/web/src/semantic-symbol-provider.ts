import {
  applySourceEdits,
  ganttSymbolOccurrences,
  normalizeTaskId,
  renameResource,
  renameTask,
  renameTaskAlias,
  type GanttDocument,
  type GanttSymbolOccurrence,
} from "@plantuml-studio/diagram-gantt";
import {
  sequenceParticipantOccurrences,
  renameSequenceAnchor,
  updateSequenceStructure,
  updateSequenceParticipant,
  type SequenceDocument,
  type SequenceParticipantOccurrence,
} from "@plantuml-studio/diagram-sequence";
import {
  collectUseCaseSymbolOccurrences,
  updateUseCaseElement,
  updateUseCasePackage,
  type UseCaseDocument,
  type UseCaseSymbolOccurrence,
} from "@plantuml-studio/diagram-usecase";
import {
  collectClassSymbolOccurrences,
  updateClassPackage,
  type ClassDocument,
  type ClassSymbolOccurrence,
} from "@plantuml-studio/diagram-class";
import {
  collectActivitySymbolOccurrences,
  parseActivity,
  updateActivityAction,
  updateActivityPartition,
  type ActivityDocument,
  type ActivitySymbolOccurrence,
} from "@plantuml-studio/diagram-activity";
import {
  collectWbsSymbolOccurrences,
  renameWbsNodeAlias,
  updateWbsNode,
  type WbsDocument,
  type WbsSymbolOccurrence,
} from "@plantuml-studio/diagram-wbs";
import type { DiagramKind } from "./model";
import { validateRenameValue } from "./rename-symbol-validation";

export type SemanticSymbolOccurrence =
  | GanttSymbolOccurrence
  | SequenceParticipantOccurrence
  | UseCaseSymbolOccurrence
  | ClassSymbolOccurrence
  | ActivitySymbolOccurrence
  | WbsSymbolOccurrence;

export type SemanticRenameMode =
  | "task"
  | "task alias"
  | "person"
  | "participant"
  | "participant alias"
  | "sequence anchor"
  | "actor"
  | "actor alias"
  | "use case"
  | "use case alias"
  | "use case package"
  | "use case package alias"
  | "class entity"
  | "class entity alias"
  | "class package"
  | "class package alias"
  | "activity action"
  | "activity partition"
  | "WBS node"
  | "WBS node alias";

export interface SemanticRenameRequest {
  occurrence: SemanticSymbolOccurrence;
  mode: SemanticRenameMode;
}

export interface SemanticRenameResult {
  source?: string;
  error?: string;
  nextKey?: string;
  validateGenerated?: boolean;
  personRename?: { from: string; to: string };
}

interface ProviderContext {
  diagramKind: DiagramKind;
  source: string;
  gantt: GanttDocument;
  sequence: SequenceDocument;
  useCase: UseCaseDocument;
  classDiagram: ClassDocument;
  activity: ActivityDocument;
  wbs: WbsDocument;
}

export interface SemanticSymbolProvider {
  occurrences: SemanticSymbolOccurrence[];
  occurrenceAt(position: number): SemanticSymbolOccurrence | undefined;
  occurrencesFor(symbol: Pick<SemanticSymbolOccurrence, "kind" | "key">): SemanticSymbolOccurrence[];
  renameRequest(occurrence: SemanticSymbolOccurrence): SemanticRenameRequest | undefined;
  renameOccurrenceCount(request: SemanticRenameRequest): number;
  renameOccurrences(request: SemanticRenameRequest): SemanticSymbolOccurrence[];
  validateRename(request: SemanticRenameRequest, value: string): string | undefined;
  rename(request: SemanticRenameRequest, value: string): SemanticRenameResult;
}

export function createSemanticSymbolProvider(context: ProviderContext): SemanticSymbolProvider {
  const occurrences = collectOccurrences(context);
  const occurrenceAt = (position: number) =>
    occurrences.find((item) => position >= item.range.from && position <= item.range.to);
  const occurrencesFor = (symbol: Pick<SemanticSymbolOccurrence, "kind" | "key">) =>
    occurrences.filter((item) => item.kind === symbol.kind && item.key === symbol.key);
  return {
    occurrences,
    occurrenceAt,
    occurrencesFor,
    renameRequest: (occurrence) => renameRequest(context, occurrence),
    renameOccurrenceCount: (request) => renameOccurrences(context, occurrences, request).length,
    renameOccurrences: (request) => renameOccurrences(context, occurrences, request),
    validateRename: (request, value) => validateRename(context, occurrences, request, value),
    rename: (request, value) => rename(context, request, value),
  };
}

function collectOccurrences(context: ProviderContext): SemanticSymbolOccurrence[] {
  switch (context.diagramKind) {
    case "gantt":
      return ganttSymbolOccurrences(context.source, context.gantt);
    case "sequence":
      return sequenceParticipantOccurrences(context.source, context.sequence);
    case "usecase":
      return collectUseCaseSymbolOccurrences(context.source, context.useCase);
    case "class":
      return collectClassSymbolOccurrences(context.source, context.classDiagram);
    case "activity":
      return collectActivitySymbolOccurrences(context.source, context.activity);
    case "wbs":
      return collectWbsSymbolOccurrences(context.source, context.wbs);
  }
}

function renameRequest(
  context: ProviderContext,
  occurrence: SemanticSymbolOccurrence,
): SemanticRenameRequest | undefined {
  if (occurrence.kind === "task") {
    const task = context.gantt.symbols.tasks.get(occurrence.key);
    return {
      occurrence,
      mode: task?.alias && normalizeTaskId(occurrence.value) === task.id ? "task alias" : "task",
    };
  }
  if (occurrence.kind === "person") return { occurrence, mode: "person" };
  if (occurrence.kind === "participant") {
    const participant = context.sequence.participants.find((item) => item.id === occurrence.key);
    const creation = context.sequence.creations.find((item) => item.participant.toLocaleLowerCase() === occurrence.key);
    if (!participant && !creation) return undefined;
    return {
      occurrence,
      mode: participant?.alias && occurrence.value === participant.alias ? "participant alias" : "participant",
    };
  }
  if (occurrence.kind === "sequence-anchor") return { occurrence, mode: "sequence anchor" };
  if (occurrence.kind === "actor" || occurrence.kind === "usecase") {
    const element = context.useCase.elements.find((item) => item.id === occurrence.key);
    if (!element) return undefined;
    const kind = element.kind === "usecase" ? "use case" : "actor";
    return { occurrence, mode: !element.alias || occurrence.declaration === "label" ? kind : `${kind} alias` };
  }
  if (occurrence.kind === "class-entity") {
    const entity = context.classDiagram.entities.find((item) => item.id === occurrence.key);
    if (!entity) return undefined;
    return {
      occurrence,
      mode: !entity.alias || occurrence.declaration === "label" ? "class entity" : "class entity alias",
    };
  }
  if (occurrence.kind === "usecase-package") {
    const item = context.useCase.packages.find((candidate) => candidate.id === occurrence.key);
    if (!item) return undefined;
    return {
      occurrence,
      mode: item.alias && occurrence.declaration === "alias" ? "use case package alias" : "use case package",
    };
  }
  if (occurrence.kind === "class-package") {
    const item = context.classDiagram.packages.find((candidate) => candidate.id === occurrence.key);
    if (!item) return undefined;
    return {
      occurrence,
      mode: item.alias && occurrence.declaration === "alias" ? "class package alias" : "class package",
    };
  }
  if (occurrence.kind === "activity-action" || occurrence.kind === "activity-partition")
    return { occurrence, mode: occurrence.kind === "activity-action" ? "activity action" : "activity partition" };
  if (occurrence.kind !== "wbs-node") return undefined;
  const node = context.wbs.nodes.find((item) => item.id === occurrence.key);
  if (!node) return undefined;
  return { occurrence, mode: node.alias && occurrence.declaration !== "label" ? "WBS node alias" : "WBS node" };
}

function renameOccurrences(
  context: ProviderContext,
  occurrences: SemanticSymbolOccurrence[],
  request: SemanticRenameRequest,
) {
  const target = request.occurrence;
  return occurrences.filter((item) => {
    if (item.kind !== target.kind || item.key !== target.key) return false;
    if (request.mode === "task alias") return normalizeTaskId(item.value) === target.key;
    const task = target.kind === "task" ? context.gantt.symbols.tasks.get(target.key) : undefined;
    if (request.mode === "task" && task?.alias) return item.range.from === task.labelRange.from;
    const participant =
      target.kind === "participant" ? context.sequence.participants.find((item) => item.id === target.key) : undefined;
    if (request.mode === "participant alias") return item.value === participant?.alias;
    if (request.mode === "participant" && participant?.alias)
      return item.range.from >= participant.sourceRange.from && item.value === participant.label;
    if (request.mode.endsWith("package alias")) return "declaration" in item && item.declaration === "alias";
    if (request.mode.endsWith("package")) return "declaration" in item && item.declaration === "label";
    if (["actor alias", "use case alias", "class entity alias", "WBS node alias"].includes(request.mode))
      return item.role === "reference" || ("declaration" in item && item.declaration === "alias");
    if (["actor", "use case", "class entity", "WBS node"].includes(request.mode)) {
      const hasAlias =
        target.kind === "actor" || target.kind === "usecase"
          ? context.useCase.elements.find((element) => element.id === target.key)?.alias
          : target.kind === "class-entity"
            ? context.classDiagram.entities.find((entity) => entity.id === target.key)?.alias
            : target.kind === "wbs-node"
              ? context.wbs.nodes.find((node) => node.id === target.key)?.alias
              : undefined;
      if (hasAlias) return "declaration" in item && item.declaration === "label";
    }
    return true;
  });
}

function validateRename(
  context: ProviderContext,
  occurrences: SemanticSymbolOccurrence[],
  request: SemanticRenameRequest,
  value: string,
): string | undefined {
  const target = request.occurrence;
  if (target.kind === "task") {
    const task = context.gantt.symbols.tasks.get(target.key);
    if (!task) return "Task not found";
    return (
      request.mode === "task alias"
        ? renameTaskAlias(context.source, context.gantt, task, value)
        : renameTask(context.source, context.gantt, task, value)
    ).unavailableReason;
  }
  if (target.kind === "person")
    return validateRenameValue(value, {
      label: "Person name",
      currentIdentity: target.value,
      identities: occurrences
        .filter((item) => item.kind === "person" && item.key !== target.key)
        .map((item) => item.value),
      forbidden: /[{},:]/,
      forbiddenMessage: "Person name cannot contain braces, commas, or colons",
    });
  if (target.kind === "participant") {
    const item = context.sequence.participants.find((candidate) => candidate.id === target.key);
    const creation = context.sequence.creations.find(
      (candidate) => candidate.participant.toLocaleLowerCase() === target.key,
    );
    if (!item && !creation) return "Participant not found";
    if (creation)
      return validateRenameValue(value, {
        label: "Participant name",
        currentIdentity: creation.participant,
        identities: [
          ...context.sequence.participants.map((candidate) => candidate.alias ?? candidate.label),
          ...context.sequence.creations
            .filter((candidate) => candidate !== creation)
            .map((candidate) => candidate.participant),
        ],
        forbidden: /["\r\n]/,
        forbiddenMessage: "Participant names cannot contain quotes or line breaks",
      });
    if (!item) return "Participant not found";
    return validateNamedIdentity(
      value,
      request.mode === "participant alias",
      item.alias,
      item.label,
      item.id,
      context.sequence.participants.map((candidate) => ({
        id: candidate.id,
        identity: candidate.alias ?? candidate.label,
      })),
      "Participant",
      false,
    );
  }
  if (target.kind === "sequence-anchor")
    return validateRenameValue(value, {
      label: "Sequence anchor",
      currentIdentity: target.value,
      identities: context.sequence.messages
        .map((item) => item.anchor)
        .filter((item): item is string => Boolean(item) && item !== target.value),
      identifier: /^[A-Za-z_][\w.-]*$/,
      identifierMessage:
        "Sequence anchors must start with a letter or underscore and contain only letters, numbers, dots, underscores, or dashes",
    });
  if (target.kind === "actor" || target.kind === "usecase") {
    const item = context.useCase.elements.find((candidate) => candidate.id === target.key);
    if (!item) return "Use Case element not found";
    return validateNamedIdentity(
      value,
      request.mode.endsWith(" alias"),
      item.alias,
      item.label,
      item.id,
      context.useCase.elements.map((candidate) => ({ id: candidate.id, identity: candidate.alias ?? candidate.label })),
      request.mode.endsWith(" alias") ? "Alias" : "Name",
      true,
    );
  }
  if (target.kind === "class-entity") {
    const item = context.classDiagram.entities.find((candidate) => candidate.id === target.key);
    if (!item) return "Class entity not found";
    return validateNamedIdentity(
      value,
      request.mode.endsWith(" alias"),
      item.alias,
      item.label,
      item.id,
      context.classDiagram.entities.map((candidate) => ({
        id: candidate.id,
        identity: candidate.alias ?? candidate.label,
      })),
      request.mode.endsWith(" alias") ? "Alias" : "Name",
      true,
    );
  }
  if (target.kind === "usecase-package" || target.kind === "class-package") {
    const packages = target.kind === "usecase-package" ? context.useCase.packages : context.classDiagram.packages;
    const item = packages.find((candidate) => candidate.id === target.key);
    if (!item) return "Package not found";
    const aliasMode = request.mode.endsWith(" alias");
    return validateNamedIdentity(
      value,
      aliasMode,
      item.alias,
      item.label,
      item.id,
      packages.map((candidate) => ({ id: candidate.id, identity: candidate.alias ?? candidate.label })),
      aliasMode ? "Alias" : "Package",
      true,
    );
  }
  if (target.kind === "activity-action")
    return validateRenameValue(value, {
      label: "Action name",
      forbidden: /[;\r\n]/,
      forbiddenMessage: "Action names cannot contain semicolons or line breaks",
    });
  if (target.kind === "activity-partition") {
    const item = context.activity.partitions.find((candidate) => candidate.id === target.key);
    if (!item) return "Activity partition not found";
    return validateRenameValue(value, {
      label: "Partition name",
      currentIdentity: item.label,
      identities: context.activity.partitions
        .filter((candidate) => candidate.id !== item.id)
        .map((candidate) => candidate.label),
      normalize: (candidate) =>
        candidate
          .trim()
          .toLocaleLowerCase()
          .replace(/[^\w.-]+/g, "-"),
      forbidden: /["\r\n]/,
      forbiddenMessage: "Partition names cannot contain quotes or line breaks",
    });
  }
  const node = context.wbs.nodes.find((candidate) => candidate.id === target.key);
  if (!node) return "WBS node not found";
  return request.mode === "WBS node alias"
    ? validateRenameValue(value, {
        label: "WBS alias",
        currentIdentity: node.alias ?? target.value,
        identities: context.wbs.nodes
          .filter((candidate) => candidate.id !== node.id)
          .flatMap((candidate) => (candidate.alias ? [candidate.alias] : [])),
        identifier: /^[A-Za-z_][\w-]*$/,
        identifierMessage:
          "WBS alias must start with a letter or underscore and contain only letters, numbers, underscores, or dashes",
      })
    : validateRenameValue(value, {
        label: "WBS node name",
        forbidden: /[\r\n]/,
        forbiddenMessage: "WBS node names cannot contain line breaks",
      });
}

function validateNamedIdentity(
  value: string,
  aliasMode: boolean,
  alias: string | undefined,
  label: string,
  id: string,
  identities: Array<{ id: string; identity: string }>,
  fieldLabel: string,
  strictAlias: boolean,
) {
  const changesIdentity = aliasMode || !alias;
  return validateRenameValue(value, {
    label: aliasMode ? fieldLabel : `${fieldLabel} name`,
    ...(strictAlias && aliasMode
      ? {
          identifier: /^[\w.$-]+$/,
          identifierMessage: "Alias can only contain letters, numbers, underscores, dots, dollars, or dashes",
        }
      : { forbidden: /["\r\n]/, forbiddenMessage: `${fieldLabel} names cannot contain quotes or line breaks` }),
    ...(changesIdentity
      ? {
          currentIdentity: alias ?? label,
          identities: identities.filter((item) => item.id !== id).map((item) => item.identity),
        }
      : {}),
  });
}

function rename(context: ProviderContext, request: SemanticRenameRequest, value: string): SemanticRenameResult {
  const target = request.occurrence;
  const trimmed = value.trim();
  if (target.kind === "task" || target.kind === "person") {
    const task = target.kind === "task" ? context.gantt.symbols.tasks.get(target.key) : undefined;
    const operation =
      request.mode === "person"
        ? renameResource(context.gantt, target.value, value, context.source)
        : request.mode === "task alias" && task
          ? renameTaskAlias(context.source, context.gantt, task, value)
          : task
            ? renameTask(context.source, context.gantt, task, value)
            : { edits: [], unavailableReason: "Task not found" };
    if (operation.unavailableReason) return { error: operation.unavailableReason };
    return {
      source: applySourceEdits(context.source, operation.edits),
      validateGenerated: true,
      nextKey:
        request.mode === "person"
          ? trimmed.toLocaleLowerCase()
          : request.mode === "task alias"
            ? normalizeTaskId(trimmed)
            : task?.alias?.value
              ? task.id
              : normalizeTaskId(trimmed),
      ...(request.mode === "person" ? { personRename: { from: target.value, to: trimmed } } : {}),
    };
  }
  if (target.kind === "participant") {
    const item = context.sequence.participants.find((candidate) => candidate.id === target.key);
    const creation = context.sequence.creations.find(
      (candidate) => candidate.participant.toLocaleLowerCase() === target.key,
    );
    if (creation) {
      const source = updateSequenceStructure(context.source, creation, {
        kind: "create",
        participantKind: creation.participantKind,
        participant: trimmed,
      });
      return source === context.source
        ? { error: "Rename made no changes" }
        : { source, nextKey: trimmed.toLocaleLowerCase(), validateGenerated: true };
    }
    if (!item) return { error: "Participant not found" };
    const aliasMode = request.mode === "participant alias";
    return {
      source: updateSequenceParticipant(context.source, context.sequence, item, {
        kind: item.kind,
        label: aliasMode ? item.label : trimmed,
        ...(aliasMode ? { alias: trimmed } : item.alias ? { alias: item.alias } : {}),
        ...(item.color ? { color: item.color } : {}),
        ...(item.stereotype ? { stereotype: item.stereotype } : {}),
        ...(item.spotCharacter ? { spotCharacter: item.spotCharacter } : {}),
        ...(item.spotColor ? { spotColor: item.spotColor } : {}),
        ...(item.order !== undefined ? { order: item.order } : {}),
      }),
      nextKey: (aliasMode ? trimmed : (item.alias ?? trimmed)).toLowerCase(),
    };
  }
  if (target.kind === "sequence-anchor") {
    const source = renameSequenceAnchor(context.source, context.sequence, target.key, trimmed);
    return source === context.source ? { error: "Rename made no changes" } : { source, nextKey: trimmed };
  }
  if (target.kind === "actor" || target.kind === "usecase") {
    const item = context.useCase.elements.find((candidate) => candidate.id === target.key);
    if (!item) return { error: "Use Case element not found" };
    const aliasMode = request.mode.endsWith(" alias");
    return {
      source: updateUseCaseElement(context.source, context.useCase, item, {
        kind: item.kind,
        label: aliasMode ? item.label : trimmed,
        ...(aliasMode ? { alias: trimmed } : item.alias ? { alias: item.alias } : {}),
        business: item.business,
        ...(item.stereotype ? { stereotype: item.stereotype } : {}),
        ...(item.color ? { color: item.color } : {}),
      }),
      nextKey: (aliasMode ? trimmed : (item.alias ?? trimmed)).toLowerCase(),
    };
  }
  if (target.kind === "class-entity") {
    const item = context.classDiagram.entities.find((candidate) => candidate.id === target.key);
    if (!item) return { error: "Class entity not found" };
    const aliasMode = request.mode === "class entity alias";
    const occurrences = renameOccurrences(
      context,
      collectClassSymbolOccurrences(context.source, context.classDiagram),
      request,
    );
    return {
      source: applySourceEdits(
        context.source,
        occurrences.map((occurrence) => ({ range: occurrence.range, text: trimmed })),
      ),
      nextKey: (aliasMode ? trimmed : (item.alias ?? trimmed)).toLowerCase(),
    };
  }
  if (target.kind === "usecase-package") {
    const item = context.useCase.packages.find((candidate) => candidate.id === target.key);
    if (!item) return { error: "Use Case package not found" };
    const aliasMode = request.mode.endsWith(" alias");
    const source = updateUseCasePackage(context.source, item, {
      kind: item.kind,
      label: aliasMode ? item.label : trimmed,
      ...(aliasMode ? { alias: trimmed } : item.alias ? { alias: item.alias } : {}),
      ...(item.color ? { color: item.color } : {}),
      ...(item.stereotype ? { stereotype: item.stereotype } : {}),
      ...(item.parentId ? { parentId: item.parentId } : {}),
    });
    return { source, nextKey: (aliasMode ? trimmed : (item.alias ?? trimmed)).toLocaleLowerCase() };
  }
  if (target.kind === "class-package") {
    const item = context.classDiagram.packages.find((candidate) => candidate.id === target.key);
    if (!item) return { error: "Class package not found" };
    const aliasMode = request.mode.endsWith(" alias");
    const source = updateClassPackage(context.source, item, {
      kind: item.kind,
      label: aliasMode ? item.label : trimmed,
      ...(aliasMode ? { alias: trimmed } : item.alias ? { alias: item.alias } : {}),
      ...(item.color ? { color: item.color } : {}),
      ...(item.parentId ? { parentId: item.parentId } : {}),
    });
    return { source, nextKey: (aliasMode ? trimmed : (item.alias ?? trimmed)).toLocaleLowerCase() };
  }
  if (target.kind === "activity-action") {
    const item = context.activity.nodes.find((candidate) => candidate.id === target.key);
    if (!item || item.kind !== "action") return { error: "Activity action not found" };
    return {
      source: updateActivityAction(context.source, item, {
        label: trimmed,
        ...(item.color ? { color: item.color } : {}),
        ...(item.stereotype ? { stereotype: item.stereotype } : {}),
        ...(item.partitionId ? { partitionId: item.partitionId } : {}),
      }),
      nextKey: item.id,
    };
  }
  if (target.kind === "activity-partition") {
    const item = context.activity.partitions.find((candidate) => candidate.id === target.key);
    if (!item) return { error: "Activity partition not found" };
    const source = updateActivityPartition(context.source, item, {
      label: trimmed,
      ...(item.color ? { color: item.color } : {}),
      ...(item.parentId ? { parentId: item.parentId } : {}),
    });
    const nextKey = parseActivity(source).partitions.find((candidate) => candidate.label === trimmed)?.id;
    return { source, ...(nextKey ? { nextKey } : {}) };
  }
  const item = context.wbs.nodes.find((candidate) => candidate.id === target.key);
  if (!item) return { error: "WBS node not found" };
  const source =
    request.mode === "WBS node alias"
      ? renameWbsNodeAlias(context.source, context.wbs, item, trimmed)
      : updateWbsNode(context.source, item, {
          label: trimmed,
          ...(item.color ? { color: item.color } : {}),
          ...(item.textColor ? { textColor: item.textColor } : {}),
          ...(item.stereotype ? { stereotype: item.stereotype } : {}),
          ...(item.side !== "root" ? { side: item.side } : {}),
        });
  return source === context.source ? { error: "Rename made no changes" } : { source, nextKey: item.id };
}
