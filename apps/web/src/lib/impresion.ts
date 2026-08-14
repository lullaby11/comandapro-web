// ─── Transporte de impresión ESC/POS ─────────────────────────────────────────
// El buffer ESC/POS lo genera SIEMPRE la API (printer.service.ts). Aquí solo se empuja
// por el transporte que el local tenga configurado. Ver docs/06-impresion.md.
//
// Este fichero existe porque la lógica estaba duplicada en dos páginas y las copias
// habían divergido: la de crear pedido se quedó con `claimInterface(0)` + `transferOut(1)`
// fijos, que falla con cualquier impresora cuyo endpoint no esté en (0, 1), y además
// ignoraba `printerMode`. Una sola implementación para que no vuelva a pasar.

// ─── Diagnóstico ─────────────────────────────────────────────────────────────
// Los problemas de impresora solo se reproducen en el local del cliente, así que el
// registro detallado se activa desde la consola del propio equipo, sin redesplegar:
//   localStorage.setItem('debugPrint', '1')
export function printLog(...args: unknown[]) {
  if (typeof window !== 'undefined' && localStorage.getItem('debugPrint') === '1') {
    console.log('[Print]', ...args);
  }
}

// ─── WebUSB ──────────────────────────────────────────────────────────────────

type Candidato = {
  interfaceNumber: number;
  altSetting: number;
  endpointNumber: number;
  claseImpresora: boolean;
};

/**
 * Recorre la configuración del dispositivo y devuelve todos los endpoints BULK OUT
 * reales, con los de clase impresora (0x07) primero.
 *
 * No se inventan combinaciones: un endpoint que no está en el descriptor no existe, y
 * escribir en él solo produce «The specified endpoint is not part of a claimed and
 * selected alternate interface», que además tapaba el error verdadero al ser el último
 * candidato probado.
 */
function descubrirCandidatos(device: USBDevice): Candidato[] {
  const candidatos: Candidato[] = [];

  for (const iface of device.configuration?.interfaces ?? []) {
    for (const alt of iface.alternates) {
      for (const ep of alt.endpoints) {
        if (ep.type === 'bulk' && ep.direction === 'out') {
          candidatos.push({
            interfaceNumber: iface.interfaceNumber,
            altSetting:      alt.alternateSetting,
            endpointNumber:  ep.endpointNumber,
            claseImpresora:  alt.interfaceClass === 0x07,
          });
        }
      }
    }
  }

  // Las de clase impresora primero; dentro de cada grupo, el alternate por defecto antes
  // que los demás, que suelen ser modos especiales del fabricante.
  return candidatos.sort((a, b) =>
    Number(b.claseImpresora) - Number(a.claseImpresora) || a.altSetting - b.altSetting);
}

export async function imprimirPorWebUSB(buffer: Uint8Array) {
  if (!navigator.usb) throw new Error('WebUSB no soportado. Usa Chrome o Edge.');

  const device = await navigator.usb.requestDevice({
    filters: [{ classCode: 0x07 }, { classCode: 0xFF }],
  });
  await device.open();

  try {
    if (device.configuration === null) await device.selectConfiguration(1);

    const candidatos = descubrirCandidatos(device);
    printLog('WebUSB — dispositivo', {
      vendorId: device.vendorId, productId: device.productId, producto: device.productName,
    });
    printLog('WebUSB — candidatos:', candidatos);

    if (candidatos.length === 0) {
      throw new Error(
        'La impresora no expone ningún canal de datos compatible (endpoint BULK OUT). ' +
        'Comprueba que está en modo impresora y no en modo báscula o pantalla.');
    }

    const errores: string[] = [];

    for (const c of candidatos) {
      const etiqueta = `iface=${c.interfaceNumber} alt=${c.altSetting} ep=${c.endpointNumber}`;
      let reclamada = false;
      try {
        printLog(`WebUSB — probando ${etiqueta}...`);
        await device.claimInterface(c.interfaceNumber);
        reclamada = true;

        // Solo hace falta si el alternate no es el activo por defecto. Antes se llamaba
        // siempre y el fallo se descartaba en silencio, con lo que se podía acabar
        // escribiendo en un endpoint del alternate equivocado — justamente el error que
        // este módulo viene a resolver. Si el alternate no se puede seleccionar, el
        // candidato no vale.
        if (c.altSetting !== 0) {
          await device.selectAlternateInterface(c.interfaceNumber, c.altSetting);
        }

        const resultado = await device.transferOut(c.endpointNumber, buffer);

        // transferOut NO lanza cuando el endpoint rechaza los datos: devuelve status
        // 'stall'. Sin esta comprobación se daba el pedido por impreso sin que saliera.
        if (resultado.status !== 'ok') {
          await device.clearHalt('out', c.endpointNumber).catch(() => {});
          throw new Error(`la impresora rechazó los datos (${resultado.status})`);
        }
        if (resultado.bytesWritten < buffer.length) {
          throw new Error(
            `envío incompleto: ${resultado.bytesWritten} de ${buffer.length} bytes`);
        }

        printLog(`WebUSB — impresión correcta con ${etiqueta}`);
        return;
      } catch (err) {
        // Es normal que fallen varios candidatos antes de dar con el bueno: no es un aviso
        const motivo = err instanceof Error ? err.message : String(err);
        printLog(`WebUSB — falló ${etiqueta}: ${motivo}`);
        errores.push(`${etiqueta}: ${motivo}`);
        if (reclamada) await device.releaseInterface(c.interfaceNumber).catch(() => {});
      }
    }

    // El sistema operativo se queda la interfaz con su propio driver de impresora, y
    // entonces fallan TODOS los candidatos con el mismo motivo. Merece un mensaje propio
    // porque la solución no está en la aplicación.
    if (errores.every((e) => /claim|access|denied|busy/i.test(e))) {
      throw new Error(
        'El sistema operativo tiene la impresora ocupada. Quítala de la lista de ' +
        'impresoras del sistema (o desinstala su driver) y vuelve a intentarlo. ' +
        `Detalle: ${errores[0]}`);
    }

    throw new Error(`No se pudo imprimir. Se probaron ${errores.length} configuraciones — ${errores.join(' · ')}`);
  } finally {
    await device.close().catch(() => {});
  }
}

