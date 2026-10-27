import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../Button';
import { Icon } from '../Icon';
import { CashCount } from './CashCount';
import type { CashCountValue } from './CashCount';
import { AmountField, Field } from './Field';
import { Sheet } from './Sheet';
import { ApiError } from '../../api/client';
import { closeSession, fetchCurrentSession, openSession } from '../../api/workspace/sessions';
import type { CashSession } from '../../api/workspace/sessions';
import { formatTime } from '../../utils/date';
import { parseAmount } from '../../utils/money';
import { printZReport } from '../../utils/zReport';
import { useWorkspace } from '../../screens/workspace/WorkspaceContext';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, spacing } from '../../theme/layout';

interface CashSessionPanelProps {
  /** Prévient l'écran parent : l'écran de vente se bloque tant que la caisse est fermée. */
  onSessionChange?: (session: CashSession | null) => void;
  /** Appelé après une clôture, pour rafraîchir un historique affiché à côté. */
  onClosed?: (session: CashSession) => void;
}

/**
 * Bandeau d'ouverture et de clôture de la caisse.
 *
 * Le caissier commence sa journée en comptant le fond de caisse, et la
 * termine en comptant le tiroir — à l'aveugle : il ne voit pas ce qui est
 * attendu. Le gérant, lui, voit le résultat de la clôture et peut imprimer
 * le ticket Z.
 */
export function CashSessionPanel({ onSessionChange, onClosed }: CashSessionPanelProps) {
  const { can, money, currency, profile, notify, refreshBalance } = useWorkspace();
  const [session, setSession] = useState<CashSession | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [openSheet, setOpenSheet] = useState(false);
  const [closeSheet, setCloseSheet] = useState(false);
  const [result, setResult] = useState<CashSession | null>(null);

  const load = useCallback(async () => {
    try {
      const current = await fetchCurrentSession();
      setSession(current);
      onSessionChange?.(current);
    } catch {
      // Le bandeau reste masqué si la lecture échoue : la vente, elle, dira
      // clairement que la caisse est fermée.
    } finally {
      setLoaded(true);
    }
  }, [onSessionChange]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!can('cash.session') || !loaded) return null;

  return (
    <>
      <View style={[styles.card, session ? styles.cardOpen : styles.cardClosed]}>
        <View style={styles.icon}>
          <Icon
            name={session ? 'check' : 'lock'}
            size={17}
            color={session ? colors.success : colors.warning}
            strokeWidth={2.4}
          />
        </View>
        <View style={styles.texts}>
          <Text style={styles.title}>{session ? 'Caisse ouverte' : 'Caisse fermée'}</Text>
          <Text style={styles.caption} numberOfLines={2}>
            {session
              ? `Depuis ${formatTime(session.openedAt)} · ${session.openedByName ?? '—'} · fond ${money(session.openingFloat)}`
              : can('cash.manage')
                ? 'Ouvrez-la pour suivre la journée et la clôturer ce soir.'
                : 'Comptez le fond de caisse pour commencer à encaisser.'}
          </Text>
        </View>
        <Button
          label={session ? 'Clôturer' : 'Ouvrir'}
          onPress={() => (session ? setCloseSheet(true) : setOpenSheet(true))}
          variant={session ? 'secondary' : 'primary'}
          style={styles.action}
        />
      </View>

      <OpenSheet
        visible={openSheet}
        onClose={() => setOpenSheet(false)}
        onDone={(opened) => {
          setOpenSheet(false);
          setSession(opened);
          onSessionChange?.(opened);
          notify('Caisse ouverte');
        }}
      />

      <CloseSheet
        visible={closeSheet}
        onClose={() => setCloseSheet(false)}
        onDone={(closed) => {
          setCloseSheet(false);
          setSession(null);
          onSessionChange?.(null);
          refreshBalance();
          onClosed?.(closed);
          // Le résultat n'est montré qu'à qui a le droit de le voir.
          if (closed.expectedCash !== undefined) setResult(closed);
          else notify('Caisse clôturée. Le gérant a été prévenu.');
        }}
      />

      <Sheet
        visible={Boolean(result)}
        title="Caisse clôturée"
        subtitle={result?.reference}
        onClose={() => setResult(null)}
        actions={
          <>
            <Button
              label="Imprimer le ticket Z"
              onPress={() =>
                result && void printZReport(result, profile.restaurant.name, currency)
              }
            />
            <Button label="Fermer" onPress={() => setResult(null)} variant="secondary" />
          </>
        }
      >
        {result && <SessionResult session={result} money={money} />}
      </Sheet>
    </>
  );
}

