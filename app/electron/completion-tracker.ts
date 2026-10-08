import type { Status } from "../src/shared";

/** Track transitions without keeping removed jobs alive or replaying history. */
export class CompletionTracker {
  private statuses = new WeakMap<object, Status>();

  update<T extends { status: Status }>(jobs: readonly T[]): T[] {
    const completed: T[] = [];
    for (const job of jobs) {
      const previous = this.statuses.get(job);
      this.statuses.set(job, job.status);
      if (previous && previous !== "completed" && job.status === "completed") {
        completed.push(job);
      }
    }
    return completed;
  }
}
