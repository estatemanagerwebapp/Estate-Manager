# Environment reference

All variables are read by `apps/api/src/config/env.ts` and validated with
Zod at startup. An invalid value aborts the process with a secret-free error
listing every problem.

| Variable               | Required | Default                 | Notes                                                          |
| ---------------------- | -------- | ----------------------- | -------------------------------------------------------------- |
| `NODE_ENV`             | no       | `development`           | `development` \| `test` \| `production`                        |
| `APP_NAME`             | no       | `Silverstone Managers`  | Logged and returned in health                                  |
| `PORT`                 | no       | `4000`                  | 1–65535                                                        |
| `API_BASE_PATH`        | no       | `/api/v1`               | Must start with `/`                                            |
| `CORS_ORIGINS`         | no*      | `http://localhost:5173` | *Required in production. Comma-separated. No `*` in production |
| `BODY_LIMIT`           | no       | `1mb`                   | Express body-parser limit (e.g. `2kb`, `5mb`)                  |
| `TRUST_PROXY`          | no       | `0`                     | 0 = off; 1..n = trust n hops                                   |
| `LOG_LEVEL`            | no       | `info`                  | `fatal`\|`error`\|`warn`\|`info`\|`debug`\|`trace`\|`silent`   |
| `RATE_LIMIT_WINDOW_MS` | no       | `900000`                | Minimum 1000                                                   |
| `RATE_LIMIT_MAX`       | no       | `300`                   | Minimum 1. Health probes are exempt                            |
| `DATABASE_URL`         | **yes**  | —                       | `postgresql://user:pass@host:port/db` (password required)      |
| `ORGANIZATION_SLUG`    | no       | `silverstone`           | Lowercase `[a-z][a-z0-9_]{0,63}`                               |
| `SHUTDOWN_TIMEOUT_MS`  | no       | `10000`                 | 1000–120000                                                    |

## Production checklist

- Set `NODE_ENV=production`.
- Set `CORS_ORIGINS` to your operator-console origin(s).
- Use a strong `DATABASE_URL` (SSL-terminated).
- Set `TRUST_PROXY` to match your reverse-proxy hop count.
- Set `LOG_LEVEL=info` (or `warn` for minimal log volume).
