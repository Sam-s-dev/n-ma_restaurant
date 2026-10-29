import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { ConfirmSheet } from '../../components/workspace/ConfirmSheet';
import { AmountField, Field } from '../../components/workspace/Field';
import { EmptyState, ListRow, RowDivider, SectionHeader } from '../../components/workspace/ListRow';
import { ErrorState, LoadingState } from '../../components/workspace/ScreenState';
import { Sheet } from '../../components/workspace/Sheet';
import { ToggleRow } from '../../components/workspace/ToggleRow';
import { ApiError } from '../../api/client';
import {
  createZone,
  deleteZone,
  fetchOnlineSettings,
  listZones,
  updateOnlineSettings,
  updateZone,
} from '../../api/workspace/orders';
import type { DeliveryZone, OnlineSettings } from '../../api/workspace/orders';
import { parseAmount } from '../../utils/money';
import { publicMenuUrl } from '../../utils/publicRoute';
import { printOrderPoster, qrSvg } from '../../utils/qr';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, screenPadding, spacing } from '../../theme/layout';
import { useWorkspace } from './WorkspaceContext';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Réglages du mini-site : son adresse, l'ouverture des commandes, les
 * horaires, les zones de livraison et le QR code à imprimer.
 */
export function OnlineScreen() {
  const { profile, money, notify } = useWorkspace();
  const [settings, setSettings] = useState<OnlineSettings | null>(null);
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [slug, setSlug] = useState('');
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [zoneSheet, setZoneSheet] = useState<DeliveryZone | 'new' | null>(null);
  const [zoneToDelete, setZoneToDelete] = useState<DeliveryZone | null>(null);

  const load = useCallback(async () => {
    try {
      const [next, nextZones] = await Promise.all([fetchOnlineSettings(), listZones()]);
      setSettings(next);
      setZones(nextZones);
      setSlug(next.slug ?? next.suggestedSlug);
      setOpensAt(next.opensAt ?? '');
      setClosesAt(next.closesAt ?? '');
      setMessage(next.message ?? '');
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chargement impossible.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const url = settings?.slug ? publicMenuUrl(settings.slug) : null;
  const qr = useMemo(() => (url ? qrSvg(url, 200) : null), [url]);

  async function save(patch: Partial<OnlineSettings>, success: string) {
    setSaving(true);
    setFormError(null);
    try {
      const next = await updateOnlineSettings(patch);
      setSettings(next);
      notify(success);
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  function saveDetails() {
    const open = opensAt.trim();
    const close = closesAt.trim();
    if ((open === '') !== (close === '')) {
      setFormError('Indiquez les deux heures, ou aucune pour prendre les commandes à toute heure.');
      return;
    }
    if ((open && !TIME.test(open)) || (close && !TIME.test(close))) {
      setFormError('Heures au format 09:00.');
      return;
    }
    void save(
      {
        slug: slug.trim().toLowerCase(),
        opensAt: open || null,
        closesAt: close || null,
        message: message.trim() || null,
      },
      'Mini-site enregistré',
    );
  }

  async function shareLink() {
    if (!url) return;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url).catch(() => undefined);
      notify('Lien copié : collez-le sur WhatsApp ou Facebook');
      return;
    }
    await Share.share({ message: `Commandez chez ${profile.restaurant.name} : ${url}` }).catch(() => undefined);
  }

  if (error && !settings) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!settings) return <LoadingState label="Chargement du mini-site…" />;

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!settings.allowed && (
          <View style={styles.block}>
            <Banner
              tone="warning"
              title="Mini-site non activé"
              message="L’administrateur de N’ma Restaurant n’a pas activé la commande en ligne pour votre restaurant."
            />
          </View>
        )}

        {url && qr && (
          <Card reveal={0} style={styles.block}>
            <View style={styles.linkRow}>
              <View style={styles.qr}>
                <SvgXml xml={qr} width={120} height={120} />
              </View>
              <View style={styles.linkText}>
                <Text style={styles.linkLabel}>Votre lien de commande</Text>
                <Text style={styles.link} selectable>
                  {url}
                </Text>
                <View style={[styles.state, settings.enabled ? styles.stateOn : styles.stateOff]}>
                  <Text style={[styles.stateText, { color: settings.enabled ? colors.success : colors.textSecondary }]}>
                    {settings.enabled ? 'Commandes ouvertes' : 'Commandes fermées'}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.linkActions}>
              <SmallAction icon="send" label={Platform.OS === 'web' ? 'Copier' : 'Partager'} onPress={() => void shareLink()} />
              <SmallAction icon="globe" label="Ouvrir" onPress={() => void Linking.openURL(url)} />
              <SmallAction
                icon="receipt"
                label="Affiche QR"
                onPress={() => void printOrderPoster(profile.restaurant.name, url)}
              />
            </View>
          </Card>
        )}

        <Card reveal={1} style={styles.block}>
          <ToggleRow
            label="Accepter les commandes en ligne"
            hint={
              settings.slug
                ? 'Fermez-les le temps d’un rush ou en fin de journée : le mini-site reste visible.'
                : 'Enregistrez d’abord l’adresse de votre mini-site ci-dessous.'
            }
            value={settings.enabled}
            disabled={saving || !settings.allowed || !settings.slug}
            onChange={(enabled) =>
              void save({ enabled }, enabled ? 'Commandes en ligne ouvertes' : 'Commandes en ligne fermées')
            }
          />
          <ToggleRow
            label="Livraison"
            hint={zones.some((zone) => zone.isActive) ? undefined : 'Ajoutez au moins une zone pour la proposer.'}
            value={settings.delivery}
            disabled={saving}
            onChange={(delivery) => void save({ delivery }, delivery ? 'Livraison proposée' : 'Livraison retirée')}
          />
          <ToggleRow
            label="À emporter"
            value={settings.pickup}
            disabled={saving}
            onChange={(pickup) => void save({ pickup }, pickup ? 'Retrait sur place proposé' : 'Retrait sur place retiré')}
          />
        </Card>

        <Card reveal={2} style={styles.block}>
          <SectionHeader title="Adresse et horaires" />
          <Field
            label="Adresse du mini-site"
            value={slug}
            onChangeText={(value) => setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            autoCapitalize="none"
            hint={`Lettres, chiffres et tirets. Votre lien : …/r/${slug || 'votre-restaurant'}`}
          />
          <View style={styles.hours}>
            <View style={styles.hour}>
              <Field label="Ouverture" value={opensAt} onChangeText={setOpensAt} placeholder="09:00" />
            </View>
            <View style={styles.hour}>
              <Field label="Fermeture" value={closesAt} onChangeText={setClosesAt} placeholder="22:00" />
            </View>
          </View>
          <Text style={styles.hint}>Laissez vide pour prendre les commandes à toute heure.</Text>
          <Field
            label="Message aux clients (facultatif)"
            value={message}
            onChangeText={setMessage}
            placeholder="Livraison en 45 minutes environ"
            multiline
          />
          {Boolean(formError) && <Text style={styles.error}>{formError}</Text>}
          <Button label="Enregistrer" onPress={saveDetails} loading={saving} />
        </Card>

        <SectionHeader
          title="Zones de livraison"
          caption="Le prix s’ajoute à la commande du client"
          action={
            <Pressable onPress={() => setZoneSheet('new')} hitSlop={8} accessibilityRole="button">
              <Text style={styles.add}>Ajouter</Text>
            </Pressable>
          }
        />
        {zones.length === 0 ? (
          <EmptyState
            icon="map-pin"
            title="Aucune zone"
            message="Ajoutez les quartiers que vous livrez, par exemple Kipé à 10 000 et Ratoma à 15 000."
          />
        ) : (
          <Card reveal={3}>
            {zones.map((zone, index) => (
              <View key={zone.id}>
                {index > 0 && <RowDivider />}
                <ListRow
                  icon="map-pin"
                  iconColor={zone.isActive ? colors.iconGreen : colors.textTertiary}
                  iconBackground={zone.isActive ? colors.pastelGreen : colors.backgroundAlt}
                  title={zone.name}
                  subtitle={zone.isActive ? 'Livrée' : 'Suspendue'}
                  value={money(zone.fee)}
                  valueTone={zone.isActive ? 'neutral' : 'muted'}
                  onPress={() => setZoneSheet(zone)}
                />
              </View>
            ))}
          </Card>
        )}
      </ScrollView>

      <ZoneSheet
        zone={zoneSheet}
        onClose={() => setZoneSheet(null)}
        onDelete={(zone) => {
          setZoneSheet(null);
          setZoneToDelete(zone);
        }}
        onDone={(text) => {
          setZoneSheet(null);
          notify(text);
          void load();
        }}
      />

      <ConfirmSheet
        visible={Boolean(zoneToDelete)}
        title="Supprimer la zone"
        message={`${zoneToDelete?.name ?? ''} ne sera plus proposée. Les commandes passées gardent leur zone.`}
        confirmLabel="Supprimer"
        onCancel={() => setZoneToDelete(null)}
        onConfirm={() => {
          const zone = zoneToDelete;
          setZoneToDelete(null);
          if (!zone) return;
          deleteZone(zone.id)
            .then(() => {
              notify('Zone supprimée');
              void load();
            })
            .catch((cause) => notify(cause instanceof ApiError ? cause.message : 'Suppression impossible.', 'danger'));
        }}
      />
    </View>
  );
}

