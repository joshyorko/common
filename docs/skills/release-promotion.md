---
name: release-promotion
description: "Promotion criteria, monthly release cadence, hotfix procedure, and artifact verification for projectbluefin/common."
---

# Release and promotion — common

Load this when cutting a release, evaluating whether a monthly tag is safe to create, doing a hotfix, or verifying signed artifacts.

## Promotion criteria

A `common` release is safe when **all** of the following are true:

| Criterion | How to verify |
|---|---|
| Post-merge E2E is green | Check `.github/workflows/e2e.yml` run on latest `main` commit |
| No open `do-not-merge` PRs targeting `main` | `gh pr list --repo projectbluefin/common --label do-not-merge` |
| No open P0 issues | `~/src/hive-status` — zero 🔴 blockers |
| Promotion-candidate E2E passed this week | Check `.github/workflows/promotion-candidate-e2e.yml` (runs Tuesdays) — no open blocker issue from it |

If any criterion fails, **do not tag a release**. File or escalate the blocker issue and wait.

> **Planned gate (common#513):** The monthly `release.yml` will be updated to run the promotion-candidate E2E as a required prerequisite job before creating the GitHub Release. Until that ships, the check above is manual.

## Monthly release cadence

- **Schedule:** 1st of every month at 00:00 UTC (`release.yml` cron)
- **Tag format:** `v<YEAR>.<MONTH>` — e.g., `v2026.06`
- **What it creates:** A GitHub Release with a changelog since the previous tag, pointing at the current `main` HEAD
- **What it does NOT do:** Promote or retag the OCI image — `:latest` is always the most recent merge to `main`

## Emergency hotfix release

When a critical fix needs a versioned tag outside the monthly window:

1. Merge the fix to `main` via normal PR process
2. Verify all promotion criteria above are met
3. Run `release.yml` manually via `workflow_dispatch` — it will tag the current `main` with the current month's tag (or create a patch tag manually with `gh release create`)
4. Notify downstream image repos if the fix affects their builds

## Supply chain — current state and planned improvements

> **Note:** Supply chain tooling for this repo is being centralized. Do not add inline signing, SBOM, or scanning logic to `build.yml`. All of that belongs in `projectbluefin/actions`.

| Practice | Current state | Tracking |
|---|---|---|
| OCI image signing | Key-based (`SIGNING_SECRET`) | Migrate to keyless via `sign-and-publish` — [common#513](https://github.com/projectbluefin/common/issues/513) |
| SBOM | None | Adopt `sign-and-publish` (includes syft) — [actions#86](https://github.com/projectbluefin/actions/issues/86) |
| SLSA L2 provenance | None | Adopt upgraded `sign-and-publish` — [actions#86](https://github.com/projectbluefin/actions/issues/86) |
| CVE scanning | None | Adopt `scan-image` composite action — [actions#86](https://github.com/projectbluefin/actions/issues/86) |
| Changelog quality | `git log` heredoc | Migrate to `git-cliff` — [common#513](https://github.com/projectbluefin/common/issues/513) |

## Verifying a published artifact

### Verify cosign signature (current — key-based)

```bash
cosign verify \
  --key https://raw.githubusercontent.com/projectbluefin/common/main/cosign.pub \
  ghcr.io/projectbluefin/common:latest
```

### Verify GitHub attestation (after common#513 ships)

```bash
gh attestation verify \
  oci://ghcr.io/projectbluefin/common:latest \
  --repo projectbluefin/common
```

### Verify SBOM attachment (after actions#86 ships)

```bash
# List attached referrers (SBOM, signatures, attestations)
oras discover ghcr.io/projectbluefin/common:latest

# Pull the SBOM
cosign verify-attestation \
  --type cyclonedx \
  ghcr.io/projectbluefin/common:latest | jq .payload | base64 -d | jq .
```

## Related docs

| Topic | Doc |
|---|---|
| CI workflow purposes | [workflow-map.md](workflow-map.md) |
| E2E gates | [e2e-ci.md](e2e-ci.md) |
| Promotion gates (QA model) | [../qa/PROMOTION_GATES.md](../qa/PROMOTION_GATES.md) |
| Supply chain tooling (shared) | [projectbluefin/actions#86](https://github.com/projectbluefin/actions/issues/86) |
