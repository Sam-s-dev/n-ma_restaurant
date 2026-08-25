import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { ConfirmSheet } from '../../components/workspace/ConfirmSheet';
import { Field } from '../../components/workspace/Field';
import { ListRow, RowDivider, SectionHeader } from '../../components/workspace/ListRow';
import { PhotoField } from '../../components/workspace/PhotoField';
import { ErrorState, LoadingState } from '../../components/workspace/ScreenState';
import { Sheet } from '../../components/workspace/Sheet';
import { ApiError, mediaUrl } from '../../api/client';
import {
  changePassword,
  fetchSettings,
  inviteMember,
  listInvitations,
  listMembers,
  revokeInvitation,
  updateMember,
  updateSettings,
} from '../../api/workspace/settings';
import type { Invitation, Member, RestaurantSettings } from '../../api/workspace/settings';
import { formatFullDate } from '../../utils/date';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, screenPadding, spacing } from '../../theme/layout';
import { useWorkspace } from './WorkspaceContext';

/**
 * §3 — Paramètres du restaurant, §2.b — équipe.
 *
 * Le nom, l'adresse et le téléphone saisis ici sont ceux qui figureront en
 * tête des tickets de vente. Le logo N'ma n'apparaît nulle part dans cet
 * espace : il est réservé à la page d'accueil publique.
 */
