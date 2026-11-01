import { useAuth } from '../auth/AuthContext';
import { GuardOverviewPage } from './GuardOverviewPage';
import { OverviewPage } from './OverviewPage';

/**
 * Role-aware operator home.
 *
 * The `GUARD` role has a single job — watch SOS and run entry/exit
 * verifications — so it gets a focused gate desk. Every other staff role keeps
 * the full operator overview.
 */
export function DashboardHome() {
  const { user } = useAuth();

  if (user?.role === 'GUARD') {
    return <GuardOverviewPage />;
  }

  return <OverviewPage />;
}
