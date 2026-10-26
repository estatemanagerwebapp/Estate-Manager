import { KeyRound } from 'lucide-react';
import { Card, CardHeader, CardBody, EmptyState } from '../../components/ui';

/**
 * Resident access codes page (stub — S4 will replace with active codes,
 * generate, extend and deactivate).
 */
export function ResidentCodesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <KeyRound aria-hidden size={20} className="text-(--color-primary)" />
        <h1 className="text-lg font-semibold text-(--color-ink)">Access Codes</h1>
      </div>
      <Card>
        <CardHeader
          title="Entry / exit codes"
          subtitle="Active codes, generate new, extend or deactivate."
        />
        <CardBody>
          <EmptyState
            title="Access codes coming soon"
            body="Your entry and exit codes will be listed here."
          />
        </CardBody>
      </Card>
    </div>
  );
}
