# OpenCode Plugin Corpus Clone Audit

Generated: 2026-08-14T03:29:55.642Z

Clone-result files audited: `clone-results-0-48.json`, `clone-results-49-97.json`, `clone-results-98-146.json`.

## Findings

- Manifest candidates: 147
- Unique canonical repository roots: 147
- Actual Git directories: 147
- Verified candidate analysis worktrees: 147
- Unresolved candidates: 0
- Candidates belonging to duplicate canonical roots: 0
- Extra Git directories not referenced by the manifest: 0
- Repair performed: cloned missing indices 49-97 with --depth 1; existing clone contents were not modified.

## Cause Of Indices 49-97 Failure

clone-results-49-97.json is internally inconsistent with the filesystem: it marks index 49 as skipped and indices 50-97 as succeeded, but the recorded paths for all 49 indices were absent. The first result file (0-48) is consistent. The existing 98 directories were the 49 roots for indices 0-48 plus 49 roots for indices 98-146, leaving the middle range unmaterialized. Analysts resolving the recorded paths therefore received missing worktrees. No existing directory had a different remote for a requested candidate, so no clone contents were overwritten and no collision rename was required.

## Candidate Verification

| Index | URL | Clone path | Duplicate root | Verification |
|---:|---|---|:---:|---|
| 0 | https://github.com/bluelovers/opencode-arise | `.research/opencode-plugin-corpus/repos/bluelovers--opencode-arise` | no | verified |
| 1 | https://github.com/aerovato/opencode-quotes-plugin | `.research/opencode-plugin-corpus/repos/aerovato--opencode-quotes-plugin` | no | verified |
| 2 | https://github.com/gotgenes/opencode-agent-identity | `.research/opencode-plugin-corpus/repos/gotgenes--opencode-agent-identity` | no | verified |
| 3 | https://github.com/joshuadavidthomas/opencode-agent-memory | `.research/opencode-plugin-corpus/repos/joshuadavidthomas--opencode-agent-memory` | no | verified |
| 4 | https://github.com/NoeFabris/opencode-antigravity-auth | `.research/opencode-plugin-corpus/repos/noefabris--opencode-antigravity-auth` | no | verified |
| 5 | https://github.com/theblazehen/opencode-antigravity-multi-auth | `.research/opencode-plugin-corpus/repos/theblazehen--opencode-antigravity-multi-auth` | no | verified |
| 6 | https://github.com/pawelma/opencode-autotitle | `.research/opencode-plugin-corpus/repos/pawelma--opencode-autotitle` | no | verified |
| 7 | https://github.com/zenobi-us/opencode-background | `.research/opencode-plugin-corpus/repos/zenobi-us--opencode-background` | no | verified |
| 8 | https://github.com/kdcokenny/opencode-background-agents | `.research/opencode-plugin-corpus/repos/kdcokenny--opencode-background-agents` | no | verified |
| 9 | https://github.com/joshuadavidthomas/opencode-beads | `.research/opencode-plugin-corpus/repos/joshuadavidthomas--opencode-beads` | no | verified |
| 10 | https://github.com/ZanzyTHEbar/brhp | `.research/opencode-plugin-corpus/repos/zanzythebar--brhp` | no | verified |
| 11 | https://github.com/kenryu42/claude-code-safety-net | `.research/opencode-plugin-corpus/repos/kenryu42--claude-code-safety-net` | no | verified |
| 12 | https://github.com/JasonLandbridge/opencode-ccs-sync | `.research/opencode-plugin-corpus/repos/jasonlandbridge--opencode-ccs-sync` | no | verified |
| 13 | https://github.com/shihyuho/opencode-command-inject | `.research/opencode-plugin-corpus/repos/shihyuho--opencode-command-inject` | no | verified |
| 14 | https://github.com/IgorWarzocha/Opencode-Context-Analysis-Plugin | `.research/opencode-plugin-corpus/repos/igorwarzocha--opencode-context-analysis-plugin` | no | verified |
| 15 | https://github.com/xberg-io/plugins | `.research/opencode-plugin-corpus/repos/xberg-io--plugins` | no | verified |
| 16 | https://github.com/CrewBeeLab/CrewBee | `.research/opencode-plugin-corpus/repos/crewbeelab--crewbee` | no | verified |
| 17 | https://github.com/athal7/opencode-devcontainers | `.research/opencode-plugin-corpus/repos/athal7--opencode-devcontainers` | no | verified |
| 18 | https://github.com/simonwjackson/opencode-direnv | `.research/opencode-plugin-corpus/repos/simonwjackson--opencode-direnv` | no | verified |
| 19 | https://github.com/dodopayments/dodo-agent-plugin | `.research/opencode-plugin-corpus/repos/dodopayments--dodo-agent-plugin` | no | verified |
| 20 | https://github.com/Tarquinen/opencode-dynamic-context-pruning | `.research/opencode-plugin-corpus/repos/tarquinen--opencode-dynamic-context-pruning` | no | verified |
| 21 | https://github.com/boxpositron/envsitter-guard | `.research/opencode-plugin-corpus/repos/boxpositron--envsitter-guard` | no | verified |
| 22 | https://github.com/DVNghiem/FlowDeck | `.research/opencode-plugin-corpus/repos/dvnghiem--flowdeck` | no | verified |
| 23 | https://github.com/forloop-cc/forloop-opencode-plugin-planner | `.research/opencode-plugin-corpus/repos/forloop-cc--forloop-opencode-plugin-planner` | no | verified |
| 24 | https://github.com/smartfrog/opencode-froggy | `.research/opencode-plugin-corpus/repos/smartfrog--opencode-froggy` | no | verified |
| 25 | https://github.com/jenslys/opencode-gemini-auth | `.research/opencode-plugin-corpus/repos/jenslys--opencode-gemini-auth` | no | verified |
| 26 | https://github.com/amestsantim/opencode-github-release | `.research/opencode-plugin-corpus/repos/amestsantim--opencode-github-release` | no | verified |
| 27 | https://github.com/IgorWarzocha/Opencode-Google-AI-Search-Plugin | `.research/opencode-plugin-corpus/repos/igorwarzocha--opencode-google-ai-search-plugin` | no | verified |
| 28 | https://github.com/hffmnnj/opencode-goopspec | `.research/opencode-plugin-corpus/repos/hffmnnj--opencode-goopspec` | no | verified |
| 29 | https://github.com/yuji-hatakeyama/opencode-gpt-imagegen | `.research/opencode-plugin-corpus/repos/yuji-hatakeyama--opencode-gpt-imagegen` | no | verified |
| 30 | https://github.com/joshuadavidthomas/opencode-handoff | `.research/opencode-plugin-corpus/repos/joshuadavidthomas--opencode-handoff` | no | verified |
| 31 | https://github.com/smc2315/harness-memory | `.research/opencode-plugin-corpus/repos/smc2315--harness-memory` | no | verified |
| 32 | https://github.com/HiAi-gg/hiai-opencode | `.research/opencode-plugin-corpus/repos/hiai-gg--hiai-opencode` | no | verified |
| 33 | https://github.com/plastic-labs/opencode-honcho | `.research/opencode-plugin-corpus/repos/plastic-labs--opencode-honcho` | no | verified |
| 34 | https://github.com/Looted/kibi | `.research/opencode-plugin-corpus/repos/looted--kibi` | no | verified |
| 35 | https://github.com/JungHoonGhae/opencode-kilo-auth | `.research/opencode-plugin-corpus/repos/junghoonghae--opencode-kilo-auth` | no | verified |
| 36 | https://github.com/xenitV1/lemma | `.research/opencode-plugin-corpus/repos/xenitv1--lemma` | no | verified |
| 37 | https://github.com/cortexkit/opencode-magic-context | `.research/opencode-plugin-corpus/repos/cortexkit--opencode-magic-context` | no | verified |
| 38 | https://github.com/vtemian/micode | `.research/opencode-plugin-corpus/repos/vtemian--micode` | no | verified |
| 39 | https://github.com/ramarivera/opencode-model-announcer | `.research/opencode-plugin-corpus/repos/ramarivera--opencode-model-announcer` | no | verified |
| 40 | https://github.com/JRedeker/opencode-morph-fast-apply | `.research/opencode-plugin-corpus/repos/jredeker--opencode-morph-fast-apply` | no | verified |
| 41 | https://github.com/one-bit/oc-mnemoria | `.research/opencode-plugin-corpus/repos/one-bit--oc-mnemoria` | no | verified |
| 42 | https://github.com/code-yeongyu/oh-my-opencode | `.research/opencode-plugin-corpus/repos/code-yeongyu--oh-my-opencode` | no | verified |
| 43 | https://github.com/alvinunreal/oh-my-opencode-slim | `.research/opencode-plugin-corpus/repos/alvinunreal--oh-my-opencode-slim` | no | verified |
| 44 | https://github.com/Alph4d0g/opencode-omniroute-auth | `.research/opencode-plugin-corpus/repos/alph4d0g--opencode-omniroute-auth` | no | verified |
| 45 | https://github.com/martinzokov/open-conclave | `.research/opencode-plugin-corpus/repos/martinzokov--open-conclave` | no | verified |
| 46 | https://github.com/Suraj1235/open-dynamic-workflows | `.research/opencode-plugin-corpus/repos/suraj1235--open-dynamic-workflows` | no | verified |
| 47 | https://github.com/ndom91/open-plan-annotator | `.research/opencode-plugin-corpus/repos/ndom91--open-plan-annotator` | no | verified |
| 48 | https://github.com/numman-ali/opencode-openai-codex-auth | `.research/opencode-plugin-corpus/repos/numman-ali--opencode-openai-codex-auth` | no | verified |
| 49 | https://github.com/ian-pascoe/opencode-adaptive-thinking | `.research/opencode-plugin-corpus/repos/ian-pascoe--opencode-adaptive-thinking` | no | verified |
| 50 | https://github.com/AnganSamadder/opencode-agent-tmux | `.research/opencode-plugin-corpus/repos/angansamadder--opencode-agent-tmux` | no | verified |
| 51 | https://github.com/Mark1708/opencode-agents-sidebar | `.research/opencode-plugin-corpus/repos/mark1708--opencode-agents-sidebar` | no | verified |
| 52 | https://github.com/mailshieldai/opencode-canvas | `.research/opencode-plugin-corpus/repos/mailshieldai--opencode-canvas` | no | verified |
| 53 | https://github.com/DJOCKER-FACE/opencode-chromium-browser-plugin | `.research/opencode-plugin-corpus/repos/djocker-face--opencode-chromium-browser-plugin` | no | verified |
| 54 | https://github.com/kuitos/opencode-claude-memory | `.research/opencode-plugin-corpus/repos/kuitos--opencode-claude-memory` | no | verified |
| 55 | https://github.com/hueyexe/opencode-ensemble | `.research/opencode-plugin-corpus/repos/hueyexe--opencode-ensemble` | no | verified |
| 56 | https://github.com/romain325/opencode-hooks-plugin | `.research/opencode-plugin-corpus/repos/romain325--opencode-hooks-plugin` | no | verified |
| 57 | https://github.com/Zaradacht/opencode-host-notify-bridge | `.research/opencode-plugin-corpus/repos/zaradacht--opencode-host-notify-bridge` | no | verified |
| 58 | https://github.com/lgladysz/opencode-ignore | `.research/opencode-plugin-corpus/repos/lgladysz--opencode-ignore` | no | verified |
| 59 | https://github.com/yuseferi/opencode-litellm | `.research/opencode-plugin-corpus/repos/yuseferi--opencode-litellm` | no | verified |
| 60 | https://github.com/errhythm/opencode-log-sanitizer | `.research/opencode-plugin-corpus/repos/errhythm--opencode-log-sanitizer` | no | verified |
| 61 | https://github.com/tickernelz/opencode-mem | `.research/opencode-plugin-corpus/repos/tickernelz--opencode-mem` | no | verified |
| 62 | https://github.com/nigel-dev/opencode-mission-control | `.research/opencode-plugin-corpus/repos/nigel-dev--opencode-mission-control` | no | verified |
| 63 | https://github.com/yuhp/opencode-models-discovery | `.research/opencode-plugin-corpus/repos/yuhp--opencode-models-discovery` | no | verified |
| 64 | https://github.com/kdcokenny/opencode-notify | `.research/opencode-plugin-corpus/repos/kdcokenny--opencode-notify` | no | verified |
| 65 | https://github.com/lannuttia/opencode-ntfy.sh | `.research/opencode-plugin-corpus/repos/lannuttia--opencode-ntfy.sh` | no | verified |
| 66 | https://github.com/yurihbm/opencode-plan-manager | `.research/opencode-plugin-corpus/repos/yurihbm--opencode-plan-manager` | no | verified |
| 67 | https://github.com/baranwang/opencode-provider-alias | `.research/opencode-plugin-corpus/repos/baranwang--opencode-provider-alias` | no | verified |
| 68 | https://github.com/slkiser/opencode-quota | `.research/opencode-plugin-corpus/repos/slkiser--opencode-quota` | no | verified |
| 69 | https://github.com/IgorWarzocha/Opencode-Roadmap | `.research/opencode-plugin-corpus/repos/igorwarzocha--opencode-roadmap` | no | verified |
| 70 | https://github.com/malhashemi/opencode-sessions | `.research/opencode-plugin-corpus/repos/malhashemi--opencode-sessions` | no | verified |
| 71 | https://github.com/JosXa/opencode-snippets | `.research/opencode-plugin-corpus/repos/josxa--opencode-snippets` | no | verified |
| 72 | https://github.com/zaxbysauce/opencode-swarm | `.research/opencode-plugin-corpus/repos/zaxbysauce--opencode-swarm` | no | verified |
| 73 | https://github.com/iHildy/opencode-synced | `.research/opencode-plugin-corpus/repos/ihildy--opencode-synced` | no | verified |
| 74 | https://github.com/agostinilabsrl/opencode-telemetry | `.research/opencode-plugin-corpus/repos/agostinilabsrl--opencode-telemetry` | no | verified |
| 75 | https://github.com/Howardzhangdqs/opencode-throughput | `.research/opencode-plugin-corpus/repos/howardzhangdqs--opencode-throughput` | no | verified |
| 76 | https://github.com/eserete/opencode-token-tracker | `.research/opencode-plugin-corpus/repos/eserete--opencode-token-tracker` | no | verified |
| 77 | https://github.com/StefanoChiodino/opencode-tts | `.research/opencode-plugin-corpus/repos/stefanochiodino--opencode-tts` | no | verified |
| 78 | https://github.com/tim-hilde/opencode-update-notifier | `.research/opencode-plugin-corpus/repos/tim-hilde--opencode-update-notifier` | no | verified |
| 79 | https://github.com/Mark1708/opencode-usage-monitor | `.research/opencode-plugin-corpus/repos/mark1708--opencode-usage-monitor` | no | verified |
| 80 | https://github.com/psinetron/opencode-visualiser | `.research/opencode-plugin-corpus/repos/psinetron--opencode-visualiser` | no | verified |
| 81 | https://github.com/RoderickQiu/opencode-workaholic | `.research/opencode-plugin-corpus/repos/roderickqiu--opencode-workaholic` | no | verified |
| 82 | https://github.com/kdcokenny/opencode-workspace | `.research/opencode-plugin-corpus/repos/kdcokenny--opencode-workspace` | no | verified |
| 83 | https://github.com/kdcokenny/opencode-worktree | `.research/opencode-plugin-corpus/repos/kdcokenny--opencode-worktree` | no | verified |
| 84 | https://github.com/d3vv3/opencode-ascii | `.research/opencode-plugin-corpus/repos/d3vv3--opencode-ascii` | no | verified |
| 85 | https://github.com/Alex-stack-cell/opencode-bmad-workflow | `.research/opencode-plugin-corpus/repos/alex-stack-cell--opencode-bmad-workflow` | no | verified |
| 86 | https://github.com/vbgate/opencode-mystatus | `.research/opencode-plugin-corpus/repos/vbgate--opencode-mystatus` | no | verified |
| 87 | https://github.com/joostvanwollingen/opencode-personality | `.research/opencode-plugin-corpus/repos/joostvanwollingen--opencode-personality` | no | verified |
| 88 | https://github.com/DEVtheOPS/opencode-plugin-otel | `.research/opencode-plugin-corpus/repos/devtheops--opencode-plugin-otel` | no | verified |
| 89 | https://github.com/sun-praise/opencode-review | `.research/opencode-plugin-corpus/repos/sun-praise--opencode-review` | no | verified |
| 90 | https://github.com/andrejtonev/opencode-short-term-memory | `.research/opencode-plugin-corpus/repos/andrejtonev--opencode-short-term-memory` | no | verified |
| 91 | https://github.com/VincentHardouin/opencode-snip | `.research/opencode-plugin-corpus/repos/vincenthardouin--opencode-snip` | no | verified |
| 92 | https://github.com/MrDoe/OpenCodeRAG | `.research/opencode-plugin-corpus/repos/mrdoe--opencoderag` | no | verified |
| 93 | https://github.com/open-hax/codex | `.research/opencode-plugin-corpus/repos/open-hax--codex` | no | verified |
| 94 | https://github.com/Octane0411/opencode-plugin-openspec | `.research/opencode-plugin-corpus/repos/octane0411--opencode-plugin-openspec` | no | verified |
| 95 | https://github.com/Lyapsus/opencode-optimal-model-temps | `.research/opencode-plugin-corpus/repos/lyapsus--opencode-optimal-model-temps` | no | verified |
| 96 | https://github.com/useorgx/orgx-opencode-plugin | `.research/opencode-plugin-corpus/repos/useorgx--orgx-opencode-plugin` | no | verified |
| 97 | https://github.com/athal7/opencode-pilot | `.research/opencode-plugin-corpus/repos/athal7--opencode-pilot` | no | verified |
| 98 | https://github.com/backnotprop/plannotator | `.research/opencode-plugin-corpus/repos/backnotprop--plannotator` | no | verified |
| 99 | https://github.com/spoons-and-mirrors/pocket-universe | `.research/opencode-plugin-corpus/repos/spoons-and-mirrors--pocket-universe` | no | verified |
| 100 | https://github.com/arttttt/opencode-pr-signature | `.research/opencode-plugin-corpus/repos/arttttt--opencode-pr-signature` | no | verified |
| 101 | https://github.com/Th0rgal/opencode-ralph-wiggum | `.research/opencode-plugin-corpus/repos/th0rgal--opencode-ralph-wiggum` | no | verified |
| 102 | https://github.com/saim-x/opencode-research-papers | `.research/opencode-plugin-corpus/repos/saim-x--opencode-research-papers` | no | verified |
| 103 | https://github.com/JensGrote/opencode-semantic-anchors | `.research/opencode-plugin-corpus/repos/jensgrote--opencode-semantic-anchors` | no | verified |
| 104 | https://github.com/JRedeker/opencode-shell-strategy | `.research/opencode-plugin-corpus/repos/jredeker--opencode-shell-strategy` | no | verified |
| 105 | https://github.com/cnicolov/opencode-plugin-simple-memory | `.research/opencode-plugin-corpus/repos/cnicolov--opencode-plugin-simple-memory` | no | verified |
| 106 | https://github.com/Yusuzhan/opencode-simple-notify | `.research/opencode-plugin-corpus/repos/yusuzhan--opencode-simple-notify` | no | verified |
| 107 | https://github.com/Tarquinen/opencode-smart-title | `.research/opencode-plugin-corpus/repos/tarquinen--opencode-smart-title` | no | verified |
| 108 | https://github.com/MasuRii/opencode-smart-voice-notify | `.research/opencode-plugin-corpus/repos/masurii--opencode-smart-voice-notify` | no | verified |
| 109 | https://github.com/raisbecka/opencode-subagent-output | `.research/opencode-plugin-corpus/repos/raisbecka--opencode-subagent-output` | no | verified |
| 110 | https://github.com/spoons-and-mirrors/subtask2 | `.research/opencode-plugin-corpus/repos/spoons-and-mirrors--subtask2` | no | verified |
| 111 | https://github.com/joelhooks/opencode-swarm-plugin | `.research/opencode-plugin-corpus/repos/joelhooks--opencode-swarm-plugin` | no | verified |
| 112 | https://github.com/tlinhart/opencode-system-prompt-logger | `.research/opencode-plugin-corpus/repos/tlinhart--opencode-system-prompt-logger` | no | verified |
| 113 | https://github.com/Ainsley0917/opencode-token-monitor | `.research/opencode-plugin-corpus/repos/ainsley0917--opencode-token-monitor` | no | verified |
| 114 | https://github.com/ramtinJ95/opencode-tokenscope | `.research/opencode-plugin-corpus/repos/ramtinj95--opencode-tokenscope` | no | verified |
| 115 | https://github.com/mmynsted/opencode-toon-config-plugin | `.research/opencode-plugin-corpus/repos/mmynsted--opencode-toon-config-plugin` | no | verified |
| 116 | https://gitee.com/ulthon/ul-opencode-event | `.research/opencode-plugin-corpus/repos/ulthon--ul-opencode-event` | no | verified |
| 117 | https://codeberg.org/bastiangx/opencode-unmoji | `.research/opencode-plugin-corpus/repos/bastiangx--opencode-unmoji` | no | verified |
| 118 | https://github.com/Wangmerlyn/vibe-coding-slack-notifier | `.research/opencode-plugin-corpus/repos/wangmerlyn--vibe-coding-slack-notifier` | no | verified |
| 119 | https://github.com/angristan/opencode-wakatime | `.research/opencode-plugin-corpus/repos/angristan--opencode-wakatime` | no | verified |
| 120 | https://github.com/pantheon-org/opencode-warcraft-notifications | `.research/opencode-plugin-corpus/repos/pantheon-org--opencode-warcraft-notifications` | no | verified |
| 121 | https://github.com/boxpositron/with-context-mcp | `.research/opencode-plugin-corpus/repos/boxpositron--with-context-mcp` | no | verified |
| 122 | https://github.com/Edison-A-N/opencode-worktree-memory-sync | `.research/opencode-plugin-corpus/repos/edison-a-n--opencode-worktree-memory-sync` | no | verified |
| 123 | https://github.com/Xquik-dev/x-twitter-scraper | `.research/opencode-plugin-corpus/repos/xquik-dev--x-twitter-scraper` | no | verified |
| 124 | https://github.com/24601/opencode-zellij-namer | `.research/opencode-plugin-corpus/repos/24601--opencode-zellij-namer` | no | verified |
| 125 | https://github.com/H2Shami/opencode-helicone-session | `.research/opencode-plugin-corpus/repos/h2shami--opencode-helicone-session` | no | verified |
| 126 | https://github.com/nick-vi/opencode-type-inject | `.research/opencode-plugin-corpus/repos/nick-vi--opencode-type-inject` | no | verified |
| 127 | https://github.com/shekohex/opencode-google-antigravity-auth | `.research/opencode-plugin-corpus/repos/shekohex--opencode-google-antigravity-auth` | no | verified |
| 128 | https://github.com/Opencode-DCP/opencode-dynamic-context-pruning | `.research/opencode-plugin-corpus/repos/opencode-dcp--opencode-dynamic-context-pruning` | no | verified |
| 129 | https://github.com/ghoulr/opencode-websearch-cited | `.research/opencode-plugin-corpus/repos/ghoulr--opencode-websearch-cited` | no | verified |
| 130 | https://github.com/shekohex/opencode-pty | `.research/opencode-plugin-corpus/repos/shekohex--opencode-pty` | no | verified |
| 131 | https://github.com/franlol/opencode-md-table-formatter | `.research/opencode-plugin-corpus/repos/franlol--opencode-md-table-formatter` | no | verified |
| 132 | https://github.com/daytona/integrations | `.research/opencode-plugin-corpus/repos/daytona--integrations` | no | verified |
| 133 | https://github.com/inkdust2021/opencode-vibeguard | `.research/opencode-plugin-corpus/repos/inkdust2021--opencode-vibeguard` | no | verified |
| 134 | https://github.com/morphllm/opencode-morph-plugin | `.research/opencode-plugin-corpus/repos/morphllm--opencode-morph-plugin` | no | verified |
| 135 | https://github.com/panta82/opencode-notificator | `.research/opencode-plugin-corpus/repos/panta82--opencode-notificator` | no | verified |
| 136 | https://github.com/mohak34/opencode-notifier | `.research/opencode-plugin-corpus/repos/mohak34--opencode-notifier` | no | verified |
| 137 | https://github.com/zenobi-us/opencode-skillful | `.research/opencode-plugin-corpus/repos/zenobi-us--opencode-skillful` | no | verified |
| 138 | https://github.com/supermemoryai/opencode-supermemory | `.research/opencode-plugin-corpus/repos/supermemoryai--opencode-supermemory` | no | verified |
| 139 | https://github.com/different-ai/opencode-scheduler | `.research/opencode-plugin-corpus/repos/different-ai--opencode-scheduler` | no | verified |
| 140 | https://github.com/derekbar90/opencode-conductor | `.research/opencode-plugin-corpus/repos/derekbar90--opencode-conductor` | no | verified |
| 141 | https://github.com/vtemian/octto | `.research/opencode-plugin-corpus/repos/vtemian--octto` | no | verified |
| 142 | https://github.com/stolinski/opencode-sentry-monitor | `.research/opencode-plugin-corpus/repos/stolinski--opencode-sentry-monitor` | no | verified |
| 143 | https://github.com/firecrawl/opencode-firecrawl | `.research/opencode-plugin-corpus/repos/firecrawl--opencode-firecrawl` | no | verified |
| 144 | https://github.com/jfrog/opencode-jfrog-plugin | `.research/opencode-plugin-corpus/repos/jfrog--opencode-jfrog-plugin` | no | verified |
| 145 | https://github.com/willytop8/OpenCode-goal-plugin | `.research/opencode-plugin-corpus/repos/willytop8--opencode-goal-plugin` | no | verified |
| 146 | https://github.com/tavily-ai/opencode-tavily | `.research/opencode-plugin-corpus/repos/tavily-ai--opencode-tavily` | no | verified |

## Unresolved Failures

None.
