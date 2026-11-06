// Pure helpers for checkout: shipping address extraction and what the order page tells the buyer.

type Address = { line1?: string | null; line2?: string | null; city?: string | null; state?: string | null; postal_code?: string | null; country?: string | null };
type Party = { name?: string | null; phone?: string | null; address?: Address | null } | null | undefined;

/** Minimal shape of a Stripe Checkout Session that we read (Stripe SDK 17). */
export type SessionLike = {
  collected_information?: { shipping_details?: Party } | null;
  shipping_details?: Party;
  customer_details?: { name?: string | null; email?: string | null; phone?: string | null; address?: Address | null } | null;
};

export type ShippingAddress = {
  name: string | null; line1: string | null; line2: string | null; city: string | null;
  state: string | null; postal_code: string | null; country: string | null; phone: string | null;
};

/**
 * Delivery address of a paid session. Shipping details (collected_information first, the older
 * shipping_details field as fallback) win over billing details, which can be a different address.
 * Billing is used only for the country and the phone when there is no shipping address at all.
 */
export function shippingFromSession(s: SessionLike): ShippingAddress {
  const ship = s.collected_information?.shipping_details ?? s.shipping_details ?? null;
  const a = ship?.address ?? null;
  const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
  return {
    name: clean(ship?.name),
    line1: clean(a?.line1),
    line2: clean(a?.line2),
    city: clean(a?.city),
    state: clean(a?.state),
    postal_code: clean(a?.postal_code),
    country: clean(a?.country) ?? clean(s.customer_details?.address?.country),
    phone: clean(ship?.phone) ?? clean(s.customer_details?.phone),
  };
}

export type OrderStatus = "pendiente_pago" | "pagado" | "enviado_proveedor" | "enviado" | "entregado" | "cancelado" | "reembolsado";

export type OrderView = { title: string; message: string; showRetry: boolean };

/**
 * What the public order page says. Only the database status counts: returning from Stripe
 * (?pagado=1) just means "we are checking". We never claim an e-mail was sent (no e-mail flow yet).
 */
export function orderView(status: OrderStatus, opts: { returningFromPayment: boolean; paymentsEnabled: boolean }): OrderView {
  switch (status) {
    case "pagado":
    case "enviado_proveedor":
      return { title: "Gracias por tu compra", message: "Pago confirmado. Estamos preparando tu pedido; guarda este número para cualquier consulta.", showRetry: false };
    case "enviado":
      return { title: "Tu pedido va de camino", message: "El pedido ha salido del almacén.", showRetry: false };
    case "entregado":
      return { title: "Pedido entregado", message: "Consta como entregado. Si algo no está bien, escríbenos desde Ayuda.", showRetry: false };
    case "cancelado":
      return { title: "Pedido cancelado", message: "Este pedido está cancelado. Si se te ha hecho algún cargo, escríbenos desde Ayuda y lo revisamos.", showRetry: false };
    case "reembolsado":
      return { title: "Pedido reembolsado", message: "Hemos tramitado la devolución del importe de este pedido.", showRetry: false };
    case "pendiente_pago":
    default:
      if (opts.returningFromPayment)
        return { title: "Comprobando tu pago", message: "Aún no tenemos la confirmación del pago. Recarga la página en unos segundos.", showRetry: false };
      if (opts.paymentsEnabled)
        return { title: "Pedido pendiente de pago", message: "Todavía no se ha completado el pago de este pedido.", showRetry: true };
      return { title: "Pedido pendiente de pago", message: "Los pagos online aún no están activados en esta tienda.", showRetry: false };
  }
}
