import { Client, type Transport } from "@modelcontextprotocol/client";
import { captureStderr, safeError, stderrDetail } from "./connection-helpers";
import type { ProcessPool } from "./connection-pool";
import { createTransport, wireTransportEvents } from "./connection-transport";
import type { Session } from "./connection-types";
import type { ServerEntry } from "./types";

export interface ConnectCallbacks {
  teardown: (name: string, error: string | null) => void;
  setSession: (name: string, session: Session) => void;
  clearError: (name: string) => void;
  markError: (name: string, message: string) => void;
  touch: (name: string) => void;
}

async function handleConnectError(
  error: unknown,
  slot: boolean,
  pool: ProcessPool,
  client: Client | undefined,
  transport: Transport | undefined,
  entry: ServerEntry,
  stderrTail: string[],
  callbacks: ConnectCallbacks,
  name: string,
): Promise<never> {
  if (slot) {pool.release();}
  await client?.close().catch(() => undefined);
  if (!client) {await transport?.close().catch(() => undefined);}

  let msg = safeError(error);

  if (entry.config.type === "stdio") {msg = `spawn ${entry.config.command}: ${msg}${stderrDetail(stderrTail)}`;}
  callbacks.markError(name, msg);
  throw new Error(msg, { cause: error });
}

type HandshakeOpts = { timeout: number; version: string; callbacks: ConnectCallbacks; name: string; pool: ProcessPool; slot: boolean };

async function performHandshake(transport: Transport, opts: HandshakeOpts): Promise<Session> {
  const client = new Client({ name: "mcp-aggregator", version: opts.version }, { capabilities: {} });
  wireTransportEvents(
    transport,
    () => { if (!opts.pool.isClosed()) {opts.callbacks.teardown(opts.name, null);} },
    (msg) => { if (!opts.pool.isClosed()) {opts.callbacks.teardown(opts.name, msg);} },
  );
  await client.connect(transport, { timeout: opts.timeout });
  const session: Session = { client, transport, slot: opts.slot };
  opts.callbacks.setSession(opts.name, session);
  opts.callbacks.clearError(opts.name);
  opts.callbacks.touch(opts.name);
  return session;
}

export async function connectServerSession(
  name: string, entry: ServerEntry, pool: ProcessPool, timeout: number, version: string, callbacks: ConnectCallbacks,
): Promise<Session> {
  let slot = false;

  let transport: Transport | undefined;

  const stderrTail: string[] = [];

  try {
    if (entry.config.type === "stdio") {
      await pool.acquire(timeout);
      slot = true;
    }
    transport = createTransport(entry.config);
    captureStderr(transport, stderrTail);
    return await performHandshake(transport, { timeout, version, callbacks, name, pool, slot });
  } catch (error) {
    return await handleConnectError(error, slot, pool, undefined, transport, entry, stderrTail, callbacks, name);
  }
}
