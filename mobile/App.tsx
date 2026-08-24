import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAppFonts } from './src/theme/fonts';

// Appelé en portée globale, comme le préconise la doc Expo SDK 54 : l'écran
// de démarrage reste affiché jusqu'à ce que Poppins soit chargée, sinon la
// première frame s'affiche avec la police système puis saute.
SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ duration: 400, fade: true });

export default function App() {
  const { fontsLoaded, fontError } = useAppFonts();
  const [navigationReady, setNavigationReady] = useState(false);

  // `fontError` est traité comme un succès : mieux vaut afficher l'application
  // avec la police système que rester bloqué sur l'écran de démarrage.
  const ready = (fontsLoaded || Boolean(fontError)) && navigationReady;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  const handleNavigationReady = useCallback(() => setNavigationReady(true), []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <RootNavigator onReady={handleNavigationReady} />
    </SafeAreaProvider>
  );
}
