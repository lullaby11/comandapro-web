import { describe, it, expect } from 'vitest';
import { aCentimos, aEuros, calcularImportes } from '../money.service';

/**
 * El dinero se calculaba con números en coma flotante y sin redondeo explícito antes de
 * persistir, así que el `total` guardado podía diferir en un céntimo de la suma de sus
 * componentes guardados. En un ticket eso es una línea que no cuadra, y en la caja del
 * local al final del día, un descuadre inexplicable.
 */

describe('conversión a céntimos', () => {
  it('convierte importes corrientes sin perder precisión', () => {
    expect(aCentimos(10.5)).toBe(1050);
    expect(aCentimos(0.1)).toBe(10);
    expect(aCentimos(0)).toBe(0);
    expect(aCentimos(1234.56)).toBe(123456);
  });

  it('resiste los importes que la coma flotante representa mal', () => {
    // 0.1 + 0.2 = 0.30000000000000004 y 1.005 * 100 = 100.49999999999999
    expect(aCentimos(0.1 + 0.2)).toBe(30);
    expect(aCentimos(1.005)).toBe(101);
    expect(aCentimos(8.165)).toBe(817);
  });

  it('va y vuelve sin desviarse', () => {
    for (const euros of [0, 0.01, 1, 9.99, 10.55, 123.45, 9999.99]) {
      expect(aEuros(aCentimos(euros))).toBe(euros);
    }
  });
});

describe('calcularImportes', () => {
  it('calcula un caso sencillo', () => {
    const r = calcularImportes({
      lineas: [{ unitPriceCents: 1050, quantity: 2 }],
      taxRate: 10,
      shippingCents: 300,
    });

    expect(aEuros(r.subtotalCents)).toBe(21);
    expect(aEuros(r.taxCents)).toBe(2.1);
    expect(aEuros(r.shippingCents)).toBe(3);
    expect(aEuros(r.totalCents)).toBe(26.1);
  });

  it('no aplica IVA al coste de envío', () => {
    const r = calcularImportes({
      lineas: [{ unitPriceCents: 10000, quantity: 1 }],
      taxRate: 21,
      shippingCents: 1000,
    });

    expect(aEuros(r.taxCents)).toBe(21); // 21 % de 100, no de 110
    expect(aEuros(r.totalCents)).toBe(131);
  });

  it('sin IVA ni envío, el total es el subtotal', () => {
    const r = calcularImportes({ lineas: [{ unitPriceCents: 999, quantity: 3 }], taxRate: 0, shippingCents: 0 });
    expect(r.totalCents).toBe(2997);
    expect(r.taxCents).toBe(0);
  });

  it('PROPIEDAD: el total siempre es exactamente la suma de sus partes', () => {
    // Este es el test que justifica todo el refactor. Con coma flotante había
    // combinaciones en las que el total guardado no cuadraba con sus componentes.
    const fallos: string[] = [];

    for (let i = 0; i < 2000; i++) {
      const lineas = Array.from({ length: 1 + Math.floor(Math.random() * 5) }, () => ({
        unitPriceCents: 1 + Math.floor(Math.random() * 10_000),
        quantity: 1 + Math.floor(Math.random() * 10),
      }));
      const taxRate = [0, 4, 10, 21, 7.5][Math.floor(Math.random() * 5)];
      const shippingCents = Math.floor(Math.random() * 1000);

      const r = calcularImportes({ lineas, taxRate, shippingCents });

      if (r.totalCents !== r.subtotalCents + r.taxCents + r.shippingCents) {
        fallos.push(
          `subtotal=${r.subtotalCents} iva=${r.taxCents} envio=${r.shippingCents} total=${r.totalCents} (IVA ${taxRate}%)`
        );
      }
    }

    expect(fallos).toEqual([]);
  });

  it('PROPIEDAD: todos los importes son enteros de céntimos, nunca fracciones', () => {
    for (let i = 0; i < 500; i++) {
      const r = calcularImportes({
        lineas: [{ unitPriceCents: 1 + Math.floor(Math.random() * 9999), quantity: 1 + Math.floor(Math.random() * 7) }],
        taxRate: [0, 4, 10, 21, 7.5][Math.floor(Math.random() * 5)],
        shippingCents: Math.floor(Math.random() * 500),
      });

      const importes = {
        subtotalCents: r.subtotalCents,
        taxCents: r.taxCents,
        shippingCents: r.shippingCents,
        totalCents: r.totalCents,
      };
      for (const [nombre, valor] of Object.entries(importes)) {
        expect(Number.isInteger(valor), `${nombre} = ${valor} no es entero`).toBe(true);
      }
      for (const linea of r.lineas) {
        expect(Number.isInteger(linea.subtotalCents)).toBe(true);
      }
    }
  });

  it('PROPIEDAD: la suma de subtotales de línea es el subtotal', () => {
    for (let i = 0; i < 500; i++) {
      const lineas = Array.from({ length: 1 + Math.floor(Math.random() * 8) }, () => ({
        unitPriceCents: 1 + Math.floor(Math.random() * 5000),
        quantity: 1 + Math.floor(Math.random() * 12),
      }));

      const r = calcularImportes({ lineas, taxRate: 21, shippingCents: 0 });
      const sumaLineas = r.lineas.reduce((acc, l) => acc + l.subtotalCents, 0);

      expect(r.subtotalCents).toBe(sumaLineas);
    }
  });

  it('redondea el IVA a la mitad hacia arriba, como manda la práctica contable', () => {
    // 10,05 € al 10 % = 1,005 € → 1,01 €
    const r = calcularImportes({ lineas: [{ unitPriceCents: 1005, quantity: 1 }], taxRate: 10, shippingCents: 0 });
    expect(r.taxCents).toBe(101);
  });

  it('rechaza cantidades y precios inválidos en lugar de producir importes absurdos', () => {
    expect(() => calcularImportes({ lineas: [{ unitPriceCents: -1, quantity: 1 }], taxRate: 0, shippingCents: 0 })).toThrow();
    expect(() => calcularImportes({ lineas: [{ unitPriceCents: 100, quantity: 0 }], taxRate: 0, shippingCents: 0 })).toThrow();
    expect(() => calcularImportes({ lineas: [{ unitPriceCents: 100, quantity: 1 }], taxRate: -5, shippingCents: 0 })).toThrow();
  });
});
