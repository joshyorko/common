# Discord ChatOps — Skill File

## What this covers

Discord integration for the Bluefin factory: failure/release notifications and
maintainer lifecycle commands. Two channels, Botkube on ghost k3s, GitHub native
webhooks for read-only notifications.

## Stack

| Component | What it does |
|---|---|
| GitHub native webhooks → Discord | CI failure + release notifications, zero code |
| Botkube v1.14.0 on ghost k3s | Lifecycle commands in #factory |
| GitHub App "Bluefin Botkube" | Botkube → GitHub auth, no PAT |
| `mcp-discord` MCP server | Agent-driven Discord server management |
| `discord-release-notify` composite action | Posts release thread to #releases on promotion |

## Channel layout

| Channel | Type | What posts here |
|---|---|---|
| `#factory` | Text | CI failures (GitHub webhook), Botkube lifecycle commands |
| `#releases` | Forum | Release threads (one thread per release, via composite action) |

## MCP server (agent Discord management)

Config lives in `~/.copilot/mcp-config.json`. Token stored there — never in code or docs.

```json
{
  "discord": {
    "type": "local",
    "command": "/var/home/jorge/.local/share/pi-node/current/bin/npx",
    "args": ["-y", "mcp-discord"],
    "env": { "DISCORD_TOKEN": "<from ~/.copilot/mcp-config.json>" },
    "tools": ["*"]
  }
}
```

Tools available (next session after reload): create/edit channels, roles, webhooks,
forum posts, threads, message sending, permissions.

Bot name: **Bluefin** | App ID: `1519228970032169050`
Server: Project Bluefin (`1345470678408626206`)

## Lifecycle commands (#factory, anyone)

```
!fresh            — OCI digest + age for all images (reads image-polling-digests ConfigMap)
!fresh testing    — :testing images only
!fresh dakota     — Dakota stream only
!lab              — Node status + running VMs + Argo queue depth
!queue            — Open hive issues with status:queued
!building         — In-progress GHA runs across factory repos
!last-failure     — Last 3 failed workflow runs with links
```

## Release commands (#releases, Maintainer role only)

```
!release bluefin          — dispatches execute-release.yml on bluefin/main
!release bluefin-lts      — dispatches execute-release.yml on bluefin-lts/main
!release dakota           — dispatches execute-release.yml on dakota/main
!release common           — dispatches release.yml on common/main
```

## Release thread format (#releases Forum channel)

Each release = one Forum thread. Created by `discord-release-notify` composite action
at the end of `reusable-execute-release.yml`.

Thread opener (creates the thread):
- Title: `<repo> <tag>` (e.g. `bluefin v20250624.0`)
- Embed: green, clickable title linking to GitHub release, ISO timestamp
- `allowed_mentions: {"parse": []}` — prevents @everyone injection

Follow-up in thread (full detail):
- Inline embed fields: one per promoted variant (image:tag + short digest)
- `flags: 4096` (SUPPRESS_NOTIFICATIONS — no double-ping)

## Botkube RBAC note

Botkube v1.14 `rbac.groups` renders K8s ClusterRole objects — it does NOT map Discord
roles to executor authorization. The real auth boundary is **Discord channel isolation**:
`github-dispatch` executor is bound only to the channel where Maintainer role has
exclusive access (configured in Discord Developer Portal → App Commands → Permissions).

## Secrets (human-managed, never in git or docs)

| Secret | Where | Contains |
|---|---|---|
| `botkube-discord` | k8s namespace `botkube` | `token` (bot token) |
| `botkube-github-app` | k8s namespace `botkube` | `appID`, `installationID`, `privateKey` |
| `DISCORD_FACTORY_WEBHOOK` | GitHub org secrets | #factory webhook URL |
| `DISCORD_RELEASES_WEBHOOK` | GitHub org secrets | #releases webhook URL |
| Bot token | `~/.copilot/mcp-config.json` only | Never committed |

Store PEM key with `--from-file=privateKey=bluefin-botkube.pem` — never `--from-literal`.

## Upgrading Botkube

Edit `targetRevision` in `testing-lab/argocd/botkube-app.yaml`, update plugin index URL
to match version, commit. ArgoCD handles the rest.

## Adding a new repo to failure notifications

Add a GitHub webhook in repo settings:
- Failures: `<DISCORD_FACTORY_WEBHOOK>/github`, events: `workflow_run` + `check_run`
- Releases: `<DISCORD_RELEASES_WEBHOOK>/github`, events: `release` + `deployment`

No code changes needed.

## Implementation plan

Full plan: `/var/home/jorge/.copilot/session-state/eae49b79-71ff-4e41-84af-43afd84e502a/plan.md`

Tasks in order:
1. Human: create Discord bot app, invite to server
2. Agent (mcp-discord): create #factory, #releases (Forum), Maintainer role, webhooks
3. Human: create GitHub App "Bluefin Botkube", install on factory repos, store k8s secrets
4. Wire GitHub native webhooks to both channels (zero code)
5. Deploy Botkube via ArgoCD in testing-lab
6. Restrict github-dispatch to Maintainer role via Discord Developer Portal
7. Add `discord-release-notify` composite action to projectbluefin/actions
8. Wire into `reusable-execute-release.yml`

## Where each file lives

| File | Repo |
|---|---|
| `argocd/botkube-app.yaml` | `projectbluefin/testing-lab` |
| `botkube/values.yaml` | `projectbluefin/testing-lab` |
| `.github/actions/discord-release-notify/action.yml` | `projectbluefin/actions` |
| This skill file | `projectbluefin/common/docs/skills/discord-chatops.md` |
