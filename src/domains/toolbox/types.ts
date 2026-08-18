export interface ServerCommonConfig {
  disabled: boolean;
  timeout?: number;
  toolFilter: string[];
  tags: string[];
}

export interface StdioServerConfig extends ServerCommonConfig {
  type: "stdio";
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
}

export interface HttpServerConfig extends ServerCommonConfig {
  type: "http";
  url: string;
  headers: Record<string, string>;
  transportType: "streamable-http" | "sse";
}

export type ServerConfig = StdioServerConfig | HttpServerConfig;

export interface ToolboxConfig {
  mcpServers: Record<string, ServerConfig>;
  searchTopK: number;
  cacheToolMetadata: boolean;
  processPoolSize: number;
  timeoutSeconds: number;
  idleTimeoutMs: number;
}

export interface UpstreamTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: unknown;
  outputSchema?: unknown;
}

export interface ServerEntry {
  config: ServerConfig;
  connState: "idle" | "connected" | "error" | "disabled";
  session: unknown;
  metadataCache: UpstreamTool[] | null;
  metadataStale: boolean;
  lastError: string | null;
  lastUsedAt: number | null;
  skippedTools: string[];
  failCount: number;
  nextRetryAt: number;
}

export interface SearchRow {
  server: string;
  tool: string;
  qualifiedName: string;
  summary: string;
  title?: string;
  stale?: boolean;
}

export interface SearchServerStatus {
  name: string;
  status: ServerEntry["connState"];
  toolCount: number;
  error: string | null;
  skippedTools: string[];
  stale: boolean;
}

export interface SearchResult {
  servers: SearchServerStatus[];
  tools: SearchRow[];
  total: number;
  shown: number;
  truncated: boolean;
  searched: { query: string | null; server: string | null; refresh: boolean };
}
