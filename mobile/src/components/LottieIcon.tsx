import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import LottieView from 'lottie-react-native';
import { radius } from '../theme/layout';

/**
 * Les animations sont embarquées dans le bundle : pas d'appel réseau,
 * l'écran d'accueil s'affiche complet même sans connexion.
 * Voir `scripts/build-animations.js` pour les modifier.
 */
const ANIMATIONS = {
  signup: require('../../assets/animations/signup.json'),
  validation: require('../../assets/animations/validation.json'),
  dashboard: require('../../assets/animations/dashboard.json'),
  cash: require('../../assets/animations/cash.json'),
  stock: require('../../assets/animations/stock.json'),
  menu: require('../../assets/animations/menu.json'),
  credit: require('../../assets/animations/credit.json'),
  staff: require('../../assets/animations/staff.json'),
} as const;

export type AnimationName = keyof typeof ANIMATIONS;

interface LottieIconProps {
  name: AnimationName;
  /** Côté du carré arrondi qui contient l'animation. */
  size?: number;
  background: string;
  style?: StyleProp<ViewStyle>;
  /** Ralentit la boucle pour un rendu plus discret. */
  speed?: number;
}

export function LottieIcon({
  name,
  size = 56,
  background,
  style,
  speed = 0.6,
}: LottieIconProps) {
  const ref = useRef<LottieView>(null);

  // Sur Android, `autoPlay` ne redémarre pas toujours après un remontage :
  // on lance la lecture explicitement.
  useEffect(() => {
    ref.current?.play();
  }, []);

  return (
    <View
      style={[
        styles.container,
        { width: size, height: size, backgroundColor: background },
        style,
      ]}
    >
      <LottieView
        ref={ref}
        source={ANIMATIONS[name]}
        autoPlay
        loop
        speed={speed}
        style={{ width: size * 0.72, height: size * 0.72 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
