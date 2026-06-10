# Automation Audit — Project Bluefin Factory

> Generated: 2026-06-09 (initial), supplemented 2026-06-10 (consistency + test plan + mantra), refreshed 2026-06-10 (drift verification — counts and gates reconciled to live state).
>
> **Mantra:** *Humans approve design, security, and merge. Everything else is automated, self-healing, and non-blocking.*

## Operating principle

Project Bluefin is an **agentic OS factory** — a CNCF showcase of cloud-native operating systems built with bootc. The factory's central commitment is:

> **Manual = liability.** Every step that does not require human accountability is automated, and every automated step is self-healing. Humans are reserved for design, security, and merge accountability — not orchestration, retries, or babysitting CI.

When this principle conflicts with convenience, the principle wins. New workflows must demonstrate they self-heal under the failure modes catalogued in [`failure-modes.md`](failure-modes.md) before they ship.

## Executive Summary

The projectbluefin factory is **91% automated** across **116 workflows in 7 in-scope repos** (common 11, bluefin 26, bluefin-lts 16, dakota 22, actions 22, testsuite 10, iso 9; bonedigger 2 and housekeeping 0 are out of audit scope). This audit identifies the remaining gaps and provides ready-to-deploy artifacts to reach **≥97% automation** with only the documented intentional human gates remaining.

