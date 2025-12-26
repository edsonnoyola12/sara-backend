with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# 1. AGREGAR IMPORT
if 'pricing-and-locations' not in content:
    old_imports = "import { TwilioService } from '../services/twilio';"
    new_imports = """import { TwilioService } from '../services/twilio';
import {
  getPrecioActual, getUbicacionPropiedad, getGoogleMapsLink,
  sugerirPropiedadesPorPresupuesto, calcularHoraAlternativa
} from '../utils/pricing-and-locations';"""
    content = content.replace(old_imports, new_imports)
    print("✅ 1. Import agregado")
else:
    print("⚠️ 1. Import ya existe")

# 2. AGREGAR FUNCIÓN validarDisponibilidad (después del constructor)
if 'validarDisponibilidad' not in content:
    constructor_end = content.find('  async handleIncomingMessage')
    validation_function = """
  async validarDisponibilidad(
    supabase: any, 
    vendedorId: string | undefined, 
    asesorId: string | undefined, 
    fecha: string, 
    hora: string
  ): Promise<{ disponible: boolean, conflictos: string[] }> {
    const conflictos: string[] = [];
    
    // Verificar conflictos del vendedor
    if (vendedorId) {
      const { data: vendedorCitas } = await supabase
        .from('appointments')
        .select('*')
        .eq('vendedor_id', vendedorId)
        .eq('scheduled_date', fecha)
        .eq('scheduled_time', hora)
        .eq('status', 'scheduled');
      
      if (vendedorCitas && vendedorCitas.length > 0) {
        conflictos.push('vendedor ocupado');
      }
    }
    
    // Verificar conflictos del asesor
    if (asesorId) {
      const { data: asesorCitas } = await supabase
        .from('appointments')
        .select('*')
        .eq('asesor_id', asesorId)
        .eq('scheduled_date', fecha)
        .eq('scheduled_time', hora)
        .eq('status', 'scheduled');
      
      if (asesorCitas && asesorCitas.length > 0) {
        conflictos.push('asesor ocupado');
      }
    }
    
    return {
      disponible: conflictos.length === 0,
      conflictos
    };
  }

"""
    content = content[:constructor_end] + validation_function + content[constructor_end:]
    print("✅ 2. Función validarDisponibilidad agregada")
else:
    print("⚠️ 2. validarDisponibilidad ya existe")

# 3. MODIFICAR INSERT DE APPOINTMENTS (agregar ubicación)
old_insert = """            const { data: appt, error: apptError } = await this.supabase.client.from('appointments').insert([{
              lead_id: lead.id,
              lead_phone: cleanPhone,
              lead_name: clientName,
              property_id: matchedProperty.id,
              property_name: matchedProperty.name,
              vendedor_id: vendedor?.id,
              vendedor_name: vendedor?.name,
              asesor_id: asesorAsignado?.id,
              asesor_name: asesorAsignado?.name,
              scheduled_date: citaData.date,
              scheduled_time: citaData.time,
              status: 'scheduled',
              appointment_type: asesorAsignado ? 'property_viewing_with_credit' : 'property_viewing',
              duration_minutes: 60
            }]).select().single();"""

if old_insert in content:
    # Agregar código ANTES del insert para validar y obtener ubicación
    validation_code = """            // Validar disponibilidad
            const disponibilidad = await this.validarDisponibilidad(
              this.supabase.client,
              vendedor?.id,
              asesorAsignado?.id,
              citaData.date,
              citaData.time
            );
            
            if (!disponibilidad.disponible) {
              const hora1 = calcularHoraAlternativa(citaData.time, 1);
              const hora2 = calcularHoraAlternativa(citaData.time, 2);
              await this.twilio.sendWhatsAppMessage(
                from,
                `⚠️ Lo siento, ${citaData.timeText} no está disponible (${disponibilidad.conflictos.join(', ')}).\\n\\n¿Te viene bien alguna de estas horas?\\n• ${hora1}\\n• ${hora2}`
              );
              return;
            }
            
            // Obtener ubicación de la propiedad
            const ubicacion = getUbicacionPropiedad(matchedProperty.name);
            
            """
    
    new_insert = """            const { data: appt, error: apptError } = await this.supabase.client.from('appointments').insert([{
              lead_id: lead.id,
              lead_phone: cleanPhone,
              lead_name: clientName,
              property_id: matchedProperty.id,
              property_name: matchedProperty.name,
              vendedor_id: vendedor?.id,
              vendedor_name: vendedor?.name,
              asesor_id: asesorAsignado?.id,
              asesor_name: asesorAsignado?.name,
              scheduled_date: citaData.date,
              scheduled_time: citaData.time,
              status: 'scheduled',
              appointment_type: asesorAsignado ? 'property_viewing_with_credit' : 'property_viewing',
              duration_minutes: 60,
              location: ubicacion?.name || null,
              location_lat: ubicacion?.lat || null,
              location_lng: ubicacion?.lng || null
            }]).select().single();"""
    
    content = content.replace(old_insert, validation_code + new_insert)
    print("✅ 3. Insert de appointments actualizado con ubicación")
else:
    print("⚠️ 3. No se encontró el insert para modificar")

