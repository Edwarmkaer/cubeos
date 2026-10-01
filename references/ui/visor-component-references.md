# Referencias aprobadas — baterías y Cámara

Fecha: 2026-09-06

## Baterías

- Referencia aprobada: [Magic UI — Animated Circular Progress Bar](https://magicui.design/docs/components/animated-circular-progress-bar).
- Se conserva: aro de progreso, transición del valor y lectura central.
- Se adapta: aro de 80px con apertura visible como la referencia, dos pozos lado a lado, tokens Pozo y estado indeterminado cuando todavía no existe voltaje.
- No se calcula un porcentaje hasta definir los rangos nominales de D-007.

## Cámara

- Referencia aprobada: [React Bits — Circular Gallery](https://reactbits.dev/components/circular-gallery).
- Se conserva: banda horizontal, sensación de arco, arrastre/scroll y foco central.
- Se adapta: curvatura mínima y scroll DOM accesible en lugar de un segundo canvas WebGL. Con tres capturas o menos ocupa el ancho sin scroll; al superar esa cantidad activa la banda desplazable.
- La superficie no muestra scrollbar, instrucciones persistentes, títulos ni metadatos sobre las imágenes.
- Las capturas actuales son demostrativas y están marcadas como `DEMO`; no son telemetría recibida.
