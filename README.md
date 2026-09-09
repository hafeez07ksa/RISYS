# Sentrix — GRC Platform

A multi-tenant Governance, Risk & Compliance (GRC) platform built with Vite + React + Supabase.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 5 |
| Routing | React Router v6 |
| State | Zustand |
| Styling | Tailwind CSS |
| Backend | Supabase (Auth + Postgres + RLS) |
| Icons | Lucide React |

---

## Project Structure

```
src/
├── components/
│   ├── ui/              # Button, Input, Modal, Badge, Spinner, EmptyState, SentrixLogo
│   └── layout/          # Sidebar, Topbar
├── features/
│   ├── auth/            # LoginPage, SignupPage, OAuthCallbackPage
│   ├── onboarding/      # OnboardingPage (org setup wizard)
│   ├── dashboard/       # DashboardPage
│   ├── settings/
│   │   └── integrations/ # IntegrationsPage, ConnectorCard, OAuthModal, ConnectorLogo
│   ├── risks/           # (stub — next session)
│   ├── incidents/       # (stub — next session)
│   ├── controls/        # (stub — next session)
│   ├── compliance/      # (stub — next session)
│   └── audit/           # (stub — next session)
├── hooks/               # useAuth, useOrg, useConnectors
├── lib/                 # supabase.js, constants.js, oauth.js
├── layouts/             # AuthLayout, AppLayout
├── router/              # routes.jsx
├── store/               # authStore.js (Zustand), connectorsStore.js
└── styles/              # global.css
supabase/
└── migrations/
    └── 001_initial_schema.sql
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in your values:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_OAUTH_REDIRECT_URI=http://localhost:5173/oauth/callback

# OAuth Client IDs — register apps in each provider's developer console
VITE_GOOGLE_CLIENT_ID=...
VITE_MICROSOFT_CLIENT_ID=...
VITE_JIRA_CLIENT_ID=...
VITE_NOTION_CLIENT_ID=...
VITE_SLACK_CLIENT_ID=...
```

### 3. Run the Supabase migration

In your Supabase project → SQL Editor, paste and run:

```
supabase/migrations/001_initial_schema.sql
```

This creates:
- `organizations` table
- `organization_members` table (multi-tenancy join)
- `org_connectors` table (OAuth connections per org)
- Row Level Security policies (each org is fully isolated)

### 4. Start the dev server

```bash
npm run dev
```

---

## OAuth Setup Per Connector

### Google Workspace
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → Enable Admin SDK + Calendar APIs
3. OAuth 2.0 → Add redirect URI: `http://localhost:5173/oauth/callback`
4. Copy Client ID → `VITE_GOOGLE_CLIENT_ID`

### Microsoft Entra ID
1. Go to [portal.azure.com](https://portal.azure.com) → App registrations
2. New registration → Redirect URI: `http://localhost:5173/oauth/callback`
3. API permissions: `User.Read.All`, `Directory.Read.All`, `AuditLog.Read.All`
4. Copy Application (client) ID → `VITE_MICROSOFT_CLIENT_ID`

### Jira (Atlassian)
1. Go to [developer.atlassian.com](https://developer.atlassian.com)
2. Create app → OAuth 2.0 (3LO)
3. Callback URL: `http://localhost:5173/oauth/callback`
4. Scopes: `read:jira-work read:jira-user write:jira-work offline_access`
5. Copy Client ID → `VITE_JIRA_CLIENT_ID`

### Notion
1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. New integration → Type: Public
3. Redirect URI: `http://localhost:5173/oauth/callback`
4. Copy OAuth client ID → `VITE_NOTION_CLIENT_ID`

### Slack
1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Create App → OAuth & Permissions
3. Redirect URL: `http://localhost:5173/oauth/callback`
4. Bot scopes: `channels:read chat:write users:read team:read`
5. Copy Client ID → `VITE_SLACK_CLIENT_ID`

---

## Multi-Tenancy Architecture

- Each company signs up and creates an **Organization** record
- Users join via `organization_members` with a role (`admin`, `compliance_officer`, `risk_manager`, `auditor`, `viewer`)
- All tables use **Supabase Row Level Security (RLS)** — a user can only ever read/write data belonging to their own organization
- The helper function `auth.user_org_ids()` powers the RLS policies

---

## What's Built (Session 1)

- [x] Login & Signup pages
- [x] Org setup wizard (3-step onboarding)
- [x] App shell (sidebar, topbar, routing)
- [x] Settings → Integrations page
- [x] 5 connectors: Google Workspace, Microsoft Entra ID, Jira, Notion, Slack
- [x] OAuth popup flow per connector
- [x] Connect / Disconnect / Manage per connector
- [x] Supabase schema with full RLS multi-tenancy

## Next Sessions

- [ ] Risk Register (CRUD, scoring, matrix)
- [ ] Incidents (capture, link to connectors)
- [ ] Controls library (framework mapping)
- [ ] Compliance tracker
- [ ] Notifications (Slack + email)
- [ ] Timeline & activity log
- [ ] Team member invites
