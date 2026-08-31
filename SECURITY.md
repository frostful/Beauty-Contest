# Security policy

## Supported version

Security fixes are applied to the latest commit on `main`. Older commits and
forks are not maintained by this project.

## Reporting a vulnerability

Please do not disclose a vulnerability in a public issue. Use GitHub's
**Security → Report a vulnerability** flow to send a private report to the
maintainers.

Include the affected route or feature, reproduction steps, expected impact,
and any suggested mitigation. Never include real room credentials, admin
secrets, private keys, or personal information in a report.

The maintainers will acknowledge a complete report as soon as practical,
validate its impact, and coordinate disclosure after a fix is available.

## Security boundaries

- The browser is untrusted; scoring and room state must remain server-authoritative.
- `ADMIN_KEY` must be configured as a Cloudflare secret and never committed.
- Local `.env` files, Wrangler state, private keys, and production exports must
  remain outside version control.
