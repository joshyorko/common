# Publish Loop — Test & Verification Plan

> **Purpose:** Prove the publish loop is fully automated, idempotent, self-healing, and produces all expected artifact types — without depending on a human eyes-on-glass.
>
> **Premise:** A publish loop you cannot test under failure is a publish loop you do not control. Every failure mode in [`failure-modes.md`](failure-modes.md) is paired with a verification step here.

This document complements [`publish-loop-spec.md`](publish-loop-spec.md) (the *what*) by defining *how to know it works*.

## Verification levels

| Level | Frequency | Surface | Owner |
|---|---|---|---|
| L0 — static | every PR | YAML lint, schema, SHA-pin | pre-commit |
| L1 — unit | every PR | reusable workflow inputs, composite action contracts | `actions/unit-tests.yml` |
| L2 — integration | every merge | end-to-end build → test → push → sign on a synthetic image | `actions/migration-test.yml` (extend) |
| L3 — chaos | weekly | inject failures (rate limit, token expiry, cache poison) and verify self-heal | new `actions/chaos-suite.yml` |
| L4 — full publish | monthly + on-promotion | real `:testing` → `:stable` on all four image streams | existing `promotion-candidate-e2e.yml` + `post-merge-e2e.yml` |
| L5 — installability | per stable | ISO produced, boots, OS upgrades cleanly | testsuite + `installability` gate ([#423](https://github.com/projectbluefin/common/issues/423) ✅ closed — gate implemented) |

L0–L2 are mostly in place. L3, L4 partial, L5 missing — defined below.

## L3 — Chaos suite (new)

**Goal:** Validate that every failure mode in [`failure-modes.md`](failure-modes.md) results in a self-heal, not a stuck pipeline.

### Test matrix

| Test | Fault injected | Pass criteria |
|---|---|---|
| `chaos-rate-limit` | Set `GITHUB_TOKEN` request budget to ~50 calls before invoking lifecycle | Workflow detects, sleeps, succeeds within 2× normal time |
| `chaos-registry-429` | Use a mock GHCR endpoint returning 429 for first 2 attempts | `retry` composite retries 3×, succeeds on 3rd |
| `chaos-token-expired` | Provide an expired App token to `reusable-build.yml` | `check-token-health` action fails fast with actionable error message; downstream skipped |
| `chaos-cache-corrupt` | Pre-populate cache key with garbage tarball | Build detects mismatched manifest, evicts, rebuilds; logs `cache evicted` annotation |
| `chaos-partial-publish` | Push image succeeds, signing fails (kill cosign) | Promotion gate detects unsigned digest, blocks; alert filed as issue |
| `chaos-concurrent-promote` | Trigger two promotion runs within 1 minute | Concurrency group queues; only one PR opened; second is no-op |
| `chaos-merge-queue-race` | Two PRs enter merge queue simultaneously | Queue serializes; both eventually merge or both fail with clear cause |
| `chaos-renovate-storm` | 10 Renovate PRs auto-approve in 60s | Auto-merge throttles; no rate-limit cascade |

### Implementation

`projectbluefin/actions/.github/workflows/chaos-suite.yml`:

```yaml
name: chaos-suite
on:
  schedule:
    - cron: '0 14 * * 1'  # Monday 14:00 UTC
  workflow_dispatch:
    inputs:
      test:
        description: 'Specific chaos test to run (default: all)'
        required: false
        default: 'all'

permissions:
  contents: read
  packages: write
  id-token: write
  issues: write

jobs:
  rate-limit:
    if: inputs.test == 'all' || inputs.test == 'rate-limit'
    runs-on: ubuntu-latest
    steps:
      - uses: ./actions/check-token-health
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          token_name: GITHUB_TOKEN
      - name: Burn rate-limit budget
        run: |
          for i in $(seq 1 50); do gh api rate_limit > /dev/null; done
      - name: Verify rate-limit-aware loop
        run: ./scripts/chaos/rate-limit-test.sh

  registry-429:
    if: inputs.test == 'all' || inputs.test == 'registry-429'
    runs-on: ubuntu-latest
    steps:
      - uses: ./actions/retry
        with:
          command: ./scripts/chaos/mock-429-server.sh && ./scripts/chaos/push-to-mock.sh
          max_attempts: 3
          retry_on: '429|rate limit'
      - name: Assert success on 3rd attempt
        run: ./scripts/chaos/assert-attempts.sh 3

  token-expired:
    # ... etc for each row in matrix

  report:
    needs: [rate-limit, registry-429, token-expired, cache-corrupt, partial-publish, concurrent-promote, merge-queue-race, renovate-storm]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - name: File issue on any failure (deduplicated)
        if: contains(needs.*.result, 'failure')
        uses: actions/github-script@<sha>
        with:
          script: |
            // Deduplicate: only one open [chaos] issue at a time.
            // If one already exists, comment on it instead of creating a duplicate.
            const existing = await github.rest.issues.listForRepo({
              owner: 'projectbluefin',
              repo: 'actions',
              state: 'open',
              labels: 'kind/regression,area/ci',
              per_page: 100
            });
            const dupe = existing.data.find(i => i.title.startsWith('[chaos]'));
            const link = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
            if (dupe) {
              await github.rest.issues.createComment({
                owner: 'projectbluefin',
                repo: 'actions',
                issue_number: dupe.number,
                body: `Chaos run failed again: ${link}`
              });
            } else {
              await github.rest.issues.create({
                owner: 'projectbluefin',
                repo: 'actions',
                title: `[chaos] failures detected (${new Date().toISOString().slice(0,10)})`,
                labels: ['kind/regression', 'priority/p1', 'area/ci'],
                body: `Chaos run failed. See ${link}`
              });
            }
```

A failure files an issue automatically — no human in the loop until triage.

## L4 — Full publish dry-run

**Goal:** Exercise `:testing → :stable` end-to-end without touching production tags.

### Mechanism

Use a parallel ghost registry: `ghcr.io/projectbluefin/bluefin-canary` as the dry-run target.

`projectbluefin/actions/.github/workflows/reusable-execute-release.yml` already supports a `dry_run` input (or add one — confirm in implementation). When `dry_run: true`:

1. Resolve `:testing` digest exactly as in production
2. `skopeo copy --dry-run=true` to validate manifest plumbing
3. Push to `*-canary` instead of production tag
4. Run cosign verify against the canary
5. Generate (but don't publish) GitHub Release notes
6. Skip `repository_dispatch` to ISO

### Schedule

```yaml
schedule:
  - cron: '0 6 * * *'  # daily 06:00 UTC, before Tuesday cadence

jobs:
  dry-run-promote:
    uses: projectbluefin/actions/.github/workflows/reusable-execute-release.yml@v1
    with:
      dry_run: true
      target_tag: canary
```

A dry-run failure files an issue and pages on-call. Real promotion is blocked while dry-run is red.

## L5 — Installability gate (planned)

[common#423](https://github.com/projectbluefin/common/issues/423) ✅ closed — installability gate implemented. Required before `testing → stable` for ISO-bearing images.

### Pass criteria

For each variant produced by the publish loop:

1. ISO downloads successfully from CloudFlare R2
2. `qemu-system-x86_64` boots the ISO
3. Anaconda completes auto-install (kickstart preset)
4. First boot reaches GDM/SDDM/login
5. `bootc upgrade --check` returns no errors
6. `rpm-ostree status` confirms expected pinned image digest

Implementation lives in `projectbluefin/testsuite/scenarios/installability.feature`. The publish-loop workflow gates promotion on installability test result.

## Idempotency verification

Every step in the loop must satisfy: **running it twice produces the same end state**.

| Step | Idempotency mechanism | Verification |
|---|---|---|
| `buildah push` | Identical content → identical digest → no-op overwrite | Compare `manifest.config.digest` before/after re-run |
| `cosign sign` | Rekor entry deduplication on same digest | `cosign verify` returns same UUID across runs |
| `skopeo copy` (testing→stable) | Tag move is atomic; same source digest → same outcome | After 2nd run, `crane digest` returns identical sha256 |
| `ncipollo/release-action` | `allowUpdates: true` updates body in place | Diff release body across re-runs = empty |
| ISO upload | Filename includes content sha256 → same content = same filename = no-op | R2 ETag stable across re-runs |
| `gh issue create` (chaos report) | Workflow checks for existing open issue with same title before creating | After 2nd chaos run, count of open `[chaos]` issues unchanged |

### Test

```bash
# Dry-run promotion twice in a row, assert identical end state
gh workflow run reusable-execute-release.yml -f dry_run=true -f target_tag=canary
gh run watch --exit-status
DIGEST_1=$(crane digest ghcr.io/projectbluefin/bluefin-canary:latest)

gh workflow run reusable-execute-release.yml -f dry_run=true -f target_tag=canary
gh run watch --exit-status
DIGEST_2=$(crane digest ghcr.io/projectbluefin/bluefin-canary:latest)

[ "$DIGEST_1" = "$DIGEST_2" ] || { echo "IDEMPOTENCY VIOLATION"; exit 1; }
```

This check belongs in the chaos suite as `chaos-idempotency`.

## Artifact type verification

Each promotion must produce all artifact types listed in [`publish-loop-spec.md`](publish-loop-spec.md). Acceptance test:

```bash
#!/usr/bin/env bash
# scripts/verify-publish-artifacts.sh
# Run after a stable promotion completes.
set -euo pipefail

DIGEST="$1"   # e.g. sha256:abc...
IMAGE_REF="ghcr.io/projectbluefin/bluefin@${DIGEST}"

echo "==> 1. OCI image manifest"
crane manifest "${IMAGE_REF}" > /dev/null && echo "  OK"

echo "==> 2. Cosign signature (keyless)"
cosign verify "${IMAGE_REF}" \
  --certificate-identity-regexp 'https://github\.com/projectbluefin/.+' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  > /dev/null && echo "  OK"

echo "==> 3. SBOM (CycloneDX) attached as referrer"
cosign download sbom "${IMAGE_REF}" 2>/dev/null \
  | jq -e '.bomFormat == "CycloneDX"' > /dev/null && echo "  OK"

echo "==> 4. SLSA L2 provenance attestation"
gh attestation verify "oci://${IMAGE_REF}" \
  --owner projectbluefin > /dev/null && echo "  OK"

echo "==> 5. GitHub Release exists with same digest in body"
TAG=$(gh api repos/projectbluefin/bluefin/releases/latest --jq '.tag_name')
gh release view "$TAG" --repo projectbluefin/bluefin --json body \
  --jq '.body' | grep -q "${DIGEST}" && echo "  OK"

echo "==> 6. ISO present in R2 for this stable digest"
curl -sI "https://download.projectbluefin.io/bluefin-stable.iso" \
  | grep -qi 'HTTP/.* 200' && echo "  OK"

echo "==> 7. Changelog generated by git-cliff (not raw git log)"
gh release view "$TAG" --repo projectbluefin/bluefin --json body \
  --jq '.body' | grep -q '^## ' && echo "  OK"

echo "ALL ARTIFACT TYPES VERIFIED"
```

Wire this into `actions/.github/workflows/post-publish-verify.yml` running on every merged promotion PR. A failure files an issue.

## Drill schedule

| Drill | Cadence | Reset criteria |
|---|---|---|
| L3 chaos full | Weekly | Pass = all subjobs green |
| L4 dry-run | Daily 06:00 UTC | Pass = identical digest two runs in a row |
| L5 installability | Per stable promotion | Pass = ISO boots in QEMU |
| Idempotency probe | Daily | Pass = 2× dry-run produces same digest |
| Artifact verification | Per stable promotion | Pass = all 7 types present |

## What "tested" means

The publish loop is considered tested only when:

- [ ] L0–L2 run on every PR
- [ ] L3 chaos suite has run within the past 7 days, all green
- [ ] L4 dry-run has run within the past 24 hours, identical-digest invariant held
- [ ] L5 installability ran on the most recent stable, all variants booted
- [ ] No open `[chaos]` or `[partial-publish]` issues
- [ ] `verify-publish-artifacts.sh` last run was ≤24 hours ago and exited 0

This checklist becomes the **"pre-stable" promotion gate** — automated, no human review needed beyond the existing 2-maintainer accountability gate.
