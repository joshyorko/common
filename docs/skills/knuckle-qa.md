---
name: knuckle-qa
description: End-to-end PR review + VM e2e workflow for projectbluefin/knuckle. Covers complexity gate, code review, GHA vm-e2e testing (or local just vm-e2e), and merge-queue dispatch. Load before reviewing any knuckle PR.
---

# knuckle-qa — PR Review + VM E2E

End-to-end knuckle PR review: complexity gate → code review → vm-e2e test → queue.

Load with: `cat ~/src/skills/knuckle-qa/SKILL.md`

> Load on demand: `cat ~/src/skills/knuckle-qa/REFERENCE.md`

## When to Use
- Reviewing any open PR on projectbluefin/knuckle
- Running vm-e2e tests (GHA workflow_dispatch or `just vm-e2e` locally)
- Deciding whether to queue or hold a PR

## When NOT to Use
- PRs you've already tested this session with evidence
- Single-file docs/typo PRs — review inline and queue directly

---

## Pre-Flight Checklist (run once per session before any QA)

```bash
# First-time contributor CI gate — check for action_required runs before reviewing
gh api repos/projectbluefin/knuckle/actions/runs?status=action_required \
  --jq '.workflow_runs[] | "\(.id) \(.name) \(.head_branch)"'
# If any: gh api repos/projectbluefin/knuckle/actions/runs/<ID>/approve --method POST
```

---

## Batch PR Session Start

```bash
# 1. List open PRs with labels
gh pr list --repo projectbluefin/knuckle --state open \
  --json number,title,labels,additions,deletions \
  --jq '.[] | "#\(.number) \(.additions+.deletions)L [\(.labels|map(.name)|join(","))] \(.title)"'

# 2. File overlap check (MANDATORY — files in 2+ PRs must queue sequentially)
for pr in $ALL; do
  echo -n "PR $pr: "
  gh pr diff $pr --repo projectbluefin/knuckle --name-only | tr '\n' ' '; echo
done

# 3. Categorize by tier, then run SEQUENTIALLY (not in parallel — see parallelism note)
```

**⛔ Run QA scripts SEQUENTIALLY, not in parallel.** Parallel `go mod tidy` runs race on
`go.mod`/`go.sum` ("existing contents have changed since last read") and `golangci-lint`
uses a shared file lock. The "max 3 concurrent" rule was wrong — **max 1 at a time**.

---

## Tier Classification

Tier is set by the highest-tier domain label present. `kind/test` alone = Tier 0.

| Labels | Tier | What runs |
|---|---|---|
| `domain:ci`, `kind/test`, docs | 0 | `just ci` on dev machine |
| `domain:probe`, `domain:tui` | 1 | Tier 0 + VM tool check + dry-run (local or GHA) |
| `domain:security` | 1+sec | Tier 1 + bad-input rejection tests |
| `domain:install`, `domain:headless`, `domain:ignition`, swap, tailscale, sysext | **3** | Tier 1 + full install + **boot installed system** + domain assertions (GHA `vm-e2e.yml` or `just vm-e2e`) |
| `domain:iso` | 3 | Tier 3 + hardware-repro |

**Tier trigger uses LABELS only — never PR title.** A PR titled "fix tailscale validation"
with `domain:validate` labels is Tier 0, not Tier 3. The script (`qa-test-pr.sh`) enforces this.

---

## The Workflow

```
Step 1 → Complexity gate
Step 2 → Code review (rubber duck required)
Step 3 → VM e2e test (GHA workflow_dispatch or just vm-e2e locally)
Step 4 → Decision    (approve + queue OR request changes)
```

### Step 1 — Complexity Gate

Skip to review-only (no vm-e2e, no queue) if ANY:

| Signal | Threshold |
|---|---|
| `size:XL` or `size:XXL` label | present |
| Domain labels | >4 distinct `domain:*` |
| Workflow files | any `.github/workflows/*.yml` changed |
| Architecture boundary | `cmd/knuckle` + `internal/runner` + `internal/ignition` together |