// ─── Bluetooth ESC/POS ───────────────────────────────────────────────────────
// UUIDs del servicio serie BLE usados por la mayoría de impresoras POS (Bluebee, Xprinter, HPRT…)
const BLE_SERVICE_UUID    = '000018f0-0000-1000-8000-00805f9b34fb';
const BLE_WRITE_CHAR_UUID = '000018f1-0000-1000-8000-00805f9b34fb';
// UUIDs alternativos para impresoras que usan otro perfil serie BLE
const BLE_SERVICE_ALT     = 'e7810a71-73ae-499d-8c15-faa9aef0c3f2';
const BLE_CHAR_ALT        = 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f';

let bleDevice: BluetoothDevice | null = null;
let bleCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

export async function imprimirPorBluetooth(buffer: Uint8Array) {
  if (!('bluetooth' in navigator)) {
    throw new Error('Web Bluetooth no disponible. Usa Chrome en Android o Chrome/Edge en escritorio.');
  }

  // Si no hay dispositivo conectado o se desconectó, abrimos el diálogo de selección
  if (!bleDevice || !bleDevice.gatt?.connected) {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [BLE_SERVICE_UUID] }, { services: [BLE_SERVICE_ALT] }],
      optionalServices: [BLE_SERVICE_UUID, BLE_SERVICE_ALT],
    });

    const server = await device.gatt!.connect();
    device.addEventListener('gattserverdisconnected', () => {
      bleCharacteristic = null;
    });

    // Intentar primero con UUID principal, luego con el alternativo
    let characteristic: BluetoothRemoteGATTCharacteristic | null = null;
    for (const [svcUuid, charUuid] of [
      [BLE_SERVICE_UUID, BLE_WRITE_CHAR_UUID],
      [BLE_SERVICE_ALT,  BLE_CHAR_ALT],
    ]) {
      try {
        const svc = await server.getPrimaryService(svcUuid);
        characteristic = await svc.getCharacteristic(charUuid);
        break;
      } catch {
        // probar siguiente par
      }
    }

    if (!characteristic) {
      throw new Error('No se encontró el servicio de impresión en la impresora Bluetooth. Comprueba que esté encendida y emparejada.');
    }

    bleDevice = device;
    bleCharacteristic = characteristic;
  }

  if (!bleCharacteristic) throw new Error('Impresora Bluetooth desconectada');

  // Enviar el buffer en chunks (el MTU BLE suele ser 512 bytes, usamos 200 por seguridad)
  const CHUNK = 200;
  for (let i = 0; i < buffer.length; i += CHUNK) {
    await bleCharacteristic.writeValueWithoutResponse(buffer.slice(i, i + CHUNK));
    // Pausa mínima para que la impresora procese sin saturar el buffer BLE
    await new Promise<void>((r) => setTimeout(r, 20));
  }
}

// ─── Punto de entrada único ──────────────────────────────────────────────────

/**
 * Empuja el buffer por el transporte configurado en el local.
 *
 * `printserver` no pasa por aquí: el agente que está junto a la impresora recoge los
 * pedidos por su cuenta, así que el navegador no tiene nada que enviar.
 */
export async function imprimirComanda(buffer: Uint8Array, modo: string) {
  printLog(`buffer recibido (${buffer.length} bytes) → ${modo}`);
  if (modo === 'bluetooth') return imprimirPorBluetooth(buffer);
  return imprimirPorWebUSB(buffer);
}
