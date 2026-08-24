import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radius, spacing } from '../theme/layout';
import type { FlowStep } from '../content/landing';

interface ServiceFlowProps {
  steps: readonly FlowStep[];
}

/** Durée d'affichage de chaque étape avant de passer à la suivante. */
const STEP_MS = 2100;
const DOT = 38;

/**
 * Petite animation en boucle qui déroule le parcours d'un service :
 * commande, cuisine, service, encaissement.
 *
 * Écrit avec l'API `Animated` de React Native plutôt qu'en Lottie : le
 * texte change à chaque étape, ce qu'un fichier Lottie figé ne permet pas.
 */
export function ServiceFlow({ steps }: ServiceFlowProps) {
  const [active, setActive] = useState(0);
  const previous = useRef(0);

  const progress = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const captionFade = useRef(new Animated.Value(1)).current;

  const lastIndex = steps.length - 1;

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((current) => (current + 1) % steps.length);
    }, STEP_MS);
    return () => clearInterval(timer);
  }, [steps.length]);

  useEffect(() => {
    const target = lastIndex === 0 ? 0 : active / lastIndex;

    // Au bouclage (dernière étape → première), la barre repart de zéro
    // instantanément : la voir reculer donnerait l'impression d'un retour
    // en arrière dans le service.
    if (active === 0 && previous.current === lastIndex) {
      progress.setValue(0);
    } else {
      Animated.timing(progress, {
        toValue: target,
        duration: 480,
        useNativeDriver: false,
      }).start();
    }
    previous.current = active;

    // La pastille active rebondit légèrement à son arrivée.
    pop.setValue(0.82);
    Animated.spring(pop, {
      toValue: 1,
      friction: 5,
      tension: 110,
      useNativeDriver: true,
    }).start();

    // Le texte se renouvelle en fondu.
    captionFade.setValue(0);
    Animated.timing(captionFade, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }, [active, lastIndex, progress, pop, captionFade]);

  const fillWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // Le rail relie le centre de la première pastille à celui de la dernière.
  const railInset = `${100 / (steps.length * 2)}%` as const;

  const current = steps[active];

  return (
    <View style={styles.container}>
      <View style={styles.track}>
        <View style={[styles.railWrap, { left: railInset, right: railInset }]}>
          <View style={styles.rail} />
          <Animated.View style={[styles.railFill, { width: fillWidth }]} />
        </View>

        <View style={styles.row}>
          {steps.map((step, index) => {
            const done = index < active;
            const isActive = index === active;

            return (
              <View key={step.label} style={styles.item}>
                <Animated.View
                  style={[
                    styles.dot,
                    done && styles.dotDone,
                    isActive && styles.dotActive,
                    isActive && { transform: [{ scale: pop }] },
                  ]}
                >
                  <Text
                    style={[
                      styles.dotText,
                      done && styles.dotTextDone,
                      isActive && styles.dotTextActive,
                    ]}
                  >
                    {index + 1}
                  </Text>
                </Animated.View>

                <Text
                  style={[styles.label, isActive && styles.labelActive]}
                  numberOfLines={2}
                >
                  {step.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <Animated.View style={[styles.caption, { opacity: captionFade }]}>
        <Text style={styles.captionTitle}>{current?.title ?? ''}</Text>
        <Text style={styles.captionBody}>{current?.caption ?? ''}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.sm,
  },
  track: {
    position: 'relative',
  },
  railWrap: {
    position: 'absolute',
    top: DOT / 2 - 1.5,
    height: 3,
  },
  rail: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  railFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  row: {
    flexDirection: 'row',
  },
  item: {
    flex: 1,
    alignItems: 'center',
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.borderStrong,
  },
  dotDone: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  dotActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dotText: {
    ...typography.button,
    fontSize: 14,
    lineHeight: 18,
    color: colors.textTertiary,
  },
  dotTextDone: {
    color: colors.primary,
  },
  dotTextActive: {
    color: colors.textOnPrimary,
  },
  label: {
    ...typography.small,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: spacing.sm,
    color: colors.textTertiary,
  },
  labelActive: {
    color: colors.textPrimary,
  },
  caption: {
    marginTop: spacing.xl,
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    // Hauteur fixe : sans elle, la section sautille quand la longueur du
    // texte change d'une étape à l'autre.
    minHeight: 116,
  },
  captionTitle: {
    ...typography.h3,
    marginBottom: spacing.xs,
  },
  captionBody: {
    ...typography.small,
  },
});
