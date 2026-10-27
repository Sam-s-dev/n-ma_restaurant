import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { Chips, Segmented } from '../../components/workspace/Chips';
import { ConfirmSheet } from '../../components/workspace/ConfirmSheet';
import { AmountField, Field } from '../../components/workspace/Field';
import { EmptyState, ListRow, RowDivider, SectionHeader } from '../../components/workspace/ListRow';
import { ErrorState, LoadingState } from '../../components/workspace/ScreenState';
import { Sheet } from '../../components/workspace/Sheet';
import { ApiError } from '../../api/client';
import {
  addEmployeeNote,
  ATTENDANCE_LABELS,
  createEmployee,
  deleteEmployee,
  fetchSalaryDetail,
  fetchSalaryOverview,
  listAttendances,
  listEmployeeActivity,
  listEmployees,
  markAttendances,
  NOTE_LABELS,
  paySalary,
  updateEmployee,
} from '../../api/workspace/staff';
import type {
  Attendance,
  AttendanceStatus,
  Employee,
  EmployeeActivity,
  NoteKind,
  SalaryBalance,
  SalaryOverview,
  SalaryPayment,
} from '../../api/workspace/staff';
import { ROLE_LABELS } from '../../api/permissions';
import type { Role } from '../../api/permissions';
import { PAYMENT_LABELS } from '../../api/workspace/sales';
import { parseAmount } from '../../utils/money';
import { currentMonthISO, formatDateTime, formatFullDate, formatMonth, todayISO } from '../../utils/date';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, screenPadding, spacing } from '../../theme/layout';
import { useWorkspace } from './WorkspaceContext';

const ATTENDANCE_TONES: Record<AttendanceStatus, { background: string; color: string }> = {
  present: { background: colors.successSoft, color: colors.success },
  late: { background: colors.pastelPurple, color: colors.iconPurple },
  absent: { background: colors.dangerSoft, color: colors.danger },
  leave: { background: colors.warningSoft, color: colors.warning },
};

/**
 * §4 — Personnel : fiches, pointage du jour, salaires.
 *
 * Le pointage se fait pour toute l'équipe d'un coup : c'est un geste
 * quotidien, il ne doit pas coûter une navigation par employé. Le solde
 * salarial est cumulé mois par mois depuis l'embauche et diminué de ce qui
 * a été versé.
 */
