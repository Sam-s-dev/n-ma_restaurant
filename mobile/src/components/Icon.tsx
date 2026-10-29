import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
import { colors } from '../theme/colors';

/**
 * Jeu d'icônes tracées à la main plutôt qu'une bibliothèque d'icônes.
 *
 * Deux raisons : aucune dépendance supplémentaire à embarquer, et un trait
 * homogène (2 px, bouts arrondis) sur toutes les plateformes — les polices
 * d'icônes rendent différemment sur navigateur et sur téléphone.
 *
 * Grille 24 × 24, comme les jeux d'icônes usuels.
 */
export type IconName =
  | 'home'
  | 'bag'
  | 'wallet'
  | 'menu-book'
  | 'grid'
  | 'box'
  | 'receipt'
  | 'users'
  | 'settings'
  | 'credit'
  | 'chevron-right'
  | 'chevron-left'
  | 'chevron-down'
  | 'search'
  | 'close'
  | 'check'
  | 'trash'
  | 'edit'
  | 'plus'
  | 'minus'
  | 'alert'
  | 'logout'
  | 'calendar'
  | 'phone'
  | 'trending-up'
  | 'trending-down'
  | 'clock'
  | 'refresh'
  | 'user'
  | 'pie'
  | 'bar-chart'
  | 'arrow-up'
  | 'arrow-down'
  | 'filter'
  | 'ticket'
  | 'map-pin'
  | 'lock'
  | 'send'
  | 'bell'
  | 'cart'
  | 'truck'
  | 'globe'
  | 'flame'
  | 'more';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  /** Épaissit le trait pour les icônes affichées en grand. */
  strokeWidth?: number;
}

export function Icon({
  name,
  size = 22,
  color = colors.textPrimary,
  strokeWidth = 2,
}: IconProps) {
  const stroke: StrokeProps = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fill: 'none',
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {renderPaths(name, stroke, color)}
    </Svg>
  );
}

type StrokeProps = {
  stroke: string;
  strokeWidth: number;
  strokeLinecap: 'round';
  strokeLinejoin: 'round';
  fill: 'none';
};

