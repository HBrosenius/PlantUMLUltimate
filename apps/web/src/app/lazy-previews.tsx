import type { ComponentProps } from "react";
import { lazyFeature } from "../lazy-feature";

export const SequenceDiagramPreview = lazyFeature<
  ComponentProps<typeof import("../SequenceDiagramPreview").SequenceDiagramPreview>
>(
  () => import("../SequenceDiagramPreview").then((module) => ({ default: module.SequenceDiagramPreview })),
  "the sequence preview",
);

export const UseCaseDiagramPreview = lazyFeature<
  ComponentProps<typeof import("../UseCaseDiagramPreview").UseCaseDiagramPreview>
>(
  () => import("../UseCaseDiagramPreview").then((module) => ({ default: module.UseCaseDiagramPreview })),
  "the use case preview",
);

export const ClassDiagramPreview = lazyFeature<
  ComponentProps<typeof import("../ClassDiagramPreview").ClassDiagramPreview>
>(
  () => import("../ClassDiagramPreview").then((module) => ({ default: module.ClassDiagramPreview })),
  "the class preview",
);

export const ActivityDiagramPreview = lazyFeature<
  ComponentProps<typeof import("../ActivityDiagramPreview").ActivityDiagramPreview>
>(
  () => import("../ActivityDiagramPreview").then((module) => ({ default: module.ActivityDiagramPreview })),
  "the activity preview",
);

export const WbsDiagramPreview = lazyFeature<ComponentProps<typeof import("../WbsDiagramPreview").WbsDiagramPreview>>(
  () => import("../WbsDiagramPreview").then((module) => ({ default: module.WbsDiagramPreview })),
  "the WBS preview",
);
