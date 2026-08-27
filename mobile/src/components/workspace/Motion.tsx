import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/layout';

/**
 * Mouvements de l'espace restaurant.
 *
 * Règle unique : **rien ne bouge horizontalement**. Ni au repos, ni à
 * l'apparition. Le regard d'un utilisateur en train de remplir un
 * formulaire est fixé sur un champ ; le moindre déplacement latéral est
 * lu comme un défaut d'affichage, jamais comme une intention.
 *
 * Les entrées se font donc en fondu et en montée verticale, et seule une
 * pression du doigt autorise un changement d'échelle — il est alors
 * attendu, puisque provoqué.
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
  duration?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Entrée en cascade : l'élément monte et apparaît.
 *
 * Le mouvement est strictement vertical, et c'est délibéré. La première
 * version faisait aussi grandir la card (0,97 → 1) avec une légère
 * inclinaison : les bords gauche et droit se déplaçaient alors de quelques
 * points, et l'ensemble donnait l'impression de balancer latéralement —
 * insupportable dans un formulaire, où le regard est fixé sur un champ.
 *
 * Une largeur qui bouge est toujours perçue comme une instabilité, jamais
 * comme une animation. Seuls l'opacité et le déplacement vertical restent.
 */
export function Reveal({
  children,
  index = 0,
  distance = 14,
  duration = 380,
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
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [distance, 0],
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
 * L'échelle est infime — on ne la remarque pas consciemment — mais elle
 * suffit à confirmer l'appui sur un écran tactile, où rien d'autre ne
 * signale qu'on a bien touché la cible. Elle ne joue que pendant l'appui,
 * jamais au repos : une mise en page qui bouge toute seule est perçue
 * comme un défaut.
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
              { scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] }) },
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
 *
 * Le battement porte sur l'opacité et non sur la taille : un élément qui
 * grandit et rétrécit en boucle décale ses voisins et donne l'impression
 * que la page vibre.
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
      style={{ opacity: beat.interpolate({ inputRange: [0, 1], outputRange: [1, 0.72] }) }}
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
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
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
