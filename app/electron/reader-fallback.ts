import type { CollectionReadAttempt } from "../src/shared";
import { failureCode } from "../shared/diagnostics";

/** Report bounded, credential-free evidence without changing reader results. */
export async function readWithFallback<T>(
  primary: () => Promise<T | undefined>,
  fallback: () => Promise<T | undefined>,
  signal: AbortSignal,
  record: (attempts: CollectionReadAttempt[]) => void,
): Promise<T | undefined> {
  const attempts: CollectionReadAttempt[] = [];
  const publish = () => record(attempts.map((attempt) => ({ ...attempt })));
  const run = async (
    reader: CollectionReadAttempt["reader"],
    read: () => Promise<T | undefined>,
  ) => {
    signal.throwIfAborted();
    const attempt: CollectionReadAttempt = { reader, outcome: "reading" };
    attempts.push(attempt);
    publish();
    try {
      const result = await read();
      signal.throwIfAborted();
      attempt.outcome = result === undefined ? "empty" : "succeeded";
      publish();
      return result;
    } catch (error) {
      attempt.outcome = signal.aborted ? "cancelled" : "failed";
      if (!signal.aborted) attempt.failureCode = failureCode(error);
      publish();
      throw error;
    }
  };
  try {
    return await run("api", primary);
  } catch (error) {
    if (signal.aborted) throw error;
    return run("html", fallback);
  }
}
