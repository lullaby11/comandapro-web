import { describe, it, expect } from 'vitest';
import { generateEscPosBuffer, PrintOrderPayload } from '../printer.service';

/**
 * El generador de tickets es el código de mayor riesgo del proyecto: se ejecuta en el
 * local del cliente en hora punta, es difícil de probar a mano y una regresión no se ve
 * en una revisión de código. Estos tests fijan su comportamiento.
 */

function pedidoDePrueba(overrides: Partial<PrintOrderPayload> = {}): PrintOrderPayload {
  return {
    business: {
      name: 'Pizzería Bella Italia',
      address: 'Calle Gran Vía 45, Madrid',
      phone: '+34 912 345 678',
      paperWidth: 80,
      currency: 'EUR',
      ...overrides.business,
    },
    customer: {
      name: 'Ana Muñoz',
      phone: '600123456',
      address: 'Calle del Pez 3',
      ...overrides.customer,
    },
    order: {
      id: 'clx1234567890abcdefghij',
      trackingToken: 'tok1234567890abcdefghij',
      createdAt: new Date('2026-08-12T19:30:00.000Z'),
      items: [
        { productName: 'Pizza Margherita', quantity: 2, unitPrice: 10.5, subtotal: 21 },
        { productName: 'Coca-Cola 33cl', quantity: 1, unitPrice: 2.5, subtotal: 2.5 },
      ],
      subtotal: 23.5,
      tax: 2.35,
      shippingCost: 3,
      shippingRateName: 'Zona 2',
      total: 28.85,
      paymentMethod: 'CASH',
      cashGiven: 50,
      ...overrides.order,
    },
    trackingUrl: 'https://olyda.app/tracking/tok1234567890abcdefghij',
    ...overrides,
  };
}

/** El buffer es binario; para las aserciones interesa el texto legible que contiene. */
function textoDe(buffer: Uint8Array): string {
  return Buffer.from(buffer).toString('latin1');
}

