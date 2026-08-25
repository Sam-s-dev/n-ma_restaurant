import { Image, Platform, Share, StyleSheet, Text, View } from 'react-native';
import { API_URL } from '../../api/client';
import { PAYMENT_LABELS } from '../../api/workspace/sales';
import type { Receipt as ReceiptData } from '../../api/workspace/sales';
import { formatMoney } from '../../utils/money';
import { formatDateTime } from '../../utils/date';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, spacing } from '../../theme/layout';

interface ReceiptProps {
  data: ReceiptData;
}

/**
 * Ticket de caisse aux couleurs du restaurant (§3, §8).
 *
 * L'en-tête reprend le nom, le logo, l'adresse et le téléphone saisis dans
 * les paramètres : c'est le même ticket pour deux restaurants différents
 * qui n'aurait aucun sens. Le bord bas est dentelé comme un vrai ticket —
 * le gérant le reconnaît d'un coup d'œil quand il le montre au client.
 */
export function Receipt({ data }: ReceiptProps) {
  const { restaurant, sale } = data;
  const currency = {
    symbol: restaurant.currencySymbol,
    decimals: restaurant.currencyDecimals,
  };
  const money = (value: number) => formatMoney(value, currency);

  return (
    <View style={styles.ticket}>
      <View style={styles.header}>
        {restaurant.logoUrl ? (
          <Image
            source={{ uri: `${API_URL}${restaurant.logoUrl}` }}
            style={styles.logo}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.logoFallback}>
            <Text style={styles.logoInitials}>{initialsOf(restaurant.name)}</Text>
          </View>
        )}

        <Text style={styles.name} numberOfLines={2}>
          {restaurant.name}
        </Text>
        {Boolean(restaurant.address) && (
          <Text style={styles.contact} numberOfLines={2}>
            {restaurant.address}
          </Text>
        )}
        {Boolean(restaurant.phone) && <Text style={styles.contact}>{restaurant.phone}</Text>}
      </View>

      <View style={styles.dashed} />

      <View style={styles.meta}>
        <MetaRow label="Ticket" value={sale.reference} />
        <MetaRow label="Date" value={formatDateTime(sale.soldAt)} />
        <MetaRow
          label="Règlement"
          value={PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod}
        />
        {Boolean(sale.customerName) && (
          <MetaRow label="Client" value={sale.customerName as string} />
        )}
        {Boolean(sale.createdByName) && (
          <MetaRow label="Servi par" value={sale.createdByName as string} />
        )}
      </View>

      <View style={styles.dashed} />

      <View style={styles.lines}>
        {(sale.items ?? []).map((item) => (
          <View key={item.id} style={styles.line}>
            <Text style={styles.lineQuantity}>{item.quantity}×</Text>
            <Text style={styles.lineName} numberOfLines={2}>
              {item.dishName}
            </Text>
            <Text style={styles.lineTotal}>{money(item.lineTotal)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.dashed} />

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>TOTAL</Text>
        <Text style={styles.totalValue}>{money(sale.totalAmount)}</Text>
      </View>

      {sale.credit && (
        <View style={styles.creditBox}>
          <Text style={styles.creditText}>
            Réglé à crédit — reste dû : {money(sale.credit.amountLeft)}
            {sale.credit.dueDate ? ` (échéance ${sale.credit.dueDate})` : ''}
          </Text>
        </View>
      )}

      {sale.status === 'cancelled' && (
        <View style={styles.cancelBox}>
          <Text style={styles.cancelText}>VENTE ANNULÉE</Text>
          {Boolean(sale.cancelReason) && (
            <Text style={styles.cancelReason}>{sale.cancelReason}</Text>
          )}
        </View>
      )}

      {Boolean(sale.note) && <Text style={styles.note}>{sale.note}</Text>}

      <Text style={styles.thanks}>Merci de votre visite</Text>

      {/* Dentelure du bas, comme un ticket déchiré. */}
      <View style={styles.teeth}>
        {Array.from({ length: 22 }, (_, index) => (
          <View key={index} style={styles.tooth} />
        ))}
      </View>
    </View>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Partage du ticket en texte : ni impression ni PDF ici, mais un message
 * WhatsApp ou SMS que le client reçoit tout de suite — c'est ce qui se
 * pratique, et cela n'exige aucun matériel.
 */
export async function shareReceipt(data: ReceiptData): Promise<void> {
  const { restaurant, sale } = data;
  const currency = {
    symbol: restaurant.currencySymbol,
    decimals: restaurant.currencyDecimals,
  };
  const money = (value: number) => formatMoney(value, currency);

  const lines = (sale.items ?? [])
    .map((item) => `  ${item.quantity} × ${item.dishName}  ${money(item.lineTotal)}`)
    .join('\n');

  const text = [
    restaurant.name.toUpperCase(),
    restaurant.address ?? '',
    restaurant.phone ?? '',
    '',
    `Ticket ${sale.reference}`,
    formatDateTime(sale.soldAt),
    '',
    lines,
    '',
    `TOTAL : ${money(sale.totalAmount)}`,
    `Règlement : ${PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod}`,
    sale.credit ? `Reste dû : ${money(sale.credit.amountLeft)}` : '',
    '',
    'Merci de votre visite.',
  ]
    .filter((part) => part !== '')
    .join('\n');

  // `Share` n'existe pas sur navigateur dans React Native Web : on retombe
  // sur le presse-papiers du navigateur quand il est disponible.
  if (Platform.OS === 'web') {
    const navigatorRef = globalThis.navigator as
      | { share?: (data: { text: string }) => Promise<void>; clipboard?: Clipboard }
      | undefined;

    if (navigatorRef?.share) {
      await navigatorRef.share({ text });
      return;
    }
    await navigatorRef?.clipboard?.writeText(text);
    return;
  }

  await Share.share({ message: text });
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

const styles = StyleSheet.create({
  ticket: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingBottom: 0,
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
  },
  logo: {
    width: 60,
    height: 60,
    marginBottom: spacing.sm,
  },
  logoFallback: {
    width: 54,
    height: 54,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  logoInitials: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textOnPrimary,
  },
  name: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    lineHeight: 23,
    letterSpacing: 0.5,
    color: colors.textPrimary,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  contact: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  dashed: {
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    marginVertical: spacing.lg,
  },
  meta: {
    gap: 3,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  metaLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textTertiary,
  },
  metaValue: {
    flexShrink: 1,
    fontFamily: fontFamily.medium,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textPrimary,
    textAlign: 'right',
  },
  lines: {
    gap: spacing.sm,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  lineQuantity: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    minWidth: 24,
  },
  lineName: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textPrimary,
  },
  lineTotal: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textPrimary,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 1,
    color: colors.textPrimary,
  },
  totalValue: {
    fontFamily: fontFamily.bold,
    fontSize: 19,
    lineHeight: 25,
    color: colors.primary,
  },
  creditBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.warningSoft,
  },
  creditText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    lineHeight: 16,
    color: colors.warning,
    textAlign: 'center',
  },
  cancelBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
  },
  cancelText: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 1,
    color: colors.danger,
  },
  cancelReason: {
    ...typography.small,
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  note: {
    ...typography.small,
    fontSize: 11,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  thanks: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  teeth: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: -spacing.xl,
    marginBottom: -7,
  },
  tooth: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.background,
  },
});
