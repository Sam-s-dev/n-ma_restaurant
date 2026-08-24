import { useCallback, useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LandingScreen } from '../screens/LandingScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { RegisterSuccessScreen } from '../screens/RegisterSuccessScreen';
import { WorkspacePlaceholderScreen } from '../screens/WorkspacePlaceholderScreen';
import type { LoginResponse, Profile } from '../api/auth';
import { clearSession, loadSession } from '../api/session';
import { colors } from '../theme/colors';

export type RootStackParamList = {
  Landing: undefined;
  Register: undefined;
  RegisterSuccess: { message: string };
  Login: undefined;
  Workspace: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

interface RootNavigatorProps {
  onReady: () => void;
}

export function RootNavigator({ onReady }: RootNavigatorProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [restoring, setRestoring] = useState(true);

  // Une session déjà ouverte évite de repasser par l'accueil au lancement.
  useEffect(() => {
    let cancelled = false;
    loadSession()
      .then((session) => {
        if (!cancelled && session) setProfile(session.profile);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleReady = useCallback(() => {
    if (!restoring) onReady();
  }, [restoring, onReady]);

  useEffect(() => {
    if (!restoring) onReady();
  }, [restoring, onReady]);

  const handleLogout = useCallback(async () => {
    await clearSession().catch(() => undefined);
    setProfile(null);
  }, []);

  if (restoring) return null;

  return (
    <NavigationContainer onReady={handleReady}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        {profile ? (
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
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
