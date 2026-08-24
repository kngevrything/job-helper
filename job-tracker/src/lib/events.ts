import { EventEmitter } from "events";

// Module-level singleton so every API route handler and every SSE
// connection share the same emitter within this Node process, and so it
// survives Next.js dev-server hot reloads (same `global` caching pattern
// as the Mongoose connection cache in lib/db/mongoose.ts).
declare global {
  var applicationEventEmitter: EventEmitter | undefined;
}

export const applicationEvents: EventEmitter =
  global.applicationEventEmitter ?? (global.applicationEventEmitter = new EventEmitter());
