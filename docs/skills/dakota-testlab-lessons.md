---
name: dakota-testlab-lessons
description: "Historical lessons learned from dakota testlab sessions (May 2026). Archived from dakota-testlab.md to keep the main skill doc under the 500-line limit."
---

# Dakota Testlab — Lessons Learned Archive (May 2026)

_Archived from `dakota-testlab.md` — see that file for the active workflow._

## ⚡ Lessons Learned (2026-05-26)

### BST build log monitoring — `tail -1` misses active builds

The master build log (`/tmp/build-*.log`) only updates when an element **completes** (SUCCESS/FAILURE line). During a long single-element build (e.g., WebKitGTK), the log is silent for 30-60 minutes — the poll looks stalled even though BST is working.

**Pattern:** Check the element's own log file directly when the master log stops growing:
```bash
# Find the actively-written element log
find ~/.cache/buildstream/logs -name '*.log' -mmin -2

# Tail it directly for live progress (e.g. ninja step N/M)
tail -5 ~/.cache/buildstream/logs/gnome/sdk-webkitgtk-6.0/*-build.*.log
```

To distinguish "stalled" from "single slow element": verify `pgrep -c bst` is non-zero AND the CASD log (`~/.cache/buildstream/logs/_casd/*.log`) has recent timestamps.

### WebKitGTK is the dominant CAS-miss build time

`gnome-build-meta.bst:sdk/webkitgtk-6.0.bst` takes **~60 minutes** to build from source on ghost (32 cores). It is the single most expensive element in the GNOME stack.

When you see the master build log stall at ~1480 successes with `[--:--:--]` activity, check whether WebKitGTK is active:
```bash
find ~/.cache/buildstream/logs/gnome/sdk-webkitgtk-6.0 -name '*.log' -mmin -5
tail -3 <that-log>   # shows current ninja step N/9437
```

When WebKitGTK finishes, BST caches it locally — subsequent builds hit the CAS and skip this entirely.
## ⚡ Lessons Learned (2026-05-27)

### titan-dakota KubeVirt VM does not exist

`titan-dakota` (port 30222) in `lab-verify.sh` VM registry is **stale and non-functional**. No corresponding KubeVirt VM exists in the cluster, and no `disk.raw` exists in `projectbluefin/testing-lab` manifests. Dakota lab work is NUC-only (exo-dakota). Do not attempt `--vm titan-dakota` until a provisioning issue is filed and resolved.

### Merge queue blocked by unresolved CodeRabbit threads

The `main-review-required-with-renovate-bypass` ruleset has `required_review_thread_resolution: true`. Unresolved CodeRabbit review threads silently block merge queue entry — the PR shows CI green and approved but never enters the queue.

**Fix:** Resolve threads via GraphQL mutation:
```bash
gh api graphql -f query='
  mutation { resolveReviewThread(input:{threadId:"PRRT_..."}) { thread { isResolved } } }
'
```
Get the thread ID from the PR review page URL or `gh pr view --json reviewThreads`.

### `gh pr merge --admin` bypasses the merge queue (and build CI)

When using `--admin` to force-merge, the `build` CI job (which fires on `merge_group`) does **not** run. The nightly scheduled build at 13:00 UTC will pick up these commits. Only use `--admin` when `validate` has passed and the change is low-risk.

### Self-approve blocked on own PRs

`gh pr review --approve` returns "Review Cannot approve your own pull request" for PRs authored by the same GitHub user. PRs you authored need an external maintainer or bot review to satisfy the approving-review requirement.

### `lab:pass` label must be created before first use

The `lab:pass` label is not pre-seeded in new repos. If `gh pr edit --add-label lab:pass` fails, create it first:
```bash
gh label create "lab:pass" --repo projectbluefin/dakota \
  --color "0e8a16" --description "Maintainer lab validation passed"
```

### Patch Upstream-Status: Submitted vs Accepted

If a fix is already merged upstream (e.g., gnome-build-meta or freedesktop-sdk has the commit), the patch header **must** say `Upstream-Status: Accepted`, not `Submitted`. CodeRabbit flags this correctly — fix it by amending the commit rather than dismissing the review comment.

### lab-approve.sh — removed useless review body, added in-place update

`lab-approve.sh` previously posted `--body "NUC hardware verified. See lab report above."` on approve — this was redundant noise. Fixed to use no body on approve. Also updated to find an existing `<!-- status: -->` comment and PATCH it in-place rather than creating duplicate strike report comments on multiple runs.
