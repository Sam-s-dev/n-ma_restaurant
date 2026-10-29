import { AppError } from '../../core/errors';
import { notify } from '../notifications/notifications.service';
import { hasOpenSession } from '../sessions/sessions.service';
import { createSale, findByClientId } from './sales.service';
import type { SyncSalesInput } from './sales.schemas';

/** Au-delà, une vente hors ligne attend que le gérant l'envoie lui-même. */
const MAX_OFFLINE_AGE_MS = 3 * 24 * 60 * 60 * 1000;
/** Horloge d'un téléphone en avance : on tolère quelques minutes. */
const CLOCK_TOLERANCE_MS = 10 * 60 * 1000;

export type SyncResult =
  | { clientId: string; status: 'created' | 'duplicate'; saleId: string; reference: string }
  | { clientId: string; status: 'rejected'; error: string; retry: boolean };

/**
 * Reçoit les ventes qu'un téléphone a faites pendant une coupure.
 *
 * Chacune est traitée seule : une vente refusée n'empêche pas les autres
 * de passer. Le téléphone garde les refusées et efface celles qui sont
 * arrivées. Le gérant est prévenu des portions vendues deux fois et des
 * ventes arrivées alors qu'aucune caisse n'était ouverte.
 */
export async function syncOfflineSales(
  actor: { restaurantId: string; userId: string; userName: string; isManager: boolean; canOverridePrice: boolean },
  input: SyncSalesInput,
): Promise<{ results: SyncResult[] }> {
  const results: SyncResult[] = [];
  const oversold: string[] = [];
  let created = 0;
  const now = Date.now();

  // Les plus anciennes d'abord : les tickets gardent leur ordre.
  const ordered = [...input.sales].sort((a, b) => a.soldAt.getTime() - b.soldAt.getTime());

  for (const offline of ordered) {
    const age = now - offline.soldAt.getTime();
    if (age < -CLOCK_TOLERANCE_MS) {
      results.push({
        clientId: offline.clientId,
        status: 'rejected',
        error: 'La date de la vente est dans le futur : vérifiez l’heure du téléphone.',
        retry: false,
      });
      continue;
    }
    if (age > MAX_OFFLINE_AGE_MS && !actor.isManager) {
      results.push({
        clientId: offline.clientId,
        status: 'rejected',
        error: 'Vente de plus de 3 jours : le gérant doit l’envoyer depuis son compte.',
        retry: false,
      });
      continue;
    }

    const already = await findByClientId(actor.restaurantId, offline.clientId);
    if (already) {
      results.push({ clientId: offline.clientId, status: 'duplicate', saleId: already.id, reference: already.reference });
      continue;
    }

    try {
      const sale = await createSale(
        actor.restaurantId,
        actor.userId,
        {
          clientId: offline.clientId,
          soldAt: age < 0 ? new Date() : offline.soldAt,
          paymentMethod: offline.paymentMethod,
          ...(offline.customerId ? { customerId: offline.customerId } : {}),
          note: [`Vente hors ligne ${offline.offlineRef}`, offline.note].filter(Boolean).join(' · '),
          // Un prix modifié n'est retenu que pour qui a le droit de le faire.
          items: offline.items.map((item) =>
            actor.canOverridePrice || item.unitPrice === undefined
              ? item
              : { dishId: item.dishId, quantity: item.quantity },
          ),
        },
        { offline: true, oversold },
      );
      created += 1;
      results.push({ clientId: offline.clientId, status: 'created', saleId: sale.id, reference: sale.reference });
    } catch (error) {
      // Erreur métier (plat supprimé, client inconnu) : la renvoyer ne changerait rien.
      const business = error instanceof AppError && error.status < 500;
      results.push({
        clientId: offline.clientId,
        status: 'rejected',
        error: error instanceof Error ? error.message : 'Vente refusée.',
        retry: !business,
      });
    }
  }

  if (oversold.length > 0) {
    await notify({
      restaurantId: actor.restaurantId,
      to: { permission: 'menu.manage' },
      kind: 'stock.oversold',
      title: 'Portions vendues au-delà du stock',
      body: `Pendant la coupure d’internet : ${[...new Set(oversold)].join(', ')}. Vérifiez les portions restantes.`,
      route: 'menu',
      actorName: actor.userName,
    });
  }
  if (created > 0 && !(await hasOpenSession(actor.restaurantId))) {
    await notify({
      restaurantId: actor.restaurantId,
      to: { permission: 'cash.view' },
      exceptUserId: actor.userId,
      kind: 'cash.offline_without_session',
      title: 'Ventes hors ligne reçues sans caisse ouverte',
      body: `${created} vente(s) faite(s) pendant la coupure sont arrivées alors qu’aucune caisse n’était ouverte.`,
      route: 'cash',
      actorName: actor.userName,
    });
  }

  return { results };
}
