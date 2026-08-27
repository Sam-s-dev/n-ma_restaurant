import { useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Icon } from '../Icon';
import { ApiError, mediaUrl, THUMB } from '../../api/client';
import { uploadImage } from '../../api/media';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, spacing } from '../../theme/layout';

interface PhotoFieldProps {
  label: string;
  hint?: string;
  /** Identifiant du média déjà enregistré, ou null. */
  mediaId: string | null;
  onChange: (mediaId: string | null) => void;
  /** Aperçu rond, pour un logo ; rectangulaire par défaut. */
  round?: boolean;
}

/**
 * Photo d'un plat ou logo du restaurant.
 *
 * L'image part vers le serveur dès qu'elle est choisie : la fiche ne
 * conserve que l'identifiant renvoyé. Envoyer au moment d'enregistrer
 * ferait attendre le gérant sur le bouton « Enregistrer » sans qu'il
 * comprenne pourquoi, et un échec réseau lui ferait perdre sa saisie.
 *
 * Les images sont compressées et recadrées avant l'envoi : une photo de
 * téléphone brute pèse plusieurs mégaoctets, au-delà de ce que le serveur
 * accepte, et coûterait cher en connexion mobile.
 */
export function PhotoField({ label, hint, mediaId, onChange, round = false }: PhotoFieldProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = mediaUrl(mediaId, THUMB.medium);

  async function pick(source: 'library' | 'camera') {
    setError(null);

    try {
      const granted = await requestPermission(source);
      if (!granted) {
        setError(
          source === 'camera'
            ? 'Autorisez l’accès à l’appareil photo dans les réglages du téléphone.'
            : 'Autorisez l’accès aux photos dans les réglages du téléphone.',
        );
        return;
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: round ? [1, 1] : [4, 3],
        // 0,6 suffit pour une vignette de menu et divise le poids par cinq.
        quality: 0.6,
      };

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);

      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;

      setBusy(true);
      const reduced = await downscale(asset.uri, asset.width);
      const uploaded = await uploadImage(reduced ?? asset.uri, {
        mimeType: reduced ? 'image/jpeg' : asset.mimeType,
        fileName: reduced ? 'photo.jpg' : asset.fileName,
      });
      onChange(uploaded.id);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Image indisponible. Réessayez.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>

      <View style={styles.row}>
        <View style={[styles.preview, round && styles.previewRound]}>
          {preview ? (
            <Image
              source={{ uri: preview }}
              style={[styles.image, round && styles.previewRound]}
              resizeMode="cover"
            />
          ) : (
            <Icon name="bag" size={22} color={colors.textTertiary} strokeWidth={1.7} />
          )}

          {busy && (
            <View style={[styles.busy, round && styles.previewRound]}>
              <ActivityIndicator color={colors.textOnPrimary} size="small" />
            </View>
          )}
        </View>

        <View style={styles.buttons}>
          <Pressable
            style={styles.button}
            onPress={() => void pick('camera')}
            disabled={busy}
            accessibilityRole="button"
          >
            <Icon name="bag" size={15} color={colors.primary} strokeWidth={2.1} />
            <Text style={styles.buttonText}>Prendre en photo</Text>
          </Pressable>

          <Pressable
            style={styles.button}
            onPress={() => void pick('library')}
            disabled={busy}
            accessibilityRole="button"
          >
            <Icon name="grid" size={15} color={colors.primary} strokeWidth={2.1} />
            <Text style={styles.buttonText}>Choisir une image</Text>
          </Pressable>

          {Boolean(mediaId) && (
            <Pressable
              onPress={() => {
                setError(null);
                onChange(null);
              }}
              disabled={busy}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={styles.remove}>Retirer la photo</Text>
            </Pressable>
          )}
        </View>
      </View>

      {Boolean(error) && <Text style={styles.error}>{error}</Text>}
      {!error && Boolean(hint) && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

/**
 * Largeur maximale conservée à l'envoi.
 *
 * Un téléphone récent produit des images de 3 000 à 4 000 points de large,
 * soit plusieurs mégaoctets. Rien dans l'application n'affiche une photo
 * au-delà de la largeur de l'écran : 1 600 points laissent de la marge pour
 * un futur agrandissement tout en divisant le poids par cinq ou six.
 *
 * L'enjeu n'est pas que l'affichage — le serveur fabrique déjà ses propres
 * vignettes — mais l'envoi lui-même, qui se fait depuis un téléphone en
 * réseau mobile, et le stockage : la base conserve l'original.
 */
const MAX_UPLOAD_WIDTH = 1600;

/**
 * Réduit l'image avant l'envoi, et renvoie `null` si ce n'est pas
 * nécessaire ou pas possible — l'original part alors tel quel, comme avant.
 * Un échec de compression ne doit jamais empêcher d'ajouter une photo.
 */
async function downscale(uri: string, width: number | undefined): Promise<string | null> {
  if (width !== undefined && width <= MAX_UPLOAD_WIDTH) return null;

  try {
    const context = ImageManipulator.manipulate(uri);
    context.resize({ width: MAX_UPLOAD_WIDTH });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.75 });
    return saved.uri;
  } catch {
    return null;
  }
}

/**
 * Sur navigateur, le sélecteur ouvre un champ fichier : aucune permission
 * système n'est demandée, et l'appel renverrait un refus trompeur.
 */
async function requestPermission(source: 'library' | 'camera'): Promise<boolean> {
  if (Platform.OS === 'web') return true;

  const response =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  return response.granted;
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.bodyStrong,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  preview: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewRound: {
    borderRadius: 44,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  busy: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12, 8, 6, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttons: {
    flex: 1,
    gap: spacing.sm,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  buttonText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    lineHeight: 17,
    color: colors.primary,
  },
  remove: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  error: {
    ...typography.small,
    fontSize: 12,
    color: colors.danger,
    marginTop: 6,
  },
  hint: {
    ...typography.small,
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 6,
  },
});
