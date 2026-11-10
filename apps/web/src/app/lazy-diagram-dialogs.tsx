import type { ComponentProps } from "react";
import { lazyFeature } from "../lazy-feature";

export const AddWbsNodeDialog = lazyFeature<
  ComponentProps<typeof import("../features/wbs/WbsDialogs").AddWbsNodeDialog>
>(
  () => import("../features/wbs/WbsDialogs").then((module) => ({ default: module.AddWbsNodeDialog })),
  "the WBS node form",
);

export const WbsSettingsInspector = lazyFeature<
  ComponentProps<typeof import("../features/wbs/WbsInspectors").WbsSettingsInspector>
>(
  () => import("../features/wbs/WbsInspectors").then((module) => ({ default: module.WbsSettingsInspector })),
  "WBS settings",
);

export const WbsNodeInspector = lazyFeature<
  ComponentProps<typeof import("../features/wbs/WbsInspectors").WbsNodeInspector>
>(
  () => import("../features/wbs/WbsInspectors").then((module) => ({ default: module.WbsNodeInspector })),
  "the WBS node inspector",
);

export const WbsRelinkDialog = lazyFeature<
  ComponentProps<typeof import("../features/wbs/WbsRelinkDialog").WbsRelinkDialog>
>(
  () => import("../features/wbs/WbsRelinkDialog").then((module) => ({ default: module.WbsRelinkDialog })),
  "the relink review",
);

export const WbsLinkedDeleteDialog = lazyFeature<
  ComponentProps<typeof import("../features/wbs/WbsLinkedDeleteDialog").WbsLinkedDeleteDialog>
>(
  () => import("../features/wbs/WbsLinkedDeleteDialog").then((module) => ({ default: module.WbsLinkedDeleteDialog })),
  "the linked delete review",
);

export const WbsRelationshipInspector = lazyFeature<
  ComponentProps<typeof import("../features/wbs/WbsInspectors").WbsRelationshipInspector>
>(
  () => import("../features/wbs/WbsInspectors").then((module) => ({ default: module.WbsRelationshipInspector })),
  "the WBS relationship inspector",
);

export const ActivityDialogs = lazyFeature<
  ComponentProps<typeof import("../features/activity/ActivityDialogs").ActivityDialogs>
>(
  () => import("../features/activity/ActivityDialogs").then((module) => ({ default: module.ActivityDialogs })),
  "activity forms",
  { silent: true },
);

export const SequenceDialogs = lazyFeature<
  ComponentProps<typeof import("../features/sequence/SequenceDialogs").SequenceDialogs>
>(
  () => import("../features/sequence/SequenceDialogs").then((module) => ({ default: module.SequenceDialogs })),
  "sequence forms",
  { silent: true },
);

export const UseCaseDialogs = lazyFeature<
  ComponentProps<typeof import("../features/usecase/UseCaseDialogs").UseCaseDialogs>
>(
  () => import("../features/usecase/UseCaseDialogs").then((module) => ({ default: module.UseCaseDialogs })),
  "use case forms",
  { silent: true },
);

export const LinkedWorkPreviewDialog = lazyFeature<
  ComponentProps<typeof import("../projects/LinkedWorkPreviewDialog").LinkedWorkPreviewDialog>
>(
  () => import("../projects/LinkedWorkPreviewDialog").then((module) => ({ default: module.LinkedWorkPreviewDialog })),
  "the linked work preview",
);