### Step 2 — Code Review Checklist

```
□ gofmt clean: double space before // is the most common failure
□ No exec.Command outside internal/runner
□ Disk identity via /dev/disk/by-id (not /dev/sdX)
□ Ignition tempfile: os.CreateTemp + chmod 0600 + defer os.Remove
□ No secrets in slog output
□ Test assertions check err.Error() content, not just err != nil
□ Permission tests skip with t.Skip if os.Getuid() == 0
□ Every LGTM backed by a file:line reference from the diff
```

### Step 3 — VM E2E Test

**Option A — GitHub Actions (preferred for Tier 3 PRs on a branch):**

```bash
# Trigger all 4 passes on the PR branch
gh workflow run vm-e2e.yml \
  --repo projectbluefin/knuckle \
  --ref <branch-name>

# Watch progress
gh run list --repo projectbluefin/knuckle --workflow vm-e2e.yml --limit 3
gh run view <RUN_ID> --repo projectbluefin/knuckle
```

> ⚠️ `workflow_dispatch` only works once `vm-e2e.yml` is on `main`. For PRs before it's merged, use Option B.

**Option B — Local (`just vm-e2e`):**

```bash
cd ~/src/knuckle
git checkout <pr-branch>
just vm-e2e   # runs 4 passes: DHCP → static → sysext → NVIDIA
# output tee'd to /tmp/vm-e2e-run.log
```

Requires `/dev/kvm` accessible + QEMU installed. Any Linux machine with KVM works.
Flatcar base image (~480 MB) is cached at `.vm/flatcar_base_amd64.img` after first run.

**4 passes + what each verifies:**
| Pass | Verifies |
|---|---|
| DHCP | hostname, update strategy, core user groups |
| Static | `/etc/systemd/network/10-static.network` content (address, gateway, interface) |
| Sysext | `docker.raw` present + size, `systemd-sysext` active, `docker version` |
| NVIDIA | `/etc/flatcar/enabled-sysext.conf` contains `nvidia-drivers-*` |

**Old ghost path (`qa-test-pr.sh` with `QA_HOST=jorge@192.168.1.102`) is deprecated.**
Ghost is now optional for local dev only; GHA is the canonical CI path.

### Step 4 — Decision

**⛔ ONE COMMENT RULE: Post the strike report once, as a PR comment. That is the only substantive text that goes on the PR.**
- The report IS the review evidence. No separate review body text.
- `gh pr review --approve` with NO `-b` flag.
- `gh pr review --request-changes` via `gh` currently **requires a non-empty body**. Use the smallest possible body, e.g. `See strike report comment for requested changes.`
- The report comment explains the decision. Nothing else needed.
- If a PR flips from NOGO → GO after a fix, **edit the existing strike report comment** instead of posting a second comment.

```bash
# 🟢 GO — post report, approve with no body, queue
gh pr comment <N> --repo projectbluefin/knuckle \
  --body-file /tmp/qa-stdout-<N>.txt
gh pr review <N> --repo projectbluefin/knuckle --approve
gh pr merge --auto <N> --repo projectbluefin/knuckle

# 🔴 NOGO — post report, request changes with minimal body (gh requires it)
gh pr comment <N> --repo projectbluefin/knuckle \
  --body-file /tmp/qa-stdout-<N>.txt
gh pr review <N> --repo projectbluefin/knuckle --request-changes \
  --body "See strike report comment for requested changes."
```

| Code review | Ghost test | Action |
|---|---|---|
| APPROVE | 🟢 GO | Post report → approve (no body) → queue |
| APPROVE | 🔴 NOGO | Post report → request changes (minimal body only because gh requires it) |
| REQUEST_CHANGES | any | Post report → request changes (minimal body only because gh requires it) |
| Complex (skipped) | skipped | Post Tier 0 CI result only → leave review |

