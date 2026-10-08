import { expect, it } from "vitest";
import { runProcess } from "../electron/engine";

it("preserves Unicode when worker output splits a UTF-8 character between chunks", async () => {
  const expected = "Image samples · café — 日本語\n";
  const bytes = Buffer.from(expected);
  const split = bytes.indexOf(Buffer.from("日")) + 1;
  const lines: string[] = [];
  const worker = runProcess(
    process.execPath,
    [
      "-e",
      `const b=Buffer.from('${bytes.toString("hex")}','hex');` +
        `for(const s of [process.stdout,process.stderr])s.write(b.subarray(0,${split}));` +
        `setTimeout(()=>{for(const s of [process.stdout,process.stderr])s.write(b.subarray(${split}))},150);`,
    ],
    (line) => lines.push(line),
  );
  try {
    const result = await worker.done;
    expect(result.code).toBe(0);
    expect(result.stderr).toBe(expected);
    expect(lines).toEqual([expected.trimEnd()]);
  } finally {
    await worker.stop();
  }
});

it("terminates a silent worker after its idle deadline", async () => {
  const worker = runProcess(
    process.execPath,
    ["-e", "setInterval(()=>{},1000);setTimeout(()=>process.exit(0),5000)"],
    undefined,
    0,
    500,
  );
  try {
    const result = await worker.done;
    expect(result.timedOut).toBe(true);
    expect(result.code).not.toBe(0);
  } finally {
    await worker.stop();
  }
}, 10_000);

it("allows an active worker to run beyond its idle deadline", async () => {
  const worker = runProcess(
    process.execPath,
    [
      "-e",
      "const t=setInterval(()=>process.stdout.write('progress\\n'),100);setTimeout(()=>{clearInterval(t)},1600)",
    ],
    undefined,
    0,
    1000,
  );
  try {
    const result = await worker.done;
    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(0);
  } finally {
    await worker.stop();
  }
}, 10_000);