# 4. MODIFICAR NOTIFICACIONES (agregar Google Maps)
# Notificación al asesor
old_asesor_notif = """              \`🏦 *NUEVA SOLICITUD HIPOTECARIA*\\n\\n👤 Cliente: \${clientName}\\n📱 Teléfono: \${cleanPhone}\\n🏠 Propiedad: \${matchedProperty.name}\\n\\n💰 *DATOS FINANCIEROS:*\\n• Ingreso mensual: $\${(mortgageData.monthly_income || 0).toLocaleString()}\\n• Deudas actuales: $\${(mortgageData.current_debt || 0).toLocaleString()}\\n• Enganche disponible: $\${(mortgageData.down_payment || 0).toLocaleString()}\${citaData ? \`\\n\\n📅 CITA: \${citaData.dateText} a las \${citaData.timeText}\` : ''}\\n\\n¡Contactar pronto!\`"""

new_asesor_notif = """              \`🏦 *NUEVA SOLICITUD HIPOTECARIA*\\n\\n👤 Cliente: \${clientName}\\n📱 Teléfono: \${cleanPhone}\\n🏠 Propiedad: \${matchedProperty.name}\\n\\n💰 *DATOS FINANCIEROS:*\\n• Ingreso mensual: $\${(mortgageData.monthly_income || 0).toLocaleString()}\\n• Deudas actuales: $\${(mortgageData.current_debt || 0).toLocaleString()}\\n• Enganche disponible: $\${(mortgageData.down_payment || 0).toLocaleString()}\${citaData ? \`\\n\\n📅 CITA: \${citaData.dateText} a las \${citaData.timeText}\\n📍 \${ubicacion?.name || matchedProperty.name}\${ubicacion ? \`\\n🗺️ \${getGoogleMapsLink(ubicacion.lat, ubicacion.lng)}\` : ''}\` : ''}\\n\\n¡Contactar pronto!\`"""

if old_asesor_notif in content:
    content = content.replace(old_asesor_notif, new_asesor_notif)
    print("✅ 4a. Notificación asesor actualizada")

# Notificación al vendedor
old_vendedor_notif = """                \`🏦 *LEAD CON CRÉDITO*\\n\\n👤 \${clientName}\\n📱 \${cleanPhone}\\n🏠 \${matchedProperty.name}\\n\\n💰 Ingreso: $\${(mortgageData.monthly_income || 0).toLocaleString()}\\nDeudas: $\${(mortgageData.current_debt || 0).toLocaleString()}\\nEnganche: $\${(mortgageData.down_payment || 0).toLocaleString()}\${citaData ? \`\\n\\n📅 CITA: \${citaData.dateText} a las \${citaData.timeText}\` : ''}\\n\\nAsesor: \${assignedAsesor?.name || 'Sin asignar'}\`"""

new_vendedor_notif = """                \`🏦 *LEAD CON CRÉDITO*\\n\\n👤 \${clientName}\\n📱 \${cleanPhone}\\n🏠 \${matchedProperty.name}\\n\\n💰 Ingreso: $\${(mortgageData.monthly_income || 0).toLocaleString()}\\nDeudas: $\${(mortgageData.current_debt || 0).toLocaleString()}\\nEnganche: $\${(mortgageData.down_payment || 0).toLocaleString()}\${citaData ? \`\\n\\n📅 CITA: \${citaData.dateText} a las \${citaData.timeText}\\n📍 \${ubicacion?.name || matchedProperty.name}\${ubicacion ? \`\\n🗺️ \${getGoogleMapsLink(ubicacion.lat, ubicacion.lng)}\` : ''}\` : ''}\\n\\nAsesor: \${assignedAsesor?.name || 'Sin asignar'}\`"""

if old_vendedor_notif in content:
    content = content.replace(old_vendedor_notif, new_vendedor_notif)
    print("✅ 4b. Notificación vendedor actualizada")

# 5. AGREGAR SUGERENCIAS INTELIGENTES (antes del prompt de SARA)
sugerencias_code = """
      // SUGERENCIAS INTELIGENTES
      const pideSugerencia = /(?:qué me recomiendas|no sé cuál|cuál me conviene|recomiéndame)/i.test(body);
      if (pideSugerencia && !matchedProperty) {
        if (mortgageData.down_payment) {
          const sugeridas = sugerirPropiedadesPorPresupuesto(mortgageData.down_payment * 5, 3);
          if (sugeridas.length > 0) {
            const listaSugeridas = sugeridas.map(nombre => {
              const precio = getPrecioActual(nombre);
              return \`• \${nombre}: $\${(precio / 1000000).toFixed(1)}M\`;
            }).join('\\n');
            await this.twilio.sendWhatsAppMessage(
              from,
              \`💡 Basado en tu presupuesto, te recomiendo:\\n\\n\${listaSugeridas}\\n\\n¿Cuál te gustaría ver?\`
            );
            return;
          }
        } else {
          await this.twilio.sendWhatsAppMessage(
            from,
            '💡 Para recomendarte algo ideal, ¿cuánto tienes de enganche aproximadamente?'
          );
          return;
        }
      }

"""

catalog_pos = content.find("const catalogoProps = properties.map")
if catalog_pos > 0 and 'SUGERENCIAS INTELIGENTES' not in content:
    content = content[:catalog_pos] + sugerencias_code + content[catalog_pos:]
    print("✅ 5. Sugerencias inteligentes agregadas")
else:
    print("⚠️ 5. Sugerencias ya existen o no se encontró punto de inserción")

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("\n" + "="*60)
print("✅ TODAS LAS MODIFICACIONES COMPLETADAS")
print("="*60)
