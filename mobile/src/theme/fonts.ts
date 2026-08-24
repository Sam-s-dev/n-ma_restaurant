import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';

/**
 * Charge Poppins. `useFonts` renvoie `[loaded, error]` (doc Expo SDK 54).
 * Les clés de la map deviennent les valeurs utilisables dans `fontFamily`,
 * d'où la correspondance avec `src/theme/typography.ts`.
 */
export function useAppFonts(): { fontsLoaded: boolean; fontError: Error | null } {
  const [loaded, error] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  return { fontsLoaded: loaded, fontError: error };
}
