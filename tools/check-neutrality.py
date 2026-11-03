#!/usr/bin/env python3
# Provenance: copied from ImOnFHIR/care-continuum-lab tools/check-neutrality.py (C-059),
# commit e15db95 (2026-08-22). Changed: the banlist lives OUTSIDE this public repo.
# LEAK_GUARD_CONFIG is a colon-separated list of banlist JSON files (same format as the
# original neutrality.config.json). Missing config fails closed: an empty banlist would
# report clean while guarding nothing.
"""Refuse names that may not appear in this repository.

Scans tracked AND untracked files (an index-only walk reports clean while an untracked
offender sits beside it) plus commit messages — here the history is the deliverable, so a
name in a commit message must be rewritten, not reverted.

Terms may be plaintext or keyed HMAC digests. Use the HMAC form for anything whose mere
presence in a banlist would itself disclose something: writing a name into the file that
exists to keep the name out is self-defeating.

    printf %s 'Name Here' | NEUTRALITY_HMAC_KEY=<key> python3 tools/check-neutrality.py --hash

Usage:
    python3 tools/check-neutrality.py [--staged] [--history]
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIGS = [
    Path.home() / "Code" / "care-continuum-lab" / "tools" / "neutrality.config.json",
    Path.home() / ".config" / "member-match-decoy-lab" / "banlist.json",
]


def load_config() -> dict | None:
    env = os.environ.get("LEAK_GUARD_CONFIG")
    paths = [Path(p).expanduser() for p in env.split(":") if p] if env else DEFAULT_CONFIGS
    found = [p for p in paths if p.is_file()]
    if not found:
        return None
    cfg: dict = {"blockedTerms": [], "allowedPaths": []}
    for p in found:
        part = json.loads(p.read_text())
        cfg["blockedTerms"] += part.get("blockedTerms", [])
    # allowedPaths from another repo's config never apply here.
    return cfg
WORD = re.compile(r"[a-z0-9]+")


def tokenize(text: str) -> list[str]:
    """Single shared normalisation for both scanning and minting. Never duplicate this —
    a digest minted by a different recipe silently matches nothing forever."""
    return WORD.findall(text.lower())


def ngrams(tokens: list[str], n: int) -> list[str]:
    return [" ".join(tokens[i:i + n]) for i in range(len(tokens) - n + 1)]


def digest(phrase: str, key: str) -> str:
    return hmac.new(key.encode(), " ".join(tokenize(phrase)).encode(), hashlib.sha256).hexdigest()


def files() -> list[Path]:
    out = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT, capture_output=True, text=True, check=True).stdout.split("\n")
    return [ROOT / p for p in out if p and (ROOT / p).is_file()]


def main() -> int:
    if "--hash" in sys.argv:
        key = os.environ.get("NEUTRALITY_HMAC_KEY", "")
        if not key:
            sys.stderr.write("NEUTRALITY_HMAC_KEY is unset\n")
            return 2
        phrase = sys.stdin.read().strip()
        toks = tokenize(phrase)
        print(json.dumps({"hmac": digest(phrase, key), "label": "redacted",
                          "words": len(toks)}))
        return 0

    cfg = load_config()
    if cfg is None or not cfg["blockedTerms"]:
        sys.stderr.write("no banlist found (set LEAK_GUARD_CONFIG) — failing closed\n")
        return 2
    key = os.environ.get("NEUTRALITY_HMAC_KEY", "")
    hashed = [e for e in cfg["blockedTerms"] if e.get("hmac")]
    if hashed and not key:
        sys.stderr.write("banlist has keyed entries but NEUTRALITY_HMAC_KEY is unset — "
                         "failing closed rather than scanning with a partial list\n")
        return 2
    # Plaintext terms are normalised through the SAME tokenizer as the scan and grouped
    # by word count. Comparing a multi-word term against single tokens would silently
    # never match — a ban that looks enforced and enforces nothing, which is worse than
    # no ban at all because it stops anyone looking.
    plain: dict[int, set[str]] = {}
    for e in cfg["blockedTerms"]:
        if e.get("term"):
            norm = " ".join(tokenize(e["term"]))
            plain.setdefault(len(norm.split()), set()).add(norm)
    allowed = set(cfg.get("allowedPaths", []))
    hits: list[str] = []

    def scan(label: str, text: str) -> None:
        toks = tokenize(text)
        for width, terms in plain.items():
            for g in ngrams(toks, width):
                if g in terms:
                    hits.append(f"{label}: blocked term '{g}'")
        for e in hashed:
            for n in ([e["words"]] if e.get("words") else (1, 2, 3)):
                if any(hmac.compare_digest(digest(g, key), e["hmac"])
                       for g in ngrams(toks, n)):
                    hits.append(f"{label}: blocked term [{e.get('label', 'redacted')}]")
                    break

    for p in files():
        rel = p.relative_to(ROOT).as_posix()
        if rel in allowed:
            continue
        # The path guard reuses the banlist rather than carrying literal names. Writing the
        # names into the script that exists to keep them out would tell any reader of this
        # repository exactly what is being guarded against — the same recursion the hmac
        # entry form exists to solve.
        scan(f"{rel} (path)", rel.replace("/", " ").replace("-", " ").replace("_", " "))
        try:
            scan(rel, p.read_text(errors="ignore"))
        except OSError:
            pass

    # History is always scanned: a name in a commit message cannot be reverted, only
    # rewritten, so detecting it later than pre-commit is already too late.
    msgs = subprocess.run(["git", "log", "--format=%B"], cwd=ROOT,
                          capture_output=True, text=True).stdout
    scan("commit message", msgs)

    for h in sorted(set(hits)):
        print(f"BLOCKED {h}")
    print(f"\n{len(files())} files scanned, {len(set(hits))} violations")
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main())