function SmallAction({ icon, label, onPress }: { icon: 'send' | 'globe' | 'receipt'; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.smallAction, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <Icon name={icon} size={16} color={colors.primary} />
      <Text style={styles.smallActionText}>{label}</Text>
    </Pressable>
  );
}

function ZoneSheet({
  zone,
  onClose,
  onDelete,
  onDone,
}: {
  zone: DeliveryZone | 'new' | null;
  onClose: () => void;
  onDelete: (zone: DeliveryZone) => void;
  onDone: (message: string) => void;
}) {
  const { currency } = useWorkspace();
  const existing = zone && zone !== 'new' ? zone : null;
  const [name, setName] = useState('');
  const [fee, setFee] = useState('');
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!zone) return;
    setName(existing?.name ?? '');
    setFee(existing ? String(existing.fee) : '');
    setActive(existing?.isActive ?? true);
    setError(null);
  }, [zone, existing]);

  async function submit() {
    const value = parseAmount(fee);
    if (name.trim().length < 2) return setError('Donnez le nom du quartier.');
    if (value === null || value < 0) return setError('Indiquez le prix de la livraison.');
    setSaving(true);
    setError(null);
    try {
      if (existing) {
        await updateZone(existing.id, { name: name.trim(), fee: value, isActive: active });
        onDone('Zone mise à jour');
      } else {
        await createZone({ name: name.trim(), fee: value });
        onDone('Zone ajoutée');
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      visible={Boolean(zone)}
      title={existing ? 'Modifier la zone' : 'Nouvelle zone'}
      error={error}
      onClose={onClose}
      actions={
        <>
          <Button label="Enregistrer" onPress={() => void submit()} loading={saving} />
          {existing && <Button label="Supprimer la zone" onPress={() => onDelete(existing)} variant="ghost" />}
        </>
      }
    >
      <Field label="Quartier" value={name} onChangeText={setName} placeholder="Kipé" />
      <AmountField label="Prix de la livraison" value={fee} onChangeText={setFee} placeholder="0" suffix={currency.symbol} />
      {existing && (
        <ToggleRow
          label="Zone livrée"
          hint="Suspendez-la le temps d’une route coupée, sans la supprimer."
          value={active}
          onChange={setActive}
        />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.huge,
  },
  block: {
    marginBottom: spacing.lg,
  },
  linkRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    alignItems: 'center',
  },
  qr: {
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  linkText: {
    flex: 1,
  },
  linkLabel: {
    ...typography.small,
    color: colors.textTertiary,
  },
  link: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.primary,
    marginTop: 2,
  },
  state: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    marginTop: spacing.sm,
  },
  stateOn: {
    backgroundColor: colors.successSoft,
  },
  stateOff: {
    backgroundColor: colors.backgroundAlt,
  },
  stateText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    lineHeight: 16,
  },
  linkActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  smallAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
  },
  smallActionText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.primary,
  },
  pressed: {
    opacity: 0.75,
  },
  hours: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  hour: {
    flex: 1,
  },
  hint: {
    ...typography.small,
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
  },
  error: {
    ...typography.small,
    color: colors.danger,
    marginBottom: spacing.md,
  },
  add: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.primary,
  },
});
