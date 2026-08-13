import Link from 'next/link';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', background: 'hsl(var(--bg))', padding: '2rem 1.25rem' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/*
          AVISO DELIBERADAMENTE VISIBLE.

          Estos textos son un borrador de trabajo, no un documento con validez legal.
          Olyda trata datos personales de los clientes finales de sus locales, lo que
          convierte a la plataforma en encargada del tratamiento: eso exige textos
          revisados por un profesional y un contrato con cada local.

          Publicar una política inventada es peor que no tener ninguna, porque aparenta un
          cumplimiento que no existe. El aviso se queda hasta que un abogado valide el
          contenido.
        */}
        <div
          style={{
            border: '1px solid hsl(38 92% 50% / 0.4)',
            background: 'hsl(38 92% 50% / 0.12)',
            borderRadius: 'var(--radius)',
            padding: '1rem 1.125rem',
            marginBottom: '2rem',
            fontSize: '0.875rem',
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: 'hsl(38 92% 60%)' }}>Borrador pendiente de revisión jurídica.</strong>{' '}
          Este texto recoge la estructura y los hechos de cómo funciona el servicio, para
          servir de punto de partida a un profesional. <strong>No tiene validez legal</strong>{' '}
          mientras no lo revise un abogado.
        </div>

        {children}

        <div style={{ marginTop: '3rem', paddingTop: '1.5rem', borderTop: '1px solid hsl(var(--border))', fontSize: '0.8125rem' }}>
          <Link href="/legal/privacidad" style={{ color: 'hsl(var(--primary))', marginRight: '1.25rem' }}>
            Política de privacidad
          </Link>
          <Link href="/legal/terminos" style={{ color: 'hsl(var(--primary))' }}>
            Términos del servicio
          </Link>
        </div>
      </div>
    </div>
  );
}
