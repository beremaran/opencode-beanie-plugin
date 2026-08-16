import {afterEach, expect, test} from "bun:test";
import {mkdtemp, readdir, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createOrchestratorJobRepository} from "./repository";
import {orchestratorJobPath} from "./path";
import {derivedOrchestratorArtifactBytes} from "./budget";
import type {OrchestratorConfig, OrchestratorJob, OrchestratorNode} from "./model";

const roots: string[] = [];
const config: OrchestratorConfig = {
    enabled: true, manager: {agent: "manager", model: "model", fanOut: 1}, coordinators: [],
    build: {agent: "build", model: "model", maxParallel: 1}, fanOutMode: "exact", failurePolicy: "fail-fast",
    limits: {maxNodes: 4, maxDurationMs: 1000, maxCoordinatorAttempts: 2, maxPromptChars: 100, maxResultChars: 100},
};

const job = (id: string, rootSessionID = "root", status: OrchestratorJob["status"] = "registered"): OrchestratorJob => ({
    id, rootSessionID, objective: "objective", title: "title", constraints: [], verification: [], config,
    graph: {nodes: [{id: `${id}-manager`, jobID: id, childIDs: [], role: "manager", layer: 0, objective: "objective", title: "title", constraints: [], verification: [], rootSessionID, attempt: 1, createdAt: "created", updatedAt: "updated", status: "registered"}], edges: []}, attempt: 1, createdAt: "created", updatedAt: "updated", status,
});

const makeRepository = async () => {
    const worktree = await mkdtemp(join(tmpdir(), "beanie-orchestrator-"));
    roots.push(worktree);
    return {worktree, repository: await createOrchestratorJobRepository({worktree, projectID: "project"})};
};

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true}))); });

test("uses project, session, and safe job path segments", async () => {
    const {worktree} = await makeRepository();
    const path = orchestratorJobPath(worktree, "project", "root", "job-1");
    expect(path).toContain("/.opencode/beanie/orchestrator/");
    expect(path.endsWith("/job-1.json")).toBe(true);
    expect(() => orchestratorJobPath(worktree, "project", "root", "../escape")).toThrow();
    expect(() => orchestratorJobPath(worktree, "project", "root", "nested/job")).toThrow();
});

test("saves, reads, replaces, and leaves no temporary files", async () => {
    const {worktree, repository} = await makeRepository();
    await repository.save(job("job-1"));
    await repository.save({...job("job-1"), title: "replacement", status: "running"});
    expect((await repository.read("root", "job-1"))?.title).toBe("replacement");
    const files = await readdir(join(worktree, ".opencode", "beanie", "orchestrator"), {recursive: true});
    expect(files.some((file) => file.endsWith(".tmp"))).toBe(false);
});

test("accepts an explicitly empty optional result", async () => {
    const {repository} = await makeRepository();
    await repository.save({...job("empty-result"), result: ""});
    expect((await repository.read("root", "empty-result"))?.result).toBe("");
});

test("serializes concurrent saves and preserves the last replacement", async () => {
    const {repository} = await makeRepository();
    await Promise.all([1, 2, 3, 4].map((number) => repository.save({...job("job-1"), title: `title-${String(number)}`})));
    expect((await repository.read("root", "job-1"))?.title).toBe("title-4");
});

test("ignores malformed and cross-session artifacts", async () => {
    const {worktree, repository} = await makeRepository();
    await Bun.write(orchestratorJobPath(worktree, "project", "root", "bad"), "not json");
    await Bun.write(orchestratorJobPath(worktree, "project", "root", "cross"), JSON.stringify({schema: "opencode-beanie.orchestrator.v1", job: job("cross", "other")}));
    expect(await repository.read("root", "bad")).toBeUndefined();
    expect(await repository.list("root")).toEqual([]);
});

test("filters identity and rejects traversal IDs", async () => {
    const {repository} = await makeRepository();
    await repository.save(job("job-a", "root-a"));
    await repository.save(job("job-b", "root-b"));
    expect((await repository.list("root-a")).map((item) => item.id)).toEqual(["job-a"]);
    expect(() => repository.save(job("../bad"))).toThrow();
    expect(() => repository.read("root", "../bad")).toThrow();
});

test("bounds serialized artifact size", async () => {
    const worktree = await mkdtemp(join(tmpdir(), "beanie-orchestrator-bounded-"));
    roots.push(worktree);
    const repository = await createOrchestratorJobRepository({worktree, projectID: "project", maxArtifactBytes: 100});
    expect(repository.save({...job("large"), objective: "x".repeat(90)})).rejects.toThrow("exceeds");
});

test("recovers active jobs and preserves terminal jobs on startup", async () => {
    const first = await makeRepository();
    await first.repository.save(job("active", "root", "running"));
    await first.repository.save(job("done", "root", "completed"));
    await first.repository.dispose();
    const second = await createOrchestratorJobRepository({worktree: first.worktree, projectID: "project"});
    const recovered = await second.read("root", "active");
    expect(recovered?.status).toBe("interrupted");
    expect(recovered?.updatedAt).not.toBe("updated");
    expect(recovered?.completedAt).toBe(recovered?.updatedAt);
    expect((await second.read("root", "done"))?.status).toBe("completed");
});

test("marks selected or all loaded jobs interrupted", async () => {
    const {repository} = await makeRepository();
    await repository.save(job("one", "root-a", "running"));
    await repository.save(job("two", "root-b", "registered"));
    await repository.markInterrupted("root-a");
    expect((await repository.read("root-a", "one"))?.status).toBe("interrupted");
    expect((await repository.read("root-b", "two"))?.status).toBe("registered");
    await repository.markInterrupted();
    expect((await repository.read("root-b", "two"))?.status).toBe("interrupted");
});

