# oem-hardware-hooks — OEM Hardware First-Boot Setup in common

How to add, move, or maintain hardware-specific first-boot setup hooks
in `projectbluefin/common`. Covers the hook directories, the versioning
contract, shellcheck requirements, and what belongs here vs upstream.

---

## Hook directories

Two directories are scanned automatically at first boot — no registration needed:

| Directory | Runner | Runs as |
|---|---|---|
| `system_files/shared/usr/share/ublue-os/system-setup.hooks.d/` | `ublue-system-setup` (systemd system service) | root |
| `system_files/shared/usr/share/ublue-os/user-setup.hooks.d/` | `ublue-user-setup` (systemd user service) | current user |

The runners glob `*` in order — name scripts with a numeric prefix
(`10-`, `20-`) to control execution order.

---

## The version-script contract

Every hook must begin with:
```bash
# shellcheck disable=SC1091
source /usr/lib/ublue/setup-services/libsetup.sh

version-script <name> <type> <version> || exit 0
```

- `<name>` — a stable slug (e.g. `framework`, `theming`)
- `<type>` — `system`, `user`, or `privileged` — must match the runner
- `<version>` — integer; bump when you want the hook to re-run on existing systems

**Critical when migrating a hook from a downstream repo to common:**
use the **same** version number that already exists in the downstream hook.
If you bump it, the hook re-runs on every existing bluefin system on next boot.
If you keep it the same, existing systems correctly skip it (already ran).

---

## Shellcheck requirement

CI runs `shellcheck -e SC2207` on all `*.sh` files in `system_files/`.
The `source /usr/lib/ublue/setup-services/libsetup.sh` line triggers SC1091
(can't follow a path not present at lint time). Suppress it inline:

```bash
# shellcheck disable=SC1091
source /usr/lib/ublue/setup-services/libsetup.sh
```

This is the established pattern — see `20-dynamic-wallpaper.sh`.

---

## What belongs in common vs downstream

**Move to common when the hook:**
- Has no Fedora/Bluefin-version-specific dependency
- Should apply to ALL variants including bluefin-lts
- Is pure hardware detection (DMI vendor/product, CPU vendor, BIOS version)

**Leave in the downstream repo when the hook:**
- Depends on packages or services only that variant ships
- Uses `brew install --cask` (depends on tap trust being configured first)
- Requires dconf keys only present in one variant's GNOME extension set

---

## Migrating a hook from bluefin to common

1. Copy the script verbatim to the corresponding hooks.d directory in common
2. Add `# shellcheck disable=SC1091` before the `source` line
3. Keep the same `version-script` version number (do not bump)
4. If the hook depends on icon SVGs, copy them to
   `system_files/shared/usr/share/icons/hicolor/scalable/actions/`
5. Open a PR in common
6. After common ships, file a follow-up issue in `projectbluefin/bluefin`
   (and `bluefin-lts` if applicable) to delete the originals

**Check bluefin-lts path structure** — it uses `system_files/usr/share/...`
(no `shared/` prefix), unlike bluefin's `system_files/shared/usr/share/...`.
Confirm the exact path before filing the cleanup issue.

---

## Hardware currently in common

| Hook | Type | What it does |
|---|---|---|
| `system-setup.hooks.d/10-framework.sh` | system | Intel Framework keyboard karg; Framework 13 Ryzen 7040 suspend fix |
| `user-setup.hooks.d/10-theming.sh` | user | Framework logo/scroll/font; Thelio Astra Ampere logo |

---

## Known gaps (tracking issues)

- Framework 13 + 16 ICC display color profiles — common#670
- WirePlumber hardware profiles for Framework Desktop (AMD Ryzen AI Max 300) — common#671
- `user-setup.hooks.d/20-framework.sh` (framework_tool + wallpapers via brew) not yet migrated — depends on brew tap trust landing first (common#665 / common#672)
