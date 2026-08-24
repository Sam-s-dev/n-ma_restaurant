import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { ApiError } from '../api/client';
import { register } from '../api/auth';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { screenPadding, spacing } from '../theme/layout';

interface RegisterScreenProps {
  onSuccess: (message: string) => void;
  onBack: () => void;
  onGoToLogin: () => void;
}

interface FormState {
  restaurantName: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  password: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const EMPTY: FormState = {
  restaurantName: '',
  fullName: '',
  email: '',
  phone: '',
  address: '',
  password: '',
};

export function RegisterScreen({ onSuccess, onBack, onGoToLogin }: RegisterScreenProps) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (key: keyof FormState) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // L'erreur disparaît dès que l'utilisateur corrige le champ.
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  /** Validation locale : évite un aller-retour réseau pour un champ vide. */
  function validate(): boolean {
    const next: FormErrors = {};

    if (form.restaurantName.trim().length < 2) {
      next.restaurantName = 'Indiquez le nom de votre restaurant.';
    }
    if (form.fullName.trim().length < 2) {
      next.fullName = 'Indiquez votre nom complet.';
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
      next.email = 'Adresse e-mail invalide.';
    }
    if (form.phone.trim() && !/^[0-9+\s().-]{4,30}$/.test(form.phone.trim())) {
      next.phone = 'Numéro de téléphone invalide.';
    }
    if (form.password.length < 8) {
      next.password = 'Au moins 8 caractères.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    setFormError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const result = await register({
        restaurantName: form.restaurantName.trim(),
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        ...(form.address.trim() ? { address: form.address.trim() } : {}),
      });
      onSuccess(result.message);
    } catch (error) {
      if (error instanceof ApiError) {
        // Le backend renvoie les champs fautifs : on les replace sous les
        // bons libellés au lieu d'afficher un message global.
        if (error.fields.length > 0) {
          const mapped: FormErrors = {};
          for (const key of Object.keys(EMPTY) as Array<keyof FormState>) {
            const message = error.fieldError(key);
            if (message) mapped[key] = message;
          }
          setErrors(mapped);
          setFormError(
            Object.keys(mapped).length > 0
              ? 'Certains champs doivent être corrigés.'
              : error.message,
          );
        } else if (error.code === 'CONFLICT') {
          setErrors({ email: 'Cette adresse e-mail est déjà utilisée.' });
          setFormError(null);
        } else {
          setFormError(error.message);
        }
      } else {
        setFormError('Une erreur inattendue est survenue. Réessayez.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.huge },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={onBack} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>← Retour</Text>
        </Pressable>

        <Text style={typography.h1}>Créer votre espace</Text>
        <Text style={[typography.body, styles.intro]}>
          Quelques informations suffisent. Le logo et les autres réglages
          s’ajouteront plus tard, dans vos paramètres.
        </Text>

        {Boolean(formError) && <Banner tone="danger" message={formError as string} />}

        <Text style={[typography.caption, styles.groupLabel]}>Votre restaurant</Text>
        <TextField
          label="Nom du restaurant"
          placeholder="Chez Mariama"
          value={form.restaurantName}
          onChangeText={update('restaurantName')}
          error={errors.restaurantName}
          autoCapitalize="words"
          returnKeyType="next"
        />
        <TextField
          label="Adresse"
          placeholder="Quartier Almamya, Conakry"
          value={form.address}
          onChangeText={update('address')}
          error={errors.address}
          autoCapitalize="sentences"
          returnKeyType="next"
        />

        <Text style={[typography.caption, styles.groupLabel]}>Vous, le gérant</Text>
        <TextField
          label="Nom complet"
          placeholder="Mariama Diallo"
          value={form.fullName}
          onChangeText={update('fullName')}
          error={errors.fullName}
          autoCapitalize="words"
          returnKeyType="next"
        />
        <TextField
          label="Téléphone"
          placeholder="+224 622 00 00 00"
          value={form.phone}
          onChangeText={update('phone')}
          error={errors.phone}
          keyboardType="phone-pad"
          returnKeyType="next"
        />
        <TextField
          label="Adresse e-mail"
          placeholder="mariama@exemple.com"
          value={form.email}
          onChangeText={update('email')}
          error={errors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          returnKeyType="next"
        />
        <TextField
          label="Mot de passe"
          placeholder="8 caractères minimum"
          value={form.password}
          onChangeText={update('password')}
          error={errors.password}
          hint="Choisissez un mot de passe que vous seul connaissez."
          secureTextEntry
          revealable
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={submit}
        />

        <Button
          label="Créer mon compte"
          onPress={submit}
          loading={submitting}
          style={styles.submit}
        />

        <Pressable onPress={onGoToLogin} hitSlop={8} style={styles.loginLink}>
          <Text style={typography.small}>
            Vous avez déjà un compte ? <Text style={styles.loginLinkStrong}>Se connecter</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
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
  back: {
    alignSelf: 'flex-start',
    marginBottom: spacing.xl,
  },
  backText: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
  },
  intro: {
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },
  groupLabel: {
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  submit: {
    marginTop: spacing.md,
  },
  loginLink: {
    alignSelf: 'center',
    marginTop: spacing.xl,
  },
  loginLinkStrong: {
    color: colors.primary,
  },
});
