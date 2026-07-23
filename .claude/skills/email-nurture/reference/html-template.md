# HTML Template — GHL Email Compatible

Base HTML para emails de nurturing en Go High Level. Estructura de tablas con inline styles.
Compatible con Gmail, Outlook, Apple Mail, Yahoo Mail, y el Code Editor de GHL.

---

## Instrucciones de uso

1. Copiar la plantilla base correspondiente al tipo de email
2. Reemplazar todos los `{PLACEHOLDER}` con el contenido generado
3. Verificar que los placeholders GHL (`{{contact.first_name}}`, etc.) estén intactos
4. Pegar el HTML resultante en: Marketing > Emails > Templates > Code Editor

---

## Plantilla Base — Email de Texto (uso general)

Para SOS, Seinfeld, Insight, Mito, Error Común, Behind-the-Scenes, Q&A, Testimonio, Newsletter.

```html
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="es">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="format-detection" content="telephone=no" />
  <title>{EMAIL_TITLE}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    /* Fallback styles for clients that support <style> */
    body { margin: 0; padding: 0; background-color: #f4f4f4; }
    img { border: 0; display: block; }
    a { color: {ACCENT_COLOR}; text-decoration: underline; }
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .email-body-cell { padding: 24px 20px !important; }
      .cta-button { width: 100% !important; text-align: center !important; }
      .footer-cell { padding: 20px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">

  <!-- Preheader text (hidden, shows in inbox preview) -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: #f4f4f4;">
    {PREHEADER_TEXT}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <!-- Outer wrapper table -->
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f4f4;">
    <tr>
      <td align="center" style="padding: 24px 0;">

        <!-- Email container: 600px max -->
        <table class="email-container" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">

          <!-- ==================== HEADER ==================== -->
          <tr>
            <td align="center" style="background-color: {BRAND_COLOR_PRIMARY}; padding: 20px 40px;">
              <!-- Option A: Logo image -->
              <!-- <img src="{LOGO_URL}" alt="{COMPANY_NAME}" width="120" style="display: block; border: 0;" /> -->
              <!-- Option B: Text logo (use when no image available) -->
              <p style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 20px; font-weight: normal; color: {BRAND_COLOR_ON_PRIMARY}; letter-spacing: 1px; text-transform: uppercase;">
                {COMPANY_NAME}
              </p>
            </td>
          </tr>

          <!-- ==================== BODY ==================== -->
          <tr>
            <td class="email-body-cell" style="padding: 40px 48px; font-family: Georgia, 'Times New Roman', serif; font-size: 17px; line-height: 1.75; color: #2d2d2d;">

              <!-- Greeting -->
              <p style="margin: 0 0 24px 0; font-size: 17px; line-height: 1.75; color: #2d2d2d;">
                Hola {{contact.first_name}},
              </p>

              <!-- Body copy blocks -->
              <!-- Each paragraph is a separate <p> tag. Never merge paragraphs. -->

              {BODY_PARAGRAPH_1}

              {BODY_PARAGRAPH_2}

              {BODY_PARAGRAPH_3}

              <!-- [Add more paragraphs as needed using the <p> snippet below] -->

              <!-- ==================== CTA BUTTON (optional) ==================== -->
              <!-- Remove this block entirely if email type has no CTA -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 32px 0;">
                <tr>
                  <td align="center">
                    <table border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td class="cta-button" align="center" bgcolor="{ACCENT_COLOR}" style="border-radius: 4px; background-color: {ACCENT_COLOR};">
                          <a href="{CTA_URL}" target="_blank" style="display: inline-block; font-family: Arial, Helvetica, sans-serif; font-size: 15px; font-weight: bold; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 4px; background-color: {ACCENT_COLOR}; mso-padding-alt: 14px 32px;">
                            {CTA_TEXT}
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <!-- END CTA BUTTON -->

              <!-- Signature -->
              <p style="margin: 32px 0 0 0; font-size: 17px; line-height: 1.75; color: #2d2d2d;">
                {SIGNATURE_CLOSING},<br />
                {SENDER_NAME}
              </p>
              <p style="margin: 4px 0 0 0; font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.5; color: #888888;">
                {SENDER_TITLE} · {COMPANY_NAME}
              </p>

              <!-- P.D. (optional — use in SOS emails) -->
              <!-- Remove if not needed -->
              <p style="margin: 28px 0 0 0; font-size: 15px; line-height: 1.7; color: #555555; font-style: italic; border-top: 1px solid #eeeeee; padding-top: 20px;">
                <strong>P.D.</strong> {PD_TEXT}
              </p>
              <!-- END P.D. -->

            </td>
          </tr>

          <!-- ==================== OPTIONAL IMAGE BLOCK ==================== -->
          <!-- Insert between body paragraphs when email type calls for an image -->
          <!-- Position: after 2nd paragraph, before CTA, or as email opener -->
          <!--
          <tr>
            <td style="padding: 0 0 24px 0;">
              <img src="{IMAGE_URL}" alt="{IMAGE_ALT_TEXT}" width="600" style="display: block; width: 100%; max-width: 600px; border: 0;" />
              <p style="margin: 12px 48px 0; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.5; color: #aaaaaa; text-align: center;">
                {IMAGE_CAPTION}
              </p>
            </td>
          </tr>
          -->
          <!-- END OPTIONAL IMAGE BLOCK -->

          <!-- ==================== FOOTER ==================== -->
          <tr>
            <td class="footer-cell" style="background-color: #f9f9f9; padding: 24px 48px; border-top: 1px solid #eeeeee;">
              <p style="margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.6; color: #aaaaaa; text-align: center;">
                {COMPANY_NAME} · {COMPANY_ADDRESS}<br />
                Estás recibiendo este email porque dejaste tus datos en <a href="{OPTIN_URL}" style="color: #aaaaaa; text-decoration: underline;">{OPTIN_SOURCE}</a>.
              </p>
              <p style="margin: 12px 0 0 0; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.6; color: #aaaaaa; text-align: center;">
                <a href="{{unsubscribe_link}}" style="color: #aaaaaa; text-decoration: underline;">Darme de baja</a>
              </p>
            </td>
          </tr>

        </table>
        <!-- END Email container -->

      </td>
    </tr>
  </table>
  <!-- END Outer wrapper -->

</body>
</html>
```

