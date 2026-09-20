# Security Policy

## Supported Versions

Kitbash is developed on `main`, and fixes ship there. Use the latest commit.

| Version | Supported |
| --- | --- |
| `main` | ✅ |
| older tags | ❌ |

## Reporting a Vulnerability

Report privately through [GitHub Security Advisories](https://github.com/Open-Dev-Society/kitbash/security/advisories/new), or email **opendevsociety@gmail.com**. Please do not open a public issue for a vulnerability.

Include what you can: affected version or commit, reproduction steps, and what an attacker gains. We will acknowledge within 72 hours, tell you whether we accept the report and our planned fix within 7 days, and credit you in the advisory unless you would rather stay anonymous.

## What Kitbash Touches

The MCP server makes unauthenticated `GET` requests to `api.github.com` to confirm that the repositories it names exist. It reads no files, writes no files outside the ones you ask an agent to write, and runs no shell commands. `GITHUB_TOKEN`, if set, is sent only to `api.github.com` to raise the rate limit.