export function StaffScreen() {
  const { money, refreshBalance, notify } = useWorkspace();

  const [view, setView] = useState<'team' | 'attendance'>('team');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [overview, setOverview] = useState<SalaryOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<{ open: boolean; employee: Employee | null }>({
    open: false,
    employee: null,
  });
  const [salaryFor, setSalaryFor] = useState<Employee | null>(null);
  const [toDelete, setToDelete] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextEmployees, nextOverview] = await Promise.all([
        listEmployees(),
        fetchSalaryOverview(),
      ]);
      setEmployees(nextEmployees);
      setOverview(nextOverview);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chargement du personnel impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteEmployee(toDelete.id);
      setToDelete(null);
      notify('Employé retiré de l’équipe');
      await load();
    } catch (cause) {
      setDeleteError(cause instanceof ApiError ? cause.message : 'Suppression impossible.');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <LoadingState label="Chargement de l’équipe…" />;
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
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Masse salariale</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>
                {money(overview?.totalMonthlyPayroll ?? 0)}
              </Text>
              <Text style={styles.summaryCaption}>par mois</Text>
            </View>
            <View style={styles.summarySeparator} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Reste à payer</Text>
              <Text
                style={[
                  styles.summaryValue,
                  { color: (overview?.totalBalanceDue ?? 0) > 0 ? colors.warning : colors.success },
                ]}
                numberOfLines={1}
              >
                {money(overview?.totalBalanceDue ?? 0)}
              </Text>
              <Text style={styles.summaryCaption}>{overview?.employees ?? 0} employé(s)</Text>
            </View>
          </View>
        </Card>

        <Segmented
          options={[
            { value: 'team', label: 'Équipe' },
            { value: 'attendance', label: 'Pointage' },
          ]}
          value={view}
          onChange={setView}
        />

        {view === 'team' ? (
          <>
            <Pressable
              style={styles.actionButton}
              onPress={() => setForm({ open: true, employee: null })}
              accessibilityRole="button"
            >
              <Icon name="plus" size={16} color={colors.textOnPrimary} strokeWidth={2.5} />
              <Text style={styles.actionText}>Nouvel employé</Text>
            </Pressable>

            {employees.length === 0 ? (
              <EmptyState
                icon="users"
                title="Aucun employé"
                message="Créez les fiches de votre équipe pour suivre les présences et les salaires versés."
                action={
                  <Button
                    label="Ajouter un employé"
                    onPress={() => setForm({ open: true, employee: null })}
                  />
                }
              />
            ) : (
              <Card reveal={1}>
                {employees.map((employee, index) => (
                  <View key={employee.id}>
                    {index > 0 && <RowDivider />}
                    <ListRow
                      initials={initialsOf(employee.fullName)}
                      iconColor={colors.iconBlue}
                      iconBackground={colors.pastelBlue}
                      title={employee.fullName}
                      subtitle={`${employee.position} · ${money(employee.monthlySalary)}/mois`}
                      badge={
                        employee.account ? (
                          <View style={styles.accessBadge}>
                            <Text style={styles.accessBadgeText}>
                              {ROLE_LABELS[employee.account.role as Role] ?? 'Accès'}
                            </Text>
                          </View>
                        ) : undefined
                      }
                      value={money(employee.salary?.balanceDue ?? 0)}
                      valueTone={(employee.salary?.balanceDue ?? 0) > 0 ? 'negative' : 'positive'}
                      valueCaption="à payer"
                      onPress={() => setSalaryFor(employee)}
                    />
                  </View>
                ))}
              </Card>
            )}
          </>
        ) : (
          <AttendanceBoard employees={employees} notify={notify} />
        )}
      </ScrollView>

      <EmployeeFormSheet
        visible={form.open}
        employee={form.employee}
        onClose={() => setForm({ open: false, employee: null })}
        onDone={(message) => {
          setForm({ open: false, employee: null });
          notify(message);
          void load();
        }}
      />

      <SalarySheet
        employee={salaryFor}
        onClose={() => setSalaryFor(null)}
        onEdit={(employee) => {
          setSalaryFor(null);
          setForm({ open: true, employee });
        }}
        onDelete={(employee) => {
          setSalaryFor(null);
          setDeleteError(null);
          setToDelete(employee);
        }}
        onPaid={() => {
          setSalaryFor(null);
          refreshBalance();
          notify('Salaire versé');
          void load();
        }}
      />

      <ConfirmSheet
        visible={Boolean(toDelete)}
        title="Retirer de l’équipe"
        message={`${toDelete?.fullName ?? ''} ne sera plus dans la liste. S’il a déjà été payé, sa fiche est désactivée pour conserver l’historique.`}
        confirmLabel="Retirer"
        loading={deleting}
        error={deleteError}
        onCancel={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </View>
  );
}

// -------------------------------------------------------------------------
// Pointage du jour
// -------------------------------------------------------------------------

interface AttendanceBoardProps {
  employees: Employee[];
  notify: (message: string, tone?: 'success' | 'danger') => void;
}

