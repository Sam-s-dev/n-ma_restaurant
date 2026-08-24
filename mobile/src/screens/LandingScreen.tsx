import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FaqItem } from '../components/FaqItem';
import { LottieIcon } from '../components/LottieIcon';
import { ServiceFlow } from '../components/ServiceFlow';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { maxContentWidth, radius, screenPadding, shadows, spacing } from '../theme/layout';
import {
  audiences,
  audienceSection,
  brand,
  faqs,
  faqSection,
  features,
  featuresSection,
  finalCta,
  flowSection,
  flowSteps,
  footer,
  hero,
  punchline,
  steps,
  stepsSection,
} from '../content/landing';

interface LandingScreenProps {
  onRegister: () => void;
  onLogin: () => void;
  /** Accès à la console de l'éditeur, volontairement discret (§2.a). */
  onAdminAccess: () => void;
}

export function LandingScreen({ onRegister, onLogin, onAdminAccess }: LandingScreenProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // La photo reste en portrait — c'est ce qui préserve le visage — mais elle
  // n'occupe qu'une partie de la largeur : elle accompagne le titre au lieu
  // de remplir l'écran.
  const contentWidth = Math.min(width, maxContentWidth) - screenPadding * 2;
  const photoWidth = Math.min(contentWidth * 0.72, 260);
  const photoHeight = photoWidth * 1.15;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* ---------- En-tête : logo N'ma (page publique uniquement) -------- */}
      <View style={styles.header}>
        <Image
          source={require('../../assets/logo-nma.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel={brand.name}
        />
      </View>

      {/* ---------------------------- Hero -------------------------------- */}
      <View style={styles.hero}>
        <View style={[styles.heroPhoto, { width: photoWidth, height: photoHeight }]}>
          <Image
            source={require('../../assets/hero-restaurant.png')}
            style={styles.heroImage}
            resizeMode="cover"
            accessibilityRole="image"
            accessibilityLabel="Serveuse apportant des boissons en salle"
          />
          {/* Léger voile en pied de photo : la pastille blanche qui la
              chevauche reste lisible quelle que soit la zone de l'image. */}
          <LinearGradient
            colors={['transparent', colors.scrimMid]}
            locations={[0.6, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>

        <View style={styles.heroBadge}>
          <View style={styles.heroBadgeDot} />
          <Text style={styles.heroBadgeText}>{hero.badge}</Text>
        </View>

        <Text style={styles.heroTitle}>{hero.title}</Text>
        <Text style={styles.heroSubtitle}>{hero.subtitle}</Text>
      </View>

      {/* ------------------------- Appels à l'action ---------------------- */}
      <View style={styles.ctaGroup}>
        <Button label={hero.primaryCta} onPress={onRegister} variant="primary" />
        <Button label={hero.secondaryCta} onPress={onLogin} variant="secondary" />
      </View>

      {/* ------------------------ Bandeau d'accroche ---------------------- */}
      <View style={styles.punchline}>
        <Text style={styles.punchlineTitle}>{punchline.title}</Text>
        <Text style={styles.punchlineBody}>{punchline.body}</Text>
      </View>

      {/* ------------------------ Comment ça marche ----------------------- */}
      <View style={styles.section}>
        <Text style={typography.caption}>{stepsSection.eyebrow}</Text>
        <Text style={[typography.h1, styles.sectionTitle]}>{stepsSection.title}</Text>

        <View style={styles.stepList}>
          {steps.map((step, index) => (
            <View key={step.animation} style={styles.stepRow}>
              <View style={styles.stepRail}>
                <LottieIcon name={step.animation} background={step.background} size={62} />
                {/* Trait de liaison, sauf après la dernière étape. */}
                {index < steps.length - 1 && <View style={styles.stepConnector} />}
              </View>

              <View style={styles.stepBody}>
                <View style={styles.stepTitleRow}>
                  <View style={[styles.stepNumber, { backgroundColor: step.tint }]}>
                    <Text style={styles.stepNumberText}>{step.number}</Text>
                  </View>
                  <Text style={[typography.h3, styles.stepTitle]}>{step.title}</Text>
                </View>
                <Text style={typography.body}>{step.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* ------------------- Le déroulé d'un service ---------------------- */}
      <View style={styles.section}>
        <Text style={typography.caption}>{flowSection.eyebrow}</Text>
        <Text style={[typography.h1, styles.sectionTitleTight]}>{flowSection.title}</Text>
        <Text style={[typography.body, styles.sectionIntro]}>{flowSection.intro}</Text>

        <ServiceFlow steps={flowSteps} />
      </View>

      {/* -------------------------- Fonctionnalités ----------------------- */}
      <View style={styles.section}>
        <Text style={typography.caption}>{featuresSection.eyebrow}</Text>
        <Text style={[typography.h1, styles.sectionTitle]}>{featuresSection.title}</Text>

        <View style={styles.featureList}>
          {features.map((feature) => (
            <Card key={feature.animation} style={styles.featureCard}>
              <LottieIcon name={feature.animation} background={feature.background} size={54} />
              <View style={styles.featureText}>
                <Text style={typography.h3}>{feature.title}</Text>
                <Text style={[typography.small, styles.featureTagline]}>{feature.tagline}</Text>
              </View>
            </Card>
          ))}
        </View>
      </View>

      {/* ------------------------------ Pour qui -------------------------- */}
      <View style={styles.section}>
        <Text style={typography.caption}>{audienceSection.eyebrow}</Text>
        <Text style={[typography.h1, styles.sectionTitleTight]}>{audienceSection.title}</Text>
        <Text style={[typography.body, styles.sectionIntro]}>{audienceSection.body}</Text>

        <View style={styles.chips}>
          {audiences.map((audience) => (
            <View key={audience} style={styles.chip}>
              <Text style={styles.chipText}>{audience}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ------------------------ Questions fréquentes -------------------- */}
      <View style={styles.section}>
        <Text style={typography.caption}>{faqSection.eyebrow}</Text>
        <Text style={[typography.h1, styles.sectionTitle]}>{faqSection.title}</Text>

        <View style={styles.faqList}>
          {faqs.map((faq) => (
            <FaqItem key={faq.question} question={faq.question} answer={faq.answer} />
          ))}
        </View>
      </View>

      {/* --------------------------- Dernier appel ------------------------ */}
      <View style={styles.finalCta}>
        <Text style={[typography.h2, styles.finalCtaTitle]}>{finalCta.title}</Text>
        <Text style={[typography.body, styles.finalCtaBody]}>{finalCta.body}</Text>
        <Button label={finalCta.cta} onPress={onRegister} variant="light" />
      </View>

      {/* ------------------------------ Footer ---------------------------- */}
      <View style={styles.footer}>
        <Text style={[typography.bodyStrong, styles.footerTagline]}>{footer.tagline}</Text>
        <View style={styles.footerLinks}>
          <Text style={typography.small}>
            {footer.contactLabel} · {footer.contactValue}
          </Text>
          <Text style={typography.small}>{footer.legalLabel}</Text>
        </View>
        <Text style={[typography.small, styles.footerCopyright]}>{footer.copyright}</Text>

        <Pressable onPress={onAdminAccess} hitSlop={10} style={styles.adminLink}>
          <Text style={styles.adminLinkText}>{footer.adminLabel}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: screenPadding,
  },

  // --- En-tête ---
  header: {
    alignItems: 'flex-start',
    marginBottom: spacing.xxl,
  },
  logo: {
    width: 150,
    height: 49,
  },

  // --- Hero ---
  hero: {
    alignItems: 'center',
  },
  heroPhoto: {
    borderRadius: radius.xxl,
    overflow: 'hidden',
    backgroundColor: colors.backgroundAlt,
    ...shadows.large,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  /* Pastille blanche à cheval sur le bas de la photo. */
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: '100%',
    marginTop: -18,
    paddingVertical: 9,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    ...shadows.medium,
  },
  heroBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  heroBadgeText: {
    ...typography.small,
    fontSize: 12,
    color: colors.textPrimary,
  },
  heroTitle: {
    ...typography.display,
    textAlign: 'center',
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  heroSubtitle: {
    ...typography.body,
    textAlign: 'center',
  },

  // --- Appels à l'action ---
  ctaGroup: {
    gap: spacing.md,
    marginTop: spacing.xxl,
  },

  // --- Bandeau d'accroche ---
  punchline: {
    marginTop: spacing.xxxl,
    padding: spacing.xxl,
    borderRadius: radius.xl,
    backgroundColor: colors.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(230, 57, 70, 0.16)',
  },
  punchlineTitle: {
    ...typography.h2,
    color: colors.primaryDarker,
    marginBottom: spacing.sm,
  },
  punchlineBody: {
    ...typography.body,
    color: colors.textPrimary,
  },

  // --- Sections ---
  section: {
    marginTop: spacing.huge,
  },
  sectionTitle: {
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },
  /* Variante quand un paragraphe d'introduction suit le titre. */
  sectionTitleTight: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionIntro: {
    marginBottom: spacing.xxl,
  },

  // --- Pour qui ---
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  chipText: {
    ...typography.bodyStrong,
    fontSize: 14,
  },

  // --- Questions fréquentes ---
  faqList: {
    gap: spacing.sm,
  },

  // --- Étapes ---
  stepList: {
    gap: spacing.xl,
  },
  stepRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  stepRail: {
    alignItems: 'center',
  },
  stepConnector: {
    flex: 1,
    width: 2,
    marginTop: spacing.md,
    marginBottom: -spacing.xl,
    borderRadius: 1,
    backgroundColor: colors.border,
  },
  stepBody: {
    flex: 1,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  stepTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    ...typography.button,
    fontSize: 12,
    lineHeight: 16,
    color: '#FFFFFF',
  },
  stepTitle: {
    flex: 1,
  },

  // --- Fonctionnalités ---
  featureList: {
    gap: spacing.md,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.lg,
  },
  featureText: {
    flex: 1,
  },
  featureTagline: {
    marginTop: 2,
  },

  // --- Dernier appel ---
  finalCta: {
    marginTop: spacing.huge,
    padding: spacing.xxl,
    borderRadius: radius.xxl,
    backgroundColor: colors.primary,
    ...shadows.medium,
  },
  finalCtaTitle: {
    color: '#FFFFFF',
  },
  finalCtaBody: {
    color: 'rgba(255, 255, 255, 0.88)',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },

  // --- Footer ---
  footer: {
    marginTop: spacing.huge,
    paddingTop: spacing.xxl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
    alignItems: 'center',
    gap: spacing.sm,
  },
  footerTagline: {
    textAlign: 'center',
  },
  footerLinks: {
    alignItems: 'center',
    gap: 2,
  },
  footerCopyright: {
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  /* Réservé à l'éditeur : présent mais sans mise en avant. */
  adminLink: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  adminLinkText: {
    ...typography.small,
    fontSize: 12,
    color: colors.textTertiary,
    textDecorationLine: 'underline',
  },
});
