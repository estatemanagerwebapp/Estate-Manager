import type { Logger } from 'pino';

/**
 * Email delivery adapter.
 *
 * The auth service depends on this interface so it is never coupled to one
 * provider. The default concrete implementation sends through the provider
 * configured via `EMAIL_PROVIDER` (`console` for local development,
 * `resend` for production). Tests inject a mock adapter.
 *
 * Provider credentials are read only from validated environment variables
 * and are never returned by any API route or logged.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailAdapter {
  readonly provider: 'console' | 'resend' | 'mock';
  /**
   * Send the message. Resolves only when the provider has *accepted* the
   * message; rejects on transport failure so the caller can report an honest
   * outcome instead of claiming delivery.
   */
  send(message: EmailMessage): Promise<void>;
}

/**
 * Local-development adapter: logs the message to the server log (without the
 * token) and does not deliver to an external provider. A deployment running
 * this adapter must never claim that a reset email was delivered — callers
 * check `provider` and surface that honestly.
 */
export class ConsoleEmailAdapter implements EmailAdapter {
  readonly provider = 'console' as const;

  constructor(private readonly logger: Logger) {}

  async send(message: EmailMessage): Promise<void> {
    // The token lives in `text`/`html`; log only metadata so a leaked log
    // line can't hand out a working reset credential.
    this.logger.info(
      { to: message.to, subject: message.subject },
      'console email adapter: message captured (not delivered)',
    );
  }
}

/** No-op adapter for unit tests. Records what would have been sent. */
export class MockEmailAdapter implements EmailAdapter {
  readonly provider = 'mock' as const;
  readonly sent: EmailMessage[] = [];

  /** Test hook: simulate provider failure. */
  failNext = false;

  async send(message: EmailMessage): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('mock email provider failure');
    }
    this.sent.push(message);
  }
}

/**
 * Resend provider. Constructed from validated environment values
 * (`RESEND_API_KEY`); refuses to boot without one.
 */
export class ResendEmailAdapter implements EmailAdapter {
  readonly provider = 'resend' as const;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly logger: Logger,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: message.to,
        subject: message.subject,
        ...(message.html ? { html: message.html } : {}),
        ...(message.html ? {} : { text: message.text }),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(
        { provider: 'resend', status: response.status, body: body.slice(0, 500) },
        'resend rejected the message',
      );
      throw new Error(`email provider rejected the message (status ${response.status})`);
    }

    this.logger.info({ to: message.to, subject: message.subject }, 'resend accepted the message');
  }
}
