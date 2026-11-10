/**
 * Log: a private journal Summit learns from. The whole page is
 * components/Log/Journal, which a Log block on a space's page draws too.
 */
import { Journal } from '@/components/Log/Journal';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function Log() {
  useDocumentTitle('Log');
  return <Journal />;
}