function renderPaths(name: IconName, s: StrokeProps, color: string) {
  switch (name) {
    case 'home':
      return (
        <>
          <Path d="M3 9.5 12 3l9 6.5V20a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 20z" {...s} />
          <Path d="M9.5 21.5v-7h5v7" {...s} />
        </>
      );

    case 'bag':
      return (
        <>
          <Path d="M6 2.5 3.5 6.5V20a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5V6.5L18 2.5z" {...s} />
          <Line x1="3.5" y1="6.5" x2="20.5" y2="6.5" {...s} />
          <Path d="M16 10a4 4 0 0 1-8 0" {...s} />
        </>
      );

    case 'wallet':
      return (
        <>
          <Path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v1" {...s} />
          <Path d="M3 7.5V18a2.5 2.5 0 0 0 2.5 2.5H19a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H5.5" {...s} />
          <Circle cx="16.5" cy="14" r="1.2" fill={color} stroke="none" />
        </>
      );

    case 'menu-book':
      return (
        <>
          <Path d="M2.5 4h5.5a3.5 3.5 0 0 1 3.5 3.5v13a2.75 2.75 0 0 0-2.75-2.75H2.5z" {...s} />
          <Path d="M21.5 4H16a3.5 3.5 0 0 0-3.5 3.5v13a2.75 2.75 0 0 1 2.75-2.75h6.25z" {...s} />
        </>
      );

    case 'grid':
      return (
        <>
          <Rect x="3" y="3" width="7.5" height="7.5" rx="2" {...s} />
          <Rect x="13.5" y="3" width="7.5" height="7.5" rx="2" {...s} />
          <Rect x="3" y="13.5" width="7.5" height="7.5" rx="2" {...s} />
          <Rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" {...s} />
        </>
      );

    case 'box':
      return (
        <>
          <Path
            d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
            {...s}
          />
          <Polyline points="3.3 7 12 12 20.7 7" {...s} />
          <Line x1="12" y1="22" x2="12" y2="12" {...s} />
        </>
      );

    case 'receipt':
      return (
        <>
          <Path d="M5 2.5h14v19l-2.3-1.6-2.35 1.6L12 20l-2.35 1.5L7.3 19.9 5 21.5z" {...s} />
          <Line x1="9" y1="8" x2="15" y2="8" {...s} />
          <Line x1="9" y1="12" x2="15" y2="12" {...s} />
        </>
      );

    case 'users':
      return (
        <>
          <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" {...s} />
          <Circle cx="9" cy="7" r="4" {...s} />
          <Path d="M22 21v-2a4 4 0 0 0-3-3.87" {...s} />
          <Path d="M16 3.13a4 4 0 0 1 0 7.75" {...s} />
        </>
      );

    case 'settings':
      return (
        <>
          <Line x1="4" y1="21" x2="4" y2="14" {...s} />
          <Line x1="4" y1="10" x2="4" y2="3" {...s} />
          <Line x1="12" y1="21" x2="12" y2="12" {...s} />
          <Line x1="12" y1="8" x2="12" y2="3" {...s} />
          <Line x1="20" y1="21" x2="20" y2="16" {...s} />
          <Line x1="20" y1="12" x2="20" y2="3" {...s} />
          <Line x1="1.5" y1="14" x2="6.5" y2="14" {...s} />
          <Line x1="9.5" y1="8" x2="14.5" y2="8" {...s} />
          <Line x1="17.5" y1="16" x2="22.5" y2="16" {...s} />
        </>
      );

    case 'credit':
      return (
        <>
          <Rect x="1.5" y="4.5" width="21" height="15" rx="2.5" {...s} />
          <Line x1="1.5" y1="10" x2="22.5" y2="10" {...s} />
          <Line x1="5.5" y1="15" x2="9" y2="15" {...s} />
        </>
      );

    case 'chevron-right':
      return <Polyline points="9 18 15 12 9 6" {...s} />;

    case 'chevron-left':
      return <Polyline points="15 18 9 12 15 6" {...s} />;

    case 'chevron-down':
      return <Polyline points="6 9.5 12 15.5 18 9.5" {...s} />;

    case 'search':
      return (
        <>
          <Circle cx="11" cy="11" r="7.5" {...s} />
          <Line x1="21" y1="21" x2="16.5" y2="16.5" {...s} />
        </>
      );

    case 'close':
      return (
        <>
          <Line x1="18" y1="6" x2="6" y2="18" {...s} />
          <Line x1="6" y1="6" x2="18" y2="18" {...s} />
        </>
      );

    case 'check':
      return <Polyline points="20 6.5 9 17.5 4 12.5" {...s} />;

    case 'trash':
      return (
        <>
          <Polyline points="3.5 6 20.5 6" {...s} />
          <Path d="M19 6v13.5A2 2 0 0 1 17 21.5H7a2 2 0 0 1-2-2V6" {...s} />
          <Path d="M8.5 6V4.5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2V6" {...s} />
        </>
      );

    case 'edit':
      return (
        <>
          <Path d="M11 4.5H4.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V13" {...s} />
          <Path d="M18.4 2.6a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" {...s} />
        </>
      );

    case 'plus':
      return (
        <>
          <Line x1="12" y1="5" x2="12" y2="19" {...s} />
          <Line x1="5" y1="12" x2="19" y2="12" {...s} />
        </>
      );

    case 'minus':
      return <Line x1="5" y1="12" x2="19" y2="12" {...s} />;

    case 'alert':
      return (
        <>
          <Path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" {...s} />
          <Line x1="12" y1="9" x2="12" y2="13.5" {...s} />
          <Circle cx="12" cy="17.2" r="1.05" fill={color} stroke="none" />
        </>
      );

    case 'logout':
      return (
        <>
          <Path d="M9.5 21.5h-5a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2h5" {...s} />
          <Polyline points="16.5 17 21.5 12 16.5 7" {...s} />
          <Line x1="21.5" y1="12" x2="9.5" y2="12" {...s} />
        </>
      );

    case 'calendar':
      return (
        <>
          <Rect x="3" y="5" width="18" height="16.5" rx="2.5" {...s} />
          <Line x1="16" y1="2.5" x2="16" y2="7.5" {...s} />
          <Line x1="8" y1="2.5" x2="8" y2="7.5" {...s} />
          <Line x1="3" y1="10.5" x2="21" y2="10.5" {...s} />
        </>
      );

    case 'phone':
      return (
        <Path
          d="M21.5 17v2.8a1.9 1.9 0 0 1-2.1 1.9 18.9 18.9 0 0 1-8.2-2.9 18.6 18.6 0 0 1-5.7-5.7A18.9 18.9 0 0 1 2.6 4.8 1.9 1.9 0 0 1 4.5 2.7h2.8A1.9 1.9 0 0 1 9.2 4.4a12.2 12.2 0 0 0 .7 2.7 1.9 1.9 0 0 1-.4 2L8.2 10.4a15.2 15.2 0 0 0 5.7 5.7l1.2-1.2a1.9 1.9 0 0 1 2-.4 12.2 12.2 0 0 0 2.7.7 1.9 1.9 0 0 1 1.7 1.8z"
          {...s}
        />
      );

    case 'trending-up':
      return (
        <>
          <Polyline points="22.5 6.5 13.5 15.5 8.5 10.5 1.5 17.5" {...s} />
          <Polyline points="16.5 6.5 22.5 6.5 22.5 12.5" {...s} />
        </>
      );

    case 'trending-down':
      return (
        <>
          <Polyline points="22.5 17.5 13.5 8.5 8.5 13.5 1.5 6.5" {...s} />
          <Polyline points="16.5 17.5 22.5 17.5 22.5 11.5" {...s} />
        </>
      );

    case 'clock':
      return (
        <>
          <Circle cx="12" cy="12" r="9.5" {...s} />
          <Polyline points="12 6.5 12 12 15.8 14" {...s} />
        </>
      );

    case 'refresh':
      return (
        <>
          <Polyline points="21.5 4.5 21.5 10 16 10" {...s} />
          <Polyline points="2.5 19.5 2.5 14 8 14" {...s} />
          <Path d="M4.6 9a8.5 8.5 0 0 1 14-3.2l3 3" {...s} />
          <Path d="M2.5 14l3 3A8.5 8.5 0 0 0 19.4 15" {...s} />
        </>
      );

    case 'user':
      return (
        <>
          <Path d="M20 21.5v-2a4.5 4.5 0 0 0-4.5-4.5h-7A4.5 4.5 0 0 0 4 19.5v2" {...s} />
          <Circle cx="12" cy="7.5" r="4.5" {...s} />
        </>
      );

    case 'pie':
      return (
        <>
          <Path d="M21.2 15.9A10 10 0 1 1 8 2.8" {...s} />
          <Path d="M22 12A10 10 0 0 0 12 2v10z" {...s} />
        </>
      );

    case 'bar-chart':
      return (
        <>
          <Line x1="6" y1="21" x2="6" y2="12" {...s} />
          <Line x1="12" y1="21" x2="12" y2="4" {...s} />
          <Line x1="18" y1="21" x2="18" y2="9" {...s} />
        </>
      );

    case 'arrow-up':
      return (
        <>
          <Line x1="12" y1="19.5" x2="12" y2="5" {...s} />
          <Polyline points="6 11 12 5 18 11" {...s} />
        </>
      );

    case 'arrow-down':
      return (
        <>
          <Line x1="12" y1="4.5" x2="12" y2="19" {...s} />
          <Polyline points="6 13 12 19 18 13" {...s} />
        </>
      );

    case 'filter':
      return <Path d="M21.5 3.5h-19L10 12.9V19l4 2.2v-8.3z" {...s} />;

    case 'ticket':
      return (
        <>
          <Path d="M3 8.5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2V10a2 2 0 0 0 0 4v1.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V14a2 2 0 0 0 0-4z" {...s} />
          <Line x1="12" y1="7.5" x2="12" y2="10" {...s} />
          <Line x1="12" y1="14" x2="12" y2="16.5" {...s} />
        </>
      );

    case 'map-pin':
      return (
        <>
          <Path d="M20 10.3c0 6-8 12.2-8 12.2s-8-6.2-8-12.2a8 8 0 1 1 16 0z" {...s} />
          <Circle cx="12" cy="10" r="2.8" {...s} />
        </>
      );

    case 'lock':
      return (
        <>
          <Rect x="4" y="10.5" width="16" height="11" rx="2.5" {...s} />
          <Path d="M7.8 10.5V7a4.2 4.2 0 0 1 8.4 0v3.5" {...s} />
        </>
      );

    case 'send':
      return (
        <>
          <Line x1="21.5" y1="2.5" x2="10.5" y2="13.5" {...s} />
          <Path d="M21.5 2.5 14.5 21.5l-4-8-8-4z" {...s} />
        </>
      );

    case 'bell':
      return (
        <>
          <Path d="M18 8.5a6 6 0 0 0-12 0c0 6.5-2.8 8.5-2.8 8.5h17.6S18 15 18 8.5z" {...s} />
          <Path d="M13.7 20.5a2 2 0 0 1-3.4 0" {...s} />
        </>
      );

    case 'cart':
      return (
        <>
          <Path d="M2.5 3.5h2.8l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h8.4a1.6 1.6 0 0 0 1.6-1.2l1.7-7.3H6.2" {...s} />
          <Circle cx="9.5" cy="20" r="1.3" {...s} />
          <Circle cx="17.5" cy="20" r="1.3" {...s} />
        </>
      );

    case 'truck':
      return (
        <>
          <Path d="M2.5 5.5h11v10.5h-11z" {...s} />
          <Path d="M13.5 9h4l3 3.5V16h-7" {...s} />
          <Circle cx="7" cy="18" r="1.8" {...s} />
          <Circle cx="17" cy="18" r="1.8" {...s} />
        </>
      );

    case 'flame':
      return (
        <Path
          d="M12 22c4 0 7-2.8 7-7 0-3.2-2-5.6-3.6-7.4-.3 1.9-1.3 3.2-2.6 3.8.2-3-1.2-6.2-4.3-8.4.3 3.1-1.4 5.3-2.9 7.1C4.4 11.6 5 12.8 5 15c0 4.2 3 7 7 7z"
          {...s}
        />
      );

    case 'globe':
      return (
        <>
          <Circle cx="12" cy="12" r="9" {...s} />
          <Path d="M3 12h18" {...s} />
          <Path d="M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" {...s} />
        </>
      );

    case 'more':
      return (
        <>
          <Circle cx="5" cy="12" r="1.6" fill={color} stroke="none" />
          <Circle cx="12" cy="12" r="1.6" fill={color} stroke="none" />
          <Circle cx="19" cy="12" r="1.6" fill={color} stroke="none" />
        </>
      );

    default:
      return null;
  }
}
