export const TUI_REFRESH_EVENT_NAMES = [
    "session.created",
    "session.updated",
    "session.deleted",
    "session.status",
    "session.diff",
    "todo.updated",
    "lsp.updated",
    "permission.asked",
    "permission.replied",
    "question.asked",
    "question.replied",
    "question.rejected",
    "mcp.tools.changed",
    "vcs.branch.updated",
] as const;

export type TuiRefreshEventName = (typeof TUI_REFRESH_EVENT_NAMES)[number];

const names: ReadonlySet<string> = new Set(TUI_REFRESH_EVENT_NAMES);

export const isTuiRefreshEvent = (name: unknown): name is TuiRefreshEventName =>
    typeof name === "string" && names.has(name);
