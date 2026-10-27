# Environment reference

All variables are read by `apps/api/src/config/env.ts` and validated with
Zod at startup. An invalid value aborts the process with a secret-free error
listing every problem.

| Variable                  | Required | Default                      | Notes                                                                             |
| ------------------------- | -------- | ---------------------------- | --------------------------------------------------------------------------------- |
| `NODE_ENV`                | no       | `development`                | `development` \| `test` \| `production`                                           |
| `APP_NAME`                | no       | `Silverstone Managers`       | Logged and returned in health                                                     |
| `PORT`                    | no       | `4000`                       | 1–65535                                                                           |
| `API_BASE_PATH`           | no       | `/api/v1`                    | Must start with `/`                                                               |
| `CORS_ORIGINS`            | no*      | `http://localhost:5173`      | *Required in production. Comma-separated. No `*` in production                    |
| `BODY_LIMIT`              | no       | `1mb`                        | Express body-parser limit (e.g. `2kb`, `5mb`)                                     |
| `TRUST_PROXY`             | no       | `0`                          | 0 = off; 1..n = trust n hops                                                      |
| `LOG_LEVEL`               | no       | `info`                       | `fatal`\|`error`\|`warn`\|`info`\|`debug`\|`trace`\|`silent`                      |
| `RATE_LIMIT_WINDOW_MS`    | no       | `900000`                     | Minimum 1000                                                                      |
| `RATE_LIMIT_MAX`          | no       | `300`                        | Minimum 1. Health probes are exempt                                               |
| `DATABASE_URL`            | **yes**  | —                            | `postgresql://user:pass@host:port/db` (password required); see pooling note below |
| `ORGANIZATION_SLUG`       | no       | `silverstone`                | Lowercase `[a-z][a-z0-9_]{0,63}`                                                  |
| `SHUTDOWN_TIMEOUT_MS`     | no       | `10000`                      | 1000–120000                                                                       |
| `SESSION_LIFETIME_DAYS`   | no       | `7`                          | Session cookie lifetime (days)                                                    |
| `WEB_BASE_URL`            | no       | `http://localhost:5173`      | Absolute http(s) base URL of the web console; used to build reset links           |
| `RESET_TOKEN_TTL_MINUTES` | no       | `60`                         | Password-reset token lifetime (minutes)                                           |
| `EMAIL_PROVIDER`          | no       | `console`                    | `console` \| `resend` \| `mock`                                                   |
| `RESEND_API_KEY`          | no*      | —                            | *Required when `EMAIL_PROVIDER=resend`                                            |
| `EMAIL_FROM`              | no       | `no-reply@silverstone.local` | From address for outbound email                                                   |
| `MEDIA_STORAGE`           | no       | `local`                      | `local` \| `r2`; use `r2` on Vercel because function filesystems are ephemeral    |
| `ALLOW_EPHEMERAL_MEDIA`   | no       | `false`                      | Temporary: allow production to boot with local temp-dir media (not durable)       |
| `R2_ACCOUNT_ID`           | no*      | —                            | *Required when `MEDIA_STORAGE=r2`; Cloudflare account ID                          |
| `R2_ACCESS_KEY_ID`        | no*      | —                            | *Required when `MEDIA_STORAGE=r2`; R2 API token access key                        |
| `R2_SECRET_ACCESS_KEY`    | no*      | —                            | *Required when `MEDIA_STORAGE=r2`; R2 API token secret                            |
| `R2_BUCKET_NAME`          | no*      | —                            | *Required when `MEDIA_STORAGE=r2`; private R2 bucket name                         |

## Production checklist

- Set `NODE_ENV=production`.
- Set `CORS_ORIGINS` to your operator-console origin(s).
- Use a strong `DATABASE_URL` (SSL-terminated).
- Set `TRUST_PROXY` to match your reverse-proxy hop count.
- Set `LOG_LEVEL=info` (or `warn` for minimal log volume).
- Set `EMAIL_PROVIDER=resend` and `RESEND_API_KEY` (and `EMAIL_FROM`) for
  real password-reset delivery.
- Set `WEB_BASE_URL` to the public origin of the web console so reset
  links in emails are absolute.

## Serverless database pooling

Supabase's session-mode pooler (port `5432`) admits only **15 client
sessions** in total. A serverless platform runs many function instances, each
with its own Prisma pool, so a per-instance `connection_limit` above 1 can
exhaust that budget and surface as:

```text
P2024: Timed out fetching a new connection from the connection pool
```

The API defensively caps Vercel instances at `connection_limit=1` and
`pool_timeout=30`. That fits a small deployment, but the durable fix is to
point the runtime at Supabase's **transaction pooler** (port `6543`):

```text
postgresql://postgres.<ref>:<password>@aws-1-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

- Transaction mode multiplexes many function instances over a small number of
  real database connections.
- Keep the session-mode URL (port `5432`) in your local `.env` for
  `prisma migrate` — migrations hold a connection for their whole run.
- `pgbouncer=true` disables prepared statements, which transaction mode does
  not support.

- Set `MEDIA_STORAGE=r2` and configure the four `R2_*` variables for durable,
  private ID-document storage. R2 credentials must have access only to the
  intended bucket; do not make the bucket public. If you need to boot a first
  deployment before R2 exists, set `ALLOW_EPHEMERAL_MEDIA=true` — uploads then
  live in the function's temp directory and are lost on recycle.
- After the first `db:deploy` + `db:seed`, run `ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run bootstrap:admin` to create the first `SUPER_ADMIN`.

## Vercel notes

- The API build needs build-time type packages (`@types/node`,
  `@types/express`, `@types/cors`, `@types/multer`) and the web build needs
  `vite`; all are devDependencies. Because `NODE_ENV=production` makes
  `npm ci` omit devDependencies, `vercel.json` installs with
  `npm ci --include=dev` for both services. Keep that flag when editing an
  install command, or the build fails with `TS2688: Cannot find type
definition file for 'node'`.