function AttendanceBoard({ employees, notify }: AttendanceBoardProps) {
  const today = todayISO();
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  /** Heure d'arrivée saisie pour un retard (« 09:40 »). */
  const [arrivals, setArrivals] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Attendance[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const items = await listAttendances(today, today);
      setSaved(items);
      setStatuses(
        Object.fromEntries(items.map((item) => [item.employeeId, item.status])) as Record<
          string,
          AttendanceStatus
        >,
      );
      setArrivals(
        Object.fromEntries(
          items
            .filter((item) => item.arrivalTime)
            .map((item) => [item.employeeId, item.arrivalTime as string]),
        ),
      );
    } catch {
      // Le pointage reste saisissable même si la lecture échoue.
    }
  }, [today]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    const badTime = Object.entries(statuses).find(
      ([id, status]) =>
        status === 'late' && arrivals[id] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(arrivals[id] ?? ''),
    );
    if (badTime) {
      setError('Heure d’arrivée attendue au format HH:MM, par exemple 09:40.');
      return;
    }

    const entries = Object.entries(statuses).map(([employeeId, status]) => ({
      employeeId,
      status,
      arrivalTime: status === 'late' && arrivals[employeeId] ? arrivals[employeeId] : null,
    }));
    if (entries.length === 0) return;

    setSaving(true);
    setError(null);
    try {
      await markAttendances(today, entries);
      notify('Pointage enregistré');
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  if (employees.length === 0) {
    return (
      <EmptyState
        icon="calendar"
        title="Personne à pointer"
        message="Ajoutez d’abord les fiches de votre équipe."
      />
    );
  }

  // Un retardataire est là : il compte parmi les présents.
  const presentCount = Object.values(statuses).filter(
    (status) => status === 'present' || status === 'late',
  ).length;

  return (
    <View style={styles.attendance}>
      <SectionHeader
        title={formatFullDate(today)}
        caption={`${presentCount}/${employees.length} présent(s) · ${saved.length} déjà enregistré(s)`}
      />

      <Card reveal={2}>
        {employees.map((employee, index) => {
          const status = statuses[employee.id];

          return (
            <View key={employee.id}>
              {index > 0 && <RowDivider />}
              <View style={styles.attendanceRow}>
                <View style={styles.attendanceAvatar}>
                  <Text style={styles.attendanceInitials}>{initialsOf(employee.fullName)}</Text>
                </View>

                <View style={styles.attendanceTexts}>
                  <Text style={styles.attendanceName} numberOfLines={1}>
                    {employee.fullName}
                  </Text>
                  <Text style={styles.attendanceRole} numberOfLines={1}>
                    {employee.position}
                  </Text>
                </View>

                <View style={styles.attendanceButtons}>
                  {(['present', 'late', 'absent', 'leave'] as AttendanceStatus[]).map((option) => {
                    const selected = status === option;
                    const tone = ATTENDANCE_TONES[option];

                    return (
                      <Pressable
                        key={option}
                        onPress={() =>
                          setStatuses((current) => ({ ...current, [employee.id]: option }))
                        }
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`${employee.fullName} : ${ATTENDANCE_LABELS[option]}`}
                        style={[
                          styles.attendanceChip,
                          selected && { backgroundColor: tone.background },
                        ]}
                      >
                        <Text
                          style={[
                            styles.attendanceChipText,
                            selected && { color: tone.color, fontFamily: fontFamily.semiBold },
                          ]}
                        >
                          {ATTENDANCE_LABELS[option].slice(0, 3)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {status === 'late' && (
                <View style={styles.arrivalField}>
                  <Field
                    label="Heure d’arrivée"
                    value={arrivals[employee.id] ?? ''}
                    onChangeText={(value) =>
                      setArrivals((current) => ({ ...current, [employee.id]: value }))
                    }
                    placeholder="09:40"
                    keyboardType="numbers-and-punctuation"
                    hint={
                      employee.account
                        ? 'Il sera prévenu de son retard dans l’application.'
                        : undefined
                    }
                  />
                </View>
              )}
            </View>
          );
        })}
      </Card>

      {Boolean(error) && <Text style={styles.attendanceError}>{error}</Text>}

      <View style={styles.attendanceAction}>
        <Button
          label="Enregistrer le pointage"
          onPress={save}
          loading={saving}
          disabled={Object.keys(statuses).length === 0}
        />
      </View>
    </View>
  );
}

// -------------------------------------------------------------------------
// Fiche employé
// -------------------------------------------------------------------------

interface EmployeeFormSheetProps {
  visible: boolean;
  employee: Employee | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

function EmployeeFormSheet({ visible, employee, onClose, onDone }: EmployeeFormSheetProps) {
  const { currency } = useWorkspace();
  const [fullName, setFullName] = useState('');
  const [position, setPosition] = useState('');
  const [phone, setPhone] = useState('');
  const [hireDate, setHireDate] = useState(todayISO());
  const [salary, setSalary] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ fullName?: string; position?: string; hireDate?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setFullName(employee?.fullName ?? '');
    setPosition(employee?.position ?? '');
    setPhone(employee?.phone ?? '');
    setHireDate(employee?.hireDate ?? todayISO());
    setSalary(employee ? String(employee.monthlySalary) : '');
    setNote(employee?.note ?? '');
    setErrors({});
    setError(null);
  }, [visible, employee]);

  async function submit() {
    const next: { fullName?: string; position?: string; hireDate?: string } = {};
    if (fullName.trim().length < 2) next.fullName = 'Indiquez le nom complet.';
    if (position.trim().length < 2) next.position = 'Indiquez le poste occupé.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) next.hireDate = 'Date attendue au format AAAA-MM-JJ.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    setError(null);
    try {
      const base = {
        fullName: fullName.trim(),
        position: position.trim(),
        phone: phone.trim() === '' ? null : phone.trim(),
        monthlySalary: parseAmount(salary) ?? 0,
        note: note.trim() === '' ? null : note.trim(),
      };

      if (employee) {
        await updateEmployee(employee.id, base);
        onDone('Fiche mise à jour');
      } else {
        await createEmployee({ ...base, hireDate });
        onDone('Employé ajouté');
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
      title={employee ? 'Modifier la fiche' : 'Nouvel employé'}
      error={error}
      onClose={onClose}
      actions={<Button label="Enregistrer" onPress={submit} loading={saving} />}
    >
      <Field
        label="Nom complet"
        value={fullName}
        onChangeText={(value) => {
          setFullName(value);
          if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: undefined }));
        }}
        placeholder="Mariama Diallo"
        error={errors.fullName}
      />

      <Field
        label="Poste"
        value={position}
        onChangeText={(value) => {
          setPosition(value);
          if (errors.position) setErrors((prev) => ({ ...prev, position: undefined }));
        }}
        placeholder="Serveuse"
        error={errors.position}
      />

      <Field
        label="Téléphone (facultatif)"
        value={phone}
        onChangeText={setPhone}
        placeholder="620 00 00 00"
        keyboardType="phone-pad"
      />

      {!employee && (
        <Field
          label="Date d’embauche"
          value={hireDate}
          onChangeText={(value) => {
            setHireDate(value);
            if (errors.hireDate) setErrors((prev) => ({ ...prev, hireDate: undefined }));
          }}
          placeholder={todayISO()}
          hint="Le solde salarial est cumulé à partir de cette date."
          error={errors.hireDate}
        />
      )}

      <AmountField
        label="Salaire mensuel"
        value={salary}
        onChangeText={setSalary}
        placeholder="0"
        suffix={currency.symbol}
      />

      <Field
        label="Note (facultatif)"
        value={note}
        onChangeText={setNote}
        placeholder="Travaille le week-end"
        multiline
      />
    </Sheet>
  );
}

// -------------------------------------------------------------------------
// Salaire
// -------------------------------------------------------------------------

interface SalarySheetProps {
  employee: Employee | null;
  onClose: () => void;
  onEdit: (employee: Employee) => void;
  onDelete: (employee: Employee) => void;
  onPaid: () => void;
}

function SalarySheet({ employee, onClose, onEdit, onDelete, onPaid }: SalarySheetProps) {
  const { money, currency } = useWorkspace();
  const [balance, setBalance] = useState<SalaryBalance | null>(null);
  const [payments, setPayments] = useState<SalaryPayment[]>([]);
  const [amount, setAmount] = useState('');
  const [month, setMonth] = useState(currentMonthISO());
  const [method, setMethod] = useState('cash');
  const [amountError, setAmountError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [activity, setActivity] = useState<EmployeeActivity[]>([]);
  const [noteKind, setNoteKind] = useState<NoteKind>('note');
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | undefined>();

  useEffect(() => {
    if (!employee) return;
    setAmount('');
    setMonth(currentMonthISO());
    setMethod('cash');
    setAmountError(undefined);
    setError(null);
    setBalance(employee.salary ?? null);
    setPayments([]);
    setActivity([]);
    setNoteKind('note');
    setNoteText('');
    setNoteError(undefined);

    fetchSalaryDetail(employee.id)
      .then((detail) => {
        setBalance(detail.balance);
        setPayments(detail.payments);
      })
      .catch(() => undefined);
    listEmployeeActivity(employee.id)
      .then(setActivity)
      .catch(() => undefined);
  }, [employee]);

  async function addNote() {
    if (!employee) return;
    if (noteText.trim().length === 0) {
      setNoteError('Décrivez ce qui s’est passé.');
      return;
    }
    setNoteSaving(true);
    setNoteError(undefined);
    try {
      const entry = await addEmployeeNote(employee.id, { kind: noteKind, note: noteText.trim() });
      setActivity((current) => [entry, ...current]);
      setNoteText('');
    } catch (cause) {
      setNoteError(cause instanceof ApiError ? cause.message : 'Enregistrement impossible.');
    } finally {
      setNoteSaving(false);
    }
  }

  async function submit() {
    if (!employee) return;
    const value = parseAmount(amount);
    if (value === null || value <= 0) {
      setAmountError('Saisissez un montant supérieur à zéro.');
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(month)) {
      setError('Le mois doit être au format AAAA-MM.');
      return;
    }

    setAmountError(undefined);
    setSaving(true);
    setError(null);
    try {
      await paySalary(employee.id, { amount: value, periodMonth: month, paymentMethod: method });
      onPaid();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Paiement impossible.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      visible={Boolean(employee)}
      title={employee?.fullName ?? ''}
      subtitle={employee ? `${employee.position} · embauché le ${formatFullDate(employee.hireDate)}` : undefined}
      error={error}
      onClose={onClose}
      actions={
        <>
          <Button label="Verser le salaire" onPress={submit} loading={saving} />
          {employee && (
            <View style={styles.sheetSecondaryRow}>
              <Pressable onPress={() => onEdit(employee)} hitSlop={8} accessibilityRole="button">
                <Text style={styles.sheetLink}>Modifier la fiche</Text>
              </Pressable>
              <Pressable onPress={() => onDelete(employee)} hitSlop={8} accessibilityRole="button">
                <Text style={[styles.sheetLink, styles.sheetLinkDanger]}>Retirer</Text>
              </Pressable>
            </View>
          )}
        </>
      }
    >
      {balance && (
        <View style={styles.balanceCard}>
          <View style={styles.balanceRow}>
            <BalanceItem label="Cumulé" value={money(balance.totalAccrued)} />
            <BalanceItem label="Versé" value={money(balance.totalPaid)} tone={colors.success} />
            <BalanceItem
              label="Reste dû"
              value={money(balance.balanceDue)}
              tone={balance.balanceDue > 0 ? colors.warning : colors.success}
            />
          </View>
          <Text style={styles.balanceCaption}>
            {balance.monthsElapsed} mois cumulé(s) à {money(balance.monthlySalary)} par mois.
          </Text>
        </View>
      )}

      <AmountField
        label="Montant à verser"
        value={amount}
        onChangeText={(value) => {
          setAmount(value);
          if (amountError) setAmountError(undefined);
        }}
        placeholder="0"
        suffix={currency.symbol}
        error={amountError}
      />

      <Field
        label="Mois concerné"
        value={month}
        onChangeText={setMonth}
        placeholder={currentMonthISO()}
        hint="Format AAAA-MM."
      />

      <Text style={styles.blockLabel}>Mode de règlement</Text>
      <View style={styles.spaced}>
        <Chips
          options={[
            { value: 'cash', label: 'Espèces' },
            { value: 'mobile_money', label: 'Mobile Money' },
            { value: 'bank_transfer', label: 'Virement' },
          ]}
          value={method}
          onChange={setMethod}
        />
      </View>

      {payments.length > 0 && (
        <>
          <SectionHeader title="Versements" caption={`${payments.length} paiement(s)`} />
          {payments.map((payment, index) => (
            <View key={payment.id}>
              {index > 0 && <RowDivider />}
              <ListRow
                icon="wallet"
                iconColor={colors.iconGreen}
                iconBackground={colors.pastelGreen}
                title={formatMonth(payment.periodMonth.slice(0, 7))}
                subtitle={`${formatDateTime(payment.paidAt)} · ${
                  PAYMENT_LABELS[payment.paymentMethod] ?? payment.paymentMethod
                }`}
                value={money(payment.amount)}
                valueTone="positive"
                valueCaption={payment.expenseReference ?? undefined}
              />
            </View>
          ))}
        </>
      )}

      {/* --- Activités : retards, absences, avertissements… ------------- */}
      <View style={styles.activityBlock}>
        <SectionHeader
          title="Activités"
          caption={
            employee?.account
              ? `Accès ${ROLE_LABELS[employee.account.role as Role] ?? ''} · prévenu de chaque note`
              : 'Sans accès à l’application'
          }
        />
        <View style={styles.spaced}>
          <Chips
            options={(Object.keys(NOTE_LABELS) as NoteKind[]).map((kind) => ({
              value: kind,
              label: NOTE_LABELS[kind],
            }))}
            value={noteKind}
            onChange={setNoteKind}
          />
        </View>
        <Field
          label="Ce qui s’est passé"
          value={noteText}
          onChangeText={(value) => {
            setNoteText(value);
            if (noteError) setNoteError(undefined);
          }}
          placeholder="Arrivé à 10 h sans prévenir"
          multiline
          error={noteError}
        />
        <Button
          label="Ajouter à la fiche"
          onPress={() => void addNote()}
          loading={noteSaving}
          variant="secondary"
        />

        {activity.map((entry, index) => (
          <View key={`${entry.source}-${entry.id}`}>
            {index === 0 ? <View style={styles.activityGap} /> : <RowDivider />}
            <ListRow
              icon={entry.kind === 'praise' ? 'check' : entry.kind === 'note' ? 'edit' : 'alert'}
              iconColor={activityTone(entry.kind).color}
              iconBackground={activityTone(entry.kind).background}
              title={activityTitle(entry)}
              subtitle={[entry.note, entry.createdByName ? `par ${entry.createdByName}` : null]
                .filter(Boolean)
                .join(' · ')}
              subtitleLines={3}
              value={formatFullDate(entry.day)}
              valueTone="muted"
            />
          </View>
        ))}
      </View>
    </Sheet>
  );
}

function activityTitle(entry: EmployeeActivity): string {
  if (entry.source === 'attendance') {
    const label = ATTENDANCE_LABELS[entry.kind as AttendanceStatus] ?? entry.kind;
    return entry.arrivalTime ? `${label} · arrivé à ${entry.arrivalTime}` : `${label} (pointage)`;
  }
  return NOTE_LABELS[entry.kind as NoteKind] ?? entry.kind;
}

function activityTone(kind: string): { color: string; background: string } {
  if (kind === 'praise') return { color: colors.iconGreen, background: colors.pastelGreen };
  if (kind === 'note' || kind === 'leave') {
    return { color: colors.textSecondary, background: colors.backgroundAlt };
  }
  if (kind === 'warning' || kind === 'absent' || kind === 'absence') {
    return { color: colors.iconRed, background: colors.pastelRed };
  }
  return { color: colors.iconPurple, background: colors.pastelPurple };
}

function BalanceItem({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.balanceItem}>
      <Text style={styles.balanceLabel}>{label}</Text>
      <Text style={[styles.balanceValue, tone ? { color: tone } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
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
  accessBadge: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  accessBadgeText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    lineHeight: 14,
    color: colors.primary,
  },
  arrivalField: {
    paddingLeft: 44,
    paddingBottom: spacing.sm,
  },
  activityBlock: {
    marginTop: spacing.xl,
  },
  activityGap: {
    height: spacing.md,
  },
  content: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.huge,
  },
  summary: {
    marginBottom: spacing.lg,
    paddingVertical: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textTertiary,
  },
  summaryValue: {
    ...typography.h3,
    fontSize: 16,
    lineHeight: 22,
    marginTop: 1,
  },
  summaryCaption: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    lineHeight: 14,
    color: colors.textTertiary,
  },
  summarySeparator: {
    width: StyleSheet.hairlineWidth,
    height: 40,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
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
  attendance: {
    marginTop: spacing.lg,
  },
  attendanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  attendanceAvatar: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.pastelBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendanceInitials: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.iconBlue,
  },
  attendanceTexts: {
    flex: 1,
  },
  attendanceName: {
    ...typography.bodyStrong,
    fontSize: 14,
    lineHeight: 19,
  },
  attendanceRole: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textTertiary,
  },
  attendanceButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  attendanceChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.backgroundAlt,
    minWidth: 38,
    alignItems: 'center',
  },
  attendanceChipText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textTertiary,
  },
  attendanceError: {
    ...typography.small,
    fontSize: 12,
    color: colors.danger,
    marginTop: spacing.md,
  },
  attendanceAction: {
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  balanceCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  balanceRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  balanceItem: {
    flex: 1,
  },
  balanceLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    lineHeight: 14,
    color: colors.textTertiary,
  },
  balanceValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textPrimary,
    marginTop: 1,
  },
  balanceCaption: {
    ...typography.small,
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: spacing.md,
  },
  blockLabel: {
    ...typography.bodyStrong,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  spaced: {
    marginBottom: spacing.lg,
  },
  sheetSecondaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  sheetLink: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  sheetLinkDanger: {
    color: colors.danger,
  },
});
