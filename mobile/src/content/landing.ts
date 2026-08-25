import { colors } from '../theme/colors';
import type { AnimationName } from '../components/LottieIcon';

/**
 * Tous les textes de la page d'accueil sont regroupés ici : les accroches
 * peuvent être retouchées sans ouvrir un seul composant.
 */

export const brand = {
  name: "N'ma Restaurant",
  /** Affiché sous le logo, en petites capitales. */
  eyebrow: 'Gestion de restaurant',
} as const;

export const hero = {
  // Volontairement court : la pastille chevauche la photo et doit rester
  // plus étroite qu'elle.
  badge: 'Pensé pour le service',
  title: 'Votre restaurant,\nenfin sous contrôle',
  subtitle:
    'Le menu, le stock, la caisse et l’équipe réunis dans une seule application. Vous cuisinez, N’ma compte.',
  primaryCta: 'Créer mon compte restaurant',
  secondaryCta: 'J’ai déjà un compte',
} as const;

/** Bandeau d'accroche posé sous le hero. */
export const punchline = {
  title: 'Fini le cahier de caisse',
  body:
    'Plus de calculs de fin de soirée, plus d’ardoises oubliées. Chaque vente est comptée, chaque franc est suivi.',
} as const;

export interface Step {
  readonly number: string;
  readonly title: string;
  readonly body: string;
  readonly animation: AnimationName;
  readonly tint: string;
  readonly background: string;
}

export const stepsSection = {
  eyebrow: 'Comment ça marche',
  title: 'Trois étapes, et vous êtes prêt',
} as const;

export const steps: readonly Step[] = [
  {
    number: '1',
    title: 'Inscrivez votre restaurant',
    body: 'Nom, adresse, contact. Deux minutes suffisent, le logo pourra venir plus tard.',
    animation: 'signup',
    tint: colors.iconRed,
    background: colors.pastelRed,
  },
  {
    number: '2',
    title: 'Notre équipe valide votre compte',
    body: 'Nous vérifions votre établissement, puis nous activons votre accès.',
    animation: 'validation',
    tint: colors.iconGreen,
    background: colors.pastelGreen,
  },
  {
    number: '3',
    title: 'Gérez tout depuis votre espace',
    body: 'Plats, stock, caisse, personnel : tout est en place dès le premier service.',
    animation: 'dashboard',
    tint: colors.iconBlue,
    background: colors.pastelBlue,
  },
] as const;

export interface FlowStep {
  readonly label: string;
  readonly title: string;
  readonly caption: string;
}

export const flowSection = {
  eyebrow: 'Le déroulé d’un service',
  title: 'De la commande à la caisse',
  intro:
    'Ce qui se passe en salle, et ce que N’ma enregistre à chaque étape.',
} as const;

export const flowSteps: readonly FlowStep[] = [
  {
    label: 'Commande',
    title: 'Le client commande',
    caption:
      'Vous composez la commande depuis votre carte, plat par plat. Le total se calcule tout seul, sans calculatrice.',
  },
  {
    label: 'Cuisine',
    title: 'La commande part en cuisine',
    caption:
      'L’équipe sait ce qu’il y a à préparer. Plus de bout de papier qui se perd entre la salle et le fourneau.',
  },
  {
    label: 'Service',
    title: 'Le plat est servi',
    caption:
      'La commande reste ouverte tant que le client est à table : vous pouvez y ajouter une boisson ou un dessert.',
  },
  {
    label: 'Encaissement',
    title: 'Le client règle',
    caption:
      'Espèces, mobile money, carte — ou à crédit s’il paiera plus tard. La caisse se met à jour à la seconde.',
  },
];

export const audienceSection = {
  eyebrow: 'Pour qui',
  title: 'Fait pour les établissements d’ici',
  body:
    'Que vous serviez vingt couverts ou deux cents, la logique reste la même : ce qui rentre, ce qui sort, ce qu’on vous doit.',
} as const;

export const audiences: readonly string[] = [
  'Restaurant',
  'Maquis',
  'Fast-food',
  'Bar & lounge',
  'Cafétéria',
  'Traiteur',
];

export interface Faq {
  readonly question: string;
  readonly answer: string;
}

export const faqSection = {
  eyebrow: 'Questions fréquentes',
  title: 'Ce qu’on nous demande le plus',
} as const;

export const faqs: readonly Faq[] = [
  {
    question: 'Combien de temps avant que mon compte soit actif ?',
    answer:
      'Chaque demande est vérifiée à la main par notre équipe. Vous recevrez l’accès dès la validation ; d’ici là, la connexion reste fermée.',
  },
  {
    question: 'Puis-je donner un accès à quelqu’un d’autre ?',
    answer:
      'Oui. Depuis votre espace, vous invitez qui vous voulez — un associé, un gérant. Chaque personne invitée a exactement les mêmes droits que vous.',
  },
  {
    question: 'Comment sont suivies les ardoises ?',
    answer:
      'Une vente à crédit n’alimente pas la caisse : elle ouvre une créance au nom du client. Vous voyez à tout moment qui doit combien, et chaque remboursement, même partiel, alimente la caisse.',
  },
  {
    question: 'Les autres restaurants voient-ils mes chiffres ?',
    answer:
      'Non, jamais. Chaque restaurant a son espace complètement séparé. Le cloisonnement est verrouillé au niveau de la base de données, pas seulement dans l’application.',
  },
  {
    question: 'Et si je me trompe en saisissant une vente ?',
    answer:
      'Vous l’annulez. L’application écrit un mouvement inverse au lieu d’effacer : votre historique reste complet et votre caisse redevient juste.',
  },
];

export interface Feature {
  readonly title: string;
  readonly tagline: string;
  readonly animation: AnimationName;
  readonly tint: string;
  readonly background: string;
}

export const featuresSection = {
  eyebrow: 'Fonctionnalités',
  title: 'Tout ce qu’il faut pour tenir la maison',
} as const;

export const features: readonly Feature[] = [
  {
    title: 'Caisse en temps réel',
    tagline: 'Votre solde à la seconde près.',
    animation: 'cash',
    tint: colors.iconGreen,
    background: colors.pastelGreen,
  },
  {
    title: 'Gestion du stock',
    tagline: 'Ne tombez plus jamais à court.',
    animation: 'stock',
    tint: colors.iconAmber,
    background: colors.pastelAmber,
  },
  {
    title: 'Menu & plats',
    tagline: 'Votre carte, toujours à jour.',
    animation: 'menu',
    tint: colors.iconRed,
    background: colors.pastelRed,
  },
  {
    title: 'Ventes à crédit',
    tagline: 'Qui vous doit quoi, en un coup d’œil.',
    animation: 'credit',
    tint: colors.iconPurple,
    background: colors.pastelPurple,
  },
  {
    title: 'Gestion du personnel',
    tagline: 'Présences et salaires, sans paperasse.',
    animation: 'staff',
    tint: colors.iconBlue,
    background: colors.pastelBlue,
  },
] as const;

export const finalCta = {
  title: 'Prêt à ouvrir votre espace ?',
  body: 'La création du compte est gratuite. Vous serez guidé pas à pas.',
  cta: 'Créer mon compte restaurant',
} as const;

export const footer = {
  tagline: 'Chaque vente comptée. Chaque franc suivi.',
  phoneLabel: 'Téléphone',
  /** Les deux numéros de l'équipe, appelables d'un toucher. */
  phones: ['610935524', '627171397'],
  emailLabel: 'E-mail',
  email: 'trillionnx@gmail.com',
  legalLabel: 'Mentions légales',
  copyright: `© ${new Date().getFullYear()} N’ma Restaurant`,
} as const;
