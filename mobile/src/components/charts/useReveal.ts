import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

/**
 * Progression 0 → 1 rejouée à chaque changement de données.
 *
 * Les graphiques en SVG ne peuvent pas être animés par `Animated.View` :
 * il faut recalculer le tracé à chaque image. On pilote donc une valeur
 * animée et on la recopie dans l'état React. C'est acceptable ici — une
 * poignée de points, sur moins d'une seconde — mais c'est la raison pour
 * laquelle les histogrammes utilisent, eux, de vraies `Animated.View`.
 *
 * Un remontage rejoue l'animation, ce qui est voulu : revenir sur le
 * tableau de bord redessine les courbes.
 */
export function useReveal(signature: string, duration = 650, delay = 0): number {
  const [progress, setProgress] = useState(0);
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    value.setValue(0);
    setProgress(0);

    const id = value.addListener((state) => setProgress(state.value));
    const animation = Animated.timing(value, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      // Le tracé est recalculé en JavaScript : le pilote natif ne peut pas
      // s'en charger.
      useNativeDriver: false,
    });

    animation.start();

    return () => {
      animation.stop();
      value.removeListener(id);
    };
  }, [signature, duration, delay, value]);

  return progress;
}
