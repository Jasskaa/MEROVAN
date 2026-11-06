import { describe, expect, it } from "vitest";
import { orderView, shippingFromSession } from "@/lib/domain/checkout";

describe("shippingFromSession", () => {
  it("uses the shipping address, not the billing one, when they differ", () => {
    const s = shippingFromSession({
      collected_information: { shipping_details: { name: "Luis Envío", address: { line1: "Calle Envío 2", line2: "3º B", city: "Valencia", state: "V", postal_code: "46001", country: "ES" } } },
      customer_details: { name: "Ana Factura", phone: "+34600000000", address: { line1: "Calle Factura 1", city: "Madrid", postal_code: "28001", country: "ES" } },
    });
    expect(s).toEqual({ name: "Luis Envío", line1: "Calle Envío 2", line2: "3º B", city: "Valencia", state: "V", postal_code: "46001", country: "ES", phone: "+34600000000" });
  });

  it("falls back to the older shipping_details field", () => {
    expect(shippingFromSession({ shipping_details: { name: "Eva", address: { line1: "Av. 1", city: "Sevilla", postal_code: "41001", country: "ES" } } }).line1).toBe("Av. 1");
  });

  it("accepts sessions without any address (fields null)", () => {
    expect(shippingFromSession({ customer_details: { email: "a@example.com" } })).toEqual({
      name: null, line1: null, line2: null, city: null, state: null, postal_code: null, country: null, phone: null,
    });
  });
});

describe("orderView", () => {
  const on = { returningFromPayment: false, paymentsEnabled: true };
  it("pending + ?pagado=1 does not thank the buyer: it only says we are checking", () => {
    const v = orderView("pendiente_pago", { returningFromPayment: true, paymentsEnabled: true });
    expect(v.title).not.toMatch(/Gracias/);
    expect(v.title).toBe("Comprobando tu pago");
  });
  it("pending with payments enabled offers to retry, without claiming payments are off", () => {
    const v = orderView("pendiente_pago", on);
    expect(v.showRetry).toBe(true);
    expect(v.message).not.toMatch(/no están activados/);
  });
  it("pending without payments configured says so", () => {
    expect(orderView("pendiente_pago", { returningFromPayment: false, paymentsEnabled: false }).message).toMatch(/no están activados/);
  });
  it("cancelled and refunded orders are not shown as paid", () => {
    expect(orderView("cancelado", { ...on, returningFromPayment: true }).title).toBe("Pedido cancelado");
    expect(orderView("reembolsado", on).title).toBe("Pedido reembolsado");
  });
  it("confirmed payment thanks the buyer and never claims an e-mail was sent", () => {
    for (const st of ["pagado", "enviado_proveedor", "enviado", "entregado", "cancelado", "reembolsado", "pendiente_pago"] as const) {
      expect(orderView(st, on).message).not.toMatch(/correo|e-?mail/i);
    }
    expect(orderView("pagado", on).title).toBe("Gracias por tu compra");
  });
});
