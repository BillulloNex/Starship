#!/usr/bin/env python3
"""Jira CLI for SHIP (Starship delivery automation). Uses curl — atlassian.net blocks python UAs.

Usage:
  ship-jira.py search "<jql>"
  ship-jira.py get <KEY>
  ship-jira.py create-bug "<summary>" <desc_md_file> [labels_csv] [--sig <dedupe_signature>]
  ship-jira.py comment <KEY> "<text>" | ship-jira.py comment <KEY> @/path/file.md

Auth: $JIRA_USERNAME/$JIRA_API_TOKEN/$JIRA_URL, fallback localhost:18000 secrets store.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.parse

PROJECT = os.environ.get("SHIP_JIRA_PROJECT", "SHIP")
AUTO_LOG_LABEL = "auto-log"


def secret(name):
    v = os.environ.get(name)
    if v:
        return v
    out = subprocess.run(
        ["curl", "-s", f"http://localhost:18000/api/settings/secrets/{name}"],
        capture_output=True,
        text=True,
        timeout=20,
    )
    return out.stdout.strip()


USER = secret("JIRA_USERNAME")
TOKEN = secret("JIRA_API_TOKEN")
BASE = secret("JIRA_URL").rstrip("/")
if not (USER and TOKEN and BASE):
    print("Missing Jira credentials", file=sys.stderr)
    sys.exit(1)


def api(method, path, payload=None):
    cmd = [
        "curl",
        "-s",
        "-w",
        "\n%{http_code}",
        "-u",
        f"{USER}:{TOKEN}",
        "-H",
        "Content-Type: application/json",
        "-H",
        "Accept: application/json",
        "-X",
        method,
        f"{BASE}{path}",
    ]
    tmp = None
    if payload is not None:
        tmp = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
        json.dump(payload, tmp)
        tmp.close()
        cmd += ["-d", f"@{tmp.name}"]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if tmp:
        os.unlink(tmp.name)
    body, _, code = out.stdout.rpartition("\n")
    if code.startswith("2"):
        return json.loads(body) if body.strip() else {}
    print(f"Jira API {method} {path} -> HTTP {code}\n{body[:800]}", file=sys.stderr)
    sys.exit(1)


def inline_nodes(text):
    nodes = []
    pattern = re.compile(r"(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|`[^`]+`)")
    pos = 0
    for m in pattern.finditer(text):
        if m.start() > pos:
            nodes.append({"type": "text", "text": text[pos : m.start()]})
        tok = m.group(0)
        if tok.startswith("**"):
            nodes.append({"type": "text", "text": tok[2:-2], "marks": [{"type": "strong"}]})
        elif tok.startswith("["):
            label, url = tok[1 : tok.index("]")], tok[tok.index("(") + 1 : -1]
            nodes.append(
                {
                    "type": "text",
                    "text": label,
                    "marks": [{"type": "link", "attrs": {"href": url}}],
                }
            )
        else:
            nodes.append({"type": "text", "text": tok[1:-1], "marks": [{"type": "code"}]})
        pos = m.end()
    if pos < len(text):
        nodes.append({"type": "text", "text": text[pos:]})
    return nodes or [{"type": "text", "text": ""}]


def md_to_adf(md):
    content = []
    bullets = []

    def flush():
        nonlocal bullets
        if bullets:
            content.append(
                {
                    "type": "bulletList",
                    "content": [
                        {
                            "type": "listItem",
                            "content": [{"type": "paragraph", "content": inline_nodes(b)}],
                        }
                        for b in bullets
                    ],
                }
            )
            bullets = []

    for line in md.splitlines():
        s = line.rstrip()
        if not s.strip():
            flush()
            continue
        if s.startswith("### "):
            flush()
            content.append(
                {"type": "heading", "attrs": {"level": 3}, "content": inline_nodes(s[4:])}
            )
        elif s.startswith("## "):
            flush()
            content.append(
                {"type": "heading", "attrs": {"level": 2}, "content": inline_nodes(s[3:])}
            )
        elif s.startswith("# "):
            flush()
            content.append(
                {"type": "heading", "attrs": {"level": 1}, "content": inline_nodes(s[2:])}
            )
        elif s.lstrip().startswith("- "):
            bullets.append(s.lstrip()[2:])
        else:
            flush()
            content.append({"type": "paragraph", "content": inline_nodes(s)})
    flush()
    return {"type": "doc", "version": 1, "content": content}


def sig_label(signature):
    digest = hashlib.sha1(signature.encode("utf-8")).hexdigest()[:10]
    return f"log-sig-{digest}"


def cmd_search(jql):
    try:
        q = urllib.parse.quote(jql)
        d = api(
            "GET",
            f"/rest/api/3/search/jql?jql={q}&maxResults=25&fields=summary,status,labels,created",
        )
    except SystemExit:
        d = api(
            "POST",
            "/rest/api/3/search",
            {"jql": jql, "maxResults": 25, "fields": ["summary", "status", "labels", "created"]},
        )
    for i in d.get("issues", []):
        f = i["fields"]
        print(
            f"{i['key']} | {f['status']['name']} | {','.join(f.get('labels', []))} | {f['summary']}"
        )
    if not d.get("issues"):
        print("NO_RESULTS")


def cmd_get(key):
    d = api("GET", f"/rest/api/3/issue/{key}?fields=summary,status,labels,description")
    f = d["fields"]
    print(f"KEY: {d['key']}\nSTATUS: {f['status']['name']}\nLABELS: {','.join(f.get('labels', []))}")
    print(f"SUMMARY: {f['summary']}")


def cmd_create_bug(summary, desc_file, labels_csv="", dedupe_sig=""):
    labels = [AUTO_LOG_LABEL]
    if labels_csv:
        labels.extend(l.strip() for l in labels_csv.split(",") if l.strip())
    if dedupe_sig:
        labels.append(sig_label(dedupe_sig))
        jql = (
            f'project = {PROJECT} AND labels = "{sig_label(dedupe_sig)}" '
            f"AND status != Done ORDER BY created DESC"
        )
        existing = api(
            "POST",
            "/rest/api/3/search",
            {"jql": jql, "maxResults": 1, "fields": ["summary", "status"]},
        )
        if existing.get("issues"):
            key = existing["issues"][0]["key"]
            print(f"SKIP_DUPLICATE {key}")
            return

    with open(desc_file, encoding="utf-8") as fh:
        md = fh.read()
    fields = {
        "project": {"key": PROJECT},
        "issuetype": {"name": "Bug"},
        "summary": summary,
        "description": md_to_adf(md),
        "labels": sorted(set(labels)),
    }
    d = api("POST", "/rest/api/3/issue", {"fields": fields})
    print(d["key"])


def cmd_comment(key, text):
    if text.startswith("@"):
        with open(text[1:]) as fh:
            text = fh.read()
    api(
        "POST",
        f"/rest/api/3/issue/{key}/comment",
        {"body": {"type": "doc", "version": 1, "content": [{"type": "paragraph", "content": inline_nodes(text)}]}},
    )
    print(f"commented {key}")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    cmd = sys.argv[1]
    if cmd == "search" and len(sys.argv) >= 3:
        cmd_search(sys.argv[2])
    elif cmd == "get" and len(sys.argv) >= 3:
        cmd_get(sys.argv[2])
    elif cmd == "create-bug" and len(sys.argv) >= 4:
        labels = ""
        dedupe = ""
        rest = sys.argv[4:]
        positional = []
        i = 0
        while i < len(rest):
            if rest[i] == "--sig" and i + 1 < len(rest):
                dedupe = rest[i + 1]
                i += 2
            elif rest[i].startswith("--"):
                i += 1
            else:
                positional.append(rest[i])
                i += 1
        if positional:
            labels = positional[0]
        cmd_create_bug(sys.argv[2], sys.argv[3], labels, dedupe)
    elif cmd == "comment" and len(sys.argv) >= 4:
        cmd_comment(sys.argv[2], sys.argv[3])
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
