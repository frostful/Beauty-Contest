# Median — The Beauty Contest

An unofficial, fan-made real-time multiplayer strategy game inspired by the
beauty-contest game format. Players choose an integer from 0–100; the closest
valid choice to 80% of the group average wins the round.

## Architecture

- React 19 and vinext on Cloudflare Workers
- Cloudflare D1 for authoritative rooms, players, rounds, and analytics
- A hibernatable Durable Object per room for WebSocket presence and state
  invalidation
- Server-authoritative scoring, eliminations, host transfer, spectators, bots,
  and reconnects

The WebSocket carries only small invalidation messages. Clients fetch a fresh
authoritative snapshot when the room changes, at a round deadline, or during a
low-frequency safety check. This avoids continuous one-second database polling.

## Local development

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm test
npm run build
```

## Cloudflare deployment

`wrangler.jsonc` declares the production D1 database, static assets, image
binding, and `ROOM_EVENTS` Durable Object. After authenticating Wrangler:

```bash
npm run build
npx wrangler d1 migrations apply median-beauty-contest --remote
npx wrangler deploy
```

## Important notes

- The project is not affiliated with Netflix or the creators of *Alice in
  Borderland*.
- Do not commit `.env` files, Wrangler state, or private keys.
- The temporary host test-score controls should be removed before a final
  competitive release.

## License

Source-available for testing and review. Add an explicit open-source license
before accepting outside contributions or redistributing the project.
