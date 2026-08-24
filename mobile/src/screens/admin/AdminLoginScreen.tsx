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
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { ApiError } from '../../api/client';
import { login } from '../../api/superadmin';
import type { AdminLoginResponse } from '../../api/superadmin';
import { saveAdminSession } from '../../api/adminSession';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { radius, screenPadding, spacing } from '../../theme/layout';

interface AdminLoginScreenProps {
  onSuccess: (session: AdminLoginResponse) => void;
  onBack: () => void;
}

/** Connexion à l'espace de l'éditeur de la plateforme (§2.a). */
export function AdminLoginScreen({ onSuccess, onBack }: AdminLoginScreenProps) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setFormError(null);

    const next: { email?: string; password?: string } = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) next.email = 'Adresse e-mail invalide.';
    if (password.length === 0) next.password = 'Saisissez votre mot de passe.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      const session = await login(email.trim().toLowerCase(), password);
      await saveAdminSession(session);
      onSuccess(session);
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(
          error.code === 'UNAUTHORIZED'
            ? 'E-mail ou mot de passe incorrect.'
            : error.message,
        );
      } else {
        setFormError('Une erreur inattendue est survenue.');
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

        <View style={styles.crest}>
          <Text style={styles.crestText}>N</Text>
        </View>

        <Text style={[typography.caption, styles.eyebrow]}>Espace administrateur</Text>
        <Text style={[typography.h1, styles.title]}>Console N’ma</Text>
        <Text style={[typography.body, styles.intro]}>
          Réservé à l’éditeur de la plateforme. C’est ici que les comptes des
          restaurants sont activés ou suspendus.
        </Text>

        {Boolean(formError) && <Banner tone="danger" message={formError as string} />}

        <TextField
          label="Adresse e-mail"
          placeholder="admin@exemple.com"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
          }}
          error={errors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          returnKeyType="next"
        />
        <TextField
          label="Mot de passe"
          placeholder="Votre mot de passe"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
          }}
          error={errors.password}
          secureTextEntry
          revealable
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={submit}
        />

        <Button
          label="Se connecter"
          onPress={submit}
          loading={submitting}
          style={styles.submit}
        />
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
    marginBottom: spacing.xxl,
  },
  backText: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
  },
  /* Marque sobre : le logo N'ma est réservé à la page d'accueil publique. */
  crest: {
    width: 60,
    height: 60,
    borderRadius: radius.lg,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.xl,
  },
  crestText: {
    ...typography.h1,
    color: '#FFFFFF',
  },
  eyebrow: {
    textAlign: 'center',
  },
  title: {
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  intro: {
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },
  submit: {
    marginTop: spacing.md,
  },
});
