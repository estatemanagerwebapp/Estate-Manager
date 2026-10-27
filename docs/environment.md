# Environment reference

All variables are read by `apps/api/src/config/env.ts` and validated with
Zod at startup. An invalid value aborts the process with a secret-free error
listing every problem.

| Variable                  | Required | Default                      | Notes                                                                          |
| ------------------------- | -------- | ---------------------------- | ------------------------------------------------------------------------------ |
| `NODE_ENV`                | no       | `development`                | `development` \| `test` \| `production`                                        |
| `APP_NAME`                | no       | `Silverstone Managers`       | Logged and returned in health                                                  |
| `PORT`                    | no       | `4000`                       | 1–65535                                                                        |
| `API_BASE_PATH`           | no       | `/api/v1`                    | Must start with `/`                                                            |
| `CORS_ORIGINS`            | no*      | `http://localhost:5173`      | *Required in production. Comma-separated. No `*` in production                 |
| `BODY_LIMIT`              | no       | `1mb`                        | Express body-parser limit (e.g. `2kb`, `5mb`)                                  |
| `TRUST_PROXY`             | no       | `0`                          | 0 = off; 1..n = trust n hops                                                   |
| `LOG_LEVEL`               | no       | `info`                       | `fatal`\|`error`\|`warn`\|`info`\|`debug`\|`trace`\|`silent`                   |
| `RATE_LIMIT_WINDOW_MS`    | no       | `900000`                     | Minimum 1000                                                                   |
| `RATE_LIMIT_MAX`          | no       | `300`                        | Minimum 1. Health probes are exempt                                            |
| `DATABASE_URL`            | **yes**  | —                            | `postgresql://user:pass@host:port/db` (password required)                      |
| `ORGANIZATION_SLUG`       | no       | `silverstone`                | Lowercase `[a-z][a-z0-9_]{0,63}`                                               |
| `SHUTDOWN_TIMEOUT_MS`     | no       | `10000`                      | 1000–120000                                                                    |
| `SESSION_LIFETIME_DAYS`   | no       | `7`                          | Session cookie lifetime (days)                                                 |
| `WEB_BASE_URL`            | no       | `http://localhost:5173`      | Absolute http(s) base URL of the web console; used to build reset links        |
| `RESET_TOKEN_TTL_MINUTES` | no       | `60`                         | Password-reset token lifetime (minutes)                                        |
| `EMAIL_PROVIDER`          | no       | `console`                    | `console` \| `resend` \| `mock`                                                |
| `RESEND_API_KEY`          | no*      | —                            | *Required when `EMAIL_PROVIDER=resend`                                         |
| `EMAIL_FROM`              | no       | `no-reply@silverstone.local` | From address for outbound email                                                |
| `MEDIA_STORAGE`           | no       | `local`                      | `local` \| `r2`; use `r2` on Vercel because function filesystems are ephemeral |
| `R2_ACCOUNT_ID`           | no*      | —                            | *Required when `MEDIA_STORAGE=r2`; Cloudflare account ID                       |
| `R2_ACCESS_KEY_ID`        | no*      | —                            | *Required when `MEDIA_STORAGE=r2`; R2 API token access key                     |
| `R2_SECRET_ACCESS_KEY`    | no*      | —                            | *Required when `MEDIA_STORAGE=r2`; R2 API token secret                         |
| `R2_BUCKET_NAME`          | no*      | —                            | *Required when `MEDIA_STORAGE=r2`; private R2 bucket name                      |

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
- Set `MEDIA_STORAGE=r2` and configure the four `R2_*` variables for durable,
  private ID-document storage. R2 credentials must have access only to the
  intended bucket; do not make the bucket public.
- After the first `db:deploy` + `db:seed`, run `ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run bootstrap:admin` to create the first `SUPER_ADMIN`.
