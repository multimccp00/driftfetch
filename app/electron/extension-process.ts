import { spawn, type ChildProcess } from "node:child_process";

export interface Capabilities {
  fallback: boolean;
  galleryArguments: boolean;
}
type Credentials = () => Promise<Record<string, string>>;
interface PendingCall {
  resolve(value: any): void;
  reject(error: Error): void;
  credentials?: Credentials;
}

/**
 * One extension's code in its own process, started with Node's permission model:
 * no file access and no child processes. It can use the network, and it receives
 * only the credentials the app hands over for the extension's own domain.
 */
export class ExtensionProcess {
  private child?: ChildProcess;
  private starting?: Promise<Capabilities>;
  private calls = new Map<number, PendingCall>();
  private nextCall = 1;
  constructor(
    private code: string,
    private hostPath: string,
  ) {}

  private failAll(error: Error) {
    const pending = [...this.calls.values()];
    this.calls.clear();
    for (const call of pending) call.reject(error);
  }

  start(): Promise<Capabilities> {
    this.starting ??= new Promise<Capabilities>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--permission",
          `--allow-fs-read=${this.hostPath}`,
          "--max-old-space-size=256",
          this.hostPath,
        ],
        {
          // No inherited environment: nothing in it for the extension to read.
          env: {
            ELECTRON_RUN_AS_NODE: "1",
            SystemRoot: process.env.SystemRoot,
          },
          stdio: ["ignore", "ignore", "ignore", "ipc"],
          windowsHide: true,
          shell: false,
        },
      );
      this.child = child;
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("The extension did not start in time."));
      }, 10_000);
      child.on("message", (message: any) => {
        if (message?.t === "loaded") {
          clearTimeout(timer);
          if (message.ok)
            resolve({
              fallback: !!message.fallback,
              galleryArguments: !!message.galleryArguments,
            });
          else {
            child.kill();
            reject(
              new Error(String(message.error || "Extension failed to load.")),
            );
          }
        } else if (message?.t === "result") {
          const call = this.calls.get(message.id);
          this.calls.delete(message.id);
          if (!call) return;
          if (message.ok) call.resolve(message.value);
          else call.reject(new Error(String(message.error)));
        } else if (message?.t === "credentials") {
          // Only while a call is in flight, and only through the app's scoped reader.
          const read = [...this.calls.values()].find(
            (call) => call.credentials,
          )?.credentials;
          const reply = (body: object) =>
            child.connected &&
            child.send({ t: "credentials-result", id: message.id, ...body });
          if (!read) return void reply({ ok: false, error: "Not available." });
          read().then(
            (value) => reply({ ok: true, value }),
            (error) =>
              reply({ ok: false, error: String(error?.message ?? error) }),
          );
        }
      });
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", () => {
        clearTimeout(timer);
        const stopped = new Error("The extension stopped unexpectedly.");
        if (this.child === child) {
          this.child = undefined;
          this.starting = undefined;
        }
        this.failAll(stopped);
        reject(stopped);
      });
      child.send({ t: "load", code: this.code });
    });
    return this.starting;
  }

  async call(
    method: "matches" | "resolve" | "fallback" | "galleryArguments",
    args: unknown[],
    options: {
      signal?: AbortSignal;
      credentials?: Credentials;
      timeoutMs?: number;
    } = {},
  ): Promise<any> {
    await this.start();
    const child = this.child;
    if (!child?.connected) throw new Error("The extension is not running.");
    const id = this.nextCall++;
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = () => {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abort);
      };
      const abort = () => {
        this.calls.delete(id);
        if (child.connected) child.send({ t: "abort", id });
        finish();
        reject(options.signal?.reason ?? new Error("Cancelled"));
      };
      this.calls.set(id, {
        resolve: (value) => (finish(), resolve(value)),
        reject: (error) => (finish(), reject(error)),
        credentials: options.credentials,
      });
      if (options.signal?.aborted) return abort();
      options.signal?.addEventListener("abort", abort, { once: true });
      if (options.timeoutMs)
        timer = setTimeout(() => {
          this.calls.delete(id);
          // Stuck code: stop the process. The next call starts a fresh one.
          child.kill();
          finish();
          reject(new Error("The extension took too long to respond."));
        }, options.timeoutMs);
      child.send({ t: "call", id, method, args });
    });
  }

  stop() {
    this.child?.kill();
    this.child = undefined;
    this.starting = undefined;
  }
}
