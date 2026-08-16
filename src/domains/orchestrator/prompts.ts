export type PromptContext = {
  readonly objective: string;
  readonly constraints: readonly string[];
  readonly verification: readonly string[];
};

export type ChildResult = {readonly title: string; readonly result: string};

const decompositionInstructions = "You are a coordinator. Return data only as strict JSON. Do not edit files, call tools, or delegate work.";

const aggregationInstructions = "You are a coordinator. Return data only as plain text. Do not edit files, call tools, or delegate work.";

const buildInstructions = "You are a build executor. Do not decompose, delegate, or call other agents. Perform the work directly and report the outcome.";

function section(name: string, value: string): string { return `\n<${name}>\n${value}\n</${name}>`; }
function escapeDynamic(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
function list(values: readonly string[]): string { return values.map((value) => `- ${escapeDynamic(value)}`).join("\n") || "(none)"; }
function context(input: PromptContext): string { return section("objective", escapeDynamic(input.objective)) + section("constraints", list(input.constraints)) + section("verification", list(input.verification)); }

export function renderCoordinatorDecomposition(input: PromptContext): string {
  return decompositionInstructions + "\nReturn an object with a `children` array. Each child must contain only title, objective, constraints, and verification." + context(input);
}

export function renderCoordinatorAggregation(input: PromptContext, results: readonly ChildResult[]): string {
  const childResults = results.map((item) => `${section("child-title", escapeDynamic(item.title))}${section("child-result", escapeDynamic(item.result))}`).join("\n") || "(none)";

  return aggregationInstructions + "\nSynthesize the bounded child results into one concise result." + context(input) + section("child-results", childResults);
}

export function renderBuildExecution(input: PromptContext): string {
  return buildInstructions + "\nAcceptance criteria are mandatory: address every verification item and state which passed or failed." + context(input);
}
