import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader, WorkspaceHeader } from '../../components/workspace/Headers';
import { TabBar } from '../../components/workspace/TabBar';
import type { TabDefinition } from '../../components/workspace/TabBar';
import { Toast } from '../../components/workspace/Toast';
import type { ToastMessage } from '../../components/workspace/Toast';
import { fetchSummary } from '../../api/workspace/dashboard';
import { fetchProfile } from '../../api/workspace/settings';
import { saveProfile } from '../../api/session';
import type { Profile } from '../../api/auth';
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

interface WorkspaceScreenProps {
  profile: Profile;
  onProfileChange: (profile: Profile) => void;
  onLogout: () => void;
}

const TAB_ROUTES: WorkspaceRoute[] = ['dashboard', 'sales', 'cash', 'menu', 'more'];

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
};

/**
 * Coque de l'espace restaurant.
 *
 * La navigation interne est tenue par un simple état plutôt que par un
 * navigateur à onglets : cinq écrans et six modules ne justifient pas une
 * dépendance de plus, et cela laisse la main sur l'en-tête, qui doit
 * afficher le solde de caisse en permanence (§7).
 */
export function WorkspaceScreen({
  profile,
  onProfileChange,
  onLogout,
}: WorkspaceScreenProps) {
  const insets = useSafeAreaInsets();
  const [route, setRoute] = useState<WorkspaceRoute>('dashboard');
  const [balance, setBalance] = useState(0);
  const [alerts, setAlerts] = useState({ stock: 0, credits: 0 });
  const [toast, setToast] = useState<ToastMessage | null>(null);
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
    fetchSummary()
      .then((summary) => {
        setBalance(summary.cash.balance);
        setAlerts({ stock: summary.stock.lowCount, credits: summary.credits.openCount });
      })
      .catch(() => undefined);
  }, []);

  useEffect(refreshBalance, [refreshBalance]);

  const notify = useCallback((text: string, tone: 'success' | 'danger' = 'success') => {
    toastId.current += 1;
    setToast({ id: toastId.current, text, tone });
  }, []);

  const reloadProfile = useCallback(() => {
    fetchProfile()
      .then(async (next) => {
        await saveProfile(next).catch(() => undefined);
        onProfileChange(next);
      })
      .catch(() => undefined);
  }, [onProfileChange]);

  const navigate = useCallback((next: WorkspaceRoute) => setRoute(next), []);

  const isTab = TAB_ROUTES.includes(route);

  // Bouton retour matériel d'Android : il doit ramener aux modules, pas
  // fermer l'application depuis un écran secondaire.
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isTab) {
        setRoute('more');
        return true;
      }
      if (route !== 'dashboard') {
        setRoute('dashboard');
        return true;
      }
      return false;
    });

    return () => subscription.remove();
  }, [isTab, route]);

  const tabs: Array<TabDefinition<WorkspaceRoute>> = [
    { key: 'dashboard', label: 'Accueil', icon: 'home' },
    { key: 'sales', label: 'Ventes', icon: 'bag' },
    { key: 'cash', label: 'Caisse', icon: 'wallet' },
    { key: 'menu', label: 'Menu', icon: 'menu-book' },
    { key: 'more', label: 'Plus', icon: 'grid', badge: alerts.stock + alerts.credits },
  ];

  const contextValue = {
    profile,
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
          {isTab ? (
            <WorkspaceHeader
              restaurantName={profile.restaurant.name}
              greeting={`Bonjour ${profile.user.fullName.split(' ')[0] ?? ''}`}
              balance={money(balance)}
              onPressAccount={() => setRoute('settings')}
            />
          ) : (
            <ScreenHeader
              title={TITLES[route]}
              onBack={() => setRoute('more')}
              action={
                <View style={styles.balanceChip}>
                  <Text style={styles.balanceChipLabel}>Caisse</Text>
                  <Text style={styles.balanceChipValue} numberOfLines={1}>
                    {money(balance)}
                  </Text>
                </View>
              }
            />
          )}
        </View>

        <View style={styles.body}>{renderRoute(route)}</View>

        <TabBar tabs={tabs} active={isTab ? route : 'more'} onChange={setRoute} />
        <Toast message={toast} onHide={() => setToast(null)} />
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
