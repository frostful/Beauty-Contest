# Contributing to Median

Thank you for helping improve the game. Focused bug fixes and small, testable
changes are easiest to review.

## Before opening a pull request

1. Create a branch from the latest `main`.
2. Keep scoring, player identity, host transfer, and elimination decisions on
   the server.
3. Preserve keyboard, reduced-motion, phone, and desktop behavior.
4. Do not commit credentials, `.env` files, Wrangler state, D1 exports, or
   third-party media without redistribution permission.
5. By contributing source code, you agree that it may be distributed under
   `AGPL-3.0-only`. Do not contribute media unless you own it or can document
   permission compatible with [ASSET-LICENSE.md](ASSET-LICENSE.md).
6. Run the local verification suite:

   ```bash
   corepack enable
   pnpm install --frozen-lockfile
   pnpm test
   pnpm lint
   pnpm typecheck
   pnpm build
   pnpm wrangler deploy --dry-run
   ```

## Test the running application

Start `pnpm dev` (which applies local D1 migrations automatically), then run
`pnpm test:features` in another terminal. This exercises real HTTP requests,
WebSockets, scoring, amendments, reconnects, host transfer, and the two-minute
room-expiry alarm against the local server. Allow about two minutes.

For UI changes, also use the browser to create a room, add bots, start a round,
lock a choice, view results, advance, reconnect, and leave. Verify create/join
forms, Back/Forward, legal links, and draft retention on desktop and phone
widths. Screenshots and a passing build alone do not verify that a game works.
Report any features that could not be tested instead of marking them passed.

## Pull request notes

Explain what changed, how it was tested, and whether database migrations or
new Cloudflare bindings are required. Include phone and desktop screenshots for
visual changes. Keep unrelated formatting or generated-file churn out of the
same pull request.

## Reporting problems

Use a public GitHub issue for ordinary bugs. Follow [SECURITY.md](SECURITY.md)
for vulnerabilities or suspected credential exposure.
