import { Mail } from 'lucide-react';
import { Card, CardHeader, CardBody, EmptyState } from '../../components/ui';

/**
 * Resident messages page (stub — S6 will replace with thread list and a
 * read/compose pane for estate-office conversations).
 */
export function ResidentMessagesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Mail aria-hidden size={20} className="text-(--color-primary)" />
        <h1 className="text-lg font-semibold text-(--color-ink)">Messages</h1>
      </div>
      <Card>
        <CardHeader title="Messages" subtitle="Conversations with the estate office." />
        <CardBody>
          <EmptyState
            title="Messages coming soon"
            body="Your conversations with the estate office will appear here."
          />
        </CardBody>
      </Card>
    </div>
  );
}
