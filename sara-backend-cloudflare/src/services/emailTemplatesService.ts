// ═══════════════════════════════════════════════════════════════════════════
// EMAIL TEMPLATES SERVICE - Plantillas HTML para emails del funnel de ventas
// ═══════════════════════════════════════════════════════════════════════════
// Genera emails HTML responsive con branding Grupo Santa Rita.
// Usa inline CSS para compatibilidad con clientes de email.
// ═══════════════════════════════════════════════════════════════════════════

import { sendEmail } from './emailService';
import { Env } from '../types/env';

// ─── Constants ──────────────────────────────────────────────────────────

const PRIMARY = '#1a365d';
const ACCENT = '#c53030';
const BG = '#f7fafc';
const TEXT_DARK = '#2d3748';
const TEXT_MUTED = '#718096';
const BORDER = '#e2e8f0';
const WHITE = '#ffffff';
const WHATSAPP_GREEN = '#25d366';
const WHATSAPP_NUMBER = '5214923860066';
const FROM_EMAIL = 'SARA <no-reply@gruposantarita.com>';

// ─── Base Layout ────────────────────────────────────────────────────────

function wrapInLayout(bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Grupo Santa Rita</title>
</head>
<body style="margin:0;padding:0;background-color:${BG};font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${BG};">
<tr><td align="center" style="padding:20px 10px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:${WHITE};border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

<!-- Header -->
<tr>
<td style="background-color:${PRIMARY};padding:24px 32px;text-align:center;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr>
<td style="font-size:22px;font-weight:bold;color:${WHITE};letter-spacing:1px;text-align:center;">
GRUPO SANTA RITA
</td>
</tr>
<tr>
<td style="font-size:12px;color:rgba(255,255,255,0.7);text-align:center;padding-top:4px;letter-spacing:0.5px;">
Construyendo hogares desde 1970
</td>
</tr>
</table>
</td>
</tr>

<!-- Body -->
<tr>
<td style="padding:32px;">
${bodyContent}
</td>
</tr>

<!-- WhatsApp CTA -->
<tr>
<td style="padding:0 32px 24px 32px;text-align:center;">
<a href="https://wa.me/${WHATSAPP_NUMBER}" target="_blank" style="display:inline-block;background-color:${WHATSAPP_GREEN};color:${WHITE};text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:bold;">
&#9993; Escr&iacute;benos por WhatsApp
</a>
</td>
</tr>

<!-- Footer -->
<tr>
<td style="background-color:${BG};padding:20px 32px;border-top:1px solid ${BORDER};text-align:center;">
<p style="margin:0;font-size:13px;color:${TEXT_MUTED};line-height:1.5;">
Grupo Santa Rita &mdash; 50+ a&ntilde;os construyendo hogares en Zacatecas
</p>
<p style="margin:8px 0 0 0;font-size:11px;color:${TEXT_MUTED};">
Este email fue enviado por SARA, tu asistente inmobiliaria.
</p>
</td>
</tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ─── Reusable Components ────────────────────────────────────────────────

function heading(text: string): string {
  return `<h1 style="margin:0 0 16px 0;font-size:22px;color:${PRIMARY};font-weight:bold;line-height:1.3;">${text}</h1>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 14px 0;font-size:15px;color:${TEXT_DARK};line-height:1.6;">${text}</p>`;
}

function divider(): string {
  return `<hr style="border:none;border-top:1px solid ${BORDER};margin:20px 0;">`;
}

function infoRow(label: string, value: string): string {
  return `<tr>
<td style="padding:8px 12px;font-size:14px;color:${TEXT_MUTED};font-weight:bold;border-bottom:1px solid ${BORDER};width:40%;">${label}</td>
<td style="padding:8px 12px;font-size:14px;color:${TEXT_DARK};border-bottom:1px solid ${BORDER};">${value}</td>
</tr>`;
}

function infoTable(rows: Array<{ label: string; value: string }>): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:16px 0;border:1px solid ${BORDER};border-radius:6px;overflow:hidden;">
${rows.map(r => infoRow(r.label, r.value)).join('\n')}
</table>`;
}

function ctaButton(text: string, url: string, color: string = ACCENT): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
<tr><td style="border-radius:6px;background-color:${color};">
<a href="${url}" target="_blank" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:bold;color:${WHITE};text-decoration:none;border-radius:6px;">${text}</a>
</td></tr>
</table>`;
}

function vendedorBlock(name: string, phone: string): string {
  return `${divider()}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr>
<td style="font-size:14px;color:${TEXT_MUTED};line-height:1.6;">
<strong style="color:${PRIMARY};">Tu asesor:</strong> ${name}<br>
Tel: <a href="tel:${phone}" style="color:${ACCENT};text-decoration:none;">${phone}</a>
</td>
</tr>
</table>`;
}

// ─── Template Interfaces ────────────────────────────────────────────────

export interface BrochureEmailParams {
  leadName: string;
  development: string;
  priceRange: string;
  brochureUrl: string;
  videoUrl?: string;
  gpsUrl?: string;
  vendedorName: string;
  vendedorPhone: string;
}