⛔ **ALWAYS use `gh pr merge --auto`. Never `gh pr merge` without `--auto`.**
Direct merge bypasses CI on the combined branch.

---

## PR Review Patterns by Domain

| Domain | Key check |
|---|---|
| `install` | `wipefs → flatcar-install → sfdisk` order; DryRunner no-ops all three |
| `ignition` | `{{- end}}` balanced; `yamlEscape` on every user string |
| `headless` | `Validate()` called before `ToInstallConfig()`; SSH keys validated |
| `tui` | No business logic in view model; `wizard.Apply*` for mutations |
| `validate` | Table-driven tests; error messages include the bad value |
| `wizard` | Conditional steps check selector in Next/Previous/GoToStep |
| `bakery` | SHA512 + GPG both checked; no per-call `http.Client` |
| `ci/release` | `persist-credentials: false` on all checkout steps |

---

## Posting the vm-e2e Report

After `just vm-e2e` or a GHA run completes, post a strike report comment:

```bash
# For local runs — summarize from /tmp/vm-e2e-run.log
gh pr comment <PR> --repo projectbluefin/knuckle --body "$(tail -20 /tmp/vm-e2e-run.log)"
gh pr review <PR> --repo projectbluefin/knuckle --approve        # if PASS
gh pr review <PR> --repo projectbluefin/knuckle --request-changes # if FAIL
```

For GHA runs, link the run URL in the comment. The run URL format:
`https://github.com/projectbluefin/knuckle/actions/runs/<RUN_ID>`

---

## cmd/knuckle TTY Issue in Non-Interactive Environments

`TestMain_TUINormalMode` and friends fail with `open /dev/tty: no such device or address`
when running without a PTY (nohup, SSH -f, non-interactive shells). These tests
pass in GitHub Actions CI (authoritative for Tier 0).

**This is a pre-existing infrastructure limitation** — not a PR regression. Work-around:
- For Tier 0 PRs, rely on GitHub Actions CI (authoritative) + note TTY issue in report
- Filed as tracking issue: see GitHub issues for "cmd/knuckle TTY test non-interactive"

---



## Common Failures and Fixes

| Failure | Cause | Fix |
|---|---|---|
| `'upstream' does not appear to be a git repository` | Ghost missing upstream remote | `git remote add upstream https://github.com/projectbluefin/knuckle.git` on ghost (one-time) |
| `To get started with GitHub CLI, please run: gh auth login` | gh not authed on ghost | Pass `GH_TOKEN=$(gh auth token)` — keyring not available on ghost |
| `go: updating go.mod: existing contents have changed since last read` | Parallel QA runs race on go.mod | Run QA scripts **sequentially**, never in parallel |
| `open /dev/tty: no such device or address` (cmd/knuckle tests) | No PTY in nohup/non-interactive worktree | Pre-existing infra bug; rely on GitHub CI (authoritative) for Tier 0; note in report |
| VM boot timeout | `flatcar-base.raw` corrupt | Re-run; first run reconverts from qcow2 |
| SSH permission denied | Key injection failed silently | Check `kv_inject_ssh_key`; `losetup -j img` for leftover loops |
| `--dry-run` non-zero | Binary from wrong commit | Verify `git rev-parse HEAD` matches PR head SHA |
| `INSTALL_FAILED` | `flatcar-install` non-zero | Read install log in report |
| `INSTALLED_BOOT_TIMEOUT` | Ignition failed at first boot | Check Ignition errors in knuckle-install.log |
| `FAIL: /var/swapfile NOT FOUND` | Swap service didn't run | Check `knuckle-create-swapfile.service` status |
| `BAD_PW_ACCEPTED_FAIL` | Plaintext password not rejected | Security regression — block the PR |
| PR stuck `BLOCKED`, no CI runs | First-time contributor — GitHub holds workflow runs | `gh api repos/projectbluefin/knuckle/actions/runs?status=action_required` then approve each run |
| `git index.lock` in parallel runs | Multiple scripts fetch/checkout concurrently | One git worktree per PR — run sequentially |
| KubeVirt VM stuck deleting | Controller race | Poll both VMI AND VM object gone before reuse |
| `git fetch ... pr<N>-qa` exits 128 | Stale local ref from prior run | `git update-ref -d refs/heads/pr<N>-qa` then rerun |
| `git worktree add` fails for `/tmp/knuckle-qa-wt-<N>` | Stale worktree from prior run | `git worktree remove /tmp/knuckle-qa-wt-<N> --force` before rerun |

