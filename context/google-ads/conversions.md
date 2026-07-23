# Conversion Actions - Agrícola Cachapoal Spa

## Summary
- **15 conversion actions** registradas en la cuenta (all-time totals)
- **4 marcadas como primary_for_goal** (cuentan hacia el goal de bidding)
- Importadas vía **GoHighLevel (GHL)** + tracking nativo Google Ads

## Primary Conversions (impactan bidding)

| Acción | Status | Type | All-time Conv | Notas |
|--------|:------:|:----:|--------------:|-------|
| **GHL - Envío de Formulario (Browser)** | ENABLED | LEAD | 467 | Primary del goal. Lead form submission. |
| **Formulario Clientes potenciales** | DELETED | LEAD | 0 | Acción anterior deprecada. |
| YouTube channel subscriptions | ENABLED | YOUTUBE | 0 | Sin uso. |
| YouTube follow-on views | ENABLED | YOUTUBE | 14 | Bajo volumen. |

## Secondary Conversions (tracking, no bidding)

| Acción | Status | All-time Conv | Categoría |
|--------|:------:|--------------:|-----------|
| GHL - Form Start | ENABLED | 488 | Micro-conv (form abierto) |
| GHL - Envío de Encuesta | ENABLED | 419 | Survey enviada |
| GHL Lead Precalificado | ENABLED | 59 | Lead calificado |
| GHL - Lead Compra Terreno | ENABLED | 43 | Compra/oportunidad |
| GHL - Agendamiento de Visita a terreno | ENABLED | 32 | Visita agendada |
| GHL - Lead Calificado (Coopeuch) | ENABLED | 8 | Segmento Coopeuch |
| GHL - Lead Asiste a Visita | ENABLED | 7 | Visita confirmada |
| GHL - Reserva | ENABLED | 0 | Reserva (paso post-visita) |
| GHL - Promesa | ENABLED | 0 | Promesa de compra |
| GHL - Encuesta Enviada (Browser) | DELETED | 0 | Reemplazada |
| Agricola Cachapoal (web) purchase | UNVERIFIED | 0 | Tracking web purchase no verificado |

## Funnel mapeado (all-time approx.)

```
Form Start         488
  → Form Submit    467  (96% complete-rate)
    → Precalificado 59  (13% qualification rate)
      → Agendamiento 32  (54%)
        → Asistencia   7  (22%)
          → Compra    43  (¿desfase de orden? — revisar atribución)
```

*Hay un desorden entre "Compra Terreno" (43) y los pasos previos (Visita asiste = 7).* Probablemente "Compra Terreno" se cuenta en momento previo a "Asiste a Visita" (e.g., al firmar Carta de Intención), o las conversiones cuentan rutas distintas. Revisar definición en GHL/Google Ads.

## Insights

- **Primary goal correcto** = `GHL - Envío de Formulario (Browser)`. El bidding optimiza a esta acción.
- **Disparidad de 16 conv (30d) vs 467 all-time:** las conv del último mes son ~3.4% del total histórico — consistente con campaña activa hace varios meses.
- **2 acciones REMOVED/DELETED** (`Formulario Clientes potenciales`, `GHL - Encuesta Enviada (Browser)`) — limpieza ok.
- **`Agricola Cachapoal (web) purchase` está UNVERIFIED** — investigar si se intentó implementar y quedó incompleta. Si no se usa, archivar.
- **Reserva y Promesa = 0** — no hay tracking del fondo del embudo todavía. Configurar webhook de GHL → Google Ads cuando se firme una reserva.
- **Coopeuch como segmento separado** (8 conv) — confirmar si es un partner/financiamiento específico que merece campaña dedicada.

---
*Last updated: 2026-05-14*
*All-time totals (no segmentación temporal en conversion_action)*