export interface AppointmentEmailParams {
  leadName: string;
  development: string;
  date: string;
  time: string;
  address: string;
  gpsUrl: string;
  vendedorName: string;
  vendedorPhone: string;
}

export interface PaymentReceiptEmailParams {
  leadName: string;
  property: string;
  amount: string;
  paymentDate: string;
  referenceNumber: string;
  nextSteps: string;
}

export interface DocumentChecklistEmailParams {
  leadName: string;
  requiredDocs: string[];
  receivedDocs: string[];
  vendedorName: string;
  vendedorPhone: string;
}

export interface WelcomeEmailParams {
  leadName: string;
  developments: Array<{ name: string; priceFrom: string; imageUrl?: string }>;
}

// ─── EmailTemplatesService ──────────────────────────────────────────────

export class EmailTemplatesService {

  /**
   * Brochure email with property details and links.
   */
  generateBrochureEmail(params: BrochureEmailParams): { subject: string; html: string } {
    const { leadName, development, priceRange, brochureUrl, videoUrl, gpsUrl, vendedorName, vendedorPhone } = params;

    let body = heading(`&iexcl;Conoce ${development}!`);
    body += paragraph(`Hola ${leadName},`);
    body += paragraph(`Gracias por tu inter&eacute;s en <strong>${development}</strong>. Te compartimos toda la informaci&oacute;n para que conozcas este incre&iacute;ble desarrollo.`);

    body += infoTable([
      { label: 'Desarrollo', value: development },
      { label: 'Rango de precios', value: priceRange },
    ]);

    body += ctaButton('&#128196; Ver Brochure', brochureUrl, PRIMARY);

    if (videoUrl) {
      body += ctaButton('&#9654; Ver Video', videoUrl, ACCENT);
    }

    if (gpsUrl) {
      body += ctaButton('&#128205; Ver Ubicaci&oacute;n', gpsUrl, '#2b6cb0');
    }

    body += paragraph('Si tienes alguna pregunta, no dudes en contactarnos. Estamos para ayudarte a encontrar tu hogar ideal.');
    body += vendedorBlock(vendedorName, vendedorPhone);

    return {
      subject: `${development} — Informaci\u00f3n y brochure para ti, ${leadName}`,
      html: wrapInLayout(body),
    };
  }

  /**
   * Appointment confirmation email.
   */
  generateAppointmentEmail(params: AppointmentEmailParams): { subject: string; html: string } {
    const { leadName, development, date, time, address, gpsUrl, vendedorName, vendedorPhone } = params;

    let body = heading('&#128197; Cita Confirmada');
    body += paragraph(`Hola ${leadName},`);
    body += paragraph(`Tu cita para visitar <strong>${development}</strong> ha sido confirmada. &iexcl;Te esperamos!`);

    body += infoTable([
      { label: 'Desarrollo', value: development },
      { label: 'Fecha', value: date },
      { label: 'Hora', value: time },
      { label: 'Direcci&oacute;n', value: address },
    ]);

    body += ctaButton('&#128205; C&oacute;mo llegar', gpsUrl, '#2b6cb0');

    body += paragraph('<strong>Recomendaciones:</strong>');
    body += `<ul style="margin:0 0 16px 0;padding-left:20px;font-size:14px;color:${TEXT_DARK};line-height:1.8;">
<li>Llega 5 minutos antes de la hora agendada</li>
<li>Trae una identificaci&oacute;n oficial</li>
<li>Si necesitas reagendar, cont&aacute;ctanos con anticipaci&oacute;n</li>
</ul>`;

    body += vendedorBlock(vendedorName, vendedorPhone);

    return {
      subject: `Cita confirmada: ${development} — ${date} a las ${time}`,
      html: wrapInLayout(body),
    };
  }

  /**
   * Payment receipt email.
   */
  generatePaymentReceiptEmail(params: PaymentReceiptEmailParams): { subject: string; html: string } {
    const { leadName, property, amount, paymentDate, referenceNumber, nextSteps } = params;

    let body = heading('&#9989; Comprobante de Pago');
    body += paragraph(`Hola ${leadName},`);
    body += paragraph('Hemos recibido tu pago exitosamente. A continuaci&oacute;n los detalles:');

    body += infoTable([
      { label: 'Propiedad', value: property },
      { label: 'Monto', value: amount },
      { label: 'Fecha de pago', value: paymentDate },
      { label: 'Referencia', value: `<strong>${referenceNumber}</strong>` },
    ]);

    body += divider();
    body += `<div style="background-color:#f0fff4;border-left:4px solid #38a169;padding:14px 16px;border-radius:4px;margin:16px 0;">
<p style="margin:0;font-size:14px;color:#276749;"><strong>Siguientes pasos:</strong></p>
<p style="margin:8px 0 0 0;font-size:14px;color:#2d3748;line-height:1.6;">${nextSteps}</p>
</div>`;

    body += paragraph('Guarda este correo como comprobante. Si tienes dudas sobre tu pago, no dudes en contactarnos.');

    return {
      subject: `Comprobante de pago — ${property} (Ref: ${referenceNumber})`,
      html: wrapInLayout(body),
    };
  }

