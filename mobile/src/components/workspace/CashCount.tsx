import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AmountField } from './Field';
import { Stepper } from './Stepper';
import { GNF_DENOMINATIONS } from '../../api/workspace/sessions';
import { parseAmount } from '../../utils/money';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { spacing } from '../../theme/layout';

export interface CashCountValue {
  total: number;
  /** Nombre de billets par valeur, sans les lignes à zéro. */
  breakdown: Record<string, number>;
}

interface CashCountProps {
  /** Remis à zéro chaque fois que la clé change (nouvelle ouverture de feuille). */
  resetKey: unknown;
  money: (value: number) => string;
  currencySymbol: string;
  onChange: (value: CashCountValue) => void;
}

/**
 * Comptage du tiroir billet par billet : on tape « 3 billets de 20 000 »,
 * l'application fait l'addition. Une ligne libre recueille les pièces et
 * tout ce qui ne rentre pas dans les cases.
 */
export function CashCount({ resetKey, money, currencySymbol, onChange }: CashCountProps) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loose, setLoose] = useState('');

  useEffect(() => {
    setCounts({});
    setLoose('');
  }, [resetKey]);

  const total = useMemo(
    () =>
      GNF_DENOMINATIONS.reduce((sum, value) => sum + value * (counts[String(value)] ?? 0), 0) +
      (parseAmount(loose) ?? 0),
    [counts, loose],
  );

  // onChange est recréé à chaque rendu du parent : on garde la dernière
  // version sans en faire une dépendance, sinon l'effet tournerait en boucle.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const breakdown = Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));
    onChangeRef.current({ total, breakdown });
  }, [total, counts]);

  return (
    <View>
      {GNF_DENOMINATIONS.map((value) => {
        const count = counts[String(value)] ?? 0;
        return (
          <View key={value} style={styles.row}>
            <Text style={styles.denomination}>{money(value)}</Text>
            <Stepper
              value={count}
              onChange={(next) => setCounts((current) => ({ ...current, [String(value)]: next }))}
              max={9999}
              compact
            />
            <Text style={styles.subtotal} numberOfLines={1}>
              {count > 0 ? money(value * count) : '—'}
            </Text>
          </View>
        );
      })}

      <AmountField
        label="Pièces et autres montants"
        value={loose}
        onChangeText={setLoose}
        placeholder="0"
        suffix={currencySymbol}
      />

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total compté</Text>
        <Text style={styles.totalValue}>{money(total)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  denomination: {
    ...typography.bodyStrong,
    fontSize: 14,
    width: 96,
  },
  subtotal: {
    ...typography.small,
    flex: 1,
    textAlign: 'right',
    color: colors.textSecondary,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  totalLabel: {
    ...typography.bodyStrong,
  },
  totalValue: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textPrimary,
  },
});
