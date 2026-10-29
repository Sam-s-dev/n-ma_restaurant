import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import type { IconName } from '../../components/Icon';
import { EmptyState, ListRow, RowDivider } from '../../components/workspace/ListRow';
import type { AppNotification } from '../../api/workspace/notifications';
import { formatDateTime } from '../../utils/date';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { screenPadding, spacing } from '../../theme/layout';
import { useWorkspace } from './WorkspaceContext';
import { canOpen } from './access';

interface KindStyle {
  icon: IconName;
  color: string;
  background: string;
}

/** Une famille de notifications, une couleur : on reconnaît le sujet d'un coup d'œil. */
function styleOf(kind: string): KindStyle {
  const family = kind.split('.')[0];
  switch (family) {
    case 'purchase':
      return { icon: 'cart', color: colors.iconAmber, background: colors.pastelAmber };
    case 'stock':
      return { icon: 'box', color: colors.iconRed, background: colors.pastelRed };
    case 'sale':
      return { icon: 'ticket', color: colors.iconRed, background: colors.pastelRed };
    case 'attendance':
    case 'employee':
      return { icon: 'users', color: colors.iconBlue, background: colors.pastelBlue };
    case 'cash':
      return kind.endsWith('with_difference')
        ? { icon: 'wallet', color: colors.iconRed, background: colors.pastelRed }
        : { icon: 'wallet', color: colors.iconGreen, background: colors.pastelGreen };
    case 'order':
      return kind.endsWith('issue') || kind.endsWith('cancelled')
        ? { icon: 'globe', color: colors.iconRed, background: colors.pastelRed }
        : { icon: 'globe', color: colors.iconGreen, background: colors.pastelGreen };
    case 'delivery':
      return { icon: 'truck', color: colors.iconBlue, background: colors.pastelBlue };
    case 'member':
      return { icon: 'user', color: colors.iconPurple, background: colors.pastelPurple };
    default:
      return { icon: 'bell', color: colors.textSecondary, background: colors.backgroundAlt };
  }
}

/**
 * Toutes les notifications du compte. Toucher une notification la marque
 * comme lue et ouvre l'écran qu'elle concerne.
 */
export function NotificationsScreen() {
  const { profile, notifications, unreadCount, markRead, navigate } = useWorkspace();

  function open(item: AppNotification) {
    if (!item.readAt) markRead([item.id]);
    if (item.route && canOpen(profile, item.route)) navigate(item.route);
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.intro}>
        {unreadCount > 0
          ? `${unreadCount} notification(s) non lue(s). Touchez-en une pour ouvrir ce qu’elle concerne.`
          : 'Vous êtes à jour. Les nouvelles notifications arrivent ici avec un signal sonore.'}
      </Text>

      {unreadCount > 0 && (
        <View style={styles.markAll}>
          <Button label="Tout marquer comme lu" onPress={() => markRead('all')} variant="secondary" />
        </View>
      )}

      {notifications.length === 0 ? (
        <EmptyState
          icon="bell"
          title="Aucune notification"
          message="Demandes d’achat, stock bas, ventes annulées, retards : tout ce qui vous concerne apparaîtra ici."
        />
      ) : (
        <Card reveal={0}>
          {notifications.map((item, index) => {
            const style = styleOf(item.kind);
            const unread = !item.readAt;
            return (
              <View key={item.id} style={unread ? styles.unread : undefined}>
                {index > 0 && <RowDivider />}
                <ListRow
                  icon={style.icon}
                  iconColor={style.color}
                  iconBackground={style.background}
                  title={item.title}
                  subtitle={`${item.body}${item.actorName ? `\n— ${item.actorName}` : ''}`}
                  subtitleLines={4}
                  value={formatDateTime(item.createdAt)}
                  valueTone={unread ? 'neutral' : 'muted'}
                  valueCaption={unread ? 'Nouveau' : undefined}
                  badge={unread ? <View style={styles.dot} /> : undefined}
                  onPress={() => open(item)}
                />
              </View>
            );
          })}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.huge,
  },
  intro: {
    ...typography.small,
    color: colors.textTertiary,
    marginBottom: spacing.md,
  },
  markAll: {
    marginBottom: spacing.lg,
  },
  unread: {
    backgroundColor: colors.primarySoft,
    // Le fond déborde jusqu'aux bords de la carte (marge intérieure xl).
    marginHorizontal: -spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
});
