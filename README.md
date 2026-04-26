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

## Roadmap (after this milestone)

1. Wire the company resolver + source discovery (server-side, Firecrawl).
2. Build the Screener adapter for Indian listed companies.
3. Implement governance checklist scoring + per-checkpoint UI.
4. Implement Beneish M-Score formula + per-ratio visualisation.
5. Implement Altman Z-Score formula + variant selection.
6. Data quality reporting in the header + per-module callouts.
