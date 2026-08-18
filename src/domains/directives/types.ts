export type MechanismName =
  | "goal"
  | "orchestrator"
  | "throttle"
  | "skillbox"
  | "toolbox"
  | "providers"
  | "configurator";

export interface DirectivesOptions {
  defaults?: boolean;
  system?: string[];
  tools?: Record<string, string>;
  mechanisms?: string[];
}

export interface ResolvedDirectivesOptions {
  defaults: boolean;
  system: string[];
  tools: Record<string, string>;
  mechanisms: string[];
}
