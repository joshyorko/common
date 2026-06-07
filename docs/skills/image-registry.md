---
name: image-registry
description: "projectbluefin OCI image registry reference — all production images published at ghcr.io/projectbluefin/. Use when looking up image paths, tags, or registry structure."
---

# Image Registry

All Bluefin images are published to `ghcr.io/projectbluefin/`. The org migration from `ublue-os` is complete — `projectbluefin` is fully standalone.

## Registry paths

| Registry path | Status | Notes |
|---|---|---|
| `ghcr.io/projectbluefin/bluefin:stable` | ✅ Production | Main Bluefin stable stream |
| `ghcr.io/projectbluefin/bluefin:latest` | ✅ Production | Main Bluefin latest stream |
| `ghcr.io/projectbluefin/bluefin:testing` | ✅ Testing | PR gate + E2E candidate |
| `ghcr.io/projectbluefin/bluefin-lts:stable` | ✅ Production | LTS stream |
| `ghcr.io/projectbluefin/bluefin-lts:testing` | ✅ Testing | LTS E2E candidate |
| `ghcr.io/projectbluefin/common` | ✅ Active | Shared layer (this repo) |
| `ghcr.io/projectbluefin/dakota` | ✅ Active | Dakota image |

## How rollback-helper derives the registry path

```bash
IMAGE_VENDOR="$(jq -r '."image-vendor"' < /usr/share/ublue-os/image-info.json)"
IMAGE_REGISTRY="ghcr.io/${IMAGE_VENDOR}"
```

`image-vendor` is set at build time via `00-image-info.sh`. The helper reads it dynamically — do not hardcode the registry path.
