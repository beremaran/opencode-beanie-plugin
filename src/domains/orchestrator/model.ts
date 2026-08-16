export type OrchestratorRole = "manager" | "coordinator" | "build";

export type OrchestratorStatus =
  | "registered"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout"
  | "interrupted";

export type FanOutMode = "exact" | "atMost";
export type FailurePolicy = "fail-fast" | "collect";

export type SplitConfig = {
  readonly agent: string;
  readonly model: string;
  readonly fanOut: number;
};

export type CoordinatorConfig = SplitConfig;

export type BuildConfig = {
  readonly agent: string;
  readonly model: string;
  readonly maxParallel: number;
};

export type OrchestratorLimits = {
  readonly maxNodes: number;
  readonly maxDurationMs: number;
  readonly maxCoordinatorAttempts: number;
  readonly maxPromptChars: number;
  readonly maxResultChars: number;
};

export type OrchestratorConfig = {
  readonly enabled: boolean;
  readonly manager: SplitConfig;
  readonly coordinators: readonly CoordinatorConfig[];
  readonly build: BuildConfig;
  readonly fanOutMode: FanOutMode;
  readonly failurePolicy: FailurePolicy;
  readonly limits: OrchestratorLimits;
};

export type OrchestratorNode = {
  readonly id: string;
  readonly jobID: string;
  readonly parentID?: string;
  readonly childIDs: readonly string[];
  readonly role: OrchestratorRole;
  readonly layer: number;
  readonly objective: string;
  readonly title: string;
  readonly constraints: readonly string[];
  readonly verification: readonly string[];
  readonly rootSessionID: string;
  readonly childSessionID?: string;
  readonly attempt: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly result?: string;
  readonly error?: string;
  readonly status: OrchestratorStatus;
};

export type OrchestratorEdge = {
  readonly from: string;
  readonly to: string;
};

export type OrchestratorGraph = {
  readonly nodes: readonly OrchestratorNode[];
  readonly edges: readonly OrchestratorEdge[];
};

export type OrchestratorJob = {
  readonly id: string;
  readonly rootSessionID: string;
  readonly objective: string;
  readonly title: string;
  readonly constraints: readonly string[];
  readonly verification: readonly string[];
  readonly config: OrchestratorConfig;
  readonly graph: OrchestratorGraph;
  readonly attempt: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly result?: string;
  readonly error?: string;
  readonly status: OrchestratorStatus;
};
