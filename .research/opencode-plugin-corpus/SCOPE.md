# OpenCode Plugin Corpus

Generated 2026-08-14T01:49:43.458Z. This inventory treats an entry as a clone candidate when it is an actual OpenCode plugin or extension, including provider/auth, hook, workflow, orchestration, and plugin-bundle repositories. Standalone MCP servers, skills managers or collections, themes, agents, projects, templates, docs-only repositories, and unrelated tools are excluded.

Sources were read from the awesome-opencode README, the opencode.cafe committed bulk/plugins.json snapshot (the live search page is client-rendered), and the official ecosystem Plugins table. Official Projects and Agents rows are recorded as exclusions. URLs are canonicalized to repository roots; subdirectories are retained where the source points inside a monorepo. Candidates are deduplicated by repository root while preserving source labels.

- Candidate repositories: 147
- Excluded source entries: 108
- Awesome source rows retained: 125
- opencode.cafe source rows retained: 12
- Official ecosystem source rows retained: 37
- Duplicate repository roots collapsed: 23

## Issues

- The live opencode.cafe search response did not expose catalog data in a static fetch; its repository snapshot was used instead.
- Classification is source-description based and not a clone-time code audit. A few bundled repositories contain MCP servers, skills, or agents as secondary components but remain candidates when the repository itself is presented as an OpenCode plugin.
