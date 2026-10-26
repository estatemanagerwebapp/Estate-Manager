import { FileText } from 'lucide-react';
import { Card, CardHeader, CardBody, EmptyState } from '../../components/ui';

/**
 * Resident finance page (stub — S3 will replace with outstanding bills, paid
 * bills, payment history and transaction history).
 */
export function ResidentInvoicesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileText aria-hidden size={20} className="text-(--color-primary)" />
        <h1 className="text-lg font-semibold text-(--color-ink)">Invoices &amp; Payments</h1>
      </div>
      <Card>
        <CardHeader
          title="Billing"
          subtitle="Outstanding bills, paid bills, payment and transaction history."
        />
        <CardBody>
          <EmptyState
            title="Finance data coming soon"
            body="Your invoices, payments and transaction history will appear here."
          />
        </CardBody>
      </Card>
    </div>
  );
}
