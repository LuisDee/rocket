"""Shared readers for CI job names and pre-commit hook ids.

Regex rather than a YAML parse, deliberately: these guards must run on a bare
python3 with nothing installed, including in a minimal CI image. A false
positive here only ever makes a check more permissive, never wrongly red.
"""

from __future__ import annotations

import re
from pathlib import Path

HOOK_ID = re.compile(r"^\s*-\s*id:\s*(\S+)", re.MULTILINE)

# Top-level GitLab CI keys that configure the pipeline rather than name a job.
RESERVED_CI_KEYS = frozenset({
    "stages", "include", "variables", "default", "workflow",
    "image", "services", "before_script", "after_script", "cache",
    "name", "on", "jobs", "env", "permissions", "concurrency", "defaults",
})


def ci_job_names(repo: Path) -> set[str]:
    """Job names from a GitLab CI or GitHub Actions config, best-effort."""
    names: set[str] = set()

    for path in (repo / ".gitlab-ci.yml", repo / ".gitlab-ci.yaml"):
        if path.is_file():
            for match in re.finditer(
                r"^([A-Za-z][\w.-]*):", path.read_text(), re.MULTILINE
            ):
                name = match.group(1)
                if name not in RESERVED_CI_KEYS:
                    names.add(name)

    workflows = repo / ".github" / "workflows"
    if workflows.is_dir():
        for path in sorted(workflows.glob("*.y*ml")):
            text = path.read_text()
            jobs = re.search(r"^jobs:\s*$", text, re.MULTILINE)
            if jobs is None:
                continue
            for match in re.finditer(
                r"^  ([A-Za-z][\w.-]*):", text[jobs.end():], re.MULTILINE
            ):
                names.add(match.group(1))

    return names


def hook_ids(repo: Path) -> set[str]:
    """Hook ids declared in .pre-commit-config.yaml."""
    config = repo / ".pre-commit-config.yaml"
    if not config.is_file():
        return set()
    return set(HOOK_ID.findall(config.read_text()))
