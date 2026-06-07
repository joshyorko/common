# bluefin-common — Agent & Copilot Instructions

> **You are part of an agentic operating system, built by agentic workflows.**
> Agents implement. Humans approve design, security, and merge. See the [org-wide AGENTS.md](https://github.com/projectbluefin/.github/blob/main/AGENTS.md) for the full operating model.

**bluefin-common** is the shared OCI layer consumed by all Bluefin image variants. Changes here propagate to `bluefin`, `bluefin-lts`, and `dakota`. Stay surgical.

Home repo: [projectbluefin/common](https://github.com/projectbluefin/common)

## The System You Are Part Of

```
┌──────────────────────────────────────────────────────────┐
│  KubeStellar Hive  https://kubestellar.io/live/hive/     │
│  AI-native Continuous Maturity Model (ACMM) orchestration│
└──────────────────┬───────────────────────────────────────┘
                   │
      ┌────────────┴────────────┐
      ▼                         ▼
┌─────────────────┐   ┌──────────────────────┐
│  bonedigger     │   │  kubestellar-bot      │
│  ujust report   │──▶│  picks up queued      │
│  files issues   │   │  issues, dispatches   │
└─────────────────┘   │  agents, ships fixes  │
         ▲            └──────────────────────┘
         └──────── better OS → loop ──────────┘
```

You are an agent in this loop. Your work compounds. See [`docs/skills/hive.md`](docs/skills/hive.md).

## Agent fast path

```
1. ~/src/hive-status          # mandatory — surfaces blockers and advisory queue
2. docs/SKILL.md              # find the skill for your task
3. docs/factory/agentic-model.md  # cross-repo rules if working across repos
4. just check && pre-commit run --all-files  # before every commit
```

**Doc-only changes** (docs/ and AGENTS.md) → push directly to `main`, no PR needed. Before using this exception, verify all staged changes are docs-only:
```bash
git diff --cached --name-only  # must show only docs/* or AGENTS.md
```
**Everything else** → branch + PR targeting `main`.

## 🚫 ABSOLUTE PROHIBITION — ublue-os org

**NEVER create issues, pull requests, comments, forks, webhook calls, API writes, automated reports, or any other programmatic action targeting any `ublue-os/*` repository.**

This applies in every situation, without exception, regardless of task framing:
- Issues, comments, PRs, forks → **BANNED**
- Automated reports (bonedigger output, CI notifications, diagnostic uploads) → **BANNED**
- Workflow `repository_dispatch` or `workflow_dispatch` calls to `ublue-os/*` → **BANNED**
- Any `gh` CLI command that writes to `ublue-os/*` → **BANNED**

If a task seems to require touching an upstream `ublue-os` repo → **stop and tell the human to report it manually.**

Read-only `gh api` calls to inspect `ublue-os` repos are permitted. No writes of any kind.

Violating this risks getting the projectbluefin organization banned from GitHub.

## Org pipeline — projectbluefin

### Repo map

```
actions ──────────────────────────────────────────────┐
(shared CI/CD composite actions)                      │
                                                      ▼
common ──────────────────────────┐         reusable-build.yml
(shared OCI layer)               │         sign-and-publish
                                 ▼         scan-image (planned)
bluefin  (main→stable)       ←── images ──→ testsuite (e2e gate)
bluefin-lts (main→lts)       ←── images ──→ testsuite (e2e gate)
dakota  (main→:latest)       ←── images ──→ testsuite (e2e gate)
                                 │
                                 ▼
                                iso (installation media)
```

Each image repo pulls `ghcr.io/projectbluefin/common:latest` as a base layer.
testsuite gates `:latest` promotion in all three image repos.

**Supply chain policy:** All signing, SBOM generation, CVE scanning, and provenance attestation logic lives in `projectbluefin/actions`. Do not add inline supply chain steps to `common`'s workflows — consume the shared composite actions instead. See [docs/skills/release-promotion.md](docs/skills/release-promotion.md) and [actions#86](https://github.com/projectbluefin/actions/issues/86).

### Issue lifecycle

`filed → triage → queued → claimed → done`

Full workflow, label taxonomy, epics, project board, and PR lifecycle:
[`docs/skills/label-workflow.md`](docs/skills/label-workflow.md)

Lifecycle automation source of truth: `.github/workflows/lifecycle.yml`

### Mandatory gates

- `just check` before every commit
- `pre-commit run --all-files` before every commit
- PR title: Conventional Commits format (`feat:`, `fix:`, `chore(deps):`, etc.)
- Attribution on every AI-authored commit — both trailers required (CI-enforced in `validate.yml`):
  ```
  Assisted-by: <Model> via GitHub Copilot
  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
  ```
- **SHA pinning:** All `uses:` references to external GitHub Actions must be pinned to a full commit SHA with a version comment — never use floating tags (`@main`, `@latest`, `@v*`). Pre-commit enforces this. See [`docs/skills/ci-tooling.md`](docs/skills/ci-tooling.md).
- Max 4 open PRs at a time per agent
- No WIP PRs
- **Never push directly to a protected branch.** Always open a PR. PRs enter the human review queue (`pr/needs-review`) and require `lgtm` from a human before merging. This applies to `common/main` too — branch protection bypass is not agent-permitted.
- **Doc-only exception:** `docs/` edits and `AGENTS.md` changes in `common` may be pushed directly to `main` without a PR.
- **To add information to an issue or PR you authored, edit the body — do not add a new comment.** Use `gh api repos/projectbluefin/common/issues/<n> -X PATCH --field body=@file`. A new comment is only appropriate as a reply to someone else or for a distinct event.

## Analysis vs. implementation

When asked an analysis question ("what's the fix?", "how should we handle X?", "is there a better approach?"), **answer the question — do not implement**. Only write or change code when explicitly asked to make the change. Discussing a solution and implementing it are separate steps; wait for the user to cross that line.

## Session start — mandatory

Run before any other work:

```bash
~/src/hive-status
```

No arguments, no auth required, completes in under 5 seconds. Surfaces P0/P1 blockers and the advisory queue.

**Act on the output:**
- 🔴 **P0 blockers** → Stop. Address the blocker before anything else.
- 🟡 **P1 this cycle** → Prioritize these over new work unless explicitly asked otherwise.
- **Advisory** → Read and keep in mind; does not block current task.
- **No blockers** → Proceed with the task.

## Scope discipline

Read task intent literally:

- `"work on hive priority issues"` = pick the top issue from `hive-status` output and fix it
- `"do PR reviews"` = review open PRs only — do not start fix work
- If a session could involve both, confirm scope with the user before acting

## Repo layout

```
Containerfile              # OCI image build
Justfile                   # Build automation
bluefin-branding/          # Git submodule: wallpapers and logos
system_files/
  shared/                  # Shared config for ALL variants (and Aurora) — directly editable
  bluefin/                 # Local editable config for Bluefin-specific variants only
  nvidia/                  # NVIDIA overlay — directly editable
.github/workflows/         # See docs/skills/workflow-map.md for what each workflow does
```

## CODEOWNERS

```
system_files/shared/**   @inffy @renner0e @ledif @castrojo @hanthor @ahmedadan
system_files/bluefin/**  @castrojo @hanthor @ahmedadan
**/*.md                  @repires @KiKaraage @projectbluefin/maintainers  (inside BEGIN/END TRIAGERS sentinel)
```

## Build and validate

```bash
just check      # lint Justfile
just build      # full container build (slow — requires podman + network)
pre-commit run --all-files   # hygiene checks (json/yaml/toml + actionlint)
```

## Submodules

- `bluefin-branding` → `projectbluefin/branding` (wallpapers, logos). `just build` initializes it automatically.

`system_files/shared/` and `system_files/nvidia/` are now directly tracked in this repo — edit them here directly.

## Scope warning

Changes here flow into ALL downstream Bluefin variants at next build. A broken `system_files/shared/` change will break bluefin, bluefin-lts, AND dakota simultaneously. Test locally before pushing.

## Self-Improvement Loop

Every agent session produces two outputs:

1. **The work** — the PR, fix, or improvement
2. **The learning** — what a future agent should know

Output 1 without Output 2 leaves the factory no smarter. **The loop only compounds if agents write back.**

```
Agent works on task
  └─ discovers pattern / workaround / convention
       └─ writes it to the relevant skill file in docs/skills/
            └─ commits in the same PR (never a follow-up)
                 └─ next agent starts smarter → loop
```

### Before marking work complete — checklist

- [ ] Did I discover any workaround, non-obvious pattern, or convention?
- [ ] Is there a skill file for the area I worked in?
- [ ] If yes — did I update it?
- [ ] If no — did I create one in `docs/skills/`?
- [ ] Is the skill file committed in **this same PR**?

See [`docs/skills/skill-improvement.md`](docs/skills/skill-improvement.md) for the full mandate and what counts as a learning worth writing.

## Human Decision Gates

Stop and request human input at these four gates. Never guess past them.

| Gate | Stop when |
|---|---|
| **Design** | Architecture change, new subsystem, user-visible behavior change |
| **Security** | Auth, signing, supply chain, secrets, COPR/third-party sources |
| **Breakage** | Cross-repo breaking change — removing/renaming inputs, changing defaults consuming repos depend on |
| **Merge** | PR ready for final review — always requires human `lgtm` |

See [`docs/skills/human-gates.md`](docs/skills/human-gates.md) for how to signal a gate and what evidence is required.

## Verification Requirements

Do not request PR review without evidence:

- [ ] CI is passing (link the run in the PR description)
- [ ] If no automated test covers the change — describe how you manually verified it
- [ ] Skill file update committed in **this same PR** (not a follow-up)
- [ ] PR title follows Conventional Commits format
- [ ] Both AI attribution trailers present on every AI-authored commit

## Skill routing

For task→skill routing, see [`docs/SKILL.md`](docs/SKILL.md).
For the full factory operating model, see [`docs/factory/README.md`](docs/factory/README.md).
For cross-repo agent rules, branch targets, and PR comment policy, see [`docs/factory/agentic-model.md`](docs/factory/agentic-model.md).