export function SettingsScreen() {
  const { profile, reloadProfile, notify, logout } = useWorkspace();

  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [restaurantOpen, setRestaurantOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextSettings, nextMembers, nextInvitations] = await Promise.all([
        fetchSettings(),
        listMembers(),
        listInvitations().catch(() => [] as Invitation[]),
      ]);
      setSettings(nextSettings);
      setMembers(nextMembers);
      setInvitations(nextInvitations);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chargement des paramètres impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleMember(member: Member) {
    try {
      await updateMember(member.id, { isActive: !member.isActive });
      notify(member.isActive ? 'Accès suspendu' : 'Accès rétabli');
      await load();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'Modification impossible.', 'danger');
    }
  }

  async function cancelInvitation(invitation: Invitation) {
    try {
      await revokeInvitation(invitation.id);
      notify('Invitation annulée');
      await load();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'Annulation impossible.', 'danger');
    }
  }

  if (loading) return <LoadingState label="Chargement des paramètres…" />;
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
        {/* --- Identité du restaurant ---------------------------------- */}
        <Card reveal={0} style={styles.card}>
          <SectionHeader
            title="Le restaurant"
            caption="Ces informations figurent sur vos tickets"
            action={
              <Pressable
                onPress={() => setRestaurantOpen(true)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Modifier les informations du restaurant"
              >
                <Icon name="edit" size={17} color={colors.primary} />
              </Pressable>
            }
          />

          <View style={styles.identity}>
            {settings?.logoMediaId ? (
              <Image
                source={{ uri: mediaUrl(settings.logoMediaId) as string }}
                style={styles.logo}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.logo, styles.logoFallback]}>
                <Text style={styles.logoInitials}>{initialsOf(settings?.name ?? '')}</Text>
              </View>
            )}
            <View style={styles.identityTexts}>
              <Text style={styles.identityName} numberOfLines={2}>
                {settings?.name ?? '—'}
              </Text>
              <Text style={styles.identityHint} numberOfLines={2}>
                {settings?.logoMediaId
                  ? 'Votre logo apparaît sur vos tickets de vente.'
                  : 'Ajoutez votre logo : il figurera en tête de vos tickets.'}
              </Text>
            </View>
          </View>

          <RowDivider />
          <InfoRow label="Nom" value={settings?.name ?? '—'} />
          <RowDivider />
          <InfoRow label="Adresse" value={settings?.address || 'Non renseignée'} />
          <RowDivider />
          <InfoRow label="Téléphone" value={settings?.phone || 'Non renseigné'} />
          <RowDivider />
          <InfoRow
            label="Devise"
            value={`${settings?.currencyCode ?? ''} · ${settings?.currencySymbol ?? ''}`}
          />
          <RowDivider />
          <InfoRow
            label="Ouvert depuis"
            value={settings ? formatFullDate(settings.createdAt.slice(0, 10)) : '—'}
          />
        </Card>

        {/* --- Équipe ---------------------------------------------------- */}
        <Card reveal={1} style={styles.card}>
          <SectionHeader
            title="L’équipe"
            caption={`${members.length} personne(s) avec un accès`}
            action={
              <Pressable
                onPress={() => setInviteOpen(true)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Inviter un collègue"
              >
                <Icon name="plus" size={18} color={colors.primary} strokeWidth={2.4} />
              </Pressable>
            }
          />

          {members.map((member, index) => (
            <View key={member.id}>
              {index > 0 && <RowDivider />}
              <ListRow
                initials={initialsOf(member.fullName)}
                iconColor={colors.iconBlue}
                iconBackground={colors.pastelBlue}
                title={member.fullName}
                subtitle={member.email}
                badge={
                  member.isOwner ? (
                    <View style={styles.ownerBadge}>
                      <Text style={styles.ownerBadgeText}>Gérant</Text>
                    </View>
                  ) : undefined
                }
                value={member.isActive ? 'Actif' : 'Suspendu'}
                valueTone={member.isActive ? 'positive' : 'muted'}
                onPress={
                  member.id === profile.user.id || member.isOwner
                    ? undefined
                    : () => void toggleMember(member)
                }
              />
            </View>
          ))}

          {invitations.length > 0 && (
            <>
              <View style={styles.invitationsHeader}>
                <Text style={styles.invitationsTitle}>Invitations en attente</Text>
              </View>
              {invitations.map((invitation, index) => (
                <View key={invitation.id}>
                  {index > 0 && <RowDivider />}
                  <ListRow
                    icon="send"
                    iconColor={colors.iconAmber}
                    iconBackground={colors.pastelAmber}
                    title={invitation.email}
                    subtitle={`Expire le ${formatFullDate(invitation.expiresAt.slice(0, 10))}`}
                    badge={
                      <Pressable
                        onPress={() => void cancelInvitation(invitation)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Annuler l’invitation de ${invitation.email}`}
                      >
                        <Icon name="close" size={15} color={colors.danger} strokeWidth={2.3} />
                      </Pressable>
                    }
                  />
                </View>
              ))}
            </>
          )}
        </Card>

        {/* --- Compte ---------------------------------------------------- */}
        <Card reveal={2} style={styles.card}>
          <SectionHeader title="Votre compte" caption={profile.user.email} />

          <ListRow
            icon="lock"
            iconColor={colors.textSecondary}
            title="Changer mon mot de passe"
            subtitle="Vous resterez connecté sur cet appareil"
            onPress={() => setPasswordOpen(true)}
          />
          <RowDivider />
          <ListRow
            icon="logout"
            iconColor={colors.danger}
            iconBackground={colors.dangerSoft}
            title="Se déconnecter"
            subtitle="Il faudra ressaisir votre mot de passe"
            onPress={() => setLogoutOpen(true)}
          />
        </Card>

        <Text style={styles.version}>N’ma Restaurant · version 1.0.0</Text>
      </ScrollView>

      <RestaurantSheet
        visible={restaurantOpen}
        settings={settings}
        onClose={() => setRestaurantOpen(false)}
        onDone={() => {
          setRestaurantOpen(false);
          notify('Informations enregistrées');
          reloadProfile();
          void load();
        }}
      />

      <PasswordSheet
        visible={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        onDone={() => {
          setPasswordOpen(false);
          notify('Mot de passe modifié');
        }}
      />

      <InviteSheet
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onDone={() => {
          setInviteOpen(false);
          void load();
        }}
      />

      <ConfirmSheet
        visible={logoutOpen}
        title="Se déconnecter"
        message="Vous retournerez à la page de connexion. Vos données restent enregistrées."
        confirmLabel="Se déconnecter"
        onCancel={() => setLogoutOpen(false)}
        onConfirm={() => {
          setLogoutOpen(false);
          logout();
        }}
      />
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

interface RestaurantSheetProps {
  visible: boolean;
  settings: RestaurantSettings | null;
  onClose: () => void;
  onDone: () => void;
}

function RestaurantSheet({ visible, settings, onClose, onDone }: RestaurantSheetProps) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [logoMediaId, setLogoMediaId] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(settings?.name ?? '');
    setAddress(settings?.address ?? '');
    setPhone(settings?.phone ?? '');
    setLogoMediaId(settings?.logoMediaId ?? null);
    setNameError(undefined);
    setError(null);
  }, [visible, settings]);

  async function submit() {
    if (name.trim().length < 2) {
      setNameError('Indiquez le nom du restaurant.');
      return;
    }
    setNameError(undefined);
    setSaving(true);
    setError(null);

    try {
      await updateSettings({
        name: name.trim(),
        address: address.trim() === '' ? null : address.trim(),
        phone: phone.trim() === '' ? null : phone.trim(),
        logoMediaId,
      });
      onDone();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      title="Informations du restaurant"
      subtitle="Reprises en tête de vos tickets de vente"
      error={error}
      onClose={onClose}
      actions={<Button label="Enregistrer" onPress={submit} loading={saving} />}
    >
      <PhotoField
        label="Logo du restaurant"
        hint="Affiché en tête de vos tickets de vente. Format carré de préférence."
        mediaId={logoMediaId}
        onChange={setLogoMediaId}
        round
      />

      <Field
        label="Nom du restaurant"
        value={name}
        onChangeText={(value) => {
          setName(value);
          if (nameError) setNameError(undefined);
        }}
        placeholder="Chez Mariama"
        error={nameError}
      />

      <Field
        label="Adresse"
        value={address}
        onChangeText={setAddress}
        placeholder="Quartier Kaloum, Conakry"
        multiline
      />

      <Field
        label="Téléphone"
        value={phone}
        onChangeText={setPhone}
        placeholder="620 00 00 00"
        keyboardType="phone-pad"
      />
    </Sheet>
  );
}

interface PasswordSheetProps {
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}

function PasswordSheet({ visible, onClose, onDone }: PasswordSheetProps) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ next?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCurrent('');
    setNext('');
    setConfirm('');
    setErrors({});
    setError(null);
  }, [visible]);

  async function submit() {
    const nextErrors: { next?: string; confirm?: string } = {};
    if (next.length < 8) nextErrors.next = 'Au moins 8 caractères.';
    if (next !== confirm) nextErrors.confirm = 'Les deux saisies ne correspondent pas.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    setError(null);
    try {
      await changePassword(current, next);
      onDone();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Modification impossible.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      title="Changer de mot de passe"
      error={error}
      onClose={onClose}
      actions={<Button label="Enregistrer" onPress={submit} loading={saving} />}
    >
      <Field
        label="Mot de passe actuel"
        value={current}
        onChangeText={setCurrent}
        secureTextEntry
        autoCapitalize="none"
      />
      <Field
        label="Nouveau mot de passe"
        value={next}
        onChangeText={(value) => {
          setNext(value);
          if (errors.next) setErrors((prev) => ({ ...prev, next: undefined }));
        }}
        secureTextEntry
        autoCapitalize="none"
        error={errors.next}
        hint="Au moins 8 caractères."
      />
      <Field
        label="Confirmer le nouveau mot de passe"
        value={confirm}
        onChangeText={(value) => {
          setConfirm(value);
          if (errors.confirm) setErrors((prev) => ({ ...prev, confirm: undefined }));
        }}
        secureTextEntry
        autoCapitalize="none"
        error={errors.confirm}
      />
    </Sheet>
  );
}

interface InviteSheetProps {
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}

/**
 * §2.b — Le lien d'invitation n'est pas envoyé par e-mail : le jeton est
 * affiché une seule fois, à charge du gérant de le transmettre par WhatsApp
 * ou SMS. C'est délibéré — pas de service d'envoi à maintenir.
 */
function InviteSheet({ visible, onClose, onDone }: InviteSheetProps) {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<Invitation | null>(null);

  useEffect(() => {
    if (!visible) return;
    setEmail('');
    setEmailError(undefined);
    setError(null);
    setCreated(null);
  }, [visible]);

  async function submit() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setEmailError('Adresse e-mail invalide.');
      return;
    }
    setEmailError(undefined);
    setSaving(true);
    setError(null);

    try {
      setCreated(await inviteMember(email.trim().toLowerCase()));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Invitation impossible.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      title="Inviter un collègue"
      subtitle="Il aura exactement les mêmes droits que vous"
      error={error}
      onClose={() => {
        if (created) onDone();
        else onClose();
      }}
      actions={
        created ? (
          <Button label="Terminé" onPress={onDone} />
        ) : (
          <Button label="Créer l’invitation" onPress={submit} loading={saving} />
        )
      }
    >
      {created ? (
        <View>
          <Text style={styles.inviteDone}>
            Invitation créée pour {created.email}. Transmettez-lui ce code — il ne sera plus
            affiché ensuite.
          </Text>
          <View style={styles.tokenBox}>
            <Text style={styles.tokenText} selectable>
              {created.token}
            </Text>
          </View>
          <Text style={styles.inviteHint}>
            Valable jusqu’au {formatFullDate(created.expiresAt.slice(0, 10))}.
          </Text>
        </View>
      ) : (
        <Field
          label="Adresse e-mail"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            if (emailError) setEmailError(undefined);
          }}
          placeholder="collegue@exemple.com"
          keyboardType="email-address"
          autoCapitalize="none"
          error={emailError}
        />
      )}
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
  card: {
    marginBottom: spacing.lg,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingBottom: spacing.lg,
  },
  logo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.backgroundAlt,
  },
  logoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  logoInitials: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.textOnPrimary,
  },
  identityTexts: {
    flex: 1,
  },
  identityName: {
    ...typography.h3,
    fontSize: 16,
    lineHeight: 22,
  },
  identityHint: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textTertiary,
    marginTop: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  infoLabel: {
    ...typography.small,
    fontSize: 13,
    color: colors.textTertiary,
  },
  infoValue: {
    flex: 1,
    ...typography.bodyStrong,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'right',
  },
  ownerBadge: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  ownerBadgeText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    lineHeight: 14,
    color: colors.primary,
  },
  invitationsHeader: {
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  invitationsTitle: {
    ...typography.caption,
  },
  version: {
    ...typography.small,
    fontSize: 11,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  inviteDone: {
    ...typography.small,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  tokenBox: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  tokenText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  inviteHint: {
    ...typography.small,
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
});