---

## Snippets reutilizables

### Párrafo de cuerpo estándar

```html
<p style="margin: 0 0 20px 0; font-size: 17px; line-height: 1.75; color: #2d2d2d;">
  {PARAGRAPH_TEXT}
</p>
```

### Párrafo de énfasis (una idea importante)

```html
<p style="margin: 0 0 20px 0; font-size: 17px; line-height: 1.75; color: #2d2d2d; border-left: 3px solid {ACCENT_COLOR}; padding-left: 16px;">
  {EMPHASIS_TEXT}
</p>
```

### Lista con bullets (para checklists o puntos clave)

```html
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 20px 0;">
  <tr>
    <td style="font-family: Georgia, 'Times New Roman', serif; font-size: 17px; line-height: 1.75; color: #2d2d2d;">
      <ul style="margin: 0; padding-left: 24px;">
        <li style="margin-bottom: 8px;">{ITEM_1}</li>
        <li style="margin-bottom: 8px;">{ITEM_2}</li>
        <li style="margin-bottom: 8px;">{ITEM_3}</li>
      </ul>
    </td>
  </tr>
</table>
```

### Separador visual

```html
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 28px 0;">
  <tr>
    <td style="border-top: 1px solid #eeeeee; font-size: 0; line-height: 0;">&nbsp;</td>
  </tr>
</table>
```

### Bloque de dato destacado (para Mini-Caso Financiero)

```html
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0; background-color: #f8f8f8; border-radius: 4px;">
  <tr>
    <td style="padding: 20px 24px; font-family: Arial, Helvetica, sans-serif;">
      <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: bold; color: #aaaaaa; text-transform: uppercase; letter-spacing: 1px;">
        {DATA_LABEL}
      </p>
      <p style="margin: 0; font-size: 28px; font-weight: bold; color: {ACCENT_COLOR}; line-height: 1.2;">
        {DATA_VALUE}
      </p>
      <p style="margin: 4px 0 0 0; font-size: 13px; color: #888888; line-height: 1.5;">
        {DATA_DESCRIPTION}
      </p>
    </td>
  </tr>
</table>
```

---

## Plantilla 9-Word Email (minimalista)

Para el win-back de Dean Jackson. Sin estructura de marketing.

