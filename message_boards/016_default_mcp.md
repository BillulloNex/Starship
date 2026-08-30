# 016 — Default MCP Presets: Firebase, GCP, Coolify

**Status: DONE** ✅ (v0.45.0)

## What was requested
Add built-in MCP integrations for Firebase, GCP, and Coolify to the MCP Marketplace for better dev/user experience.

## What was shipped

### Firebase
- **Command**: `npx -y firebase-tools@latest mcp`
- **Auth**: Optional `FIREBASE_TOKEN` (CI token from `firebase login:ci`). Without it, the agent can use the built-in `firebase_login` tool for interactive browser auth.
- **Tools**: Firestore, Auth, Storage, Functions, Hosting, Remote Config, Data Connect, Crashlytics, and more.

### Google Cloud
- **Command**: `npx -y @google-cloud/gcloud-mcp`
- **Auth**: Optional `GOOGLE_APPLICATION_CREDENTIALS` (service account key path). Without it, the server uses existing gcloud CLI auth/ADC.
- **Note**: Requires `gcloud` CLI installed and authenticated.

### Coolify
- **Command**: `npx -y @masonator/coolify-mcp@latest`
- **Auth**: Required `COOLIFY_BASE_URL` + `COOLIFY_ACCESS_TOKEN` (API token from Coolify dashboard).

## Files changed
- `OpenHands/src/constants/grokbot-builtin-integrations.ts` — 3 new catalog entries
- `OpenHands/src/icons/{firebase,google-cloud,coolify}.svg` — bundled brand icons
- `OpenHands/src/components/features/mcp-logo-badge.tsx` — registered local icons
- `OpenHands/__tests__/constants/extensions-catalogs.test.ts` — 3 new test assertions