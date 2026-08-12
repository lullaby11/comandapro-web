/**
 * Aritmética monetaria en céntimos enteros.
 *
 * Antes, los importes se calculaban con números en coma flotante y se persistían sin
 * redondeo explícito: PostgreSQL redondeaba al guardar en Decimal(10,2) y el `total`
 * podía acabar difiriendo en un céntimo de la suma de sus componentes. En el ticket eso
 * es una línea que no cuadra; en el cierre de caja, un descuadre inexplicable.
 *
 * La regla: se entra a céntimos cuanto antes, se calcula todo con enteros, y solo se
 * vuelve a euros al persistir o al mostrar.
 */

export interface LineaImporte {
  unitPriceCents: number;
  quantity: number;
}

export interface LineaCalculada extends LineaImporte {
  subtotalCents: number;
}

export interface ImportesCalculados {
  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
}

export interface ResultadoImportes extends ImportesCalculados {
  lineas: LineaCalculada[];
}

/**
 * Euros → céntimos, redondeando a la mitad en sentido contrario al cero (la regla
 * contable habitual).
 *
 * El paso por `toFixed(6)` no es cosmético: multiplicar por 100 arrastra el ruido de la
 * representación binaria y deja valores como `8.165 * 100 = 816.4999999999999`, que
 * redondearía a 816 en lugar de a 817. Recortar a 6 decimales elimina ese ruido —muy por
 * debajo del céntimo— antes de redondear.
 *
 * Sumar `Number.EPSILON` no sirve: es relativo a 1.0 y se queda corto en cuanto el
 * importe pasa de unas pocas unidades.
 */
export function aCentimos(euros: number): number {
  if (!Number.isFinite(euros)) throw new Error(`Importe no numérico: ${euros}`);
  const escalado = Number((euros * 100).toFixed(6));
  return Math.sign(escalado) * Math.round(Math.abs(escalado));
}

/** Céntimos → euros, con dos decimales exactos. */
export function aEuros(centimos: number): number {
  if (!Number.isInteger(centimos)) throw new Error(`Los céntimos deben ser enteros: ${centimos}`);
  return centimos / 100;
}

/**
 * Calcula los importes de un pedido. El IVA se aplica **solo al subtotal**, nunca al
 * coste de envío: es la regla de negocio vigente y está cubierta por tests.
 */
export function calcularImportes(entrada: {
  lineas: LineaImporte[];
  taxRate: number;
  shippingCents: number;
}): ResultadoImportes {
  const { lineas, taxRate, shippingCents } = entrada;

  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
    throw new Error(`Tipo de IVA fuera de rango: ${taxRate}`);
  }
  if (!Number.isInteger(shippingCents) || shippingCents < 0) {
    throw new Error(`Coste de envío inválido: ${shippingCents}`);
  }

  const lineasCalculadas: LineaCalculada[] = lineas.map((linea) => {
    if (!Number.isInteger(linea.unitPriceCents) || linea.unitPriceCents < 0) {
      throw new Error(`Precio unitario inválido: ${linea.unitPriceCents}`);
    }
    if (!Number.isInteger(linea.quantity) || linea.quantity <= 0) {
      throw new Error(`Cantidad inválida: ${linea.quantity}`);
    }
    return { ...linea, subtotalCents: linea.unitPriceCents * linea.quantity };
  });

  const subtotalCents = lineasCalculadas.reduce((acc, l) => acc + l.subtotalCents, 0);

  // Redondeo a la mitad hacia arriba sobre el subtotal completo, no línea a línea: así
  // el IVA del pedido coincide con el que saldría de recalcularlo desde el subtotal.
  const taxCents = Math.round((subtotalCents * taxRate) / 100);

  // El total se define como la suma de las partes ya redondeadas. Por construcción,
  // nunca puede descuadrar.
  const totalCents = subtotalCents + taxCents + shippingCents;

  return { lineas: lineasCalculadas, subtotalCents, taxCents, shippingCents, totalCents };
}
