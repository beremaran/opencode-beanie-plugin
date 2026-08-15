const awesomeUrl = "https://raw.githubusercontent.com/awesome-opencode/awesome-opencode/main/README.md"
const cafeUrl = "https://raw.githubusercontent.com/R44VC0RP/opencode.cafe/main/bulk/plugins.json"
const ecosystemUrl = "https://opencode.ai/docs/ecosystem/"
const fetchedAt = new Date().toISOString()

const awesome = await (await fetch(awesomeUrl)).text()
const cafe = JSON.parse(await (await fetch(cafeUrl)).text()) as Array<Record<string, string>>
const ecosystem = await (await fetch(ecosystemUrl)).text()

type Entry = {
  name: string
  description?: string
  url: string
  source: string
  sourceSection: string
  subdirectory?: string
}
type Exclusion = Entry & { reason: string }

function repoParts(raw: string) {
  const url = raw.replace(/\.git(?=$|[?#])/, "").replace(/[?#].*$/, "").replace(/\/$/, "")
  const match = url.match(/^https?:\/\/(github\.com|gitlab\.com|codeberg\.org|gitee\.com)\/([^/]+)\/([^/]+)(\/tree\/[^/]+)?(\/.*)?$/i)
  if (!match) return { url, root: url, subdirectory: undefined }
  const root = `https://${match[1].toLowerCase()}/${match[2]}/${match[3]}`
  const treePath = `${match[4] ?? ""}${match[5] ?? ""}`
  const subdirectory = treePath.replace(/^\/tree\/[^/]+\/?/, "").replace(/^\//, "") || undefined
  return { url: root, root, subdirectory }
}

function entry(name: string, url: string, source: string, sourceSection: string, description?: string): Entry {
  const parts = repoParts(url)
  return { name: name.trim(), ...(description ? { description: description.trim() } : {}), url: parts.url, source, sourceSection, ...(parts.subdirectory ? { subdirectory: parts.subdirectory } : {}) }
}

const candidates: Entry[] = []
const excluded: Exclusion[] = []
const seen = new Map<string, Entry>()
function add(e: Entry) {
  const root = repoParts(e.url).root.toLowerCase()
  const existing = seen.get(root)
  if (existing) {
    existing.source = [existing.source, e.source].join(",")
    existing.sourceSection = [existing.sourceSection, e.sourceSection].join(",")
    if (e.subdirectory && !existing.subdirectory) existing.subdirectory = e.subdirectory
    return
  }
  seen.set(root, e)
  candidates.push(e)
}
function exclude(e: Entry, reason: string) { excluded.push({ ...e, reason }) }

const pluginStart = awesome.indexOf('<div id="plugins"></div>')
const themesStart = awesome.indexOf('<div id="themes"></div>')
const agentsStart = awesome.indexOf('<div id="agents"></div>')
const projectsStart = awesome.indexOf('<div id="projects"></div>')
const resourcesStart = awesome.indexOf('<div id="resources"></div>')

function parseAwesomeSection(start: number, end: number, section: string) {
  const text = awesome.slice(start, end)
  const blockRe = /<details>[\s\S]*?<summary>[\s\S]*?<b>([^<]+)<\/b>[\s\S]*?<\/summary>[\s\S]*?<a href="([^"]+)"[^>]*>[^<]*(?:<b>)?[^<]*(?:<\/b>)?<\/a>[\s\S]*?<\/details>/g
  for (const match of text.matchAll(blockRe)) {
    const block = match[0]
    const description = block.match(/<i>([\s\S]*?)<\/i>/)?.[1]?.replace(/<[^>]+>/g, "").replace(/\s+/g, " ")
    const e = entry(match[1], match[2], "awesome-opencode", section, description)
    const lower = `${e.name} ${e.description ?? ""} ${e.url}`.toLowerCase()
    if (!e.url.match(/^https?:\/\/(github\.com|gitlab\.com|codeberg\.org|gitee\.com)\//i)) {
      exclude(e, "not a cloneable repository URL")
    } else if (section === "plugins" && (/skills? manager|skills loader|standalone mcp|mcp server with|instructions file|plugin template|gist|typeui|openskills|manageskills|x-twitter data skill/.test(lower))) {
      exclude(e, /standalone mcp|mcp server with|x-twitter data skill/.test(lower) ? "standalone MCP server" : /skills?|typeui/.test(lower) ? "skills manager, skills collection, or prompt-only resource" : "template or non-plugin resource")
    } else if (section !== "plugins") {
      exclude(e, `${section} entry (excluded by requested scope)`)
    } else add(e)
  }
}

parseAwesomeSection(pluginStart, themesStart, "plugins")
parseAwesomeSection(themesStart, agentsStart, "themes")
parseAwesomeSection(agentsStart, projectsStart, "agents")
parseAwesomeSection(projectsStart, resourcesStart, "projects")
parseAwesomeSection(resourcesStart, awesome.length, "resources")

for (const item of cafe) {
  const e = entry(item.displayName ?? item.productId, item.repoUrl, "opencode.cafe", "plugins", item.description)
  if (/skills/.test(`${item.displayName} ${item.description}`.toLowerCase())) exclude(e, "skills manager or collection")
  else add(e)
}

const official = [
  ["opencode-daytona", "https://github.com/daytona/integrations/tree/main/packages/opencode-plugin", "Automatically run OpenCode sessions in isolated Daytona sandboxes"],
  ["opencode-helicone-session", "https://github.com/H2Shami/opencode-helicone-session", "Automatically inject Helicone session headers"],
  ["opencode-type-inject", "https://github.com/nick-vi/opencode-type-inject", "Auto-inject TypeScript/Svelte types into file reads"],
  ["opencode-openai-codex-auth", "https://github.com/numman-ali/opencode-openai-codex-auth", "Use your ChatGPT Plus/Pro subscription"],
  ["opencode-gemini-auth", "https://github.com/jenslys/opencode-gemini-auth", "Use your existing Gemini plan"],
  ["opencode-antigravity-auth", "https://github.com/NoeFabris/opencode-antigravity-auth", "Use Antigravity free models"],
  ["opencode-devcontainers", "https://github.com/athal7/opencode-devcontainers", "Multi-branch devcontainer isolation"],
  ["opencode-google-antigravity-auth", "https://github.com/shekohex/opencode-google-antigravity-auth", "Google Antigravity OAuth plugin"],
  ["opencode-dynamic-context-pruning", "https://github.com/Tarquinen/opencode-dynamic-context-pruning", "Optimize token usage"],
  ["opencode-vibeguard", "https://github.com/inkdust2021/opencode-vibeguard", "Redact secrets and PII before LLM calls"],
  ["opencode-websearch-cited", "https://github.com/ghoulr/opencode-websearch-cited", "Native websearch with citations"],
  ["opencode-pty", "https://github.com/shekohex/opencode-pty", "Background processes in a PTY"],
  ["opencode-shell-strategy", "https://github.com/JRedeker/opencode-shell-strategy", "Instructions for non-interactive shell commands"],
  ["opencode-wakatime", "https://github.com/angristan/opencode-wakatime", "Track OpenCode usage with WakaTime"],
  ["opencode-md-table-formatter", "https://github.com/franlol/opencode-md-table-formatter/tree/main", "Clean up markdown tables"],
  ["opencode-morph-plugin", "https://github.com/morphllm/opencode-morph-plugin", "Fast Apply, code search, and compaction"],
  ["oh-my-opencode", "https://github.com/code-yeongyu/oh-my-opencode", "Agents and pre-built tools"],
  ["opencode-notificator", "https://github.com/panta82/opencode-notificator", "Desktop notifications"],
  ["opencode-notifier", "https://github.com/mohak34/opencode-notifier", "Desktop notifications"],
  ["opencode-zellij-namer", "https://github.com/24601/opencode-zellij-namer", "Automatic Zellij session naming"],
  ["opencode-skillful", "https://github.com/zenobi-us/opencode-skillful", "Lazy-load prompts and skills"],
  ["opencode-supermemory", "https://github.com/supermemoryai/opencode-supermemory", "Persistent memory across sessions"],
  ["plannotator", "https://github.com/backnotprop/plannotator/tree/main/apps/opencode-plugin", "Interactive plan review"],
  ["subtask2", "https://github.com/spoons-and-mirrors/subtask2", "Orchestration system"],
  ["opencode-scheduler", "https://github.com/different-ai/opencode-scheduler", "Schedule recurring jobs"],
  ["opencode-conductor", "https://github.com/derekbar90/opencode-conductor", "Protocol-driven workflow"],
  ["micode", "https://github.com/vtemian/micode", "Brainstorm, plan, implement workflow"],
  ["octto", "https://github.com/vtemian/octto", "Interactive browser UI for brainstorming"],
  ["opencode-background-agents", "https://github.com/kdcokenny/opencode-background-agents", "Async delegation and context persistence"],
  ["opencode-notify", "https://github.com/kdcokenny/opencode-notify", "Native OS notifications"],
  ["opencode-workspace", "https://github.com/kdcokenny/opencode-workspace", "Bundled multi-agent orchestration"],
  ["opencode-worktree", "https://github.com/kdcokenny/opencode-worktree", "Git worktrees for OpenCode"],
  ["opencode-sentry-monitor", "https://github.com/stolinski/opencode-sentry-monitor", "Sentry AI monitoring"],
  ["opencode-firecrawl", "https://github.com/firecrawl/opencode-firecrawl", "Web scraping via Firecrawl CLI"],
  ["opencode-jfrog-plugin", "https://github.com/jfrog/opencode-jfrog-plugin", "JFrog integration"],
  ["opencode-goal-plugin", "https://github.com/willytop8/OpenCode-goal-plugin", "Session-scoped goal workflow"],
  ["opencode-tavily", "https://github.com/tavily-ai/opencode-tavily", "Web search and deep research"]
] as const
for (const [name, url, description] of official) add(entry(name, url, "opencode.ai", "Plugins", description))

const officialProjects = [
  ["kimaki", "https://github.com/remorses/kimaki"], ["opencode.nvim", "https://github.com/NickvanDyke/opencode.nvim"], ["portal", "https://github.com/hosenur/portal"], ["opencode plugin template", "https://github.com/zenobi-us/opencode-plugin-template/"], ["opencode.nvim", "https://github.com/sudo-tee/opencode.nvim"], ["ai-sdk-provider-opencode-sdk", "https://github.com/ben-vargas/ai-sdk-provider-opencode-sdk"], ["OpenChamber", "https://github.com/btriapitsyn/openchamber"], ["OpenCode-Obsidian", "https://github.com/mtymek/opencode-obsidian"], ["OpenWork", "https://github.com/different-ai/openwork"], ["ocx", "https://github.com/kdcokenny/ocx"], ["CodeNomad", "https://github.com/NeuralNomadsAI/CodeNomad"]
] as const
for (const [name, url] of officialProjects) exclude(entry(name, url, "opencode.ai", "Projects"), "official Projects row (excluded by requested scope)")
const officialAgents = [["Agentic", "https://github.com/Cluster444/agentic"], ["opencode-agents", "https://github.com/darrenhinde/opencode-agents"]] as const
for (const [name, url] of officialAgents) exclude(entry(name, url, "opencode.ai", "Agents"), "official Agents row (excluded by requested scope)")

const roots = new Set(candidates.map((e) => repoParts(e.url).root.toLowerCase()))
for (const e of excluded) if (roots.has(repoParts(e.url).root.toLowerCase())) e.reason += "; same repository retained as a plugin candidate"

const manifest = {
  schemaVersion: 1,
  generatedAt: fetchedAt,
  clonePolicy: "Clone repository roots only; use subdirectory when present.",
  sources: [
    { id: "awesome-opencode", label: "awesome-opencode", url: "https://github.com/awesome-opencode/awesome-opencode", snapshot: awesomeUrl, retrievedAt: fetchedAt, sections: { plugins: awesome.slice(pluginStart, themesStart).match(/<details>/g)?.length ?? 0 } },
    { id: "opencode.cafe", label: "opencode.cafe", url: "https://www.opencode.cafe/search", snapshot: cafeUrl, retrievedAt: fetchedAt, catalogType: "committed bulk/plugins.json", entries: cafe.length },
    { id: "opencode.ai", label: "opencode.ai ecosystem", url: ecosystemUrl, snapshot: ecosystemUrl, retrievedAt: fetchedAt, entries: official.length }
  ],
  candidates,
  excluded,
  counts: { candidates: candidates.length, excluded: excluded.length, sourceRows: { awesome: candidates.filter((e) => e.source.includes("awesome-opencode")).length, cafe: candidates.filter((e) => e.source.includes("opencode.cafe")).length, official: candidates.filter((e) => e.source.includes("opencode.ai")).length }, duplicateRepositoriesCollapsed: candidates.filter((e) => e.source.includes(",")).length }
}
await Bun.write(".research/opencode-plugin-corpus/manifest.json", JSON.stringify(manifest, null, 2) + "\n")
await Bun.write(".research/opencode-plugin-corpus/SCOPE.md", `# OpenCode Plugin Corpus\n\nGenerated ${fetchedAt}. This inventory treats an entry as a clone candidate when it is an actual OpenCode plugin or extension, including provider/auth, hook, workflow, orchestration, and plugin-bundle repositories. Standalone MCP servers, skills managers or collections, themes, agents, projects, templates, docs-only repositories, and unrelated tools are excluded.\n\nSources were read from the awesome-opencode README, the opencode.cafe committed bulk/plugins.json snapshot (the live search page is client-rendered), and the official ecosystem Plugins table. Official Projects and Agents rows are recorded as exclusions. URLs are canonicalized to repository roots; subdirectories are retained where the source points inside a monorepo. Candidates are deduplicated by repository root while preserving source labels.\n\n- Candidate repositories: ${candidates.length}\n- Excluded source entries: ${excluded.length}\n- Awesome source rows retained: ${manifest.counts.sourceRows.awesome}\n- opencode.cafe source rows retained: ${manifest.counts.sourceRows.cafe}\n- Official ecosystem source rows retained: ${manifest.counts.sourceRows.official}\n- Duplicate repository roots collapsed: ${manifest.counts.duplicateRepositoriesCollapsed}\n\n## Issues\n\n- The live opencode.cafe search response did not expose catalog data in a static fetch; its repository snapshot was used instead.\n- Classification is source-description based and not a clone-time code audit. A few bundled repositories contain MCP servers, skills, or agents as secondary components but remain candidates when the repository itself is presented as an OpenCode plugin.\n`)
