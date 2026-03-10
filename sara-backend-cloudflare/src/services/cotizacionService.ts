// ═══════════════════════════════════════════════════════════════════════════
// COTIZACIÓN SERVICE - Generate professional HTML quotes for leads
// Generates a hosted HTML page with property details, pricing, and financing
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CotizacionData {
  id: string;
  leadName: string;
  vendedorName: string;
  vendedorPhone: string;
  propertyName: string;
  development: string;
  price: number;
  discount?: number;
  discountPercent?: number;
  finalPrice: number;
  downPayment?: number;
  downPaymentPercent?: number;
  monthlyPayment?: number;
  term?: number;
  bankName?: string;
  annualRate?: number;
  propertyDetails?: {
    bedrooms?: number;
    bathrooms?: number;
    area_m2?: number;
    parking?: number;
    amenities?: string[];
  };
  imageUrl?: string;
  gpsUrl?: string;
  validUntil: string;
  createdAt: string;
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILD COTIZACIÓN DATA from offer + property
// ═══════════════════════════════════════════════════════════════════════════

export async function buildCotizacionFromOffer(
  supabase: SupabaseService,
  offerId: string
): Promise<CotizacionData | null> {
  try {
    const { data: offer } = await supabase.client
      .from('offers')
      .select('*, leads(name, phone, property_interest)')
      .eq('id', offerId)
      .single();

    if (!offer) return null;

    // Get property details
    let property: any = null;
    if (offer.property_id) {
      const { data } = await supabase.client
        .from('properties')
        .select('*')
        .eq('id', offer.property_id)
        .single();
      property = data;
    } else if (offer.development) {
      const { data } = await supabase.client
        .from('properties')
        .select('*')
        .ilike('name', `%${offer.development}%`)
        .limit(1)
        .maybeSingle();
      property = data;
    }

    // Get vendor
    let vendedor: any = null;
    if (offer.vendor_id) {
      const { data } = await supabase.client
        .from('team_members')
        .select('name, phone')
        .eq('id', offer.vendor_id)
        .single();
      vendedor = data;
    }

    const listPrice = Number(offer.list_price || offer.offered_price);
    const finalPrice = Number(offer.offered_price);
    const discount = listPrice > finalPrice ? listPrice - finalPrice : 0;
    const discountPercent = discount > 0 ? Math.round((discount / listPrice) * 100) : 0;

    // Calculate basic financing (20% down, 20 years, 10.5% rate)
    const downPaymentPercent = 20;
    const downPayment = finalPrice * (downPaymentPercent / 100);
    const loanAmount = finalPrice - downPayment;
    const annualRate = 10.5;
    const termYears = 20;
    const monthlyRate = annualRate / 100 / 12;
    const totalPayments = termYears * 12;
    const factor = Math.pow(1 + monthlyRate, totalPayments);
    const monthlyPayment = Math.round(loanAmount * (monthlyRate * factor) / (factor - 1));

    return {
      id: offer.id,
      leadName: offer.leads?.name || 'Cliente',
      vendedorName: vendedor?.name || 'Asesor',
      vendedorPhone: vendedor?.phone || '',
      propertyName: offer.property_name || property?.name || 'Propiedad',
      development: offer.development || property?.development || '',
      price: listPrice,
      discount: discount > 0 ? discount : undefined,
      discountPercent: discountPercent > 0 ? discountPercent : undefined,
      finalPrice,
      downPayment,
      downPaymentPercent,
      monthlyPayment,
      term: termYears,
      bankName: 'Referencia bancaria',
      annualRate,
      propertyDetails: property ? {
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        area_m2: property.area_m2 || property.construction_area,
        parking: property.parking,
        amenities: property.amenities
      } : undefined,
      imageUrl: property?.photo_url || property?.image_url,
      gpsUrl: property?.gps_url,
      validUntil: offer.expires_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: offer.created_at || new Date().toISOString(),
      notes: offer.notes
    };
  } catch (e) {
    console.error('Error building cotización:', e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE HTML COTIZACIÓN
// ═══════════════════════════════════════════════════════════════════════════

export function generateCotizacionHTML(data: CotizacionData): string {
  const fmt = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 0 });
  const validDate = new Date(data.validUntil).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
  const createdDate = new Date(data.createdAt).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  const details = data.propertyDetails;
  const detailsHTML = details ? `
    <div class="details-grid">
      ${details.bedrooms ? `<div class="detail"><span class="icon">🛏️</span><span>${details.bedrooms} Recámaras</span></div>` : ''}
      ${details.bathrooms ? `<div class="detail"><span class="icon">🚿</span><span>${details.bathrooms} Baños</span></div>` : ''}
      ${details.area_m2 ? `<div class="detail"><span class="icon">📐</span><span>${details.area_m2} m²</span></div>` : ''}
      ${details.parking ? `<div class="detail"><span class="icon">🚗</span><span>${details.parking} Estacionamiento${details.parking > 1 ? 's' : ''}</span></div>` : ''}
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cotización - ${data.propertyName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; }
    .container { max-width: 600px; margin: 0 auto; background: white; }
    .header { background: linear-gradient(135deg, #1a5632 0%, #2d8a4e 100%); color: white; padding: 24px; text-align: center; }
    .header h1 { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
    .header .subtitle { font-size: 13px; opacity: 0.9; }
    .hero { position: relative; }
    .hero img { width: 100%; height: 200px; object-fit: cover; }
    .hero .overlay { position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.7)); padding: 16px; color: white; }
    .hero .overlay h2 { font-size: 18px; }
    .hero .overlay .dev { font-size: 13px; opacity: 0.9; }
    .section { padding: 20px 24px; border-bottom: 1px solid #eee; }
    .section-title { font-size: 14px; font-weight: 600; color: #1a5632; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .price-main { text-align: center; padding: 24px; }
    .price-main .label { font-size: 13px; color: #666; }
    .price-main .amount { font-size: 32px; font-weight: 700; color: #1a5632; }
    .price-main .original { font-size: 16px; color: #999; text-decoration: line-through; margin-bottom: 4px; }
    .price-main .discount { display: inline-block; background: #e74c3c; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .detail { display: flex; align-items: center; gap: 8px; padding: 8px; background: #f8f9fa; border-radius: 6px; }
    .detail .icon { font-size: 18px; }
    .financing { background: #f0f7f3; border-radius: 8px; padding: 16px; }
    .financing-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
    .financing-row.highlight { font-weight: 600; font-size: 16px; color: #1a5632; border-top: 1px solid #ddd; padding-top: 10px; margin-top: 6px; }
    .financing-row .label { color: #666; }
    .cta { text-align: center; padding: 24px; }
    .cta a { display: inline-block; background: #25D366; color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; }
    .footer { text-align: center; padding: 16px 24px; font-size: 12px; color: #999; background: #f8f9fa; }
    .validity { background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 10px; text-align: center; font-size: 13px; color: #856404; }
    .vendor { display: flex; align-items: center; gap: 12px; }
    .vendor-avatar { width: 40px; height: 40px; background: #1a5632; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 16px; }
    .vendor-info { flex: 1; }
    .vendor-info .name { font-weight: 600; font-size: 14px; }
    .vendor-info .role { font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Grupo Santa Rita</h1>
      <div class="subtitle">Cotización Personalizada</div>
    </div>

    ${data.imageUrl ? `
    <div class="hero">
      <img src="${data.imageUrl}" alt="${data.propertyName}">
      <div class="overlay">
        <h2>${data.propertyName}</h2>
        ${data.development ? `<div class="dev">${data.development}</div>` : ''}
      </div>
    </div>
    ` : `
    <div class="section">
      <h2 style="font-size: 20px; margin-bottom: 4px;">${data.propertyName}</h2>
      ${data.development ? `<div style="color: #666; font-size: 14px;">${data.development}</div>` : ''}
    </div>
    `}

    <div class="section">
      <div class="section-title">Para: ${data.leadName}</div>
      <div style="font-size: 13px; color: #666;">Fecha: ${createdDate}</div>
    </div>

    ${detailsHTML ? `<div class="section"><div class="section-title">Características</div>${detailsHTML}</div>` : ''}

    <div class="price-main">
      ${data.discount ? `<div class="original">$${fmt(data.price)} MXN</div>` : ''}
      ${data.discountPercent ? `<span class="discount">-${data.discountPercent}% descuento</span>` : ''}
      <div class="label">Precio especial</div>
      <div class="amount">$${fmt(data.finalPrice)} MXN</div>
    </div>

    ${data.monthlyPayment ? `
    <div class="section">
      <div class="section-title">Simulación de Financiamiento</div>
      <div class="financing">
        <div class="financing-row"><span class="label">Enganche (${data.downPaymentPercent}%)</span><span>$${fmt(data.downPayment || 0)}</span></div>
        <div class="financing-row"><span class="label">Plazo</span><span>${data.term} años</span></div>
        <div class="financing-row"><span class="label">Tasa anual</span><span>${data.annualRate}%</span></div>
        <div class="financing-row highlight"><span class="label">Mensualidad aprox.</span><span>$${fmt(data.monthlyPayment)}</span></div>
      </div>
      <div style="font-size: 11px; color: #999; margin-top: 8px; text-align: center;">*Simulación referencial. Sujeta a aprobación crediticia.</div>
    </div>
    ` : ''}

    <div class="section">
      <div class="validity">⏰ Cotización válida hasta el <strong>${validDate}</strong></div>
    </div>

    ${data.gpsUrl ? `
    <div class="section" style="text-align: center;">
      <a href="${data.gpsUrl}" target="_blank" style="color: #1a5632; font-size: 14px;">📍 Ver ubicación en mapa</a>
    </div>
    ` : ''}

    <div class="cta">
      <a href="https://wa.me/${data.vendedorPhone?.replace(/\D/g, '')}?text=Hola%2C%20me%20interesa%20la%20cotización%20de%20${encodeURIComponent(data.propertyName)}">💬 Contactar asesor por WhatsApp</a>
    </div>

    <div class="section">
      <div class="vendor">
        <div class="vendor-avatar">${(data.vendedorName || 'A').charAt(0)}</div>
        <div class="vendor-info">
          <div class="name">${data.vendedorName}</div>
          <div class="role">Asesor de Ventas • Grupo Santa Rita</div>
        </div>
      </div>
    </div>

    <div class="footer">
      <p>Grupo Santa Rita © ${new Date().getFullYear()}</p>
      <p style="margin-top: 4px;">Esta cotización es informativa y no constituye un contrato de compraventa.</p>
    </div>
  </div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMAT COTIZACIÓN FOR WHATSAPP (text summary + link)
// ═══════════════════════════════════════════════════════════════════════════

export function formatCotizacionWhatsApp(data: CotizacionData, cotizacionUrl: string): string {
  const fmt = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 0 });
  const validDate = new Date(data.validUntil).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long'
  });

  let msg = `🏠 *COTIZACIÓN PERSONALIZADA*\n\n`;
  msg += `📦 *${data.propertyName}*\n`;
  if (data.development) msg += `📍 ${data.development}\n`;
  msg += `\n`;

  if (data.discount) {
    msg += `~~$${fmt(data.price)}~~ → *$${fmt(data.finalPrice)} MXN*\n`;
    msg += `📉 Descuento: ${data.discountPercent}%\n`;
  } else {
    msg += `💰 *$${fmt(data.finalPrice)} MXN*\n`;
  }

  if (data.monthlyPayment) {
    msg += `\n💳 Mensualidad desde *$${fmt(data.monthlyPayment)}*\n`;
    msg += `_(Enganche ${data.downPaymentPercent}%, ${data.term} años, ${data.annualRate}%)_\n`;
  }

  msg += `\n📅 Válida hasta: ${validDate}\n`;
  msg += `\n👉 Ver cotización completa:\n${cotizacionUrl}`;

  return msg;
}
