# Deployment Notes

## Hosting Model

This project is not a static-only site.

It currently requires:

- a static frontend bundle
- a Cloudflare Worker
- a Durable Object for per-room state
- WebSocket support through the Worker and Durable Object

Because of that, GitHub Pages by itself is not a valid production host for the full app.

## Why GitHub Pages Is Not Enough

GitHub Pages can host:

- HTML
- CSS
- JavaScript assets

GitHub Pages cannot host:

- Cloudflare Workers
- Durable Objects
- room creation APIs
- authoritative room state
- the WebSocket room endpoint

If you only publish the frontend on GitHub Pages, the UI may load, but room creation and multiplayer links will not work unless the frontend is separately configured to talk to a deployed Cloudflare backend.

## Recommended Production Setup

The cleanest deployment shape is:

- deploy the app to Cloudflare
- serve the frontend assets from the same Cloudflare project
- run the Worker API and Durable Object in the same environment
- use one public origin for both page loads and room APIs

This keeps routing simple for:

- `/room/:roomId`
- `/api/rooms`
- `/api/rooms/:roomId`
- `/api/rooms/:roomId/socket`

## Local Development

Local preview is still useful, but it is not public hosting.

Use:

```bash
npm install
npm run dev
```

That gives you a local browser session for development and manual testing.

## Cloudflare Deployment Flow

1. Install dependencies.
2. Authenticate Wrangler.
3. Verify the Worker name in `wrangler.jsonc`.
4. Build the project.
5. Deploy the Worker and assets.

Commands:

```bash
npm install
npx wrangler login
npm run build
npm run deploy
```

## Current Config Files

The main deployment files are:

- [`wrangler.jsonc`](../wrangler.jsonc)
- [`vite.config.ts`](../vite.config.ts)
- [`package.json`](../package.json)

## Current Constraints

- The app is still a room/lobby prototype, not a playable chess game.
- There is no production environment variable setup yet.
- There is no CI/CD pipeline yet.
- The repo does not yet include a Cloudflare Pages project config or GitHub Actions workflow.

## Future Deployment Improvements

Useful follow-up work:

1. add a documented production release checklist
2. add a Cloudflare Pages + Workers deployment recipe if we choose that exact flow
3. add CI validation for `typecheck` and `build`
4. add environment-specific config if the frontend and API are ever split across origins
