import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/layout';

/**
 * Mouvements de l'espace restaurant.
 *
 * Le relief vient de vraies transformations en trois dimensions : les
 * éléments arrivent inclinés sur l'axe X, vus à travers une perspective,
 * puis se redressent. C'est la seule façon d'obtenir de la profondeur sans
 * embarquer un moteur 3D, qui pèserait plusieurs mégaoctets et viderait la
 * batterie pour un écran de caisse.
 *
 * Tout passe par le pilote natif (opacité et transformations uniquement) :
 * l'animation continue de tourner même quand le fil JavaScript est occupé
 * à traiter une réponse du serveur.
 */

/** Décalage entre deux éléments d'une même série, en millisecondes. */
const STAGGER = 55;

interface RevealProps {
  children: React.ReactNode;
  /** Rang dans la liste : décale le départ pour créer la cascade. */
  index?: number;
  /** Distance de montée, en points. */
  distance?: number;
  /** Inclinaison de départ, en degrés. Zéro pour un simple fondu. */
  tilt?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Entrée en cascade : l'élément monte, se redresse et apparaît.
 *
 * Le mouvement se rejoue à chaque montage, donc à chaque retour sur
 * l'écran — c'est ce qui donne le sentiment que l'application « respire »
 * plutôt que d'afficher un écran figé.
 */
export function Reveal({
  children,
  index = 0,
  distance = 18,
  tilt = 8,
  duration = 420,
  style,
}: RevealProps) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay: index * STAGGER,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, index, duration]);

  return (
    <Animated.View
      style={[
        {
          opacity: progress,
          transform: [
            // La perspective doit précéder les rotations, sinon l'inclinaison
            // reste plate et le relief disparaît.
            { perspective: 800 },
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [distance, 0],
              }),
            },
            {
              rotateX: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [`${tilt}deg`, '0deg'],
              }),
            },
            {
              scale: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0.97, 1],
              }),
            },
          ],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

interface DepthPressableProps {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Surface qui s'enfonce sous le doigt.
 *
 * L'échelle et l'inclinaison sont infimes — on ne les remarque pas
 * consciemment — mais elles suffisent à confirmer l'appui sur un écran
 * tactile, où rien d'autre ne signale qu'on a bien touché la cible.
 */
export function DepthPressable({
  children,
  onPress,
  disabled = false,
  accessibilityLabel,
  style,
}: DepthPressableProps) {
  const press = useRef(new Animated.Value(0)).current;

  const animateTo = (value: number) =>
    Animated.spring(press, {
      toValue: value,
      speed: 40,
      bounciness: 4,
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => animateTo(1)}
      onPressOut={() => animateTo(0)}
      accessibilityRole="button"
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
    >
      <Animated.View
        style={[
          {
            transform: [
              { perspective: 700 },
              { scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.965] }) },
              {
                rotateX: press.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '4deg'],
                }),
              },
            ],
            opacity: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] }),
          },
          style,
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

/**
 * Battement lent, pour attirer l'œil sur ce qui réclame une action —
 * une caisse vide, un stock épuisé. Réservé à un seul élément à la fois :
 * si tout clignote, plus rien ne ressort.
 */
export function Pulse({ children, active = true }: { children: React.ReactNode; active?: boolean }) {
  const beat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      beat.setValue(0);
      return undefined;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(beat, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(beat, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [beat, active]);

  return (
    <Animated.View
      style={{
        transform: [
          { scale: beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Compteur qui monte jusqu'à la valeur réelle.
 *
 * Rend visible qu'un chiffre vient de changer : après un encaissement, la
 * recette du jour grimpe au lieu de sauter, et l'on comprend que c'est
 * bien la vente qu'on vient de saisir qui l'a fait bouger.
 *
 * Ici l'état React est mis à jour à chaque image — inévitable puisqu'il
 * s'agit de recomposer du texte — d'où une durée courte et un seul
 * compteur animé par écran.
 */
export function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(target);
  const animated = useRef(new Animated.Value(target)).current;
  const previous = useRef(target);

  useEffect(() => {
    if (previous.current === target) return undefined;

    animated.setValue(previous.current);
    previous.current = target;

    const id = animated.addListener((state) => setValue(state.value));
    const animation = Animated.timing(animated, {
      toValue: target,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();

    return () => {
      animation.stop();
      animated.removeListener(id);
    };
  }, [target, duration, animated]);

  return value;
}

/**
 * Bloc gris qui ondule pendant le chargement.
 *
 * Préféré à un rond qui tourne : la forme annonce déjà ce qui va
 * apparaître, l'écran ne se réorganise pas sous les yeux au moment où les
 * données arrivent.
 */
export function Skeleton({
  width,
  height,
  style,
}: {
  width?: number | `${number}%`;
  height: number;
  style?: StyleProp<ViewStyle>;
}) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        { height, ...(width !== undefined ? { width } : { alignSelf: 'stretch' }) },
        { opacity: shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) },
        style,
      ]}
    />
  );
}

/**
 * Bascule animée entre deux vues : l'ancienne s'efface vers l'arrière,
 * la nouvelle avance. Utilisée au changement d'onglet.
 */
export function SceneSwitch({ sceneKey, children }: { sceneKey: string; children: React.ReactNode }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [sceneKey, progress]);

  return (
    <Animated.View
      style={[
        styles.scene,
        {
          opacity: progress,
          transform: [
            { perspective: 1000 },
            {
              translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }),
            },
            {
              scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: radius.sm,
  },
  scene: {
    flex: 1,
  },
});
