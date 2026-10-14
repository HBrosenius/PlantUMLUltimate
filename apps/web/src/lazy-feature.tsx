import { lazy, Suspense, type ComponentType } from "react";

/** Keep a feature's loading boundary local to the UI that requested it. */
export function lazyFeature<P extends object>(load: () => Promise<{ default: ComponentType<P> }>, name: string) {
  const Feature = lazy(load);
  return function DeferredFeature(props: P) {
    return (
      <Suspense fallback={<div role="status">Loading {name}…</div>}>
        <Feature {...props} />
      </Suspense>
    );
  };
}
