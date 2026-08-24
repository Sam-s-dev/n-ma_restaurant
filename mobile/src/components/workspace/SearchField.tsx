import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { TextStyle } from 'react-native';
import { Icon } from '../Icon';
import { colors } from '../../theme/colors';
import { fontFamily } from '../../theme/typography';
import { radius, spacing } from '../../theme/layout';

const noBrowserOutline =
  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : null;

interface SearchFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
}

/** Barre de recherche des listes (menu, stock, employés, clients). */
export function SearchField({ value, onChangeText, placeholder = 'Rechercher…' }: SearchFieldProps) {
  return (
    <View style={styles.field}>
      <Icon name="search" size={17} color={colors.textTertiary} />
      <TextInput
        style={[styles.input, noBrowserOutline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <Pressable
          onPress={() => onChangeText('')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Effacer la recherche"
        >
          <Icon name="close" size={16} color={colors.textTertiary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 46,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: 0,
  },
});
