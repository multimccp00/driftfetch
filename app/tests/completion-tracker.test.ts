import { expect, it } from "vitest";
import { CompletionTracker } from "../electron/completion-tracker";
import type { Status } from "../src/shared";

it("does not replay a large history when a new download completes", () => {
  const tracker = new CompletionTracker();
  const history = Array.from({ length: 700 }, () => ({
    status: "completed" as Status,
  }));
  const active = { status: "downloading" as Status };
  const jobs = [...history, active];
  expect(tracker.update(jobs)).toEqual([]);
  active.status = "completed";
  expect(tracker.update(jobs)).toEqual([active]);
  expect(tracker.update(jobs)).toEqual([]);
});

it("does not replay completions that were consumed with notifications off", () => {
  const tracker = new CompletionTracker();
  const job = { status: "processing" as Status };
  tracker.update([job]);
  job.status = "completed";
  tracker.update([job]); // Caller deliberately ignores notifications while muted.
  expect(tracker.update([job])).toEqual([]);
});

it("notifies another completion after the same job has been retried", () => {
  const tracker = new CompletionTracker();
  const job = { status: "completed" as Status };
  tracker.update([job]);
  job.status = "queued";
  tracker.update([job]);
  job.status = "completed";
  expect(tracker.update([job])).toEqual([job]);
});