describe('generateEscPosBuffer', () => {
  it('genera un buffer no vacío que incluye la secuencia de inicialización ESC @', async () => {
    const buffer = await generateEscPosBuffer(pedidoDePrueba());

    expect(buffer.length).toBeGreaterThan(100);
    // ESC @ = 0x1B 0x40, el comando que reinicia la impresora. No está en la posición 0:
    // el codificador emite antes unos espacios de alineación.
    expect(Buffer.from(buffer).includes(Buffer.from([0x1b, 0x40]))).toBe(true);
  });

  it('incluye los datos del local, del cliente y del pedido', async () => {
    const texto = textoDe(await generateEscPosBuffer(pedidoDePrueba()));

    expect(texto).toContain('PIZZERIA BELLA ITALIA'); // en mayúsculas y sin tildes
    expect(texto).toContain('Calle Gran Via 45, Madrid');
    expect(texto).toContain('Ana Munoz');
    expect(texto).toContain('600123456');
    expect(texto).toContain('Pizza Margherita');
    expect(texto).toContain('Coca-Cola 33cl');
  });

  it('usa los últimos 8 caracteres del id como referencia legible del pedido', async () => {
    const texto = textoDe(await generateEscPosBuffer(pedidoDePrueba()));
    expect(texto).toContain('#CDEFGHIJ');
  });

  it('imprime totales, forma de pago y cambio', async () => {
    const texto = textoDe(await generateEscPosBuffer(pedidoDePrueba()));

    expect(texto).toContain('Subtotal:');
    expect(texto).toContain('IVA:');
    expect(texto).toContain('Envio (Zona 2):');
    expect(texto).toContain('TOTAL:');
    expect(texto).toContain('Efectivo');
    expect(texto).toContain('CAMBIO:');
    // 50 - 28,85 = 21,15
    expect(texto).toContain('21,15');
  });

  it('no imprime el bloque de cambio cuando se paga con tarjeta', async () => {
    const pedido = pedidoDePrueba();
    pedido.order.paymentMethod = 'CARD';
    pedido.order.cashGiven = undefined;

    const texto = textoDe(await generateEscPosBuffer(pedido));

    expect(texto).toContain('Tarjeta');
    expect(texto).not.toContain('CAMBIO:');
  });

  it('omite la línea de envío cuando es recogida en local', async () => {
    const pedido = pedidoDePrueba();
    pedido.order.shippingCost = 0;
    pedido.order.shippingRateName = undefined;

    const texto = textoDe(await generateEscPosBuffer(pedido));

    expect(texto).not.toContain('Envio');
  });

  it('sustituye tildes, eñes y el símbolo del euro, que muchas impresoras no renderizan', async () => {
    const pedido = pedidoDePrueba();
    pedido.customer.name = 'Íñigo Peñáñez';
    pedido.order.notes = '¡Sin cebolla! ¿Salsa aparte?';

    const texto = textoDe(await generateEscPosBuffer(pedido));

    expect(texto).toContain('Inigo Penanez');
    expect(texto).toContain('!Sin cebolla! ?Salsa aparte?');
    expect(texto).toContain('EUR');
    expect(texto).not.toContain('€');
  });

  it('respeta el ancho de línea de cada tipo de papel', async () => {
    const ancho80 = await generateEscPosBuffer(pedidoDePrueba());

    const pedido58 = pedidoDePrueba();
    pedido58.business.paperWidth = 58;
    const ancho58 = await generateEscPosBuffer(pedido58);

    // El de 58 mm usa 32 columnas y un QR más pequeño: pesa menos
    expect(ancho58.length).toBeLessThan(ancho80.length);

    // Las líneas de separación ocupan el ancho declarado. No son guiones ASCII: el
    // codificador usa 0xC4, la línea horizontal de CP850, que es lo que la impresora
    // renderiza como raya continua.
    const RAYA = '\xC4';
    expect(textoDe(ancho80)).toContain(RAYA.repeat(48));
    expect(textoDe(ancho58)).toContain(RAYA.repeat(32));
    expect(textoDe(ancho80)).not.toContain(RAYA.repeat(49));
  });

  it('trunca los nombres de producto largos en lugar de romper la maquetación', async () => {
    const pedido = pedidoDePrueba();
    pedido.order.items = [
      {
        productName: 'Pizza gigante con absolutamente todos los ingredientes de la carta y alguno mas',
        quantity: 1,
        unitPrice: 30,
        subtotal: 30,
      },
    ];

    const texto = textoDe(await generateEscPosBuffer(pedido));

    expect(texto).toContain('...');
    for (const linea of texto.split('\n')) {
      // Se ignoran las líneas con datos binarios de imagen (logo y QR)
      if (/^[\x20-\x7E]*$/.test(linea)) expect(linea.length).toBeLessThanOrEqual(48);
    }
  });

  it('sigue generando el ticket aunque el logo no se pueda descargar', async () => {
    const pedido = pedidoDePrueba();
    pedido.business.logoUrl = 'https://dominio-que-no-existe.invalid/logo.png';

    const buffer = await generateEscPosBuffer(pedido);

    // El logo es prescindible; el ticket no
    expect(textoDe(buffer)).toContain('PIZZERIA BELLA ITALIA');
    expect(textoDe(buffer)).toContain('TOTAL:');
  });

  it('incluye la URL de seguimiento en texto además del QR', async () => {
    const texto = textoDe(await generateEscPosBuffer(pedidoDePrueba()));
    expect(texto).toContain('SEGUIMIENTO DE PEDIDO');
    expect(texto).toContain('olyda.app/tracking');
  });

  it('termina con el comando de corte de papel', async () => {
    const buffer = await generateEscPosBuffer(pedidoDePrueba());
    const cola = Buffer.from(buffer.slice(-8));
    // GS V = 0x1D 0x56, corte de papel
    expect(cola.includes(Buffer.from([0x1d, 0x56]))).toBe(true);
  });
});