---

## Script Rules (qa-test-pr.sh) — 2026-05-24

These rules are baked into the script (PR #336). Needed if extending the script.

- **RUNDIR must be absolute** — `$(pwd)/.qa/runs/${RUN_ID}`. Relative paths break inside `(cd $WORKTREE && ...)` subshells.
- **Quoted heredoc: no `\$` escaping** — Inside `<< 'ASSERT_SCRIPT_EOF'`, write `$(hostname)` and `${VAR}` directly. The quoted delimiter prevents local expansion. `\$(hostname)` is a bash syntax error.
- **Variable ordering** — Write `HOSTNAME_EXPECTED` and `HOST_PUB_KEY` to the script BEFORE the heredoc assertions. `set -u` rejects unbound variables.
- **COUNT: use `wc -l`** — `grep -cv '^$' || echo 0` produces `0\n0` on empty input; integer comparison fails.
- **Feature injection: LABELS only** — Check `$LABELS`, never `$TITLE`. A PR titled "fix tailscale tests" would otherwise inject a fake auth key into the QA config.
- **by-id empty on KubeVirt** — virtio disks have no serial numbers; `SKIP` not `FAIL`.
- **Stale ref cleanup** — if `git fetch upstream "pull/${PR}/head:pr${PR}-qa"` exits 128, delete the stale ref with `git update-ref -d refs/heads/pr${PR}-qa` before retrying.
- **Stale worktree cleanup** — if `/tmp/knuckle-qa-wt-${PR}` already exists or points at the wrong branch, remove it with `git worktree remove --force` before rerunning.

---

## Hanthor PR Patterns

- Stale branches accumulate all upstream changes — check `git diff merge-base..pr-HEAD --stat` to isolate the actual change.
- `size:XXL` PRs trigger complexity gate — do NOT ghost-test them.
- Verify unique change is not already in main before rebasing.

---

## Workflow File PRs

`.github/workflows/*.yml` PRs **cannot be auto-merged** — require `workflow` OAuth scope.
Jorge merges these manually via GitHub UI. Approve + leave; do not attempt `gh pr merge`.

Renovate already SHA-pins via `@SHA # vX` format. When Renovate and a SHA-pinning PR target
the same file, merge Renovate first, then rebase the pinning PR.

---

## VM E2E Infrastructure

VM e2e tests run on any Linux machine with KVM, or via GHA `vm-e2e.yml` workflow.

**Local requirements:** `/dev/kvm` accessible, `qemu-system-x86_64` installed, Go toolchain.
**GHA:** `ubuntu-latest` with KVM enabled (same pattern as `iso-boot-smoke` in `ci.yml`).

Ghost (192.168.1.102) remains available as an optional dedicated test machine but is no longer the canonical CI path. Load `ghost-testlab` skill only if you need to use ghost directly.

---

## ISO Boot Smoke Test

`just vm-e2e` does NOT test ISO boot — it installs via headless mode directly into a VM disk.
ISO boot is tested by the `iso-boot-smoke` GHA job in `ci.yml` (headless serial-log assertions).

For a full ISO boot test locally:

```bash
just iso stable         # build ISO → output/knuckle-installer-stable-amd64.iso
just iso-smoke output/knuckle-installer-stable-amd64.iso /usr/share/OVMF/OVMF_CODE_4M.fd 120
```

**Serial log invariants (checked by `iso-smoke.sh`):**
- `systemd.gpt_auto=0` must appear on BOTH BLS entries (primary + serial)
- `initrd-root-device.target`, `initrd-usr-fs.target`, `getty.target` must appear
- `x2dauto` / `xd2root.device` / `dracut.*skip` must NOT appear

**Critical ISO boot invariants (checked in build-iso.sh):**
- `systemd.gpt_auto=0` must be on **both** BLS entries (primary + serial)
- Without it: bare metal GPT disks cause systemd-gpt-auto-generator to create device units → dracut xd2root hook is skipped
- Root cause of v0.6.2 bare metal boot failure (fixed in v0.7.0)

---

## Worktree Hygiene

Worktrees from prior sessions accumulate silently in `/tmp/knuckle-pr-*`. Run cleanup at the **end of every batch session** to prevent `/tmp` bloat and git confusion (16 stale worktrees found 2026-05-24):

```bash
cd ~/src/knuckle
for wt in $(git worktree list --porcelain | grep worktree | awk '{print $2}' | grep /tmp/knuckle-pr-); do
  git worktree remove "$wt" --force 2>/dev/null && echo "removed $wt"
done
git worktree list  # verify clean
```

---

## Merge Conflict Guardrails

```bash
# Try GitHub auto-rebase first
gh pr update-branch <N> --repo projectbluefin/knuckle
# If that fails, rebase locally (see REFERENCE.md → PR Sequencing)
```

Never regex-based conflict surgery on Go files. Require `go build ./...` before staging.

---

## Powerlevel

- **Level:** 4

---


## Lessons Learned

_Older lessons (2026-05-26 through 2026-05-29) archived in [knuckle-qa-lessons.md](knuckle-qa-lessons.md)._

## Lessons Learned (2026-06-01)

### Quality agent stale issues — detection and cleanup pattern

Three recurring stale/duplicate issue patterns resolved this session:

1. **Stale coverage gap**: Before acting on a quality issue, always verify the gap still
   exists on current `upstream/main`:
   ```bash
   go test -count=1 -cover ./internal/<pkg>/... 2>/dev/null
   ```
   Issue #661 (tui at 98.1%) was stale — actual was 99.7%, above the 99% gate.

2. **Duplicate issues**: Quality agent filed #669 and #673 for the same gap
   (`cmd/compile-butane-fresh` missing from cover-check), and #663 and #670 for the
   same `cmd/knuckle` threshold issue. Close the lower-quality/older one as a duplicate
   with a pointer to the canonical issue.

3. **Batch fix**: A single PR (#675) can close multiple small quality issues
   (Justfile gate fixes + BATS test additions) to avoid merge queue noise.

### httptest patching for cmd/ tools: const → var pattern

When a `cmd/` tool has a hardcoded URL constant and you want to write httptest
tests that patch it, convert `const` to `var`:

```go
// Before (untestable)
const docsURL = "https://..."

// After (patchable in tests)
var docsURL = "https://..."
```

Then in tests:
```go
orig := docsURL
docsURL = srv.URL
defer func() { docsURL = orig }()
```

This was done for `cmd/nvidia-check/main.go` to enable 100% coverage of
`fetchNvidiaDocs`. Note: removing any now-orphaned companion constants to avoid
`golangci-lint unused` failures.

### cmd/ package coverage expectations

`main()` in `cmd/` packages is typically 0% covered (CLI entry with network
calls, fmt.Println, os.Exit). This is normal and expected. Focus coverage
efforts on the non-main functions (`fetchX`, `extractX`, etc.) which are
fully testable. Do not add `cmd/<tool>` to the cover-check gate unless
non-main functions can be driven above a meaningful threshold (≥50%).
