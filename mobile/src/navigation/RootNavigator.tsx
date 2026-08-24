import { useCallback, useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LandingScreen } from '../screens/LandingScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { RegisterSuccessScreen } from '../screens/RegisterSuccessScreen';
import { WorkspacePlaceholderScreen } from '../screens/WorkspacePlaceholderScreen';
import { AdminLoginScreen } from '../screens/admin/AdminLoginScreen';
import { AdminRestaurantsScreen } from '../screens/admin/AdminRestaurantsScreen';
import type { LoginResponse, Profile } from '../api/auth';
import type { AdminLoginResponse } from '../api/superadmin';
import { clearSession, loadSession } from '../api/session';
import { clearAdminSession, loadAdminSession } from '../api/adminSession';
import type { StoredAdminSession } from '../api/adminSession';
import { colors } from '../theme/colors';

export type RootStackParamList = {
  Landing: undefined;
  Register: undefined;
  RegisterSuccess: { message: string };
  Login: undefined;
  AdminLogin: undefined;
  AdminRestaurants: undefined;
  Workspace: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

interface RootNavigatorProps {
  onReady: () => void;
}

export function RootNavigator({ onReady }: RootNavigatorProps) {
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
        if (user) setProfile(user.profile);
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
    await clearSession().catch(() => undefined);
    setProfile(null);
  }, []);

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
            {() => <WorkspacePlaceholderScreen profile={profile} onLogout={handleLogout} />}
          </Stack.Screen>
        ) : (
          <>
            <Stack.Screen name="Landing">
              {({ navigation }) => (
                <LandingScreen
                  onRegister={() => navigation.navigate('Register')}
                  onLogin={() => navigation.navigate('Login')}
                  onAdminAccess={() => navigation.navigate('AdminLogin')}
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
                  onSuccess={(session: LoginResponse) => setProfile(session.profile)}
                  onBack={() => navigation.goBack()}
                  onGoToRegister={() => navigation.replace('Register')}
                />
              )}
            </Stack.Screen>

            <Stack.Screen name="AdminLogin">
              {({ navigation }) => (
                <AdminLoginScreen
                  onSuccess={(session: AdminLoginResponse) =>
                    setAdminSession({
                      accessToken: session.accessToken,
                      refreshToken: session.refreshToken,
                      admin: session.admin,
                    })
                  }
                  onBack={() => navigation.goBack()}
                />
              )}
            </Stack.Screen>
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
