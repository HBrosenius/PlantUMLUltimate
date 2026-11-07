import { useRef } from "react";

type Handler = (...args: never[]) => unknown;

/**
 * Returns an object with the same keys whose functions keep one identity for the life of the
 * component while always calling the handler from the latest render.
 *
 * `App` creates most command handlers inline, so `React.memo` on the menus and status components it
 * feeds could never skip a render. Passing them through here keeps their props stable without the
 * stale-closure risk of a dependency list. A key whose value is `undefined` stays `undefined`
 * (components use that to hide a command), so presence can still change.
 */
export function useStableHandlers<T extends Record<string, Handler | undefined>>(handlers: T): T {
  const latest = useRef(handlers);
  latest.current = handlers;
  const wrappers = useRef(new Map<string, Handler>());
  const stable: Record<string, Handler | undefined> = {};
  for (const key of Object.keys(handlers)) {
    if (!handlers[key]) {
      stable[key] = undefined;
      continue;
    }
    let wrapper = wrappers.current.get(key);
    if (!wrapper) {
      wrapper = ((...args: never[]) => latest.current[key]?.(...args)) as Handler;
      wrappers.current.set(key, wrapper);
    }
    stable[key] = wrapper;
  }
  return stable as T;
}

/** Returns the previous array while the new one has the same items, so a memoised child can skip rendering. */
export function useStableList<T extends readonly unknown[]>(list: T): T {
  const previous = useRef(list);
  const same = previous.current.length === list.length && previous.current.every((item, index) => item === list[index]);
  if (!same) previous.current = list;
  return previous.current;
}
