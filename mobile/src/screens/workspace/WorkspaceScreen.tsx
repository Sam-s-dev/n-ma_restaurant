import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../components/Icon';
import { ConfirmSheet } from '../../components/workspace/ConfirmSheet';
import { SceneSwitch } from '../../components/workspace/Motion';
import { BellButton, ScreenHeader, WorkspaceHeader } from '../../components/workspace/Headers';
import { TabBar } from '../../components/workspace/TabBar';
import type { TabDefinition } from '../../components/workspace/TabBar';
import { Toast } from '../../components/workspace/Toast';
import type { ToastMessage } from '../../components/workspace/Toast';
import { fetchSummary } from '../../api/workspace/dashboard';
import { fetchBalance } from '../../api/workspace/cash';
import { listNotifications, markNotificationsRead } from '../../api/workspace/notifications';
import type { AppNotification } from '../../api/workspace/notifications';
import { playNotificationSound, unlockNotificationSound } from '../../utils/notificationSound';
import { fetchProfile } from '../../api/workspace/settings';
import { saveProfile } from '../../api/session';
import { mediaUrl, THUMB } from '../../api/client';
import type { Profile } from '../../api/auth';
import { can as profileCan } from '../../api/permissions';
import type { Permission } from '../../api/permissions';
import { formatMoney } from '../../utils/money';
import type { Currency } from '../../utils/money';
import { colors } from '../../theme/colors';
import { fontFamily } from '../../theme/typography';
import { radius, screenPadding, spacing } from '../../theme/layout';
import { WorkspaceProvider } from './WorkspaceContext';
import type { WorkspaceRoute } from './WorkspaceContext';
import { DashboardScreen } from './DashboardScreen';
import { SalesScreen } from './SalesScreen';
import { CashScreen } from './CashScreen';
import { MenuScreen } from './MenuScreen';
import { MoreScreen } from './MoreScreen';
import { StockScreen } from './StockScreen';
import { ExpensesScreen } from './ExpensesScreen';
import { StaffScreen } from './StaffScreen';
import { CreditsScreen } from './CreditsScreen';
import { CustomersScreen } from './CustomersScreen';
import { SettingsScreen } from './SettingsScreen';
import { AuditScreen } from './AuditScreen';
import { PurchasesScreen } from './PurchasesScreen';
import { NotificationsScreen } from './NotificationsScreen';
import { ReportsScreen } from './ReportsScreen';
import { canOpen, homeRouteFor, tabRoutesFor } from './access';

interface WorkspaceScreenProps {
  profile: Profile;
  onProfileChange: (profile: Profile) => void;
  onLogout: () => void;
}

const TITLES: Record<WorkspaceRoute, string> = {
  dashboard: 'Tableau de bord',
  sales: 'Ventes',
  cash: 'Caisse',
  menu: 'Menu',
  more: 'Modules',
  stock: 'Stock',
  expenses: 'Dépenses',
  staff: 'Personnel',
  credits: 'Créances',
  customers: 'Clients',
  settings: 'Paramètres',
  audit: 'Journal d’activité',
  purchases: 'Demandes d’achat',
  notifications: 'Notifications',
  reports: 'Rapports et exports',
};

/** Interrogation des notifications : assez vite pour ressembler à une messagerie. */
const NOTIFICATION_POLL_MS = 10_000;

const TAB_DEFINITIONS: Record<WorkspaceRoute, Omit<TabDefinition<WorkspaceRoute>, 'key'>> = {
  dashboard: { label: 'Accueil', icon: 'home' },
  sales: { label: 'Ventes', icon: 'bag' },
  cash: { label: 'Caisse', icon: 'wallet' },
  menu: { label: 'Menu', icon: 'menu-book' },
  stock: { label: 'Stock', icon: 'box' },
  expenses: { label: 'Achats', icon: 'receipt' },
  credits: { label: 'Créances', icon: 'credit' },
  customers: { label: 'Clients', icon: 'user' },
  staff: { label: 'Personnel', icon: 'users' },
  settings: { label: 'Compte', icon: 'settings' },
  audit: { label: 'Journal', icon: 'clock' },
  purchases: { label: 'Achats', icon: 'cart' },
  notifications: { label: 'Alertes', icon: 'bell' },
  reports: { label: 'Rapports', icon: 'bar-chart' },
  more: { label: 'Plus', icon: 'grid' },
};

/**
 * Coque de l'espace restaurant.
 *
 * La navigation interne est tenue par un simple état plutôt que par un
 * navigateur à onglets : cinq écrans et quelques modules ne justifient pas
 * une dépendance de plus, et cela laisse la main sur l'en-tête, qui doit
 * afficher le solde de caisse en permanence (§7).
 *
 * Les onglets dépendent du rôle : le caissier arrive sur l'écran de vente
 * et ne voit pas le solde, le magasinier arrive sur le stock et voit le
 * solde, sans le détail.
 */
