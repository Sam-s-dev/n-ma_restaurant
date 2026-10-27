import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../Button';
import { Card } from '../Card';
import { SessionResult } from './CashSessionPanel';
import { ConfirmSheet } from './ConfirmSheet';
import { ListRow, RowDivider, SectionHeader } from './ListRow';
import { Sheet } from './Sheet';
import { ApiError } from '../../api/client';
import { correctSession, listSessions } from '../../api/workspace/sessions';
import type { CashSession } from '../../api/workspace/sessions';
import { formatDateTime } from '../../utils/date';
import { printZReport } from '../../utils/zReport';
import { useWorkspace } from '../../screens/workspace/WorkspaceContext';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/layout';

/**
 * Historique des clôtures, pour le gérant. C'est ici que se repère un
 * tiroir toujours un peu court, jour après jour, ou chez un même caissier.
 */
export function SessionsHistory({ refreshKey }: { refreshKey: unknown }) {
  const { money, currency, profile, can, notify, refreshBalance } = useWorkspace();
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [detail, setDetail] = useState<CashSession | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const page = await listSessions({ limit: 10 });
      setSessions(page.items.filter((session) => session.status === 'closed'));
    } catch {
      // L'historique est un complément : son absence ne bloque pas l'écran.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function correct() {
    if (!detail) return;
    setCorrecting(true);
    setError(null);
    try {
      const updated = await correctSession(detail.id);
      setConfirmOpen(false);
      setDetail(updated);
      refreshBalance();
      notify('Solde de caisse corrigé');
      void load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Correction impossible.');
    } finally {
      setCorrecting(false);
    }
  }

  if (sessions.length === 0) return null;

  const difference = detail?.cashDifference ?? 0;
  const canCorrect = Boolean(detail && difference !== 0 && !detail.correctedAt && can('cash.manage'));

  return (
    <View style={styles.block}>
      <SectionHeader title="Clôtures de caisse" caption="Les dix dernières journées" />
      <Card>
        {sessions.map((session, index) => {
          const gap = session.cashDifference ?? 0;
          return (
            <View key={session.id}>
              {index > 0 && <RowDivider />}
              <ListRow
                icon={gap === 0 ? 'check' : 'alert'}
                iconColor={gap === 0 ? colors.iconGreen : colors.iconRed}
                iconBackground={gap === 0 ? colors.pastelGreen : colors.pastelRed}
                title={`${session.reference} · ${session.closedByName ?? '—'}`}
                subtitle={`${session.closedAt ? formatDateTime(session.closedAt) : ''} · ${
                  session.summary?.sales.count ?? 0
                } vente(s)`}
                value={gap === 0 ? 'Juste' : `${gap > 0 ? '+' : ''}${money(gap)}`}
                valueTone={gap === 0 ? 'positive' : 'negative'}
                valueCaption={gap !== 0 ? (session.correctedAt ? 'Corrigé' : 'À examiner') : undefined}
                onPress={() => {
                  setError(null);
                  setDetail(session);
                }}
              />
            </View>
          );
        })}
      </Card>

      <Sheet
        visible={Boolean(detail) && !confirmOpen}
        title={detail?.reference ?? ''}
        subtitle={detail?.closedAt ? `Clôturée le ${formatDateTime(detail.closedAt)}` : undefined}
        error={error}
        onClose={() => setDetail(null)}
        actions={
          <>
            {canCorrect && (
              <Button
                label={`Corriger le solde de ${difference > 0 ? '+' : ''}${money(difference)}`}
                onPress={() => setConfirmOpen(true)}
              />
            )}
            <Button
              label="Imprimer le ticket Z"
              onPress={() => detail && void printZReport(detail, profile.restaurant.name, currency)}
              variant="secondary"
            />
          </>
        }
      >
        {detail && (
          <>
            <SessionResult session={detail} money={money} />
            {Boolean(detail.correctedAt) && (
              <Text style={styles.note}>
                Écart corrigé par {detail.correctedByName ?? '—'} le{' '}
                {formatDateTime(detail.correctedAt as string)}.
              </Text>
            )}
          </>
        )}
      </Sheet>

      <ConfirmSheet
        visible={confirmOpen}
        title="Corriger le solde de caisse"
        message={`Le solde de l’application sera aligné sur ce qui a été compté (${
          difference > 0 ? '+' : ''
        }${money(difference)}). L’écriture reste visible dans le grand livre.`}
        confirmLabel="Corriger"
        loading={correcting}
        error={error}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void correct()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: spacing.xl,
  },
  note: {
    ...typography.small,
    color: colors.textTertiary,
    marginTop: spacing.md,
  },
});
