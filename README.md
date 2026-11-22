<div align="center">

# STREAM WEAVER

### A polished, self-hostable streaming catalog starter.

Discover, organize, and manage movies, series, and anime with a modern React interface, a Supabase-powered catalog, and server-side metadata integrations.

[![Live app](https://img.shields.io/badge/Live%20app-kino--sync.lovable.app-6366F1?style=for-the-badge)](https://kino-sync.lovable.app)
[![Built with Lovable](https://img.shields.io/badge/Built%20with-Lovable-FF5A5F?style=for-the-badge)](https://lovable.dev)

[Features](#features) · [Getting started](#getting-started) · [Configuration](#configuration) · [Project structure](#project-structure) · [Development](#development)

</div>

---

## About

Stream Weaver is a TypeScript streaming-catalog application built with React, TanStack Start and Router, and Supabase. Use the existing app as a starting point, adapt the experience to your own catalog, or continue building in Lovable.

> **Heads-up:** This repository provides the application code—not a streaming-content service. Configure your own database and only add media and links you are authorized to use.

## Features

- **Catalog browsing** — browse movies, series, and anime with search and genre or cast filters.
- **Rich title pages** — display artwork, descriptions, metadata, trailers, and available video sources.
- **Admin tools** — manage catalog entries and integrations from the authenticated admin area.
- **Watchlist and sign-in** — Supabase-backed authentication and personal saved titles.
- **Metadata and trailers** — IMDb/OMDb metadata workflows and optional server-side TMDB trailer and episode-still lookups.
- **Responsive player experience** — supports configured direct video sources and embedded providers, with external-link fallbacks.
- **Lovable integration** — changes committed to the connected branch sync with the Lovable editor.

## Getting started

### Prerequisites

- [Bun](https://bun.sh/) (recommended; the repository includes `bun.lock`)
- A Supabase project with the project's database schema configured
- Optional: a TMDB API key for server-side trailer and episode-still lookups

### 1. Clone and install

```bash
git clone https://github.com/kakajuben/Netflix-mirror-.git
cd Netflix-mirror-
bun install
```

### 2. Configure environment variables

Create a local `.env` file from the example:

```bash
cp .env.example .env
```

Fill in the Supabase values for your project. See [Configuration](#configuration) for details.

### 3. Start the development server

```bash
bun run dev
```

Open the local URL printed by Vite in your terminal.

## Configuration

The repository includes `.env.example` with these Supabase variables:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL used by server-side code. |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key used by server-side code. |
| `SUPABASE_PROJECT_ID` | Supabase project identifier. |
| `VITE_SUPABASE_URL` | Supabase project URL available to the client app. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key available to the client app. |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project identifier available to the client app. |

For TMDB integrations, configure `TMDB_API_KEY` as a **server-only** environment variable in your local environment and deployment platform. Do not prefix it with `VITE_` or expose it in browser code. TMDB features return no results when the key is not configured.

Apply the SQL migrations in `supabase/migrations/` to your Supabase project before using database-backed features. Keep credentials and other secrets out of source control; use your deployment provider's secret manager for production values.

## Using the app

- Visit `/` to browse the public catalog and use search, type, genre, or cast filters.
- Sign in to use account features such as a personal watchlist.
- Use `/admin` with an account that has admin access to manage catalog entries and integrations.
- Configure metadata, trailers, and video sources for titles you have permission to publish. Third-party providers may restrict embeds; use an external link when playback is unavailable.

## Project structure

```text
src/
├── components/       # Shared UI and catalog/player components
├── integrations/     # Supabase client and generated database types
├── lib/              # Catalog, metadata, and server-side TMDB helpers
├── routes/           # TanStack file-based routes
└── ...
supabase/
└── migrations/       # Database schema migrations
```

Routes are file-based. See [`src/routes/README.md`](src/routes/README.md) for the route conventions. The route tree is generated automatically—do not edit `routeTree.gen.ts` by hand.

## Development

Useful scripts from `package.json`:

```bash
bun run dev        # Start the Vite development server
bun run build      # Create a production build
bun run preview    # Preview the production build locally
bun run typecheck  # Run TypeScript checks
```

## Deployment

Deploy the app to a platform that supports the TanStack Start/Vite server runtime. Configure the Supabase variables and, if needed, the server-only `TMDB_API_KEY` in the platform's environment settings, then run:

```bash
bun run build
```

Use your hosting provider's documented build and start commands for the selected runtime. Never publish private service-role keys or API secrets in client-side environment variables.

## Built with

- [React](https://react.dev/)
- [TanStack Start and Router](https://tanstack.com/router)
- [TypeScript](https://www.typescriptlang.org/)
- [Supabase](https://supabase.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Lovable](https://lovable.dev/)

## Lovable

This project was built with [Lovable](https://lovable.dev) and is connected to the [Lovable editor](https://lovable.dev/projects/4a72ab50-e55e-4773-816e-0f52ba42bf17). Changes committed to the connected branch sync back to the editor. Avoid rewriting published Git history.

---

<div align="center">

**Make it yours. Build responsibly. Enjoy the show.**

</div>
