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
import type { BannerTone } from '../components/Banner';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { ApiError } from '../api/client';
import { login } from '../api/auth';
import type { LoginResponse } from '../api/auth';
import { login as adminLogin } from '../api/superadmin';
import type { AdminLoginResponse } from '../api/superadmin';
import { saveSession } from '../api/session';
import { saveAdminSession } from '../api/adminSession';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { screenPadding, spacing } from '../theme/layout';

interface LoginScreenProps {
  onSuccess: (session: LoginResponse) => void;
  /** Le même formulaire ouvre aussi la console de l'éditeur. */
  onAdminSuccess: (session: AdminLoginResponse) => void;
  onBack: () => void;
  onGoToRegister: () => void;
}

interface StatusMessage {
  tone: BannerTone;
  title: string;
  message: string;
}

/**
 * Traduit le refus du backend en message compréhensible.
 *
 * Le backend renvoie 403 pour un compte en attente comme pour un compte
 * désactivé ; on distingue les deux cas sur le contenu du message, afin
 * d'afficher l'explication exacte prévue par la spécification.
 */
function statusFromError(error: ApiError): StatusMessage {
  if (error.code === 'FORBIDDEN') {
    const text = error.message.toLowerCase();

    if (text.includes('attente')) {
      return {
        tone: 'warning',
        title: 'Compte en attente de validation',
        message:
          'Votre compte est en attente de validation. Vous pourrez vous connecter dès qu’il sera activé.',
      };
    }

    if (text.includes('suspendu') || text.includes('désactiv') || text.includes('desactiv')) {
      return {
        tone: 'danger',
        title: 'Compte désactivé',
        message: 'Votre compte a été désactivé. Contactez le support pour plus d’informations.',
      };
    }

    // Autre refus (compte utilisateur désactivé par son propre gérant) :
    // on relaie le message du serveur plutôt que d'inventer une explication.
    return { tone: 'danger', title: 'Accès refusé', message: error.message };
  }

  if (error.code === 'UNAUTHORIZED') {
    return {
      tone: 'danger',
      title: 'Identifiants incorrects',
      message: 'E-mail ou mot de passe incorrect. Vérifiez votre saisie et réessayez.',
    };
  }

  if (error.code === 'TOO_MANY_REQUESTS') {
    return { tone: 'warning', title: 'Trop de tentatives', message: error.message };
  }

  if (error.code === 'NETWORK') {
    return { tone: 'danger', title: 'Connexion impossible', message: error.message };
  }

  return { tone: 'danger', title: 'Erreur', message: error.message };
}

export function LoginScreen({
  onSuccess,
  onAdminSuccess,
  onBack,
  onGoToRegister,
}: LoginScreenProps) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setStatus(null);

    const nextErrors: { email?: string; password?: string } = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      nextErrors.email = 'Adresse e-mail invalide.';
    }
    if (password.length === 0) {
      nextErrors.password = 'Saisissez votre mot de passe.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const normalizedEmail = email.trim().toLowerCase();
    setSubmitting(true);
    try {
      // Cas courant : un gérant de restaurant.
      const session = await login(normalizedEmail, password);
      await saveSession(session);
      onSuccess(session);
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setStatus({
          tone: 'danger',
          title: 'Erreur',
          message: 'Une erreur inattendue est survenue.',
        });
        setSubmitting(false);
        return;
      }

      // Un 401 signifie « inconnu parmi les gérants » : l'adresse peut être
      // celle de l'éditeur de la plateforme. Un 403 (compte en attente ou
      // suspendu) est en revanche un vrai refus, il ne faut pas le masquer.
      if (error.code === 'UNAUTHORIZED') {
        try {
          const adminSession = await adminLogin(normalizedEmail, password);
          await saveAdminSession(adminSession);
          onAdminSuccess(adminSession);
          return;
        } catch (adminError) {
          // Si la seconde tentative échoue pour une autre raison que des
          // identifiants inconnus — limite de tentatives atteinte, serveur
          // injoignable — c'est cette raison qu'il faut montrer. Afficher
          // « mot de passe incorrect » enverrait l'éditeur vérifier une
          // saisie pourtant juste.
          if (adminError instanceof ApiError && adminError.code !== 'UNAUTHORIZED') {
            setStatus(statusFromError(adminError));
            return;
          }
          // Ni gérant ni éditeur : on retombe sur le message d'origine, qui
          // ne révèle pas si l'adresse existe.
        }
      }

      setStatus(statusFromError(error));
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

        {/* Pas de logo ici : vous l'avez réservé à la page d'accueil. */}
        <Text style={[typography.h1, styles.title]}>Content de vous revoir</Text>
        <Text style={[typography.body, styles.intro]}>
          Connectez-vous pour retrouver votre espace.
        </Text>

        {status && <Banner tone={status.tone} title={status.title} message={status.message} />}

        <TextField
          label="Adresse e-mail"
          placeholder="mariama@exemple.com"
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

        <View style={styles.separator}>
          <View style={styles.separatorLine} />
          <Text style={styles.separatorText}>Nouveau sur N’ma ?</Text>
          <View style={styles.separatorLine} />
        </View>

        <Button
          label="Inscrire mon restaurant"
          onPress={onGoToRegister}
          variant="secondary"
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
    marginBottom: spacing.xl,
  },
  backText: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
  },
  title: {
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
  intro: {
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },
  submit: {
    marginTop: spacing.md,
  },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.xxl,
  },
  separatorLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderStrong,
  },
  separatorText: {
    ...typography.small,
    color: colors.textTertiary,
  },
});
