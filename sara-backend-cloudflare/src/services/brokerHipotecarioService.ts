// ============================================
// BROKER HIPOTECARIO - VISION API INTELIGENTE
// Detecta CUALQUIER combinación de documentos
// ============================================

import { SupabaseClient } from '@supabase/supabase-js';

interface AnalisisVision {
  documentos: {
    tipo: string;
    cantidad: number;
    datos?: any;
  }[];
  esValido: boolean;
  mensaje: string;
  datosExtraidos: Record<string, any>;
}

export class BrokerHipotecarioService {
  private supabase: SupabaseClient;
  private openaiKey: string;

  constructor(supabase: SupabaseClient, openaiKey: string) {
    this.supabase = supabase;
    this.openaiKey = openaiKey;
    console.log('🏦 BrokerService inicializado, API key:', openaiKey ? '✅' : '❌ FALTA');
  }

  // ═══════════════════════════════════════════════════════════════
  // PROCESAR DOCUMENTO - PUNTO DE ENTRADA
  // ═══════════════════════════════════════════════════════════════
  async procesarDocumento(leadId: string, mediaUrl: string, nombreLead: string): Promise<{ respuesta: string; todosCompletos: boolean }> {
    console.log('🏦 procesarDocumento para lead:', leadId);
    
    if (!this.openaiKey) {
      return { respuesta: '😕 Error de configuración. Intenta de nuevo.', todosCompletos: false };
    }

    // Obtener documentos que YA tenemos
    const { data: docsExistentes } = await this.supabase
      .from('documentos_broker')
      .select('tipo')
      .eq('lead_id', leadId)
      .eq('valido', true);
    
    const inventarioActual = this.contarInventario(docsExistentes || []);
    console.log('🏦 Inventario actual:', inventarioActual);

    // Analizar imagen con Vision API
    const analisis = await this.analizarConVision(mediaUrl, inventarioActual);
    console.log('🏦 Vision detectó:', analisis.documentos);

    if (!analisis.esValido) {
      return { respuesta: analisis.mensaje, todosCompletos: false };
    }

    // Calcular qué documentos NUEVOS aporta esta imagen
    const aportaciones = this.calcularAportaciones(analisis.documentos, inventarioActual);
    console.log('🏦 Aportaciones nuevas:', aportaciones);

    if (aportaciones.length === 0) {
      return { 
        respuesta: `⚠️ Ya tengo esos documentos. Te faltan:\n${this.listarFaltantes(inventarioActual).join('\n')}`, 
        todosCompletos: false 
      };
    }

    // Guardar documentos nuevos
    for (const doc of aportaciones) {
      await this.supabase.from('documentos_broker').insert({
        lead_id: leadId,
        tipo: doc.tipo,
        media_url: mediaUrl,
        datos_extraidos: analisis.datosExtraidos,
        valido: true,
        created_at: new Date().toISOString()
      });
    }

    // Actualizar inventario
    const nuevoInventario = { ...inventarioActual };
    for (const doc of aportaciones) {
      nuevoInventario[doc.tipo] = (nuevoInventario[doc.tipo] || 0) + 1;
    }

    // Calcular progreso
    const progreso = this.calcularProgreso(nuevoInventario);
    const barra = '🟢'.repeat(progreso.completos) + '⚪'.repeat(Math.max(0, 6 - progreso.completos));

    // ¿Ya tenemos todo?
    if (progreso.completo) {
      return {
        respuesta: `${analisis.mensaje}

${barra}

🎉 *¡LISTO ${nombreLead}!* Ya tengo todos tus documentos.

Los voy a revisar y te confirmo en breve. ¡Gracias!`,
        todosCompletos: true
      };
    }

    // Listar lo que falta
    const faltantes = this.listarFaltantes(nuevoInventario);

    return {
      respuesta: `${analisis.mensaje}

${barra}

📸 *Te falta:* ${faltantes[0]}`,
      todosCompletos: false
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // VISION API - ANÁLISIS INTELIGENTE
  // ═══════════════════════════════════════════════════════════════
  private async analizarConVision(mediaUrl: string, inventarioActual: Record<string, number>): Promise<AnalisisVision> {
    
    const faltantesTexto = this.listarFaltantes(inventarioActual).join(', ') || 'Nada, ya tenemos todo';
    
    const prompt = `Eres un experto analizando documentos mexicanos para créditos hipotecarios.

ANALIZA esta imagen y detecta TODOS los documentos que veas. Puede haber MÚLTIPLES documentos en una sola foto.

LO QUE NOS FALTA RECIBIR: ${faltantesTexto}

TIPOS DE DOCUMENTOS A DETECTAR:
1. ine_frente - INE/IFE lado FRENTE (tiene FOTO de la persona, nombre, dirección)
2. ine_reverso - INE/IFE lado REVERSO (tiene huella, firma, código OCR/barras)
3. nomina - Recibo de nómina, talón de pago, comprobante de ingresos (CUENTA CUÁNTOS hay)
4. comprobante_domicilio - Recibo de LUZ, AGUA, TELÉFONO, GAS, estado de cuenta bancario

IMPORTANTE:
- Si hay varios recibos de nómina, CUENTA cuántos son
- Si hay varios comprobantes (luz + agua + teléfono), cuenta como 1 solo comprobante_domicilio
- Si ves INE frente Y reverso, reporta AMBOS
- Valida que los documentos sean LEGIBLES y NO estén vencidos
- Extrae nombre, CURP, dirección y datos importantes

RESPONDE EN JSON:
{
  "documentos": [
    {"tipo": "ine_frente", "cantidad": 1},
    {"tipo": "ine_reverso", "cantidad": 1},
    {"tipo": "nomina", "cantidad": 3},
    {"tipo": "comprobante_domicilio", "cantidad": 1}
  ],
  "es_valido": true,
  "problema": "solo si es_valido=false, explica el problema",
  "datos": {
    "nombre": "",
    "curp": "",
    "direccion": "",
    "vigencia_ine": "",
    "empresa_nomina": "",
    "monto_nomina": ""
  },
  "resumen": "Descripción breve de lo que encontraste"
}`;

    try {
      console.log('🏦 Llamando Vision API...');
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: mediaUrl, detail: 'high' } }
            ]
          }],
          max_tokens: 1000,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        console.error('❌ Vision API error:', response.status);
        return {
          documentos: [],
          esValido: false,
          mensaje: '😕 No pude analizar la foto. ¿Me la mandas de nuevo?',
          datosExtraidos: {}
        };
      }

      const data = await response.json() as any;
      const content = data.choices?.[0]?.message?.content || '';
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          documentos: [],
          esValido: false,
          mensaje: '🤔 No pude leer la imagen. ¿Me la mandas con mejor luz?',
          datosExtraidos: {}
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validar documentos encontrados
      const docsValidos = (parsed.documentos || []).filter((d: any) => 
        ['ine_frente', 'ine_reverso', 'nomina', 'comprobante_domicilio'].includes(d.tipo) && d.cantidad > 0
      );

      if (docsValidos.length === 0) {
        return {
          documentos: [],
          esValido: false,
          mensaje: parsed.problema || '🤔 No reconozco ningún documento válido. Necesito: INE, nóminas o comprobante de domicilio.',
          datosExtraidos: {}
        };
      }

      if (!parsed.es_valido) {
        return {
          documentos: docsValidos,
          esValido: false,
          mensaje: `❌ ${parsed.problema || 'Documento no válido'}`,
          datosExtraidos: parsed.datos || {}
        };
      }

      // Generar mensaje de confirmación
      const mensaje = this.generarMensajeConfirmacion(docsValidos, parsed.datos?.nombre);

      return {
        documentos: docsValidos,
        esValido: true,
        mensaje: mensaje,
        datosExtraidos: parsed.datos || {}
      };

    } catch (error) {
      console.error('❌ Error Vision:', error);
      return {
        documentos: [],
        esValido: false,
        mensaje: '😕 Tuve un problema técnico. ¿Me mandas la foto de nuevo?',
        datosExtraidos: {}
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════
  
  private contarInventario(docs: {tipo: string}[]): Record<string, number> {
    const inv: Record<string, number> = {
      ine_frente: 0,
      ine_reverso: 0,
      nomina: 0,
      comprobante_domicilio: 0
    };
    for (const d of docs) {
      if (inv[d.tipo] !== undefined) {
        inv[d.tipo]++;
      }
    }
    return inv;
  }

  private calcularAportaciones(docsNuevos: {tipo: string; cantidad: number}[], inventario: Record<string, number>): {tipo: string}[] {
    const aportaciones: {tipo: string}[] = [];
    
    for (const doc of docsNuevos) {
      const actual = inventario[doc.tipo] || 0;
      const maximo = doc.tipo === 'nomina' ? 3 : 1; // Máx 3 nóminas, 1 de los demás
      const espacioDisponible = Math.max(0, maximo - actual);
      const cantidadAAportar = Math.min(doc.cantidad, espacioDisponible);
      
      for (let i = 0; i < cantidadAAportar; i++) {
        aportaciones.push({ tipo: doc.tipo });
      }
    }
    
    return aportaciones;
  }

  private calcularProgreso(inventario: Record<string, number>): { completos: number; completo: boolean } {
    let completos = 0;
    
    // INE frente (1 requerido)
    if (inventario.ine_frente >= 1) completos++;
    // INE reverso (1 requerido)
    if (inventario.ine_reverso >= 1) completos++;
    // Nóminas (3 requeridas)
    completos += Math.min(inventario.nomina || 0, 3);
    // Comprobante domicilio (1 requerido)
    if (inventario.comprobante_domicilio >= 1) completos++;
    
    return {
      completos: Math.min(completos, 6),
      completo: completos >= 6
    };
  }

  private listarFaltantes(inventario: Record<string, number>): string[] {
    const faltantes: string[] = [];
    
    if ((inventario.ine_frente || 0) < 1) faltantes.push('📄 INE (frente)');
    if ((inventario.ine_reverso || 0) < 1) faltantes.push('📄 INE (reverso)');
    
    const nominasFaltan = 3 - (inventario.nomina || 0);
    if (nominasFaltan > 0) {
      faltantes.push(`📄 ${nominasFaltan} nómina${nominasFaltan > 1 ? 's' : ''}`);
    }
    
    if ((inventario.comprobante_domicilio || 0) < 1) faltantes.push('📄 Comprobante domicilio');
    
    return faltantes;
  }

  private generarMensajeConfirmacion(docs: {tipo: string; cantidad: number}[], nombre?: string): string {
    const partes: string[] = [];
    
    const tieneFrente = docs.some(d => d.tipo === 'ine_frente');
    const tieneReverso = docs.some(d => d.tipo === 'ine_reverso');
    const nominas = docs.find(d => d.tipo === 'nomina')?.cantidad || 0;
    const comprobante = docs.some(d => d.tipo === 'comprobante_domicilio');
    
    if (tieneFrente && tieneReverso) {
      partes.push('INE completa');
    } else if (tieneFrente) {
      partes.push('INE frente');
    } else if (tieneReverso) {
      partes.push('INE reverso');
    }
    
    if (nominas > 0) {
      partes.push(`${nominas} nómina${nominas > 1 ? 's' : ''}`);
    }
    
    if (comprobante) {
      partes.push('comprobante domicilio');
    }
    
    const nombreStr = nombre ? ` - ${nombre}` : '';
    
    if (partes.length === 1) {
      return `✅ ${partes[0]} recibido${nombreStr}`;
    } else {
      return `✅ Recibidos: ${partes.join(', ')}${nombreStr}`;
    }
  }
}
