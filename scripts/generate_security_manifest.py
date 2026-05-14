#!/usr/bin/env python3
"""Generate ALPHA64 static data/build integrity manifests."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
POLICY_VERSION = "A64-SECURITY-1"
TRACKED = [
    "index.html",
    "assets/app.css",
    "assets/app.js",
    "assets/alpha64-doll-pet-x-avatar.png",
    "assets/alpha64-doll-pet-logo.png",
    "data/latest.json",
    "data/latest.js",
    "data/upcoming_launches.json",
    "data/upcoming_launches.js",
    ".well-known/security.txt",
]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def git_sha() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short=12", "HEAD"], cwd=ROOT, text=True).strip()
    except Exception:
        return "local"


def build_manifest() -> dict:
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    files = {}
    for rel in TRACKED:
        p = ROOT / rel
        if p.exists():
            files[rel] = {"sha256": sha256(p), "bytes": p.stat().st_size}
    return {
        "securityPolicyVersion": POLICY_VERSION,
        "generatedAt": now,
        "git": git_sha(),
        "canonical": "https://www.alpha64.xyz/",
        "files": files,
    }


def write_outputs(manifest: dict) -> None:
    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "data/manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    health = {
        "ok": True,
        "service": "ALPHA64.EXE",
        "canonical": "https://www.alpha64.xyz/",
        "securityPolicyVersion": POLICY_VERSION,
        "generatedAt": manifest["generatedAt"],
        "git": manifest["git"],
        "manifest": "data/manifest.json",
    }
    (ROOT / "health.json").write_text(json.dumps(health, indent=2, sort_keys=True) + "\n")


def check_manifest() -> int:
    manifest_path = ROOT / "data/manifest.json"
    if not manifest_path.exists():
        print("data/manifest.json missing")
        return 1
    current = build_manifest()
    saved = json.loads(manifest_path.read_text())
    failures = []
    if saved.get("securityPolicyVersion") != POLICY_VERSION:
        failures.append("securityPolicyVersion mismatch")
    for rel, meta in current["files"].items():
        old = (saved.get("files") or {}).get(rel)
        if not old:
            failures.append(f"{rel}: missing from manifest")
        elif old.get("sha256") != meta["sha256"] or old.get("bytes") != meta["bytes"]:
            failures.append(f"{rel}: manifest hash/size stale")
    if failures:
        print("\n".join(failures))
        return 1
    print("security manifest is current")
    return 0


def main() -> None:
    if "--check" in sys.argv:
        raise SystemExit(check_manifest())
    manifest = build_manifest()
    write_outputs(manifest)
    print("wrote data/manifest.json and health.json")


if __name__ == "__main__":
    main()
