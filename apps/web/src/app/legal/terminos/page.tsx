import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Términos del servicio — Olyda',
  robots: { index: false },
};

const seccion: React.CSSProperties = { marginBottom: '1.75rem' };
const h2: React.CSSProperties = { fontSize: '1.0625rem', fontWeight: 700, marginBottom: '0.5rem' };
const p: React.CSSProperties = { fontSize: '0.9375rem', lineHeight: 1.7, color: 'hsl(var(--muted))', marginBottom: '0.75rem' };

export default function TerminosDelServicio() {
  return (
    <article>
      <h1 style={{ fontSize: '1.625rem', fontWeight: 800, marginBottom: '1.5rem' }}>Términos del servicio</h1>

      <section style={seccion}>
        <h2 style={h2}>Qué es Olyda y qué no es</h2>
        <p style={p}>
          Olyda es la plataforma que un local usa para gestionar sus pedidos. Cuando haces un pedido,{' '}
          <strong>el contrato es entre tú y el local</strong>: es quien prepara la comida, la entrega
          y cobra. Olyda no vende ni entrega comida.
        </p>
      </section>

      <section style={seccion}>
        <h2 style={h2}>Pedidos y pagos</h2>
        <p style={p}>
          Los precios los fija cada local e incluyen los impuestos aplicables. El importe del envío,
          si lo hay, se muestra antes de confirmar. <strong>El pago se realiza en el local o al
          repartidor</strong>: la plataforma no cobra online ni guarda datos de tarjeta.
        </p>
        <p style={p}>
          Un pedido queda confirmado cuando el local lo acepta. El local puede rechazarlo o
          cancelarlo si no puede atenderlo, por ejemplo por falta de existencias o por estar fuera de
          su horario.
        </p>
      </section>

      <section style={seccion}>
        <h2 style={h2}>Cancelaciones y reclamaciones</h2>
        <p style={p}>
          Cualquier incidencia con un pedido —retraso, error, cancelación o devolución— se resuelve
          directamente con el local, que es la parte contratante.
        </p>
        <p style={p}>
          <strong>[PENDIENTE]</strong> Plazo de cancelación por parte del cliente y política de
          devoluciones. Al tratarse de alimentos preparados, conviene revisar cómo aplica el derecho
          de desistimiento de la normativa de consumo.
        </p>
      </section>

      <section style={seccion}>
        <h2 style={h2}>Tu cuenta</h2>
        <p style={p}>
          Tu cuenta es de un local concreto: si pides en otro, tendrás que registrarte allí. Eres
          responsable de mantener tu contraseña a salvo y de que los datos que facilitas, en
          particular la dirección de entrega, sean correctos.
        </p>
      </section>

      <section style={seccion}>
        <h2 style={h2}>Disponibilidad</h2>
        <p style={p}>
          El servicio se presta tal cual y puede interrumpirse por mantenimiento o por causas
          ajenas. Un local solo acepta pedidos mientras tiene el servicio abierto.
        </p>
      </section>

      <section style={seccion}>
        <h2 style={h2}>Ley aplicable</h2>
        <p style={p}>
          <strong>[PENDIENTE]</strong> Legislación aplicable, fuero y mecanismos de resolución de
          conflictos de consumo.
        </p>
      </section>
    </article>
  );
}
