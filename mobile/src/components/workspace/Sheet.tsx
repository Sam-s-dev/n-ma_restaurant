import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../Icon';
import { Banner } from '../Banner';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { maxContentWidth, radius, shadows, spacing } from '../../theme/layout';

interface SheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  /** Message d'erreur affiché en tête du formulaire. */
  error?: string | null;
  onClose: () => void;
  children: React.ReactNode;
  /** Boutons collés en bas, hors zone de défilement. */
  actions?: React.ReactNode;
}

/**
 * Feuille modale montante : le format attendu pour un formulaire court sur
 * téléphone. Le contenu défile, les boutons restent visibles en bas — sans
 * cela, « Enregistrer » disparaît sous le clavier.
 *
 * Sur navigateur la feuille est centrée et bornée en largeur, faute de quoi
 * elle s'étirerait sur toute la fenêtre.
 */
export function Sheet({
  visible,
  title,
  subtitle,
  error,
  onClose,
  children,
  actions,
}: SheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Fermer"
          accessibilityRole="button"
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.wrapper}
        >
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <View style={styles.grabber} />

            <View style={styles.header}>
              <View style={styles.headerTexts}>
                <Text style={[typography.h2, styles.title]}>{title}</Text>
                {Boolean(subtitle) && <Text style={styles.subtitle}>{subtitle}</Text>}
              </View>

              <Pressable onPress={onClose} hitSlop={12} style={styles.close}>
                <Icon name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {Boolean(error) && <Banner tone="danger" message={error ?? ''} />}
              {children}
            </ScrollView>

            {Boolean(actions) && <View style={styles.actions}>{actions}</View>}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(12, 8, 6, 0.5)',
  },
  wrapper: {
    width: '100%',
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: maxContentWidth,
    maxHeight: '88%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.md,
    ...shadows.large,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  headerTexts: {
    flex: 1,
  },
  title: {
    fontSize: 19,
    lineHeight: 25,
  },
  subtitle: {
    ...typography.small,
    color: colors.textTertiary,
    marginTop: 2,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.backgroundAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingBottom: spacing.md,
  },
  actions: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
