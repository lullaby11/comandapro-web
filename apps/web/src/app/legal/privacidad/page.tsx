import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Política de privacidad — Olyda',
  robots: { index: false },
};

const seccion: React.CSSProperties = { marginBottom: '1.75rem' };
const h2: React.CSSProperties = { fontSize: '1.0625rem', fontWeight: 700, marginBottom: '0.5rem' };
const p: React.CSSProperties = { fontSize: '0.9375rem', lineHeight: 1.7, color: 'hsl(var(--muted))', marginBottom: '0.75rem' };

/**
 * Borrador. Describe con exactitud QUÉ hace el sistema con los datos —que es lo que un
 * abogado no puede saber sin leer el código— y deja marcado con [PENDIENTE] lo que
 * requiere una decisión jurídica o de negocio.
 */
export default function PoliticaPrivacidad() {
  return (
    <article>
      <h1 style={{ fontSize: '1.625rem', fontWeight: 800, marginBottom: '1.5rem' }}>Política de privacidad</h1>

      <section style={seccion}>
        <h2 style={h2}>Quién trata tus datos</h2>
        <p style={p}>
          El local en el que haces tu pedido es el <strong>responsable del tratamiento</strong> de tus
          datos. Olyda es la plataforma que ese local usa para gestionar sus pedidos y actúa como{' '}
          <strong>encargada del tratamiento</strong>: trata tus datos únicamente siguiendo las
          instrucciones del local.
        </p>
        <p style={p}>
          <strong>[PENDIENTE]</strong> Razón social, NIF y dirección postal del titular de Olyda.
          Datos de contacto del delegado de protección de datos, si procede.
        </p>
      </section>

      <section style={seccion}>
        <h2 style={h2}>Qué datos se recogen</h2>
        <p style={p}>
          Al crear una cuenta en la tienda de un local: <strong>nombre, teléfono, correo
          electrónico, dirección de entrega</strong> y una contraseña, que se guarda cifrada y nunca
          en claro.
        </p>
        <p style={p}>
          Al hacer un pedido: los productos, importes, forma de pago elegida, la dirección de
          entrega y las notas que escribas. La forma de pago es informativa —el cobro se hace en el
          local o al repartidor— y <strong>no se guardan datos bancarios ni de tarjeta</strong>.
        </p>
      </section>

      <section style={seccion}>
        <h2 style={h2}>Para qué se usan</h2>
        <p style={p}>
          Para gestionar y entregar tus pedidos, permitirte seguir su estado y comunicarnos contigo
          sobre ellos. No se usan para publicidad ni se ceden a terceros con fines comerciales.
        </p>
        <p style={p}>
          La base legal es la <strong>ejecución del contrato</strong> —tu pedido— y, para la creación
          de la cuenta, tu <strong>consentimiento</strong>, que se registra con la fecha en que lo
          das.
        </p>
      </section>

      <section style={seccion}>
        <h2 style={h2}>Con quién se comparten</h2>
        <p style={p}>
          Con el local en el que pides, que es quien prepara y entrega tu pedido. Además, la
          infraestructura se aloja en <strong>Amazon Web Services (Irlanda y Francia)</strong>, dentro
          de la Unión Europea, y los correos se envían mediante Amazon SES.
        </p>
      </section>

      <section style={seccion}>
        <h2 style={h2}>Enlace de seguimiento</h2>
        <p style={p}>
          Cada pedido genera un enlace de seguimiento que aparece en el ticket y en el correo de
          confirmación. Quien tenga ese enlace puede ver el estado del pedido, su contenido y la
          dirección de entrega, sin necesidad de contraseña. <strong>El enlace caduca a los 30
          días</strong> desde que se hizo el pedido.
        </p>
      </section>

      <section style={seccion}>
        <h2 style={h2}>Cuánto tiempo se conservan</h2>
        <p style={p}>
          Los datos de tu cuenta, mientras la mantengas activa. Los pedidos se conservan durante el
          plazo que exige la normativa contable y fiscal, aunque ejerzas tu derecho de supresión: en
          ese caso <strong>se eliminan los datos que te identifican</strong> —nombre, teléfono,
          correo, dirección y notas— y el pedido queda únicamente con sus importes y productos.
        </p>
      </section>

      <section style={seccion}>
        <h2 style={h2}>Tus derechos</h2>
        <p style={p}>
          Puedes solicitar acceso, rectificación, supresión, limitación, oposición y portabilidad de
          tus datos dirigiéndote al local en el que hiciste el pedido, que es el responsable. También
          puedes reclamar ante la Agencia Española de Protección de Datos.
        </p>
        <p style={p}>
          <strong>[PENDIENTE]</strong> Canal de contacto para ejercer estos derechos y plazo de
          respuesta comprometido.
        </p>
      </section>

      <section style={seccion}>
        <h2 style={h2}>Cookies</h2>
        <p style={p}>
          La tienda no usa cookies de seguimiento ni de publicidad. Para mantener tu sesión iniciada
          se guarda un identificador en el almacenamiento local de tu navegador, que se borra al
          cerrar sesión.
        </p>
      </section>
    </article>
  );
}
