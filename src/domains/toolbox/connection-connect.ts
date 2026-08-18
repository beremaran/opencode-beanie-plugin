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

async function performHandshake(
  transport: Transport,
  timeout: number,
  version: string,
  callbacks: ConnectCallbacks,
  name: string,
  pool: ProcessPool,
  slot: boolean,
): Promise<Session> {
  const client = new Client({ name: "mcp-aggregator", version }, { capabilities: {} });

  wireTransportEvents(
    transport,
    () => { if (!pool.isClosed()) {callbacks.teardown(name, null);} },
    (msg) => { if (!pool.isClosed()) {callbacks.teardown(name, msg);} },
  );
  await client.connect(transport, { timeout });
  const session: Session = { client, transport, slot };
  callbacks.setSession(name, session);
  callbacks.clearError(name);
  callbacks.touch(name);
  return session;
}

export async function connectServerSession(
  name: string,
  entry: ServerEntry,
  pool: ProcessPool,
  timeout: number,
  version: string,
  callbacks: ConnectCallbacks,
): Promise<Session> {
  let slot = false;

  let transport: Transport | undefined;

  let client: Client | undefined;

  const stderrTail: string[] = [];

  try {
    if (entry.config.type === "stdio") {
      await pool.acquire(timeout);
      slot = true;
    }
    transport = createTransport(entry.config);
    captureStderr(transport, stderrTail);
    return await performHandshake(transport, timeout, version, callbacks, name, pool, slot);
  } catch (error) {
    return await handleConnectError(error, slot, pool, client, transport, entry, stderrTail, callbacks, name);
  }
}