test("isolates same job IDs across sessions", async () => {
    const {repository} = await makeRepository();
    await repository.save({...job("same", "session-a"), title: "a"});
    await repository.save({...job("same", "session-b"), title: "b"});
    expect((await repository.read("session-a", "same"))?.title).toBe("a");
    expect((await repository.read("session-b", "same"))?.title).toBe("b");
    await repository.save({...job("same", "session-b"), title: "b-replaced"});
    expect((await repository.read("session-a", "same"))?.title).toBe("a");
    expect((await repository.read("session-b", "same"))?.title).toBe("b-replaced");
});

test("rejects malformed graph and config invariants", async () => {
    const worktree = await mkdtemp(join(tmpdir(), "beanie-orchestrator-invalid-"));
    roots.push(worktree);
    const node: OrchestratorNode = {id: "node", jobID: "graph", childIDs: [], role: "build", layer: 0, objective: "objective", title: "title", constraints: [], verification: [], rootSessionID: "root", attempt: 1, createdAt: "created", updatedAt: "updated", status: "registered"};
    const valid = {...job("graph"), graph: {nodes: [node], edges: []}};
    const invalid = [
        {...valid, graph: {nodes: [node, node], edges: []}},
        {...valid, graph: {nodes: [{...node, jobID: "other"}], edges: []}},
        {...valid, graph: {nodes: [node], edges: [{from: "missing", to: "node"}]}},
        {...valid, graph: {nodes: [{...node, parentID: ""}], edges: []}},
        {...valid, config: {...config, limits: {...config.limits, maxNodes: 0}}},
        {...valid, graph: {nodes: [{...node, childIDs: ["missing"]}], edges: []}},
    ];
    await Promise.all(invalid.map((value, index) => Bun.write(orchestratorJobPath(worktree, "project", "root", `invalid-${String(index)}`), JSON.stringify({schema: "opencode-beanie.orchestrator.v1", job: value}))));
    const repository = await createOrchestratorJobRepository({worktree, projectID: "project"});
    expect(await repository.list("root")).toEqual([]);
});

test("rejects a hostile under-one-megabyte graph over maxNodes", async () => {
    const worktree = await mkdtemp(join(tmpdir(), "beanie-orchestrator-hostile-"));
    roots.push(worktree);
    const bounded = {...config, limits: {...config.limits, maxNodes: 2, maxPromptChars: 100, maxResultChars: 100}};
    const base = {...job("hostile"), config: bounded};
    const node = {id: "node", jobID: "hostile", childIDs: [], role: "build" as const, layer: 0, objective: "x", title: "x", constraints: [], verification: [], rootSessionID: "root", attempt: 1, createdAt: "created", updatedAt: "updated", status: "registered" as const};
    const value = {...base, graph: {nodes: [node, {...node, id: "node-2"}, {...node, id: "node-3"}], edges: []}};
    await Bun.write(orchestratorJobPath(worktree, "project", "root", "hostile"), JSON.stringify({schema: "opencode-beanie.orchestrator.v1", job: value}));
    const repository = await createOrchestratorJobRepository({worktree, projectID: "project", maxArtifactBytes: 1024 * 1024 - 1});
    expect(await repository.read("root", "hostile")).toBeUndefined();
});

test("accepts a large legitimate bounded artifact within the derived budget", async () => {
    const worktree = await mkdtemp(join(tmpdir(), "beanie-orchestrator-large-"));
    roots.push(worktree);
    const bounded = {...config, limits: {...config.limits, maxNodes: 4, maxPromptChars: 1000, maxResultChars: 1000}};
    const repository = await createOrchestratorJobRepository({worktree, projectID: "project", maxArtifactBytes: derivedOrchestratorArtifactBytes(bounded)});
    const value = {...job("large"), config: bounded, objective: "x".repeat(400), title: "t".repeat(400), constraints: ["c".repeat(100)], verification: ["v".repeat(100)]};
    await repository.save(value);
    expect((await repository.read("root", "large"))?.objective).toHaveLength(400);
});

test("rejects multiple roots, disconnected nodes, and role-layer mismatches", async () => {
    const worktree = await mkdtemp(join(tmpdir(), "beanie-orchestrator-tree-"));
    roots.push(worktree);
    const base = job("tree");
    const manager = base.graph.nodes[0];
    if (!manager) {throw new Error("missing manager");}
    const child = {...manager, id: "child", role: "build" as const, layer: 1, parentID: manager.id};
    const invalid = [
        {...base, graph: {nodes: [manager, {...child, parentID: undefined}], edges: [{from: manager.id, to: child.id}]}},
        {...base, graph: {nodes: [manager, {...child, parentID: undefined}], edges: []}},
        {...base, graph: {nodes: [manager, {...child, role: "coordinator" as const}], edges: [{from: manager.id, to: child.id}]}},
    ];
    await Promise.all(invalid.map((value, index) => Bun.write(orchestratorJobPath(worktree, "project", "root", `tree-${String(index)}`), JSON.stringify({schema: "opencode-beanie.orchestrator.v1", job: {...value, id: `tree-${String(index)}`}}))));
    const repository = await createOrchestratorJobRepository({worktree, projectID: "project"});
    expect(await repository.list("root")).toEqual([]);
});
