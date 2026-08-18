import { SERVER_NAME_RE } from "./config";
import type { UpstreamRegistry } from "./registry-upstream";
import type { SearchResult, SearchRow, ServerEntry, UpstreamTool } from "./types";

export const TOOL_NAME_RE = /^[A-Za-z0-9._-]{1,128}$/;
const SUMMARY_MAX_LENGTH = 120;

const MAX_SEARCH_LIMIT = 500;

export const qualifiedName = (server: string, tool: string) => `${server}__${tool}`;

export function splitQualified(name: string): { server: string; tool: string } | null {
  const index = name.indexOf("__");

  if (index < 0) {
    return null;
  }

  const server = name.slice(0, index);

  const tool = name.slice(index + 2);

  if (SERVER_NAME_RE.test(server) && TOOL_NAME_RE.test(tool)) {
    return { server, tool };
  }
  return null;
}

function rowFor(name: string, tool: UpstreamTool, entry: ServerEntry): SearchRow {
  const row: SearchRow = {
    server: name,
    tool: tool.name,
    qualifiedName: qualifiedName(name, tool.name),
    summary: (tool.description || tool.name).slice(0, SUMMARY_MAX_LENGTH),
  };

  if (tool.title) {
    row.title = tool.title;
  }
  if (entry.metadataCache === null || entry.metadataStale) {
    row.stale = true;
  }
  return row;
}

function filterRows(rows: SearchRow[], query: string, tags: string[]): SearchRow[] {
  if (!query) {
    return rows;
  }
  return rows.filter((r) =>
    [r.qualifiedName, r.server, r.tool, r.summary, ...tags].join("\0").toLowerCase().includes(query),
  );
}

export class ToolRegistry {
  readonly upstream: UpstreamRegistry;

  constructor(upstream: UpstreamRegistry) {
    this.upstream = upstream;
  }

  validateToolName(name: string): boolean {
    return TOOL_NAME_RE.test(name);
  }

  validateServerName(name: string): boolean {
    return SERVER_NAME_RE.test(name);
  }

  getTool(server: string, name: string): UpstreamTool | null {
    return this.upstream.get(server)?.metadataCache?.find((t) => t.name === name) ?? null;
  }

  setCache(server: string, tools: UpstreamTool[]): void {
    this.upstream.setCache(server, tools);
  }

  evict(server: string): void {
    this.upstream.evict(server);
  }

  needsRefresh(server?: string | null): boolean {
    let names = this.upstream.enabledNames();

    if (server) {
      names = this.upstream.has(server) ? [server] : [];
    }
    return names.some((name) => {
      const entry = this.upstream.get(name);

      return entry ? entry.metadataCache === null || entry.metadataStale || entry.connState === "idle" : false;
    });
  }

  private resolveTargetNames(server?: string | null): string[] {
    if (!server) {
      return this.upstream.enabledNames();
    }
    return this.upstream.has(server) ? [server] : [];
  }

  search(input: { query?: string | null; server?: string | null; limit?: number; refresh: boolean }): SearchResult {
    const names = this.resolveTargetNames(input.server);

    const query = (input.query ?? "").toLowerCase();

    const limit = Math.min(
      typeof input.limit === "number" && Number.isInteger(input.limit) ? input.limit : this.upstream.config.searchTopK,
      MAX_SEARCH_LIMIT,
    );

    const serverEntries = names
      .map((name) => {
        const entry = this.upstream.get(name);

        return entry ? { entry, name } : null;
      })
      .filter((s): s is { entry: ServerEntry; name: string } => s !== null);

    const rows = serverEntries.flatMap(({ entry, name }) =>
      filterRows(
        (entry.metadataCache ?? []).map((tool) => rowFor(name, tool, entry)),
        query,
        entry.config.tags,
      ),
    );

    return {
      servers: serverEntries.map(({ entry, name }) => ({
        name,
        status: entry.connState,
        toolCount: (entry.metadataCache ?? []).length,
        error: entry.lastError,
        skippedTools: [...entry.skippedTools],
        stale: entry.metadataCache === null || entry.metadataStale,
      })),
      tools: rows.slice(0, limit),
      total: rows.length,
      shown: Math.min(rows.length, limit),
      truncated: rows.length > limit,
      searched: { query: query || null, server: input.server || null, refresh: input.refresh },
    };
  }
}
