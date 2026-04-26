# Governance & Forensic Scorecard

Buy-side dashboard for assessing publicly listed companies on three axes:

1. **Corporate Governance Score** — weighted checklist across board, audit, disclosures, related parties, capital allocation.
2. **Beneish M-Score** — eight-variable earnings-manipulation model.
3. **Altman Z-Score** — bankruptcy probability model with variant selection.

## Stack

- Next.js 16 (App Router) + React 19
- TypeScript
- Tailwind CSS v4 (CSS-based theme tokens)
- Future server-side data layer: Firecrawl invoked from API routes only — never from the browser.

## Local development

```bash
npm install   # already run during scaffold; rerun after pulling
npm run dev   # http://localhost:3000
```

The root path redirects to `/governance`. Tabs: `/governance`, `/beneish`, `/altman`.

## Project structure

```
src/
├── app/
│   ├── layout.tsx                 # root layout: fonts, metadata
│   ├── page.tsx                   # redirects to /governance
│   └── (dashboard)/
│       ├── layout.tsx             # wraps tabs in DashboardShell
│       ├── governance/page.tsx
│       ├── beneish/page.tsx
│       └── altman/page.tsx
├── components/
│   ├── layout/DashboardShell.tsx
│   ├── header/
│   │   ├── CompanyHeader.tsx
│   │   ├── RefreshButton.tsx
│   │   └── StatusBadge.tsx
│   ├── tabs/TabNav.tsx
│   └── ui/
│       ├── Card.tsx
│       ├── Badge.tsx
│       └── PlaceholderModule.tsx
└── lib/
    ├── types/                      # company, scores, sources
    ├── mock/                       # exchanges, countries, empty modules
    ├── state/CompanyContext.tsx    # client state for the whole app
    └── services/
        ├── companyResolver.ts
        ├── sourceDiscovery.ts
        ├── dataQuality.ts
        ├── adapters/
        │   ├── screenerAdapter.ts
        │   ├── annualReportAdapter.ts
        │   └── exchangeFilingAdapter.ts
        └── calculations/
            ├── governanceCalc.ts
            ├── beneishCalc.ts
            └── altmanCalc.ts
```

## What's mocked vs real

- **Real**: project shell, design system, header inputs, tab routing, shared
  client state, refresh flow plumbing.
- **Mocked**: every adapter / calculation returns an empty placeholder.
  Refresh simulates a 900 ms delay and updates the timestamp — no network
  calls happen.

## Deployment (Cloudflare Workers via OpenNext)

The project ships with a committed `wrangler.jsonc` and `open-next.config.ts`,
so Cloudflare's auto-migration step has nothing to generate. The deploy
pipeline is:

```bash
npm run deploy   # runs `opennextjs-cloudflare build && opennextjs-cloudflare deploy`
```

### Cloudflare Workers Builds (CI) configuration

In the Cloudflare dashboard under **Workers & Pages → cgchecklist → Settings →
Builds**, set the **Deploy command** to:

```
npm run deploy
```

Do **not** leave it on the default `npx wrangler deploy`. The default triggers
`@opennextjs/cloudflare migrate` on every CI run, which overwrites
`wrangler.jsonc` from a template that re-introduces a `WORKER_SELF_REFERENCE`
service binding. If `package.json.name` ever drifts from the actual Worker
name on Cloudflare, that binding points at a non-existent service and the
deploy fails with API error code 10143.

`npm run deploy` calls `opennextjs-cloudflare deploy` directly and respects
the committed `wrangler.jsonc` as-is.

### Worker name pinning

Worker name (`cgchecklist`) is pinned in both `package.json` and
`wrangler.jsonc` to avoid the service-binding mismatch that occurs when
auto-migration reads a different name from npm vs the Cloudflare project.

If you change the Worker name on Cloudflare, update both files together.

## Roadmap (after this milestone)

1. Wire the company resolver + source discovery (server-side, Firecrawl).
2. Build the Screener adapter for Indian listed companies.
3. Implement governance checklist scoring + per-checkpoint UI.
4. Implement Beneish M-Score formula + per-ratio visualisation.
5. Implement Altman Z-Score formula + variant selection.
6. Data quality reporting in the header + per-module callouts.
