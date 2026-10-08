"use strict";
// Runs one extension's code in its own process. DriftFetch starts this file with
// Node's permission model (--permission), so the extension cannot read or write
// files or start programs; it can still use the network. It only ever sees the
// URL it is asked about and the credentials for its own domain, which the app
// hands over on request. Plain CommonJS with no imports, so it also runs outside
// the app archive.

/** @type {any} */
let provider;
const credentialRequests = new Map();
const controllers = new Map();
let nextRequest = 1;

const send = (message) => process.send && process.send(message);
const describe = (error) =>
  String((error && error.message) || error || "Extension error").slice(0, 2000);

function load(code) {
  const module = { exports: {} };
  new Function("module", "exports", "require", code)(
    module,
    module.exports,
    require,
  );
  const exported = module.exports.default || module.exports;
  if (
    !exported ||
    typeof exported.matches !== "function" ||
    typeof exported.resolve !== "function" ||
    (exported.fallback !== undefined &&
      typeof exported.fallback !== "function") ||
    (exported.galleryArguments !== undefined &&
      typeof exported.galleryArguments !== "function")
  )
    throw new Error("The extension does not export matches() and resolve().");
  provider = exported;
  return {
    fallback: typeof exported.fallback === "function",
    galleryArguments: typeof exported.galleryArguments === "function",
  };
}

function requestCredentials() {
  return new Promise((resolve, reject) => {
    const id = nextRequest++;
    credentialRequests.set(id, { resolve, reject });
    send({ t: "credentials", id });
  });
}

async function call(message) {
  const { id, method, args } = message;
  const controller = new AbortController();
  controllers.set(id, controller);
  try {
    if (!provider) throw new Error("The extension is not loaded.");
    let value;
    if (method === "matches") value = !!provider.matches(args[0]);
    else if (method === "galleryArguments")
      value = provider.galleryArguments(args[0]);
    else if (method === "resolve" || method === "fallback")
      value = await provider[method](args[0], {
        signal: controller.signal,
        credentials: requestCredentials,
      });
    else throw new Error("Unknown extension method.");
    send({ t: "result", id, ok: true, value });
  } catch (error) {
    send({ t: "result", id, ok: false, error: describe(error) });
  } finally {
    controllers.delete(id);
  }
}

process.on("message", (message) => {
  if (!message || typeof message !== "object") return;
  if (message.t === "load") {
    try {
      send({ t: "loaded", ok: true, ...load(message.code) });
    } catch (error) {
      send({ t: "loaded", ok: false, error: describe(error) });
    }
  } else if (message.t === "call") void call(message);
  else if (message.t === "abort") {
    const controller = controllers.get(message.id);
    if (controller) controller.abort(new Error("Cancelled"));
  } else if (message.t === "credentials-result") {
    const request = credentialRequests.get(message.id);
    credentialRequests.delete(message.id);
    if (!request) return;
    if (message.ok) request.resolve(message.value);
    else request.reject(new Error(message.error || "Credentials unavailable."));
  }
});
// The parent going away must not leave this process behind.
process.on("disconnect", () => process.exit(0));
