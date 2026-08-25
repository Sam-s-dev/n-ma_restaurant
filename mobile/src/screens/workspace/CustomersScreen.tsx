import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { Segmented } from '../../components/workspace/Chips';
import { ConfirmSheet } from '../../components/workspace/ConfirmSheet';
import { Field } from '../../components/workspace/Field';
import { EmptyState, ListRow, RowDivider } from '../../components/workspace/ListRow';
import { ErrorState, LoadingState } from '../../components/workspace/ScreenState';
import { SearchField } from '../../components/workspace/SearchField';
import { Sheet } from '../../components/workspace/Sheet';
import { ApiError } from '../../api/client';
import {
  createCustomer,
  deleteCustomer,
  listCustomers,
  updateCustomer,
} from '../../api/workspace/customers';
import type { Customer } from '../../api/workspace/customers';
import { formatRelativeDay } from '../../utils/date';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, screenPadding, spacing } from '../../theme/layout';
import { useWorkspace } from './WorkspaceContext';

/**
 * §8 — Carnet de clients.
 *
 * Les fiches se créent d'elles-mêmes lors d'une vente à crédit ; cet écran
 * sert à les compléter (téléphone, note) et à voir d'un coup d'œil qui doit
 * de l'argent.
 */
export function CustomersScreen() {
  const { money, navigate, notify } = useWorkspace();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalDue, setTotalDue] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'debtors'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<{ open: boolean; customer: Customer | null }>({
    open: false,
    customer: null,
  });
  const [toDelete, setToDelete] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await listCustomers({
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(filter === 'debtors' ? { onlyDebtors: true } : {}),
      });
      setCustomers(result.items);
      setTotalDue(result.totalDue);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chargement des clients impossible.');
    } finally {
      setLoading(false);
    }
  }, [search, filter]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 300);
    return () => clearTimeout(timer);
  }, [load]);

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteCustomer(toDelete.id);
      setToDelete(null);
      notify('Client supprimé');
      await load();
    } catch (cause) {
      // Le backend refuse si une dette est en cours ou si des ventes sont
      // rattachées : son message est explicite, on le relaie.
      setDeleteError(cause instanceof ApiError ? cause.message : 'Suppression impossible.');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <LoadingState label="Chargement des clients…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
            tintColor={colors.primary}
          />
        }
      >
        <Card reveal={0} style={styles.summary}>
          <Text style={styles.summaryLabel}>Total dû par vos clients</Text>
          <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>
            {money(totalDue)}
          </Text>
          <Pressable onPress={() => navigate('credits')} hitSlop={8} accessibilityRole="button">
            <Text style={styles.summaryLink}>Voir le détail des créances →</Text>
          </Pressable>
        </Card>

        <SearchField value={search} onChangeText={setSearch} placeholder="Nom ou téléphone…" />

        <View style={styles.filters}>
          <Segmented
            options={[
              { value: 'all', label: 'Tous' },
              { value: 'debtors', label: 'Débiteurs' },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </View>

        <Pressable
          style={styles.actionButton}
          onPress={() => setForm({ open: true, customer: null })}
          accessibilityRole="button"
        >
          <Icon name="plus" size={16} color={colors.textOnPrimary} strokeWidth={2.5} />
          <Text style={styles.actionText}>Nouveau client</Text>
        </Pressable>

        {customers.length === 0 ? (
          <EmptyState
            icon="user"
            title={search || filter === 'debtors' ? 'Aucun résultat' : 'Aucun client'}
            message="Les clients apparaissent automatiquement dès qu’une vente est enregistrée à crédit."
          />
        ) : (
          <Card reveal={1}>
            {customers.map((customer, index) => (
              <View key={customer.id}>
                {index > 0 && <RowDivider />}
                <ListRow
                  initials={initialsOf(customer.fullName)}
                  iconColor={customer.totalDue > 0 ? colors.iconRed : colors.iconPink}
                  iconBackground={customer.totalDue > 0 ? colors.pastelRed : colors.pastelPink}
                  title={customer.fullName}
                  subtitle={`${customer.phone ?? 'Sans téléphone'}${
                    customer.lastCreditAt
                      ? ` · dernier crédit ${formatRelativeDay(customer.lastCreditAt.slice(0, 10))}`
                      : ''
                  }`}
                  value={customer.totalDue > 0 ? money(customer.totalDue) : '—'}
                  valueTone={customer.totalDue > 0 ? 'negative' : 'muted'}
                  valueCaption={
                    customer.openCredits > 0 ? `${customer.openCredits} créance(s)` : 'À jour'
                  }
                  onPress={() => setForm({ open: true, customer })}
                />
              </View>
            ))}
          </Card>
        )}
      </ScrollView>

      <CustomerSheet
        visible={form.open}
        customer={form.customer}
        onClose={() => setForm({ open: false, customer: null })}
        onDelete={(customer) => {
          setForm({ open: false, customer: null });
          setDeleteError(null);
          setToDelete(customer);
        }}
        onDone={(message) => {
          setForm({ open: false, customer: null });
          notify(message);
          void load();
        }}
      />

      <ConfirmSheet
        visible={Boolean(toDelete)}
        title="Supprimer le client"
        message={`La fiche de ${toDelete?.fullName ?? ''} sera supprimée. Impossible s’il reste une dette ou des ventes rattachées.`}
        confirmLabel="Supprimer"
        loading={deleting}
        error={deleteError}
        onCancel={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </View>
  );
}

interface CustomerSheetProps {
  visible: boolean;
  customer: Customer | null;
  onClose: () => void;
  onDelete: (customer: Customer) => void;
  onDone: (message: string) => void;
}

function CustomerSheet({ visible, customer, onClose, onDelete, onDone }: CustomerSheetProps) {
  const { money } = useWorkspace();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setFullName(customer?.fullName ?? '');
    setPhone(customer?.phone ?? '');
    setNote(customer?.note ?? '');
    setNameError(undefined);
    setError(null);
  }, [visible, customer]);

  async function submit() {
    if (fullName.trim().length < 2) {
      setNameError('Indiquez le nom du client.');
      return;
    }
    setNameError(undefined);
    setSaving(true);
    setError(null);

    try {
      const payload = {
        fullName: fullName.trim(),
        phone: phone.trim() === '' ? null : phone.trim(),
        note: note.trim() === '' ? null : note.trim(),
      };

      if (customer) {
        await updateCustomer(customer.id, payload);
        onDone('Fiche mise à jour');
      } else {
        await createCustomer(payload);
        onDone('Client ajouté');
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      title={customer ? 'Fiche client' : 'Nouveau client'}
      error={error}
      onClose={onClose}
      actions={
        <>
          <Button label="Enregistrer" onPress={submit} loading={saving} />
          {customer && (
            <Button
              label="Supprimer le client"
              onPress={() => onDelete(customer)}
              variant="ghost"
            />
          )}
        </>
      }
    >
      {customer && (
        <View style={styles.history}>
          <View style={styles.historyItem}>
            <Text style={styles.historyLabel}>Total accordé</Text>
            <Text style={styles.historyValue}>{money(customer.lifetimeCredited)}</Text>
          </View>
          <View style={styles.historyItem}>
            <Text style={styles.historyLabel}>Remboursé</Text>
            <Text style={[styles.historyValue, { color: colors.success }]}>
              {money(customer.lifetimeRepaid)}
            </Text>
          </View>
          <View style={styles.historyItem}>
            <Text style={styles.historyLabel}>Reste dû</Text>
            <Text
              style={[
                styles.historyValue,
                { color: customer.totalDue > 0 ? colors.danger : colors.success },
              ]}
            >
              {money(customer.totalDue)}
            </Text>
          </View>
        </View>
      )}

      <Field
        label="Nom complet"
        value={fullName}
        onChangeText={(value) => {
          setFullName(value);
          if (nameError) setNameError(undefined);
        }}
        placeholder="Mariama Diallo"
        error={nameError}
      />

      <Field
        label="Téléphone"
        value={phone}
        onChangeText={setPhone}
        placeholder="620 00 00 00"
        keyboardType="phone-pad"
        hint="Sert à retrouver le client lors d’une vente à crédit."
      />

      <Field
        label="Note (facultatif)"
        value={note}
        onChangeText={setNote}
        placeholder="Client du quartier, paie le vendredi"
        multiline
      />
    </Sheet>
  );
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
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.huge,
  },
  summary: {
    marginBottom: spacing.lg,
  },
  summaryLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textTertiary,
  },
  summaryValue: {
    ...typography.h1,
    fontSize: 25,
    lineHeight: 32,
    marginTop: 1,
  },
  summaryLink: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    lineHeight: 17,
    color: colors.primary,
    marginTop: spacing.sm,
  },
  filters: {
    marginTop: spacing.lg,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  actionText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textOnPrimary,
  },
  history: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  historyItem: {
    flex: 1,
  },
  historyLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    lineHeight: 14,
    color: colors.textTertiary,
  },
  historyValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textPrimary,
    marginTop: 1,
  },
});
