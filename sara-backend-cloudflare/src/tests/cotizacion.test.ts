import { describe, it, expect } from 'vitest';
import { generateCotizacionHTML, formatCotizacionWhatsApp } from '../services/cotizacionService';
import type { CotizacionData } from '../services/cotizacionService';

// ═══════════════════════════════════════════════════════════════════════════
// COTIZACIÓN SERVICE TESTS
// ═══════════════════════════════════════════════════════════════════════════

function createSampleCotizacion(overrides: Partial<CotizacionData> = {}): CotizacionData {
  return {
    id: 'offer-123',
    leadName: 'Juan Pérez',
    vendedorName: 'Carlos López',
    vendedorPhone: '5214921234567',
    propertyName: 'Casa Modelo A',
    development: 'Monte Verde',
    price: 2500000,
    discount: 200000,
    discountPercent: 8,
    finalPrice: 2300000,
    downPayment: 460000,
    downPaymentPercent: 20,
    monthlyPayment: 18500,
    term: 20,
    bankName: 'Referencia bancaria',
    annualRate: 10.5,
    propertyDetails: {
      bedrooms: 3,
      bathrooms: 2,
      area_m2: 120,
      parking: 2,
      amenities: ['Alberca', 'Gym']
    },
    imageUrl: 'https://example.com/casa.jpg',
    gpsUrl: 'https://maps.google.com/xyz',
    validUntil: '2026-03-15T00:00:00.000Z',
    createdAt: '2026-03-01T00:00:00.000Z',
    ...overrides
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HTML GENERATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('generateCotizacionHTML', () => {
  it('should generate valid HTML with all sections', () => {
    const data = createSampleCotizacion();
    const html = generateCotizacionHTML(data);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Grupo Santa Rita');
    expect(html).toContain('Juan Pérez');
    expect(html).toContain('Casa Modelo A');
    expect(html).toContain('Monte Verde');
    expect(html).toContain('Carlos López');
  });

  it('should include price with formatting', () => {
    const data = createSampleCotizacion();
    const html = generateCotizacionHTML(data);

    // Final price should be displayed
    expect(html).toContain('2,300,000');
    // Original price (strikethrough) should be displayed
    expect(html).toContain('2,500,000');
  });

  it('should include discount badge', () => {
    const data = createSampleCotizacion();
    const html = generateCotizacionHTML(data);

    expect(html).toContain('-8%');
    expect(html).toContain('descuento');
  });

  it('should include property details', () => {
    const data = createSampleCotizacion();
    const html = generateCotizacionHTML(data);

    expect(html).toContain('3 Recámaras');
    expect(html).toContain('2 Baños');
    expect(html).toContain('120 m²');
    expect(html).toContain('2 Estacionamientos');
  });

  it('should include financing simulation', () => {
    const data = createSampleCotizacion();
    const html = generateCotizacionHTML(data);

    expect(html).toContain('Simulación de Financiamiento');
    expect(html).toContain('Enganche (20%)');
    expect(html).toContain('20 años');
    expect(html).toContain('10.5%');
    expect(html).toContain('18,500');
    expect(html).toContain('Sujeta a aprobación');
  });

  it('should include validity date', () => {
    const data = createSampleCotizacion();
    const html = generateCotizacionHTML(data);

    expect(html).toContain('válida hasta');
  });

  it('should include hero image when imageUrl provided', () => {
    const data = createSampleCotizacion();
    const html = generateCotizacionHTML(data);

    expect(html).toContain('<img src="https://example.com/casa.jpg"');
  });

  it('should work without image', () => {
    const data = createSampleCotizacion({ imageUrl: undefined });
    const html = generateCotizacionHTML(data);

    expect(html).not.toContain('<img');
    expect(html).toContain('Casa Modelo A');
  });

  it('should include GPS link when provided', () => {
    const data = createSampleCotizacion();
    const html = generateCotizacionHTML(data);

    expect(html).toContain('https://maps.google.com/xyz');
    expect(html).toContain('Ver ubicación');
  });

  it('should work without GPS link', () => {
    const data = createSampleCotizacion({ gpsUrl: undefined });
    const html = generateCotizacionHTML(data);

    expect(html).not.toContain('Ver ubicación');
  });

  it('should include WhatsApp CTA button', () => {
    const data = createSampleCotizacion();
    const html = generateCotizacionHTML(data);

    expect(html).toContain('wa.me/');
    expect(html).toContain('Contactar asesor');
  });

  it('should work without discount', () => {
    const data = createSampleCotizacion({ discount: undefined, discountPercent: undefined });
    const html = generateCotizacionHTML(data);

    // No original price or discount badge in content (CSS styles are always present)
    expect(html).not.toContain('class="original"');
    expect(html).not.toContain('class="discount"');
    expect(html).toContain('2,300,000');
  });

  it('should work without property details', () => {
    const data = createSampleCotizacion({ propertyDetails: undefined });
    const html = generateCotizacionHTML(data);

    expect(html).not.toContain('Recámaras');
    expect(html).not.toContain('Características');
    expect(html).toContain('Casa Modelo A');
  });

  it('should work without financing', () => {
    const data = createSampleCotizacion({ monthlyPayment: undefined });
    const html = generateCotizacionHTML(data);

    expect(html).not.toContain('Simulación de Financiamiento');
    expect(html).toContain('Casa Modelo A');
  });

  it('should use singular for 1 parking spot', () => {
    const data = createSampleCotizacion({ propertyDetails: { parking: 1 } });
    const html = generateCotizacionHTML(data);

    expect(html).toContain('1 Estacionamiento');
    expect(html).not.toContain('Estacionamientos');
  });

  it('should include vendor initial in avatar', () => {
    const data = createSampleCotizacion();
    const html = generateCotizacionHTML(data);

    expect(html).toContain('>C</div>'); // Carlos first letter
  });

  it('should include legal disclaimer', () => {
    const data = createSampleCotizacion();
    const html = generateCotizacionHTML(data);

    expect(html).toContain('no constituye un contrato');
  });

  it('should be mobile responsive', () => {
    const data = createSampleCotizacion();
    const html = generateCotizacionHTML(data);

    expect(html).toContain('viewport');
    expect(html).toContain('max-width: 600px');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// WHATSAPP FORMAT TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('formatCotizacionWhatsApp', () => {
  it('should format with all fields', () => {
    const data = createSampleCotizacion();
    const msg = formatCotizacionWhatsApp(data, 'https://sara.dev/cotizacion/123');

    expect(msg).toContain('COTIZACIÓN PERSONALIZADA');
    expect(msg).toContain('Casa Modelo A');
    expect(msg).toContain('Monte Verde');
    expect(msg).toContain('2,300,000');
    expect(msg).toContain('8%');
    expect(msg).toContain('18,500');
    expect(msg).toContain('https://sara.dev/cotizacion/123');
  });

  it('should format without discount', () => {
    const data = createSampleCotizacion({ discount: undefined, discountPercent: undefined });
    const msg = formatCotizacionWhatsApp(data, 'https://test.com/c/1');

    expect(msg).not.toContain('Descuento');
    expect(msg).toContain('2,300,000');
  });

  it('should format without financing', () => {
    const data = createSampleCotizacion({ monthlyPayment: undefined });
    const msg = formatCotizacionWhatsApp(data, 'https://test.com/c/1');

    expect(msg).not.toContain('Mensualidad');
    expect(msg).toContain('Casa Modelo A');
  });

  it('should include cotización URL', () => {
    const data = createSampleCotizacion();
    const url = 'https://sara-backend.edson-633.workers.dev/cotizacion/abc-123';
    const msg = formatCotizacionWhatsApp(data, url);

    expect(msg).toContain(url);
    expect(msg).toContain('Ver cotización completa');
  });

  it('should include validity date', () => {
    const data = createSampleCotizacion();
    const msg = formatCotizacionWhatsApp(data, 'https://x.com/c/1');

    expect(msg).toContain('Válida hasta');
  });
});
