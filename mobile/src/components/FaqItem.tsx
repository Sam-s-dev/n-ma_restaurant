import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radius, spacing } from '../theme/layout';

interface FaqItemProps {
  question: string;
  answer: string;
}

/** Question dépliable. Fermée par défaut pour garder la section compacte. */
export function FaqItem({ question, answer }: FaqItemProps) {
  const [open, setOpen] = useState(false);

  return (
    <View style={[styles.container, open && styles.containerOpen]}>
      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={question}
        style={styles.header}
      >
        <Text style={[typography.bodyStrong, styles.question]}>{question}</Text>
        <View style={[styles.chevron, open && styles.chevronOpen]}>
          <Text style={[styles.chevronGlyph, open && styles.chevronGlyphOpen]}>
            {open ? '−' : '+'}
          </Text>
        </View>
      </Pressable>

      {open && <Text style={[typography.small, styles.answer]}>{answer}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  containerOpen: {
    borderColor: 'rgba(230, 57, 70, 0.28)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  question: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
  },
  chevron: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundAlt,
  },
  chevronOpen: {
    backgroundColor: colors.primary,
  },
  chevronGlyph: {
    ...typography.button,
    fontSize: 17,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  chevronGlyphOpen: {
    color: colors.textOnPrimary,
  },
  answer: {
    marginTop: spacing.md,
    paddingRight: spacing.xxxl,
  },
});