/** Attendu, compté, écart : ce que le gérant lit d'abord après une clôture. */
export function SessionResult({
  session,
  money,
}: {
  session: CashSession;
  money: (value: number) => string;
}) {
  const difference = session.cashDifference ?? 0;
  const mmDifference = session.mobileMoneyDifference;

  return (
    <View>
      <View
        style={[
          styles.verdict,
          difference === 0 && !mmDifference ? styles.verdictOk : styles.verdictGap,
        ]}
      >
        <Text style={styles.verdictText}>
          {difference === 0 && !mmDifference
            ? 'Le compte tombe juste.'
            : `Écart espèces : ${difference > 0 ? '+' : ''}${money(difference)}${
                mmDifference ? ` · Mobile Money : ${mmDifference > 0 ? '+' : ''}${money(mmDifference)}` : ''
              }`}
        </Text>
      </View>
      <Row label="Fond de caisse" value={money(session.openingFloat)} />
      <Row label="Espèces attendues" value={money(session.expectedCash ?? 0)} />
      <Row label="Espèces comptées" value={money(session.countedCash ?? 0)} />
      {session.countedMobileMoney !== null && (
        <>
          <Row label="Mobile Money attendu" value={money(session.expectedMobileMoney ?? 0)} />
          <Row label="Mobile Money relevé" value={money(session.countedMobileMoney)} />
        </>
      )}
      {session.summary && (
        <>
          <Row
            label={`Ventes (${session.summary.sales.count})`}
            value={money(session.summary.sales.total)}
          />
          <Row label="Dépenses" value={money(session.summary.expenses)} />
        </>
      )}
      {Boolean(session.closeNote) && <Row label="Motif" value={session.closeNote as string} />}
      <Row label="Clôturée par" value={session.closedByName ?? '—'} />
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

// -------------------------------------------------------------------------

function OpenSheet({
  visible,
  onClose,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: (session: CashSession) => void;
}) {
  const { money, currency } = useWorkspace();
  const [count, setCount] = useState<CashCountValue>({ total: 0, breakdown: {} });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) setError(null);
  }, [visible]);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      onDone(await openSession({ openingFloat: count.total, breakdown: count.breakdown }));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Ouverture impossible.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      title="Ouvrir la caisse"
      subtitle="Comptez les espèces présentes dans le tiroir"
      error={error}
      onClose={onClose}
      actions={
        <Button label={`Ouvrir avec ${money(count.total)}`} onPress={submit} loading={saving} />
      }
    >
      <CashCount
        resetKey={visible}
        money={money}
        currencySymbol={currency.symbol}
        onChange={setCount}
      />
    </Sheet>
  );
}

function CloseSheet({
  visible,
  onClose,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: (session: CashSession) => void;
}) {
  const { money, currency } = useWorkspace();
  const [count, setCount] = useState<CashCountValue>({ total: 0, breakdown: {} });
  const [mobileMoney, setMobileMoney] = useState('');
  const [note, setNote] = useState('');
  const [needsNote, setNeedsNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setMobileMoney('');
    setNote('');
    setNeedsNote(false);
    setError(null);
  }, [visible]);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const mm = parseAmount(mobileMoney);
      onDone(
        await closeSession({
          countedCash: count.total,
          breakdown: count.breakdown,
          ...(mobileMoney.trim() !== '' && mm !== null ? { countedMobileMoney: mm } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      );
    } catch (cause) {
      // Le compte ne tombe pas juste : on demande de recompter, ou un motif,
      // sans dire de combien il s'écarte.
      if (cause instanceof ApiError && cause.status === 422) setNeedsNote(true);
      setError(cause instanceof ApiError ? cause.message : 'Clôture impossible.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      title="Clôturer la caisse"
      subtitle="Comptez le tiroir sans regarder les chiffres de la journée"
      error={error}
      onClose={onClose}
      actions={
        <Button label={`Clôturer avec ${money(count.total)}`} onPress={submit} loading={saving} />
      }
    >
      <CashCount
        resetKey={visible}
        money={money}
        currencySymbol={currency.symbol}
        onChange={setCount}
      />
      <AmountField
        label="Relevé Mobile Money (facultatif)"
        value={mobileMoney}
        onChangeText={setMobileMoney}
        placeholder="Total reçu sur le compte aujourd’hui"
        suffix={currency.symbol}
        hint="Le montant indiqué par Orange Money ou MTN MoMo pour la journée."
      />
      {needsNote && (
        <Field
          label="Motif de l’écart"
          value={note}
          onChangeText={setNote}
          placeholder="Erreur de rendu de monnaie, billet manquant…"
          multiline
          hint="Recomptez d’abord. Si l’écart persiste, expliquez-le : le gérant sera prévenu."
        />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardOpen: {
    backgroundColor: colors.successSoft,
    borderColor: colors.successSoft,
  },
  cardClosed: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningSoft,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  texts: {
    flex: 1,
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  caption: {
    ...typography.small,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
  },
  action: {
    minWidth: 96,
  },
  verdict: {
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  verdictOk: {
    backgroundColor: colors.successSoft,
  },
  verdictGap: {
    backgroundColor: colors.dangerSoft,
  },
  verdictText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
  },
  rowLabel: {
    ...typography.small,
    color: colors.textTertiary,
  },
  rowValue: {
    ...typography.bodyStrong,
    fontSize: 13,
    flex: 1,
    textAlign: 'right',
  },
});
