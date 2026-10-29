import { useCallback, useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LandingScreen } from '../screens/LandingScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { RegisterSuccessScreen } from '../screens/RegisterSuccessScreen';
import { WorkspaceScreen } from '../screens/workspace/WorkspaceScreen';
import { AdminRestaurantsScreen } from '../screens/admin/AdminRestaurantsScreen';
import type { LoginResponse, Profile } from '../api/auth';
import type { AdminLoginResponse } from '../api/superadmin';
import { setAuthTokens, setSessionExpiredHandler } from '../api/authed';
import { invalidateCache } from '../api/cache';
import { clearSession, loadSession } from '../api/session';
import { clearAdminSession, loadAdminSession } from '../api/adminSession';
import type { StoredAdminSession } from '../api/adminSession';
import { PublicSite } from '../screens/public/PublicSite';
import { currentPublicRoute } from '../utils/publicRoute';
import { disablePush } from '../utils/push';
import { clearSnapshots } from '../api/offline';
import { setPendingLogin } from '../api/offlineLogin';
import { colors } from '../theme/colors';

export type RootStackParamList = {
  Landing: undefined;
  Register: undefined;
  RegisterSuccess: { message: string };
  Login: undefined;
  AdminRestaurants: undefined;
  Workspace: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

interface RootNavigatorProps {
  onReady: () => void;
}

export function RootNavigator({ onReady }: RootNavigatorProps) {
  // Un client arrivé par le lien d'un restaurant voit son mini-site, rien
  // d'autre : ni page d'accueil, ni connexion.
  const [publicRoute] = useState(currentPublicRoute);
  if (publicRoute) return <PublicEntry route={publicRoute} onReady={onReady} />;
  return <StaffNavigator onReady={onReady} />;
}

function PublicEntry({ route, onReady }: { route: NonNullable<ReturnType<typeof currentPublicRoute>>; onReady: () => void }) {
  useEffect(onReady, [onReady]);
  return <PublicSite initial={route} />;
}

function StaffNavigator({ onReady }: RootNavigatorProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [adminSession, setAdminSession] = useState<StoredAdminSession | null>(null);
  const [restoring, setRestoring] = useState(true);

  // Les deux sessions sont restaurées en parallèle : l'éditeur et un gérant
  // peuvent avoir chacun la leur sur le même appareil.
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadSession(), loadAdminSession()])
      .then(([user, admin]) => {
        if (cancelled) return;
        if (user) {
          // Les jetons doivent être posés avant le premier rendu de
          // l'espace : ses écrans lancent leurs requêtes au montage.
          setAuthTokens({ accessToken: user.accessToken, refreshToken: user.refreshToken });
          setProfile(user.profile);
        }
        if (admin) setAdminSession(admin);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!restoring) onReady();
  }, [restoring, onReady]);

  const handleLogout = useCallback(async () => {
    // Le téléphone ne doit plus recevoir les messages du compte qui part.
    await disablePush();
    setAuthTokens(null);
    // Sans cela, les chiffres du restaurant précédent s'afficheraient une
    // fraction de seconde sous le compte suivant.
    invalidateCache();
    await clearSnapshots();
    setPendingLogin(null);
    await clearSession().catch(() => undefined);
    setProfile(null);
  }, []);

  // Un renouvellement de session impossible (jeton révoqué, compte
  // désactivé pendant l'utilisation) ramène à la page de connexion plutôt
  // que de laisser l'espace afficher des erreurs sur chaque écran.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      void handleLogout();
    });
    return () => setSessionExpiredHandler(null);
  }, [handleLogout]);

  const handleAdminLogout = useCallback(async () => {
    await clearAdminSession().catch(() => undefined);
    setAdminSession(null);
  }, []);

  if (restoring) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        {adminSession ? (
          <Stack.Screen name="AdminRestaurants">
            {() => (
              <AdminRestaurantsScreen
                token={adminSession.accessToken}
                admin={adminSession.admin}
                onLogout={handleAdminLogout}
                onSessionExpired={handleAdminLogout}
              />
            )}
          </Stack.Screen>
        ) : profile ? (
          <Stack.Screen name="Workspace">
            {() => (
              <WorkspaceScreen
                profile={profile}
                onProfileChange={setProfile}
                onLogout={handleLogout}
              />
            )}
          </Stack.Screen>
        ) : (
          <>
            <Stack.Screen name="Landing">
              {({ navigation }) => (
                <LandingScreen
                  onRegister={() => navigation.navigate('Register')}
                  onLogin={() => navigation.navigate('Login')}
                />
              )}
            </Stack.Screen>

            <Stack.Screen name="Register">
              {({ navigation }) => (
                <RegisterScreen
                  onSuccess={(message) => navigation.replace('RegisterSuccess', { message })}
                  onBack={() => navigation.goBack()}
                  onGoToLogin={() => navigation.replace('Login')}
                />
              )}
            </Stack.Screen>

            <Stack.Screen name="RegisterSuccess" options={{ animation: 'fade' }}>
              {({ navigation, route }) => (
                <RegisterSuccessScreen
                  message={route.params.message}
                  onGoToLogin={() => navigation.replace('Login')}
                  onGoHome={() => navigation.replace('Landing')}
                />
              )}
            </Stack.Screen>

            <Stack.Screen name="Login">
              {({ navigation }) => (
                <LoginScreen
                  onOfflineSuccess={(offlineProfile) => {
                    // Pas encore de jeton : la vraie connexion se fera au retour du réseau.
                    setAuthTokens(null);
                    setProfile(offlineProfile);
                  }}
                  onSuccess={(session: LoginResponse) => {
                    setAuthTokens({
                      accessToken: session.accessToken,
                      refreshToken: session.refreshToken,
                    });
                    setProfile(session.profile);
                  }}
                  onAdminSuccess={(session: AdminLoginResponse) =>
                    setAdminSession({
                      accessToken: session.accessToken,
                      refreshToken: session.refreshToken,
                      admin: session.admin,
                    })
                  }
                  onBack={() => navigation.goBack()}
                  onGoToRegister={() => navigation.replace('Register')}
                />
              )}
            </Stack.Screen>
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