export function WorkspaceScreen({
  profile,
  onProfileChange,
  onLogout,
}: WorkspaceScreenProps) {
  const insets = useSafeAreaInsets();
  const can = useCallback(
    (permission: Permission) => profileCan(profile, permission),
    [profile],
  );
  const home = homeRouteFor(profile);
  const tabRoutes = tabRoutesFor(profile);
  const showsBalance = can('cash.view') || can('cash.balance');

  /*
   * Pile de navigation plutôt qu'une simple route courante : le bouton
   * retour doit ramener là d'où l'on vient, y compris entre deux onglets.
   * L'accueil est le fond de pile — on ne recule jamais au-delà.
   */
  const [history, setHistory] = useState<WorkspaceRoute[]>([home]);
  const [balance, setBalance] = useState(0);
  const [alerts, setAlerts] = useState({ stock: 0, credits: 0 });
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const toastId = useRef(0);

  const currency: Currency = useMemo(
    () => ({
      symbol: profile.restaurant.currencySymbol,
      decimals: profile.restaurant.currencyDecimals,
    }),
    [profile.restaurant.currencySymbol, profile.restaurant.currencyDecimals],
  );

  const money = useCallback((value: number) => formatMoney(value, currency), [currency]);

  /**
   * Le résumé sert deux besoins : le solde de l'en-tête et les pastilles
   * d'alerte de la barre d'onglets. Un seul appel pour les deux.
   */
  const refreshBalance = useCallback(() => {
    if (can('dashboard.view')) {
      fetchSummary()
        .then((summary) => {
          setBalance(summary.cash.balance);
          setAlerts({ stock: summary.stock.lowCount, credits: summary.credits.openCount });
        })
        .catch(() => undefined);
      return;
    }
    // Le magasinier n'a pas le résumé, seulement le solde.
    if (can('cash.balance')) {
      fetchBalance()
        .then((result) => setBalance(result.balance))
        .catch(() => undefined);
    }
  }, [can]);

  useEffect(refreshBalance, [refreshBalance]);

  const notify = useCallback((text: string, tone: 'success' | 'danger' = 'success') => {
    toastId.current += 1;
    setToast({ id: toastId.current, text, tone });
  }, []);

  // --- Notifications ------------------------------------------------------
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const latestSeen = useRef<string | null>(null);
  const seenIds = useRef(new Set<string>());

  /*
   * Interrogation toutes les dix secondes tant que l'espace est ouvert. Les
   * nouveautés jouent un son et s'annoncent en bas d'écran ; le premier
   * chargement, lui, reste silencieux — ce ne sont pas des nouveautés.
   */
  useEffect(() => {
    let cancelled = false;
    const releaseSound = unlockNotificationSound();

    async function poll(initial: boolean) {
      try {
        const page = await listNotifications(
          latestSeen.current ? { since: latestSeen.current, limit: 20 } : { limit: 50 },
        );
        if (cancelled) return;
        setUnreadCount(page.unreadCount);

        // Une notification déjà vue ne s'annonce jamais deux fois, quoi que
        // renvoie le serveur.
        const fresh = page.items.filter((item) => !seenIds.current.has(item.id));
        fresh.forEach((item) => seenIds.current.add(item.id));
        const newest = page.items[0];
        if (newest) latestSeen.current = newest.createdAt;
        if (fresh.length === 0) return;

        setNotifications((current) =>
          initial ? fresh : [...fresh, ...current].slice(0, 100),
        );

        if (!initial) {
          playNotificationSound();
          notify(fresh.length > 1 ? `${fresh.length} nouvelles notifications` : fresh[0]!.title);
          // Un achat approuvé, une vente annulée : le solde a pu bouger.
          refreshBalance();
        }
      } catch {
        // Réseau coupé : on réessaiera au prochain passage.
      }
    }

    void poll(true);
    const timer = setInterval(() => void poll(false), NOTIFICATION_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
      releaseSound();
    };
  }, [notify, refreshBalance]);

  // Sur navigateur, le titre de l'onglet porte le compteur, comme une messagerie.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.title = unreadCount > 0 ? `(${unreadCount}) N’ma Restaurant` : 'N’ma Restaurant';
  }, [unreadCount]);

  const markRead = useCallback((ids: string[] | 'all') => {
    const now = new Date().toISOString();
    setNotifications((current) =>
      current.map((item) =>
        ids === 'all' || ids.includes(item.id) ? { ...item, readAt: item.readAt ?? now } : item,
      ),
    );
    setUnreadCount((count) => (ids === 'all' ? 0 : Math.max(0, count - ids.length)));
    markNotificationsRead(ids).catch(() => undefined);
  }, []);

  const reloadProfile = useCallback(() => {
    fetchProfile()
      .then(async (next) => {
        await saveProfile(next).catch(() => undefined);
        onProfileChange(next);
      })
      .catch(() => undefined);
  }, [onProfileChange]);

  // Le rôle a pu changer depuis la dernière ouverture, et un profil
  // enregistré par une version précédente n'a pas encore ses droits.
  useEffect(reloadProfile, [reloadProfile]);

  const current = history[history.length - 1] ?? home;
  // Un écran devenu interdit (rôle modifié) ramène à l'accueil du rôle.
  const route = canOpen(profile, current) ? current : home;
  const canGoBack = history.length > 1;

  const navigate = useCallback(
    (next: WorkspaceRoute) => {
      setHistory((stack) => {
        if (stack[stack.length - 1] === next) return stack;
        // Revenir à l'accueil repart de zéro : c'est le point de départ, on
        // n'y arrive jamais « par-dessus » un autre écran.
        if (next === home) return [home];
        // Vingt entrées suffisent largement et bornent la mémoire.
        return [...stack.slice(-19), next];
      });
    },
    [home],
  );

  const goBack = useCallback(() => {
    setHistory((current) => (current.length > 1 ? current.slice(0, -1) : current));
  }, []);

  const isTab = tabRoutes.includes(route);

  // Bouton retour matériel d'Android : il doit ramener aux modules, pas
  // fermer l'application depuis un écran secondaire.
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack) return false;
      goBack();
      return true;
    });

    return () => subscription.remove();
  }, [canGoBack, goBack]);

  const tabs: Array<TabDefinition<WorkspaceRoute>> = tabRoutes.map((key) => ({
    key,
    ...TAB_DEFINITIONS[key],
    ...(key === 'more' ? { badge: alerts.stock + alerts.credits } : {}),
  }));

  const bell = <BellButton count={unreadCount} onPress={() => navigate('notifications')} />;

  const contextValue = {
    profile,
    can,
    notifications,
    unreadCount,
    markRead,
    currency,
    money,
    balance,
    refreshBalance,
    navigate,
    notify,
    reloadProfile,
    logout: onLogout,
  };

  return (
    <WorkspaceProvider value={contextValue}>
      <View style={styles.screen}>
        <View style={[styles.headerZone, { paddingTop: insets.top + spacing.md }]}>
          {route === home ? (
            <WorkspaceHeader
              restaurantName={profile.restaurant.name}
              greeting={`Bonjour ${profile.user.fullName.split(' ')[0] ?? ''}`}
              balance={showsBalance ? money(balance) : undefined}
              logoUri={mediaUrl(profile.restaurant.logoMediaId, THUMB.small)}
              bell={bell}
              onPressAccount={() => navigate('settings')}
              onLogout={() => setLogoutOpen(true)}
            />
          ) : (
            <ScreenHeader
              title={TITLES[route]}
              onBack={goBack}
              action={
                <View style={styles.headerActions}>
                  {showsBalance && (
                    <View style={styles.balanceChip}>
                      <Text style={styles.balanceChipLabel}>Caisse</Text>
                      <Text style={styles.balanceChipValue} numberOfLines={1}>
                        {money(balance)}
                      </Text>
                    </View>
                  )}
                  {route !== 'notifications' && bell}
                  <Pressable
                    onPress={() => setLogoutOpen(true)}
                    hitSlop={8}
                    style={({ pressed }) => [styles.logoutSmall, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Se déconnecter"
                  >
                    <Icon name="logout" size={16} color={colors.danger} strokeWidth={2.1} />
                  </Pressable>
                </View>
              }
            />
          )}
        </View>

        <View style={styles.body}>
          <SceneSwitch sceneKey={route}>{renderRoute(route)}</SceneSwitch>
        </View>

        <TabBar tabs={tabs} active={isTab ? route : 'more'} onChange={navigate} />
        <Toast message={toast} onHide={() => setToast(null)} />

        <ConfirmSheet
          visible={logoutOpen}
          title="Se déconnecter"
          message="Vous retournerez à la page de connexion. Toutes vos données restent enregistrées."
          confirmLabel="Se déconnecter"
          onCancel={() => setLogoutOpen(false)}
          onConfirm={() => {
            setLogoutOpen(false);
            onLogout();
          }}
        />
      </View>
    </WorkspaceProvider>
  );
}

function renderRoute(route: WorkspaceRoute) {
  switch (route) {
    case 'dashboard':
      return <DashboardScreen />;
    case 'sales':
      return <SalesScreen />;
    case 'cash':
      return <CashScreen />;
    case 'menu':
      return <MenuScreen />;
    case 'more':
      return <MoreScreen />;
    case 'stock':
      return <StockScreen />;
    case 'expenses':
      return <ExpensesScreen />;
    case 'staff':
      return <StaffScreen />;
    case 'credits':
      return <CreditsScreen />;
    case 'customers':
      return <CustomersScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'audit':
      return <AuditScreen />;
    case 'purchases':
      return <PurchasesScreen />;
    case 'notifications':
      return <NotificationsScreen />;
    case 'reports':
      return <ReportsScreen />;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerZone: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.md,
  },
  body: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoutSmall: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  balanceChip: {
    alignItems: 'flex-end',
    backgroundColor: colors.pastelGreen,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    maxWidth: 140,
  },
  balanceChipLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.iconGreen,
  },
  balanceChipValue: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    lineHeight: 17,
    color: colors.success,
  },
});
