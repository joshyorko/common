---
name: e2e-ci
description: "Pre/post-merge E2E CI for common — composed PR gate, testing-stream checks, masked brew setup, quarantined scenarios."
---

# E2E CI

## Post-merge E2E

**File:** `.github/workflows/e2e.yml`

- Runs after merges to `main`
- Calls the local `.github/workflows/run-testsuite.yml` wrapper, which centralizes the pinned `projectbluefin/testsuite` SHA
- Validates the common layer against three downstream images:
  - `ghcr.io/ublue-os/bluefin:latest`
  - `ghcr.io/ublue-os/bluefin:lts`
  - `ghcr.io/projectbluefin/dakota:latest`
- Uses SSH-mode tests from the runner, so the common suite does not require a full GNOME session

## Pre-merge gate

**File:** `.github/workflows/pr-e2e.yml`

- Runs on PRs to `main` and on `merge_group`
- Builds the PR's `common` layer candidate first
- Composes a downstream test image from `ghcr.io/ublue-os/bluefin:latest` by overlaying `/system_files/shared` and `/system_files/bluefin`
- Recompiles GSettings schemas in the composed image
- Pushes the composed image to GHCR and runs the local testsuite wrapper with `suites: common`

This is the pre-merge gate for common-layer changes, so regressions can fail before merge instead of waiting for post-merge E2E.
In branch protection today it is still an advisory/non-required signal; `build.yml` remains the required merge check.

## Promotion-candidate feedback loop

**File:** `.github/workflows/promotion-candidate-e2e.yml`

- Runs weekly on Tuesdays before the downstream Bluefin promotion workflows
- Tests the exact candidate tags used for promotion from common's side:
  - `ghcr.io/projectbluefin/bluefin:testing`
  - `ghcr.io/projectbluefin/bluefin:lts-testing`
- Runs `smoke,common` to add a boot/basic-usage signal on top of the shared-layer checks
- Uses the same local testsuite wrapper as PR/post-merge workflows, so the testsuite SHA stays aligned

This is **not** a full installer gate. It is the smallest safe repo-local improvement common can make without editing downstream image repos or installer pipelines.

## Known CI caveats and quarantines

- `brew-setup.service` is masked in CI, so Homebrew-installed CLI tools are not present unless explicitly provisioned during the job
- `testsuite#210` tracks the `bash -lc` PATH mismatch affecting `zsh`/`fish` checks in the CI user environment
- GNOME Software scenarios are intentionally `@quarantine` after `testsuite#258`; they should not be treated as active software-store coverage
- Bazaar coverage is currently a `@pending` placeholder tied to the same gap
- `ujust report --confirm` scenario (`system_health.feature`) is `@quarantine` — the `--confirm` mode is not implemented in any current image variant; the step skip-detection used the wrong error string. See testsuite PR #259. Re-enable when `report --confirm` lands in the image Justfile.

## Testsuite SHA pin

`common/.github/workflows/run-testsuite.yml` pins the testsuite SHA for all repo-local callers. When the pin lags behind `main`, quarantined scenarios may run and cause spurious failures. `common` has Renovate configured (`renovate.json`) but the testsuite SHA pin may need manual updates when testsuite fixes land — check `chore(deps): update` Renovate PRs.

## Promotion pipeline e2e gate patterns

These patterns apply when wiring e2e as a gate before publishing stream tags across any image repo.

### Never publish :testing at build time

The `reusable-build.yml` action supports `publish_stream_tag: "false"` to withhold the `:testing` tag from the initial push. The build publishes `:<sha>` and version alias tags only. A separate `promote-to-testing` job in `post-testing-e2e.yml` does `skopeo copy @digest → :testing` only after all e2e jobs succeed.

This ensures `:testing` always points to a digest that passed gate e2e — never a freshly-built untested image.

### promote-to-testing job pattern

```yaml
promote-to-testing:
  needs: [e2e, run-e2e, run-upgrade-test]
  if: >-
    needs.run-e2e.result == 'success' &&
    needs.run-upgrade-test.result == 'success'
  runs-on: ubuntu-latest
  timeout-minutes: 15
  permissions:
    packages: write
  steps:
    - name: Download all testing image digests
      env:
        GH_TOKEN: ${{ github.token }}
      run: |
        gh run download "${{ github.event.workflow_run.id }}" \
          --repo "${{ github.repository }}" \
          --pattern "image-digest-testing-*" \
          --dir /tmp/all-digests
    - name: Promote verified digests to :testing
      run: |
        REGISTRY="ghcr.io/${{ github.repository_owner }}"
        while IFS= read -r -d '' f; do
          while IFS='=' read -r image_name digest; do
            [[ -z "${image_name}" || -z "${digest}" || "${image_name}" == *"|"* ]] && continue
            skopeo copy --all "docker://${REGISTRY}/${image_name}@${digest}" \
                              "docker://${REGISTRY}/${image_name}:testing"
          done < "$f"
        done < <(find /tmp/all-digests -name "*.txt" -print0)
```

Use `--pattern "image-digest-testing-*"` (not `--name`) to download all flavor artifacts in one step. Parse the `=` format lines (skip `|` multi-arch lines with the `*"|"*` guard).

### TOCTOU guard — lock the tested SHA, not the live HEAD

The `lock-sha` step in a promotion workflow must use the source SHA from the `verify` step output (the SHA the tested image was built from), compare it to the current live branch HEAD, and fail early if they differ:

```bash
CURRENT_SHA=$(gh api repos/${{ github.repository }}/git/ref/heads/main --jq '.object.sha')
if [[ "${CURRENT_SHA}" != "${SOURCE_SHA}" ]]; then
  echo "::error::main has advanced since :testing was built — aborting"
  exit 1
fi
echo "locked_sha=${SOURCE_SHA}" >> "$GITHUB_OUTPUT"
```

Locking the live HEAD after testing is a race: `main` may advance between the e2e run and the lock step.

### cosign verify — anchor the certificate identity regexp

Always anchor with `^...$` and restrict to the specific publishing workflow and allowed ref patterns:

```
--certificate-identity-regexp "^https://github.com/<repo>/.github/workflows/publish\.yml@refs/heads/(main|gh-readonly-queue/main/.+)$"
```

An unanchored wildcard (e.g. `"https://github.com/<repo>/.github/workflows/"`) accepts signatures from any workflow file in the repo.

### cosign install on GHA runners

Never write directly to `/usr/local/bin`. Use `$RUNNER_TEMP` + `sudo install`:

```bash
curl -fsSL "https://github.com/sigstore/cosign/releases/download/${COSIGN_VERSION}/cosign-linux-amd64" \
  -o "$RUNNER_TEMP/cosign"
sudo install -m 0755 "$RUNNER_TEMP/cosign" /usr/local/bin/cosign
```
