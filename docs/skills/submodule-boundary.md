---
name: submodule-boundary
description: "system_files/shared/ is now directly editable in this repo — the aurorafin-shared submodule has been removed."
---

# system_files scope — what is editable where

## Summary

`system_files/shared/` is now a **directly tracked directory** in this repo. It was previously a read-only bind from the `aurorafin-shared` submodule, but that dependency has been severed. You can now edit files in `system_files/shared/` directly in PRs to this repo.

`system_files/bluefin/` remains the editable path for Bluefin-specific config.
`system_files/nvidia/` contains NVIDIA-specific overlays and is also directly tracked here.

## Editable paths

| Path | Editable? | Notes |
|---|---|---|
| `system_files/shared/**` | ✅ Yes | Directly tracked — edit here |
| `system_files/bluefin/**` | ✅ Yes | Bluefin-specific config |
| `system_files/nvidia/**` | ✅ Yes | NVIDIA overlay |
| `bluefin-branding/**` | ❌ No | Submodule — `projectbluefin/branding` |

## What changed

Previously, `system_files/shared/` was materialized from a `ublue-os/aurorafin-shared` git submodule. The `validate.yml` workflow enforced that `system_files/shared/` could not be edited directly. **That constraint is gone.** The submodule has been removed and the files are now owned here.

## Submodule that remains

Only `bluefin-branding` remains as a submodule:
```
bluefin-branding → projectbluefin/branding (wallpapers, logos)
```

## Dakota exclusion pattern

`system_files/shared/` flows into **bluefin, bluefin-lts, and dakota** via the common OCI context. Dakota's `elements/bluefin/common.bst` does a plain `cp -r system_files/shared/usr/` — it receives everything.

If you add a file to `system_files/shared/` that should **not** appear in dakota (e.g., a migration aid that only applies to users rebasing from legacy-rechunk images), add explicit `rm -f` lines to `dakota/elements/bluefin/common.bst` immediately after the copy block:

```yaml
# Dakota is a fresh BuildStream image — strip files that only apply to
# users migrating from legacy ublue-os/rechunk-based images.
rm -f "%{install-root}%{prefix}/bin/rechunker-group-fix"
rm -f "%{install-root}%{prefix}/lib/systemd/system/rechunker-group-fix.service"
rm -f "%{install-root}%{prefix}/lib/systemd/system-preset/00-rechunker-group-fix.preset"
```

**Current exclusions in `common.bst`:** `rechunker-group-fix` (script + service + preset) — chunka migration aid for legacy rechunk-based image rebases; not needed on a fresh dakota install.
