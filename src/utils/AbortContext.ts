import { AsyncLocalStorage } from "node:async_hooks";

type AbortContextState = {
  signal?: AbortSignal;
};

const abortContext = new AsyncLocalStorage<AbortContextState>();

export const runWithAbortSignal = async <T>(
  signal: AbortSignal | undefined,
  fn: () => Promise<T>
): Promise<T> => {
  return abortContext.run({ signal }, fn);
};

export const getAbortSignal = (): AbortSignal | undefined => {
  return abortContext.getStore()?.signal;
};
