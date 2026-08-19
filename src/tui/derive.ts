import type {TuiState} from "@opencode-ai/plugin/tui";
import type {
    TuiDashboardSnapshot,
    TuiDiffFile,
    TuiDiffSummary,
    TuiHealthRow,
    TuiHealthSummary,
    TuiPermission,
    TuiQuestion,
    TuiSession,
    TuiTodoCounts,
    TuiTodoItem,
} from "./types";

const todoCount = (items: readonly TuiTodoItem[], status: string) =>
    items.filter((item) => item.status === status).length;

export const deriveTodoCounts = (items: readonly TuiTodoItem[]): TuiTodoCounts => ({
    total: items.length,
    pending: todoCount(items, "pending"),
    inProgress: todoCount(items, "in_progress"),
    completed: todoCount(items, "completed"),
    cancelled: todoCount(items, "cancelled"),
});

export const deriveTodos = (
    items: ReadonlyArray<Readonly<{content: string; status: string}>>,
): Readonly<{counts: TuiTodoCounts; items: readonly TuiTodoItem[]}> => {
    const todos: TuiTodoItem[] = items.map((item) => ({content: item.content, status: item.status}));

    return {counts: deriveTodoCounts(todos), items: todos};
};

const sum = (files: readonly TuiDiffFile[], key: "additions" | "deletions") =>
    files.reduce((total, file) => total + file[key], 0);

export const deriveDiff = (
    files: readonly TuiDiffFile[],
    summary?: Readonly<{additions: number; deletions: number; files: number}>,
): TuiDiffSummary => {
    if (files.length > 0) {
        return {files, count: files.length, additions: sum(files, "additions"), deletions: sum(files, "deletions")};
    }
    return {files: [], count: summary?.files ?? 0, additions: summary?.additions ?? 0, deletions: summary?.deletions ?? 0};
};

export const deriveHealth = (rows: readonly TuiHealthRow[]): TuiHealthSummary => {
    const healthy = rows.filter((row) => row.status === "connected").length;

    return {rows, count: rows.length, healthy, unhealthy: rows.length - healthy};
};

export const derivePending = (
    permissions: readonly Readonly<{id: string; permission: string; patterns: readonly string[]}>[],
    questions: readonly Readonly<{id: string; questions: readonly unknown[]}>[],
): TuiDashboardSnapshot["pending"] => {
    const permissionRows: TuiPermission[] = permissions.map((item) => ({
        id: item.id,
        permission: item.permission,
        patterns: item.patterns,
    }));

    const questionRows: TuiQuestion[] = questions.map((item) => ({id: item.id, count: item.questions.length}));

    return {
        permissions: permissionRows,
        questions: questionRows,
        permissionCount: permissionRows.length,
        questionCount: questionRows.reduce((total, question) => total + question.count, 0),
    };
};

export const deriveSession = (state: TuiState, sessionID: string): TuiSession => {
    const session = state.session.get(sessionID);

    const status = state.session.status(sessionID);

    return {status: status?.type, slug: session?.slug};
};

export const deriveHostSnapshot = (state: TuiState, sessionID: string): TuiDashboardSnapshot => {
    const session = state.session.get(sessionID);

    const mcpRows: TuiHealthRow[] = state.mcp().map((row) => ({id: row.name, status: row.status, error: row.error}));

    const lspRows: TuiHealthRow[] = state.lsp().map((row) => ({id: row.id, status: row.status, root: row.root}));

    return {
        session: deriveSession(state, sessionID),
        todos: deriveTodos(state.session.todo(sessionID)),
        diff: deriveDiff(state.session.diff(sessionID), session?.summary),
        mcp: deriveHealth(mcpRows),
        lsp: deriveHealth(lspRows),
        providers: {count: state.provider.length, defaultModel: state.config.model},
        vcs: {branch: state.vcs?.branch},
        pending: derivePending(state.session.permission(sessionID), state.session.question(sessionID)),
        path: state.path.directory,
    };
};
