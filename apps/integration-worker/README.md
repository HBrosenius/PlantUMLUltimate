# Jira integration Worker

Cloudflare Worker that keeps Atlassian OAuth tokens out of the browser and proxies the Jira operations used by the Gantt importer.

## Configure

1. Create an Atlassian OAuth 2.0 (3LO) app with the callback URL `https://<worker-host>/oauth/callback` and the scopes listed in `src/index.ts`.
2. Create a D1 database and replace the placeholder `database_id` in `wrangler.jsonc`.
3. Set `ATLASSIAN_CLIENT_ID` in `wrangler.jsonc`.
4. Generate a 32-byte base64url key and add both secrets:

   ```sh
   openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
   npx wrangler secret put ATLASSIAN_CLIENT_SECRET
   npx wrangler secret put TOKEN_ENCRYPTION_KEY
   ```

5. Apply the schema and deploy:

   ```sh
   npx wrangler d1 migrations apply plantuml-ultimate-jira --remote
   npx wrangler deploy
   ```

Set `VITE_JIRA_INTEGRATION_URL` in the web deployment to the Worker origin. `ALLOWED_ORIGINS` allows only the production app. For a local Worker, run `npx wrangler dev --var ALLOWED_ORIGINS:http://localhost:5173` and point `VITE_JIRA_INTEGRATION_URL` at it; the deployed Worker no longer accepts a local dev server. Over HTTPS the session cookies use the `__Host-` prefix.

Pushes to `main` that change the integration Worker automatically run its tests and type checks, apply pending remote D1 migrations, and deploy it through `.github/workflows/deploy-integration.yml`. The workflow uses the same `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets as the collaboration Worker. The Atlassian client secret and token-encryption key remain Worker secrets and are not stored in GitHub.

## Verify

```sh
npm run test:integration
npm run build:integration
```