**Key findings:**
- ISO builds are the weakest link (25% automation — fully manual dispatch); fix artifacts retained as **proposals only** (the `iso` repo is currently out of scope for this rollout)
- Supply chain tooling (SBOM, SLSA, keyless signing) is designed but not deployed
- Self-healing patterns (retry, token health) don't exist yet
- 4 of 7 non-deterministic steps are already mitigated
- **875 lines** of `promote-testing-to-main.yml` are triplicated across image repos (bluefin 343 + bluefin-lts 349 + dakota 183) and should consolidate into `projectbluefin/actions`
- **12 `@main` reusable-workflow refs** remain across image repos: 4 reusable workflows (`reusable-execute-release`, `reusable-release-gate`, `reusable-release-reminder`, `reusable-release`) × 3 consumers (bluefin, bluefin-lts, dakota) — silent behavior changes downstream
- `iso` and `bonedigger` ship without `CODEOWNERS` ([#589](https://github.com/projectbluefin/common/issues/589))
- `bluefin-lts`, `dakota`, `actions`, `iso`, and `bonedigger` have no in-repo `renovate.json`; they rely on the org-level [`projectbluefin/renovate-config`](https://github.com/projectbluefin/renovate-config) preset — this is the **intended pattern**, not a gap. Audit doc clarified rather than tracked as a defect.

**Total effort to implement all recommendations:** 9 working days (original 7 phases + 1 day consistency consolidation + 1 day test plan)

---

## Audit Artifacts

| # | File | Purpose |
|---|---|---|
| 1 | [`pipeline-map.md`](pipeline-map.md) | Complete mapping of 116 workflows across 7 in-scope repos |
| 2 | [`manual-touchpoints.md`](manual-touchpoints.md) | 11 manual touchpoints classified and prioritized |
| 3 | [`non-deterministic-steps.md`](non-deterministic-steps.md) | 7 ND steps audited, 3 actionable fixes |
| 4 | [`failure-modes.md`](failure-modes.md) | 7 failure modes with YAML hardening patterns |
| 5 | [`publish-loop-spec.md`](publish-loop-spec.md) | Target architecture for fully automated pipeline |
| 6 | [`implementation-roadmap.md`](implementation-roadmap.md) | 7-phase prioritized roadmap with dependency graph |
| 7 | [`consistency-audit.md`](consistency-audit.md) | Per-image code duplication inventory + consolidation roadmap (C1–C5) |
| 8 | [`publish-loop-test-plan.md`](publish-loop-test-plan.md) | L0–L5 verification strategy: chaos, dry-run, idempotency, artifact checks |

## Implementation Artifacts (Ready to Deploy)

| # | File | Deploy to | Addresses |
|---|---|---|---|
| 9 | [`iso-auto-rebuild.yml`](iso-auto-rebuild.yml) | `iso/.github/workflows/` *(proposal — iso repo currently out of scope)* | T2: Manual ISO builds |
| 10 | [`iso-dispatch-snippet.yml`](iso-dispatch-snippet.yml) | Image repo `execute-release.yml` *(proposal — depends on iso PR)* | T2: Dispatch trigger |
| 11 | [`actions-v1-tag-update.yml`](actions-v1-tag-update.yml) | `actions/.github/workflows/` | T6: Manual tag push |
| 12 | [`build-upgraded.yml`](build-upgraded.yml) | `common/.github/workflows/build.yml` | T8: Key-based signing |
| 13 | [`cliff.toml`](cliff.toml) | `common/` root | T9: Raw changelog |
| 14 | [`release-with-cliff.yml`](release-with-cliff.yml) | `common/.github/workflows/release.yml` | T9: + E2E gate |
| 15 | [`retry-action.yml`](retry-action.yml) | `actions/actions/retry/` | FM1, FM2: No retry |
| 16 | [`check-token-health-action.yml`](check-token-health-action.yml) | `actions/actions/check-token-health/` | FM3: Token expiry |
| 17 | [`dakota-cache-warm.yml`](dakota-cache-warm.yml) | `dakota/.github/workflows/` | ND1: Cold-start timeout |
| 18 | [`reusable-promote.yml`](reusable-promote.yml) | `actions/.github/workflows/` | C1: 875 lines of triplicated `promote-testing-to-main.yml` |
| 19 | [`dry-run-publish-loop.sh`](dry-run-publish-loop.sh) | `actions/scripts/chaos/` (or run locally) | L4: Idempotency probe + artifact verification |

---

## Remaining Human Gates (Intentional — Do Not Automate)

Review-count requirements differ per repo by branch protection (verified 2026-06-10):

| Gate | Where | Rationale |
|---|---|---|
| 2 maintainer reviews on promotion PR | `bluefin`, `bluefin-lts` | Accountability for production user-facing images |
| 1 maintainer review | `dakota`, `actions` | Lower-blast-radius repos — single reviewer is the policy floor |
| 0 required reviews (convention only) | `common` | Doc-only changes push direct to main; non-doc still convention-gated by PR |
| Human merge on `actions` repo | `actions` | Supply chain security (reusable actions = high blast radius) |
| P0/P1 priority assignment | all repos | Release impact requires judgment |
| `/unclaim` on stale PRs | all repos | Context on abandoned vs. in-progress work |

> **Note:** The audit's earlier blanket "2 maintainer reviews" claim applied only to image repos. `dakota` and `actions` enforce a 1-reviewer floor; `common` enforces zero (relies on the org's PR convention, not branch protection).

---

## Tracking Issues

Follow-up work is tracked in `projectbluefin/common`:

| Issue | Item |
|---|---|
| [#583](https://github.com/projectbluefin/common/issues/583) | `[automation-audit]` 2026-06-10 supplement landed — track follow-up batches |
| [#584](https://github.com/projectbluefin/common/issues/584) | `[consistency C1]` Land `reusable-promote.yml` in `projectbluefin/actions` |
| [#585](https://github.com/projectbluefin/common/issues/585) | `[consistency C2]` Pin `@main` reusable-workflow refs to SHA in `bluefin` |
| [#586](https://github.com/projectbluefin/common/issues/586) | `[consistency C2]` Pin `@main` reusable-workflow refs to SHA in `bluefin-lts` |
| [#589](https://github.com/projectbluefin/common/issues/589) | `[automation-audit]` Add `CODEOWNERS` to `iso` and `bonedigger` (drift-refresh finding) |

*Open a tracking issue for any new finding from drift verification before adding it to the consistency or roadmap docs.*

## How to Use This Audit

1. **Start with the roadmap** ([`implementation-roadmap.md`](implementation-roadmap.md)) — original 7-phase order and dependency graph
2. **Read [`consistency-audit.md`](consistency-audit.md)** — the per-image-code-removal items (C1–C5) sit alongside the roadmap phases. C2 and C3 are the cheapest wins (≤1 hour each).
3. **Read [`publish-loop-test-plan.md`](publish-loop-test-plan.md)** — defines what "the publish loop is tested" means before any phase is declared done
4. **Pick a phase or consolidation item** — Phases 1-4, 7, and consolidation C2/C3 have no dependencies and can start immediately
5. **Deploy the artifact** — Each YAML file has deployment instructions in its header comments
6. **Validate** — Each phase in the roadmap has specific validation steps; each test level in the test plan has pass criteria
7. **Track** — File GitHub issues per the tracking section in the roadmap and consistency audit

## Scope notes for this rollout

- The `projectbluefin/iso` repo is **currently out of scope**. Items #9 and #10 above (`iso-auto-rebuild.yml`, `iso-dispatch-snippet.yml`) remain in this directory as **proposals only** until iso work is re-authorized.
- T4 (Dakota build machine) is BLOCKED on hardware ([common#497](https://github.com/projectbluefin/common/issues/497)).
- T7 (MERGERAPTOR secret provisioning) is BLOCKED on human-only secret admin work.

---

## Design Decisions Required From Maintainers

| Decision | Context | Recommendation |
|---|---|---|
| Keyless signing migration (#513) | Eliminates SIGNING_SECRET rotation + enables SLSA | Approve — standard practice for OIDC-capable repos |
| ISO dispatch token type | App vs. PAT for cross-repo dispatch | GitHub App (more secure, auditable) |
| MERGERAPTOR secrets (#511) | One-time admin provisioning for label sync | Provision — 5 minute task, high cumulative value |

---

## Iteration Log

See [`results.tsv`](results.tsv) for the full iteration history.
