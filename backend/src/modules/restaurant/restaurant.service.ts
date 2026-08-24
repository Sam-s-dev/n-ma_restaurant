import { badRequest, notFound } from '../../core/errors';
import { buildUpdate } from '../../core/sqlBuilder';
import { queryOne } from '../../db/pool';
import { pruneOrphans } from '../media/media.service';
import type { UpdateRestaurantInput } from './restaurant.schemas';

export interface RestaurantSettings {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  logoMediaId: string | null;
  logoUrl: string | null;
  currencyCode: string;
  currencySymbol: string;
  currencyDecimals: number;
  status: string;
  createdAt: string;
}

interface Row {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  logo_media_id: string | null;
  currency_code: string;
  currency_symbol: string;
  currency_decimals: number;
  status: string;
  created_at: Date;
}

function toSettings(row: Row): RestaurantSettings {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    logoMediaId: row.logo_media_id,
    logoUrl: row.logo_media_id ? `/api/media/${row.logo_media_id}` : null,
    currencyCode: row.currency_code,
    currencySymbol: row.currency_symbol,
    currencyDecimals: row.currency_decimals,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

const SELECT = `
  SELECT id, name, address, phone, logo_media_id, currency_code, currency_symbol, currency_decimals, status, created_at
    FROM restaurants`;

export async function getSettings(restaurantId: string): Promise<RestaurantSettings> {
  const row = await queryOne<Row>(`${SELECT} WHERE id = $1`, [restaurantId]);
  if (!row) throw notFound('Restaurant');
  return toSettings(row);
}

export async function updateSettings(
  restaurantId: string,
  input: UpdateRestaurantInput,
): Promise<RestaurantSettings> {
  // Un logo doit appartenir au restaurant qui le référence.
  if (input.logoMediaId) {
    const media = await queryOne('SELECT 1 FROM media WHERE id = $1 AND restaurant_id = $2', [
      input.logoMediaId,
      restaurantId,
    ]);
    if (!media) throw badRequest('Image de logo introuvable pour ce restaurant.');
  }

  const { setClause, values, nextIndex } = buildUpdate(input, {
    name: 'name',
    address: 'address',
    phone: 'phone',
    logoMediaId: 'logo_media_id',
    currencyCode: 'currency_code',
    currencySymbol: 'currency_symbol',
    currencyDecimals: 'currency_decimals',
  });

  const row = await queryOne<Row>(
    `UPDATE restaurants SET ${setClause} WHERE id = $${nextIndex}
     RETURNING id, name, address, phone, logo_media_id, currency_code, currency_symbol, currency_decimals, status, created_at`,
    [...values, restaurantId],
  );
  if (!row) throw notFound('Restaurant');

  if ('logoMediaId' in input) {
    await pruneOrphans(restaurantId).catch(() => undefined);
  }

  return toSettings(row);
}
