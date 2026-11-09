# Google Search Automation Deployment

## Current Production Status

The existing Google Search connection is active, but the SEO Sitemap Engine v2
migration and the current Edge Function and Worker revisions are not deployed from
this checkout. Local verification is not a production acceptance result. Follow the
ordered release in `docs/implementation/SEO-SITEMAP-V2-AUDIT.md` before treating the
new compiler, R2 artifacts, or IndexNow path as live.

## Google Cloud Setup

Use one production Google Cloud project for StoreBlink and enable:

1. Google Search Console API
2. Google Site Verification API
3. OAuth consent screen for the StoreBlink application

Create an OAuth client of type **Web application** with:

- Authorized JavaScript origin: `https://storeblink.com`
- Authorized redirect URI: `https://storeblink.com/domain/connect/google/callback`

StoreBlink needs the OAuth **client ID** and **client secret** from this client. Add
them directly in the Supabase dashboard or CLI; do not paste the secret into chat.

Request these exact scopes:

```text
openid
email
https://www.googleapis.com/auth/siteverification
https://www.googleapis.com/auth/webmasters
```

The Google consent app must be published and approved for production users. While
the app is in testing mode, only configured test users can connect.

## Supabase Edge Secrets

Configure these directly in the linked Supabase project. Never send the client
secret or encryption key through chat, browser code, or a `VITE_*` variable.

```text
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_REDIRECT_URI=https://storeblink.com/domain/connect/google/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=<32 random bytes encoded as base64url>
GOOGLE_TOKEN_ENCRYPTION_KEY_VERSION=1
GOOGLE_STOREFRONT_META_INJECTION_ENABLED=true
```

## Encryption Key Rotation

Google refresh tokens, PKCE verifiers, and site-verification tokens use a versioned
AES-256-GCM envelope with purpose-specific authenticated context. Never replace the
active key in place: existing merchant connections would become unreadable.

Use this order for a zero-downtime rotation:

1. Apply the v2 database migration and deploy the rotation-capable
   `domain-orchestrator` and `storefront-seo` revisions while the existing key remains
   version `1`.
2. Generate a new 32-byte base64url key in an approved secret manager.
3. Atomically configure the new key as `GOOGLE_TOKEN_ENCRYPTION_KEY` with
   `GOOGLE_TOKEN_ENCRYPTION_KEY_VERSION=2`; retain the old key in
   `GOOGLE_TOKEN_ENCRYPTION_PREVIOUS_KEY` with version `1`.
4. Normal token refreshes lazily re-encrypt merchant refresh tokens. Storefront head
   resolution lazily re-encrypts site-verification tokens. PKCE rows expire quickly
   and all newly created rows use version `2`.
5. Verify no durable ciphertext remains on the previous version:

```sql
select 'integration' as source, token_key_version, count(*)
from public.google_integrations
where refresh_token_ciphertext is not null
group by token_key_version
union all
select 'verification', token_key_version, count(*)
from public.google_site_verifications
where token_ciphertext is not null
group by token_key_version;
```

6. Wait at least ten minutes for pre-rotation OAuth states to expire, then remove both
   `GOOGLE_TOKEN_ENCRYPTION_PREVIOUS_*` secrets. Keep only version `2`.

Do not place either key in a repository file, browser variable, terminal transcript,
issue, or chat. A failed rewrap write does not interrupt metadata serving; it remains
visible in Edge logs and retries on the next request.

After adding the client values, deploy the Worker with a separate deployment token:

```powershell
$env:CLOUDFLARE_API_TOKEN='<workers-deployment-token>'
npm run deploy
```

The deployment token needs Account / Workers Scripts / Edit and Zone / Workers
Routes / Edit for `storeblink.com`. It is separate from the least-privileged token
used by the domain Custom Hostnames orchestrator.

Verify the Worker before enabling Google automation:

```text
https://buy.skieshare.com/robots.txt   -> StoreBlink robots policy
https://buy.skieshare.com/sitemap.xml -> application/xml sitemap
https://buy.skieshare.com/             -> trusted SEO response header and head tags
```

## Production Routes

```text
Merchant UI:       https://storeblink.com/domain/connect/google
OAuth callback:    https://storeblink.com/domain/connect/google/callback
Store robots:      https://<merchant-domain>/robots.txt
Store sitemap:     https://<merchant-domain>/sitemap.xml
```

The callback route is a StoreBlink application route. It exchanges the provider
code through `domain-orchestrator`; Google secrets and tokens never enter the URL or
browser bundle.

## Automatic Merchant Flow

1. Merchant activates a primary custom domain.
2. Merchant clicks **Connect Google** once and approves the Google consent screen.
3. StoreBlink requests and injects the per-domain META verification token.
4. StoreBlink verifies ownership and adds the URL-prefix Search Console property.
5. StoreBlink submits the domain sitemap.
6. Publish/product/page events re-submit the sitemap automatically.
7. Daily jobs synchronize Search Analytics and bounded URL Inspection status.

The merchant does not need to open Search Console, add a property manually, paste a
verification tag, or submit a sitemap manually.

## Accuracy Boundary

Google's URL Inspection API reports index state; it does not request general page
indexing. Google's Indexing API is not used because normal ecommerce pages are not
eligible. StoreBlink makes published URLs crawlable, emits canonical metadata and
structured data, keeps the sitemap current, and monitors Google's result without
claiming or fabricating an indexed state.