  /**
   * Document checklist email showing required vs received documents.
   */
  generateDocumentChecklistEmail(params: DocumentChecklistEmailParams): { subject: string; html: string } {
    const { leadName, requiredDocs, receivedDocs, vendedorName, vendedorPhone } = params;

    const receivedSet = new Set(receivedDocs);
    const pendingDocs = requiredDocs.filter(d => !receivedSet.has(d));

    let body = heading('&#128203; Lista de Documentos');
    body += paragraph(`Hola ${leadName},`);
    body += paragraph('Aqu&iacute; tienes el estado actual de tus documentos para el tr&aacute;mite:');

    // Received docs
    if (receivedDocs.length > 0) {
      body += `<p style="margin:16px 0 8px 0;font-size:14px;font-weight:bold;color:#276749;">&#9989; Documentos recibidos (${receivedDocs.length})</p>`;
      body += `<ul style="margin:0 0 16px 0;padding-left:20px;font-size:14px;color:${TEXT_DARK};line-height:1.8;">`;
      for (const doc of receivedDocs) {
        body += `<li style="color:#276749;">${doc}</li>`;
      }
      body += '</ul>';
    }

    // Pending docs
    if (pendingDocs.length > 0) {
      body += `<div style="background-color:#fffbeb;border-left:4px solid #d69e2e;padding:14px 16px;border-radius:4px;margin:16px 0;">
<p style="margin:0;font-size:14px;font-weight:bold;color:#975a16;">&#9888; Documentos pendientes (${pendingDocs.length})</p>
<ul style="margin:8px 0 0 0;padding-left:20px;font-size:14px;color:${TEXT_DARK};line-height:1.8;">`;
      for (const doc of pendingDocs) {
        body += `<li>${doc}</li>`;
      }
      body += '</ul></div>';
    } else {
      body += `<div style="background-color:#f0fff4;border-left:4px solid #38a169;padding:14px 16px;border-radius:4px;margin:16px 0;">
<p style="margin:0;font-size:14px;color:#276749;font-weight:bold;">&#127881; &iexcl;Todos los documentos est&aacute;n completos!</p>
</div>`;
    }

    if (pendingDocs.length > 0) {
      body += paragraph('Env&iacute;a los documentos pendientes por WhatsApp o correo para agilizar tu tr&aacute;mite.');
    }

    body += vendedorBlock(vendedorName, vendedorPhone);

    return {
      subject: pendingDocs.length > 0
        ? `Documentos pendientes (${pendingDocs.length}) — Grupo Santa Rita`
        : `Documentos completos — Grupo Santa Rita`,
      html: wrapInLayout(body),
    };
  }

  /**
   * Welcome email with available developments overview.
   */
  generateWelcomeEmail(params: WelcomeEmailParams): { subject: string; html: string } {
    const { leadName, developments } = params;

    let body = heading(`&iexcl;Bienvenido, ${leadName}!`);
    body += paragraph('Gracias por contactar a <strong>Grupo Santa Rita</strong>. Somos l&iacute;deres en desarrollo inmobiliario en Zacatecas con m&aacute;s de 50 a&ntilde;os de experiencia.');
    body += paragraph('Soy <strong>SARA</strong>, tu asistente inmobiliaria, y estoy aqu&iacute; para ayudarte a encontrar el hogar perfecto para ti y tu familia.');

    body += divider();
    body += `<p style="margin:0 0 16px 0;font-size:16px;color:${PRIMARY};font-weight:bold;">Nuestros desarrollos:</p>`;

    for (const dev of developments) {
      body += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:12px;border:1px solid ${BORDER};border-radius:6px;overflow:hidden;">
<tr>
<td style="padding:16px;">
<p style="margin:0 0 4px 0;font-size:16px;font-weight:bold;color:${PRIMARY};">${dev.name}</p>
<p style="margin:0;font-size:14px;color:${ACCENT};font-weight:bold;">Desde ${dev.priceFrom}</p>
</td>
</tr>
</table>`;
    }

    body += divider();
    body += paragraph('&iquest;Te gustar&iacute;a agendar una visita? Escr&iacute;benos por WhatsApp y con gusto te atendemos.');

    return {
      subject: `\u00a1Bienvenido a Grupo Santa Rita, ${leadName}!`,
      html: wrapInLayout(body),
    };
  }
}

// ─── Send Helper ────────────────────────────────────────────────────────

/**
 * Send an email using a template generated by EmailTemplatesService.
 * Wraps the existing Resend-based sendEmail function.
 */
export async function sendSaraEmail(
  env: Env,
  to: string,
  template: { subject: string; html: string }
): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.error('[emailTemplatesService] RESEND_API_KEY not configured');
    return false;
  }

  const result = await sendEmail(env.RESEND_API_KEY, {
    from: FROM_EMAIL,
    to,
    subject: template.subject,
    html: template.html,
  });

  if (result.error) {
    console.error('[emailTemplatesService] sendSaraEmail failed:', result.error);
    return false;
  }

  console.log(`[emailTemplatesService] Email sent to ${to}, id=${result.id}`);
  return true;
}