```html
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="es">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Re:</title>
  <style type="text/css">
    body { margin: 0; padding: 0; background-color: #ffffff; }
    @media only screen and (max-width: 600px) {
      .plain-cell { padding: 24px 20px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff;">

  <table border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td class="plain-cell" style="padding: 40px 48px; font-family: Georgia, 'Times New Roman', serif; font-size: 17px; line-height: 1.75; color: #2d2d2d;">

        <p style="margin: 0 0 24px 0;">
          ¿Todavía estás interesado/a en {WHAT_THEY_WANTED}?
        </p>

        <p style="margin: 0; font-size: 17px; color: #2d2d2d;">
          — {SENDER_FIRST_NAME}
        </p>

        <!-- Minimal footer -->
        <p style="margin: 48px 0 0 0; font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #cccccc;">
          <a href="{{unsubscribe_link}}" style="color: #cccccc; text-decoration: underline;">Darme de baja</a>
        </p>

      </td>
    </tr>
  </table>

</body>
</html>
```

---

## Plantilla Email de Breakup

Similar al 9-Word pero con algo más de texto. Sin header, sin logo, sin tabla de marketing.

```html
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="es">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Antes de cerrar esto...</title>
  <style type="text/css">
    body { margin: 0; padding: 0; background-color: #ffffff; }
    @media only screen and (max-width: 600px) {
      .plain-cell { padding: 24px 20px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff;">

  <table border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td class="plain-cell" style="padding: 40px 48px; font-family: Georgia, 'Times New Roman', serif; font-size: 17px; line-height: 1.75; color: #2d2d2d; max-width: 560px;">

        <p style="margin: 0 0 20px 0;">
          Hola {{contact.first_name}},
        </p>

        {BREAKUP_BODY_PARAGRAPH_1}

        {BREAKUP_BODY_PARAGRAPH_2}

        {BREAKUP_INSTRUCTION_PARAGRAPH}

        <p style="margin: 0; color: #2d2d2d;">
          {SENDER_FIRST_NAME}
        </p>

        {OPTIONAL_PD}

        <!-- Minimal footer -->
        <p style="margin: 48px 0 0 0; font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #cccccc;">
          <a href="{{unsubscribe_link}}" style="color: #cccccc; text-decoration: underline;">Darme de baja</a>
        </p>

      </td>
    </tr>
  </table>

</body>
</html>
```

---

## Variables de color por defecto

Usar cuando no hay brand context definido:

| Variable | Valor por defecto | Descripción |
|----------|------------------|-------------|
| `{BRAND_COLOR_PRIMARY}` | `#1a3a5c` | Header background — azul oscuro corporativo |
| `{BRAND_COLOR_ON_PRIMARY}` | `#ffffff` | Texto sobre el header |
| `{ACCENT_COLOR}` | `#c8943f` | Botón CTA — dorado/cobre (tipico premium real estate) |
| Body background | `#f4f4f4` | Gris muy claro |
| Email background | `#ffffff` | Blanco |
| Body text | `#2d2d2d` | Gris casi negro (más suave que negro puro) |

Si el cliente tiene colores de marca definidos en `context/brand-colours/palette.md`, usar esos en lugar de estos defaults.

---

## Fuentes y tipografía

- **Body email:** `Georgia, 'Times New Roman', serif` — Serif clásico para cuerpo de email. Legible, cálido, no genérico. Perfecto para nurturing narrativo.
- **UI elements (botón, footer, labels):** `Arial, Helvetica, sans-serif` — Sans-serif limpio para elementos funcionales.
- **Font-size body:** `17px` — Tamaño cómodo para lectura en mobile. No bajar de 16px.
- **Line-height body:** `1.75` — Generoso. Emails con párrafos apretados se sienten densos y se abandonan.

---

## Checklist de compatibilidad antes de generar

Antes de entregar el HTML final, verificar:

- [ ] Todos los estilos están inline en cada elemento
- [ ] No hay divs usados para layout (solo para el preheader hidden)
- [ ] El botón CTA usa tabla anidada (funciona en Outlook)
- [ ] `width="600"` en la tabla contenedora
- [ ] `{{unsubscribe_link}}` presente en el footer
- [ ] Imágenes tienen `alt` text descriptivo
- [ ] Preheader text presente y no supera 90 caracteres
- [ ] No hay JavaScript
- [ ] No hay iframes
- [ ] Placeholders de GHL con doble corchetes: `{{contact.first_name}}`
- [ ] Comentario de metadata al inicio del `<body>`
