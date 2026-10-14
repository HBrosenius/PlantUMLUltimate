import { lazy, Suspense, type ComponentType } from "react";

/**
 * Keep a feature's loading boundary local to the UI that requested it. `silent` suits wrappers that usually
 * render nothing (closed dialogs and inspectors), where a loading notice would only flash.
 */
export function lazyFeature<P extends object>(
  load: () => Promise<{ default: ComponentType<P> }>,
  name: string,
  { silent = false }: { silent?: boolean } = {},
) {
  const Feature = lazy(load);
  return function DeferredFeature(props: P) {
    return (
      <Suspense fallback={silent ? null : <div role="status">Loading {name}…</div>}>
        <Feature {...props} />
      </Suspense>
    );
  };
}
