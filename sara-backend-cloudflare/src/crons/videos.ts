/**
 * Video Generation Functions - Veo 3 video processing and sending
 * Extraído de index.ts en Fase 6 de refactorización
 */

import { SupabaseService } from '../services/supabase';
import { MetaWhatsAppService } from '../services/meta-whatsapp';
import { logEvento } from './briefings';
import { logErrorToDB } from './healthCheck';

// ═══════════════════════════════════════════════════════════
// VERIFICAR VIDEOS PENDIENTES (CRON cada 2 min)
// Procesa videos generados por Veo 3 y los envía por WhatsApp
// ═══════════════════════════════════════════════════════════
export async function verificarVideosPendientes(supabase: SupabaseService, meta: MetaWhatsAppService, env: any): Promise<void> {
  // ═══════════════════════════════════════════════════════════
  // RATE LIMITING: Máximo 100 videos/día para evitar sobrecargar API
  // ═══════════════════════════════════════════════════════════
  const hoyStr = new Date().toISOString().split('T')[0];
  const { count: videosHoy } = await supabase.client
    .from('pending_videos')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', `${hoyStr}T00:00:00Z`)
    .lt('created_at', `${hoyStr}T23:59:59Z`);

  const MAX_VIDEOS_DIA = 100;
  if ((videosHoy || 0) >= MAX_VIDEOS_DIA) {
    console.error(`⚠️ RATE LIMIT: Ya se generaron ${videosHoy} videos hoy (máx ${MAX_VIDEOS_DIA})`);
    return;
  }

  // Limitar a 3 por CRON (cada 2 min = 90/hora máximo teórico, pero conservador)
  const { data: pendientes } = await supabase.client
    .from('pending_videos')
    .select('*')
    .eq('sent', false)
    .order('created_at', { ascending: true })
    .limit(3);

  if (!pendientes || pendientes.length === 0) {
    console.log('📭 No hay videos pendientes');
    return;
  }

  console.log(`🎬 Procesando ${pendientes.length} videos pendientes (${videosHoy || 0}/${MAX_VIDEOS_DIA} hoy)`);

  for (const video of pendientes) {
    console.log(`🔍 Verificando video: ${video.id} - ${video.lead_name}`);
    try {
      // Si ya tiene URL válida (de un intento anterior), intentar enviar directamente
      if (video.video_url && !video.video_url.startsWith('ERROR')) {
        console.log(`📦 Video ${video.id} ya tiene URL, intentando enviar...`);
        try {
          const videoResponse = await fetch(video.video_url, {
            headers: { 'x-goog-api-key': env.GEMINI_API_KEY }
          });

          if (videoResponse.ok) {
            const videoBuffer = await videoResponse.arrayBuffer();
            console.log(`✅ Video descargado: ${videoBuffer.byteLength} bytes`);

            const mediaId = await meta.uploadVideoFromBuffer(videoBuffer);
            console.log(`✅ Video subido a Meta: ${mediaId}`);

            await meta.sendWhatsAppVideoById(video.lead_phone, mediaId,
              `🎬 *¡${video.lead_name}, este video es para ti!*\n\nTu futuro hogar en *${video.desarrollo}* te espera.`);

            await supabase.client
              .from('pending_videos')
              .update({ sent: true, completed_at: new Date().toISOString() })
              .eq('id', video.id);

            console.log(`✅ Video ${video.id} enviado exitosamente (retry)`);
            continue;
          }
        } catch (retryError: any) {
          console.error(`⚠️ Error en retry de video ${video.id}: ${retryError.message}`);
        }
      }

      // Verificar estado de la operación en Google
      console.log(`📡 Consultando Google: ${video.operation_id}`);
      const statusResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${video.operation_id}`,
        {
          headers: { 'x-goog-api-key': env.GEMINI_API_KEY }
        }
      );

      console.log(`📡 Google response status: ${statusResponse.status}`);

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        console.error(`⚠️ Error verificando video ${video.id}: ${errorText}`);
        continue;
      }

      const status = await statusResponse.json() as any;
      console.log(`📡 Video done: ${status.done}`);
      console.log(`📦 Respuesta Google:`, JSON.stringify(status).substring(0, 500));

      if (status.done) {
        // Intentar múltiples rutas para encontrar el URI del video
        const videoUri =
          status.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
          status.response?.generatedSamples?.[0]?.video?.uri ||
          status.result?.videos?.[0]?.uri ||
          status.videos?.[0]?.uri;

        console.log(`🔍 URI encontrado: ${videoUri ? 'Sí' : 'NO'}`);

        if (videoUri) {
          console.log(`📥 Video URI: ${videoUri.substring(0, 80)}...`);

          // Guardar URL primero (para retry si falla el envío)
          await supabase.client
            .from('pending_videos')
            .update({ video_url: videoUri })
            .eq('id', video.id);

          try {
            // 1. Descargar video de Google (requiere API key)
            console.log(`📥 Descargando video de Google...`);
            const videoResponse = await fetch(videoUri, {
              headers: { 'x-goog-api-key': env.GEMINI_API_KEY }
            });

            if (!videoResponse.ok) {
              console.error(`❌ Error descargando video: ${videoResponse.status}`);
              // NO marcar como enviado, se reintentará
              continue;
            }

            const videoBuffer = await videoResponse.arrayBuffer();
            console.log(`✅ Video descargado: ${videoBuffer.byteLength} bytes`);

            // 2. Subir a Meta
            const mediaId = await meta.uploadVideoFromBuffer(videoBuffer);
            console.log(`✅ Video subido a Meta: ${mediaId}`);

            // 3. Enviar por WhatsApp
            let enviadoExitoso = false;
            if (video.lead_phone === 'TEAM_WEEKLY') {
              const { data: equipo } = await supabase.client
                .from('team_members')
                .select('phone, name, role')
                .in('role', ['vendedor', 'admin', 'coordinador'])
                .eq('active', true);

              const miembrosConPhone = (equipo || []).filter((m: any) => m.phone);
              console.log('═══════════════════════════════════════════════════════════');
              console.log('📤 VIDEO SEMANAL - ENVIANDO A TODO EL EQUIPO');
              console.log(`📊 Total destinatarios: ${miembrosConPhone.length}`);
              console.log('───────────────────────────────────────────────────────────');
              miembrosConPhone.forEach((m: any) => console.log(`   → ${m.name} (${m.role}) - ${m.phone}`));
              console.log('───────────────────────────────────────────────────────────');

              // Parsear stats del campo desarrollo (JSON)
              let caption = '🎬 *¡Resumen de la semana!*\n\n¡Excelente trabajo equipo! 🔥';
              try {
                const stats = JSON.parse(video.desarrollo);
                caption = `🎬 *¡RESUMEN SEMANAL!*\n\n` +
                  `📊 *Resultados del equipo:*\n` +
                  `   📥 ${stats.leads} leads nuevos\n` +
                  `   📅 ${stats.citas} citas agendadas\n` +
                  `   🏆 ${stats.cierres} cierres\n\n` +
                  `🥇 *MVP de la semana:*\n` +
                  `   ${stats.topName} (${stats.topCierres} cierres)\n\n` +
                  `¡Vamos por más! 💪🔥`;
              } catch (e) {
                console.error('⚠️ No se pudo parsear stats, usando caption default');
              }

              // Enviar video a equipo EN PARALELO
              const resultados = await Promise.allSettled(miembrosConPhone.map(async (miembro: any) => {
                await meta.sendWhatsAppVideoById(miembro.phone, mediaId, caption);
                console.log(`   ✅ ENVIADO: ${miembro.name} (${miembro.phone})`);
                return miembro.name;
              }));

              const exitosos = resultados.filter(r => r.status === 'fulfilled').length;
              const fallidos = resultados.filter(r => r.status === 'rejected').length;

              console.log('───────────────────────────────────────────────────────────');
              console.log(`📊 RESUMEN: ${exitosos} enviados, ${fallidos} fallidos`);
              console.log('═══════════════════════════════════════════════════════════');

              enviadoExitoso = exitosos > 0;
              resultados.forEach((r, i) => {
                if (r.status === 'rejected') {
                  console.error(`   ❌ FALLÓ: ${miembrosConPhone[i]?.name}: ${(r as PromiseRejectedResult).reason?.message || (r as PromiseRejectedResult).reason}`);
                }
              });
            } else {
              // Video individual (bienvenida)
              await meta.sendWhatsAppVideoById(video.lead_phone, mediaId,
                `🎬 *¡${video.lead_name}, este video es para ti!*\n\nTu futuro hogar en *${video.desarrollo}* te espera.`);
              console.log(`✅ Video enviado a ${video.lead_name}`);
              enviadoExitoso = true;
            }

            // ✅ SOLO marcar como enviado DESPUÉS de envío exitoso
            if (enviadoExitoso) {
              await supabase.client
                .from('pending_videos')
                .update({ sent: true, completed_at: new Date().toISOString() })
                .eq('id', video.id);
              console.log(`✅ Video ${video.id} marcado como enviado`);
            }
          } catch (downloadError: any) {
            console.error(`❌ Error en flujo de video: ${downloadError.message}`);
            // NO marcar como enviado, se reintentará en próximo cron
          }

        } else if (status.error) {
          console.error(`❌ Video fallido: ${status.error.message}`);
          await supabase.client
            .from('pending_videos')
            .update({ sent: true, completed_at: new Date().toISOString(), video_url: `ERROR: ${status.error.message}` })
            .eq('id', video.id);
        } else {
          // Verificar si fue bloqueado por filtros de seguridad (RAI)
          const raiReasons = status.response?.generateVideoResponse?.raiMediaFilteredReasons;
          if (raiReasons && raiReasons.length > 0) {
            console.log(`🚫 Video bloqueado por políticas de seguridad: ${raiReasons[0]}`);
            await supabase.client
              .from('pending_videos')
              .update({ sent: true, completed_at: new Date().toISOString(), video_url: `ERROR_RAI: ${raiReasons[0]}` })
              .eq('id', video.id);
          } else {
            console.error(`⚠️ Video completado pero sin URI`);
            console.log(`📦 Estructura completa:`, JSON.stringify(status));
            await supabase.client
              .from('pending_videos')
              .update({ sent: true, completed_at: new Date().toISOString(), video_url: 'ERROR: No URI found' })
              .eq('id', video.id);
          }
        }
      } else {
        console.log(`⏳ Video ${video.id} aún procesando...`);
      }
    } catch (e: any) {
      console.error(`❌ Error procesando video ${video.id}: ${e.message}`);
      // Marcar como enviado para evitar reintentos infinitos
      await supabase.client
        .from('pending_videos')
        .update({ sent: true, completed_at: new Date().toISOString(), video_url: `ERROR: ${e.message}` })
        .eq('id', video.id);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// VIDEO SEMANAL DE LOGROS - Viernes 6pm
// ═══════════════════════════════════════════════════════════
export async function generarVideoSemanalLogros(supabase: SupabaseService, meta: MetaWhatsAppService, env: any): Promise<void> {
  try {
    // Calcular fechas de la semana (lunes a viernes)
    const hoy = new Date();
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - hoy.getDay() + 1); // Lunes
    inicioSemana.setHours(0, 0, 0, 0);

    const finSemana = new Date(hoy);
    finSemana.setHours(23, 59, 59, 999);

    // Obtener métricas de la semana
    const { data: leadsNuevos } = await supabase.client
      .from('leads')
      .select('id', { count: 'exact' })
      .gte('created_at', inicioSemana.toISOString())
      .lte('created_at', finSemana.toISOString());

    const { data: citasAgendadas } = await supabase.client
      .from('appointments')
      .select('id', { count: 'exact' })
      .gte('created_at', inicioSemana.toISOString())
      .lte('created_at', finSemana.toISOString());

    const { data: cierres } = await supabase.client
      .from('leads')
      .select('id, assigned_to', { count: 'exact' })
      .eq('status', 'closed')
      .gte('status_changed_at', inicioSemana.toISOString())
      .lte('status_changed_at', finSemana.toISOString());

    // Calcular top performer
    const { data: vendedores } = await supabase.client
      .from('team_members')
      .select('id, name, phone')
      .eq('role', 'vendedor')
      .eq('active', true);

    let topPerformer = { name: 'El equipo', cierres: 0 };
    if (vendedores && cierres) {
      const cierresPorVendedor: Record<string, number> = {};
      for (const c of cierres) {
        if (c.assigned_to) {
          cierresPorVendedor[c.assigned_to] = (cierresPorVendedor[c.assigned_to] || 0) + 1;
        }
      }

      let maxCierres = 0;
      for (const [vendedorId, count] of Object.entries(cierresPorVendedor)) {
        if (count > maxCierres) {
          maxCierres = count;
          const vendedor = vendedores.find(v => v.id === vendedorId);
          if (vendedor) {
            topPerformer = { name: vendedor.name.split(' ')[0], cierres: count };
          }
        }
      }
    }

    const numLeads = leadsNuevos?.length || 0;
    const numCitas = citasAgendadas?.length || 0;
    const numCierres = cierres?.length || 0;

    console.log(`📊 Métricas semana: ${numLeads} leads, ${numCitas} citas, ${numCierres} cierres`);

    // Generar video con Veo 3 - Usando foto real de casas de Santa Rita
    const fotoSantaRita = 'https://gruposantarita.com.mx/wp-content/uploads/2024/10/EUCALIPTO-0-scaled.jpg';
    const promptVideo = `Real estate agent in front of these houses says: "Felicidades equipo Santa Rita, excelente semana!"
Professional attire, warm smile, speaking directly to camera.
Vertical 9:16, 8 seconds.`;

    console.log('🎬 Generando video semanal con Veo 3 (con imagen de referencia)...');

    // Descargar imagen de referencia
    const imgBase64 = await descargarImagenBase64(fotoSantaRita);
    console.log('🎬 Imagen de Santa Rita descargada');

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-fast-generate-001:predictLongRunning', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        instances: [{
          prompt: promptVideo,
          image: { bytesBase64Encoded: imgBase64, mimeType: 'image/jpeg' }
        }],
        parameters: {
          aspectRatio: "9:16",
          durationSeconds: 8
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('⚠️ Veo 3 error:', errorText);
      return;
    }

    const result = await response.json();
    const operationName = (result as any).name;

    if (!operationName) {
      console.error('⚠️ No operation name para video semanal');
      return;
    }

    console.log('🎬 Video semanal en proceso:', operationName);

    // Guardar para que el CRON lo procese y envíe
    // Usamos un teléfono especial "TEAM_WEEKLY" para identificar que es video grupal
    // desarrollo contiene JSON con stats para el caption
    const statsJson = JSON.stringify({
      leads: numLeads,
      citas: numCitas,
      cierres: numCierres,
      topName: topPerformer.name,
      topCierres: topPerformer.cierres
    });

    await supabase.client
      .from('pending_videos')
      .insert({
        operation_id: operationName,
        lead_phone: 'TEAM_WEEKLY',
        lead_name: 'Equipo Santa Rita',
        desarrollo: statsJson,
        sent: false
      });

    console.log('✅ Video semanal programado para envío');

  } catch (error) {
    console.error('❌ Error generando video semanal:', error);
    await logErrorToDB(supabase, 'cron_error', (error as Error).message || String(error), { severity: 'error', source: 'generarVideoSemanalLogros', stack: (error as Error).stack });
  }
}

// Fotos de fachadas por desarrollo (compartido entre funciones de video)
const FOTOS_DESARROLLO: Record<string, string> = {
  'Monte Verde': 'https://gruposantarita.com.mx/wp-content/uploads/2024/11/MONTE-VERDE-FACHADA-DESARROLLO-EDIT-scaled.jpg',
  'Los Encinos': 'https://gruposantarita.com.mx/wp-content/uploads/2020/09/Encinos-Amenidades-1.jpg',
  'Andes': 'https://gruposantarita.com.mx/wp-content/uploads/2022/09/Dalia_act.jpg',
  'Miravalle': 'https://gruposantarita.com.mx/wp-content/uploads/2025/02/FACHADA-MIRAVALLE-DESARROLLO-edit-scaled-e1740672689199.jpg',
  'Distrito Falco': 'https://gruposantarita.com.mx/wp-content/uploads/2020/09/img01-5.jpg',
  'Acacia': 'https://gruposantarita.com.mx/wp-content/uploads/2024/10/ACACIA-1-scaled.jpg'
};

function obtenerFotoDesarrollo(desarrollo: string): string {
  let foto = FOTOS_DESARROLLO[desarrollo];
  if (!foto) {
    for (const [key, url] of Object.entries(FOTOS_DESARROLLO)) {
      if (desarrollo.toLowerCase().includes(key.toLowerCase())) {
        foto = url;
        break;
      }
    }
  }
  return foto || FOTOS_DESARROLLO['Monte Verde'];
}

async function descargarImagenBase64(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  const imgResponse = await fetch(url, { signal: ctrl.signal });
  clearTimeout(timer);
  if (!imgResponse.ok) {
    throw new Error(`Error descargando imagen: ${imgResponse.status}`);
  }
  const imgBuffer = await imgResponse.arrayBuffer();
  const bytes = new Uint8Array(imgBuffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

// ═══════════════════════════════════════════════════════════
// VIDEO FELICITACIÓN POST-VENTA (Veo 3)
// Genera video personalizado cuando lead pasa a status='sold'
// ═══════════════════════════════════════════════════════════
export async function videoFelicitacionPostVenta(supabase: SupabaseService, meta: MetaWhatsAppService, env: any): Promise<void> {
  try {
    const ahora = new Date();
    const hace7dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const hoyStr = ahora.toISOString().split('T')[0];

    // Buscar leads que vendieron en los últimos 7 días y no tienen video generado
    const { data: leads } = await supabase.client
      .from('leads')
      .select('id, name, phone, property_interest, notes, updated_at')
      .eq('status', 'sold')
      .gt('updated_at', hace7dias.toISOString())
      .not('phone', 'is', null)
      .limit(5);

    if (!leads || leads.length === 0) {
      console.log('🎬 No hay nuevas ventas para video felicitación');
      return;
    }

    console.log(`🎬 Ventas recientes sin video: ${leads.length}`);

    let generados = 0;

    for (const lead of leads) {
      console.log(`🎬 Procesando lead: ${lead.name} | phone: ${lead.phone || 'SIN TELEFONO'}`);

      if (!lead.phone) {
        console.log(`🎬 SKIP: ${lead.name} no tiene teléfono`);
        continue;
      }

      const notas = typeof lead.notes === 'object' ? lead.notes : {};

      // Verificar si ya se generó video de felicitación
      if ((notas as any)?.video_felicitacion_generado) {
        console.log(`🎬 SKIP: ${lead.name} ya tiene video_felicitacion_generado`);
        continue;
      }

      const nombre = lead.name?.split(' ')[0] || 'amigo';
      const desarrollo = lead.property_interest || 'Grupo Santa Rita';
      const fotoDesarrollo = obtenerFotoDesarrollo(desarrollo);

      // Prompt para Veo 3 - SOLO la fachada de la imagen, sin generar otras casas
      const prompt = `IMPORTANT: Use ONLY the exact house facade from the input image. Do NOT show any other buildings or locations.

Slow cinematic zoom towards the exact house in the image. A female real estate agent appears briefly in front of this same house and says in Spanish: "¡Felicidades ${nombre}! Ya eres parte de la familia ${desarrollo}. Gracias por confiar en Grupo Santa Rita".

Keep focus on this specific house facade throughout. Golden hour lighting, 4k. No text, no subtitles, no overlays.`;

      try {
        // Verificar límites de API antes de intentar
        const { data: configData } = await supabase.client
          .from('system_config')
          .select('value')
          .eq('key', 'veo3_daily_count')
          .single();

        const dailyCount = configData?.value ? parseInt(configData.value) : 0;
        if (dailyCount >= 15) {
          console.log('🎬 Límite diario de videos Veo 3 alcanzado');
          break;
        }

        // Llamar a Google Veo 3 API
        const googleApiKey = env.GEMINI_API_KEY;
        if (!googleApiKey) {
          console.log('🎬 GEMINI_API_KEY no configurada');
          break;
        }

        // Descargar imagen y convertir a base64
        console.log(`🎬 Descargando imagen de ${desarrollo}...`);
        const imgBase64 = await descargarImagenBase64(fotoDesarrollo);
        console.log(`🎬 Imagen descargada`);

        const veoResponse = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-fast-generate-001:predictLongRunning',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': googleApiKey
            },
            body: JSON.stringify({
              instances: [{
                prompt: prompt,
                image: { bytesBase64Encoded: imgBase64, mimeType: 'image/jpeg' }
              }],
              parameters: {
                aspectRatio: '9:16',
                durationSeconds: 8
              }
            })
          }
        );

        if (!veoResponse.ok) {
          const errorText = await veoResponse.text();
          console.error(`Error Veo 3 para ${lead.name}:`, errorText);
          continue;
        }

        const veoData = await veoResponse.json() as any;
        const operationName = veoData.name;

        if (operationName) {
          // Normalizar teléfono (agregar código de país México si no lo tiene)
          let phoneNormalizado = lead.phone?.replace(/\D/g, '') || '';
          if (phoneNormalizado.length === 10) {
            phoneNormalizado = '521' + phoneNormalizado;
          } else if (phoneNormalizado.startsWith('1') && phoneNormalizado.length === 11) {
            phoneNormalizado = '52' + phoneNormalizado;
          } else if (!phoneNormalizado.startsWith('52')) {
            phoneNormalizado = '52' + phoneNormalizado;
          }

          // Guardar operación pendiente
          await supabase.client.from('pending_videos').insert({
            lead_id: lead.id,
            lead_name: lead.name,
            lead_phone: phoneNormalizado,
            desarrollo: desarrollo,
            operation_id: operationName,
            video_type: 'felicitacion_postventa',
            sent: false,
            created_at: new Date().toISOString()
          });

          // Marcar en notas que se generó el video
          const notasActualizadas = {
            ...notas,
            video_felicitacion_generado: hoyStr,
            video_felicitacion_operation: operationName
          };

          await supabase.client
            .from('leads')
            .update({ notes: notasActualizadas })
            .eq('id', lead.id);

          // Actualizar contador diario
          await supabase.client
            .from('system_config')
            .upsert({
              key: 'veo3_daily_count',
              value: String(dailyCount + 1),
              updated_at: new Date().toISOString()
            });

          generados++;
          console.log(`🎬 Video felicitación iniciado para: ${lead.name} (${desarrollo})`);
        }

        await new Promise(r => setTimeout(r, 3000)); // Pausa entre llamadas API

      } catch (err) {
        console.error(`Error generando video para ${lead.name}:`, err);
      }
    }

    console.log(`🎬 Videos de felicitación iniciados: ${generados}`);
    if (generados > 0) {
      await logEvento(supabase, 'video', `Videos felicitación postventa: ${generados} iniciados`, { generados, tipo: 'felicitacion' });
    }

  } catch (e) {
    console.error('Error en videoFelicitacionPostVenta:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'videoFelicitacionPostVenta', stack: (e as Error).stack });
  }
}

// ═══════════════════════════════════════════════════════════
// VIDEO DE BIENVENIDA PARA LEADS NUEVOS (Veo 3)
// Genera video personalizado cuando un lead nuevo interactúa
// ═══════════════════════════════════════════════════════════
export async function videoBienvenidaLeadNuevo(supabase: SupabaseService, meta: MetaWhatsAppService, env: any): Promise<void> {
  try {
    const ahora = new Date();
    const hace2horas = new Date(ahora.getTime() - 2 * 60 * 60 * 1000);
    const hoyStr = ahora.toISOString().split('T')[0];

    // Buscar leads nuevos de las últimas 2 horas que NO tienen video de bienvenida
    const { data: leads } = await supabase.client
      .from('leads')
      .select('id, name, phone, property_interest, notes, created_at, status')
      .eq('status', 'new')
      .gt('created_at', hace2horas.toISOString())
      .not('phone', 'is', null)
      .limit(5);

    if (!leads || leads.length === 0) {
      console.log('🎬 No hay leads nuevos para video de bienvenida');
      return;
    }

    // Filtrar los que ya tienen video de bienvenida
    const leadsParaVideo = leads.filter(lead => {
      const notas = typeof lead.notes === 'object' ? lead.notes : {};
      return !(notas as any)?.video_bienvenida_enviado;
    });

    if (leadsParaVideo.length === 0) {
      console.log('🎬 Todos los leads nuevos ya tienen video de bienvenida');
      return;
    }

    console.log(`🎬 Leads nuevos para video de bienvenida: ${leadsParaVideo.length}`);

    let generados = 0;

    for (const lead of leadsParaVideo) {
      if (!lead.phone) continue;

      const notas = typeof lead.notes === 'object' ? lead.notes : {};
      const nombre = lead.name?.split(' ')[0] || 'amigo';
      const desarrollo = lead.property_interest || 'Grupo Santa Rita';
      const fotoDesarrollo = obtenerFotoDesarrollo(desarrollo);

      // Prompt para video de bienvenida - SOLO la fachada de la imagen
      const prompt = `IMPORTANT: Use ONLY the exact house facade from the input image. Do NOT generate any other buildings or locations.

Slow cinematic zoom towards the exact house in the image. A female real estate agent appears in front of this same house and says in Spanish: "¡Hola ${nombre}! Soy Sara de Grupo Santa Rita. Me da mucho gusto que te interese ${desarrollo}. Estoy aquí para ayudarte. ¿Te gustaría agendar una visita?".

Keep focus on this specific house facade. Warm daylight, 4k. No text, no subtitles, no overlays.`;

      try {
        // Verificar límites de API
        const { data: configData } = await supabase.client
          .from('system_config')
          .select('value')
          .eq('key', 'veo3_daily_count')
          .single();

        const dailyCount = configData?.value ? parseInt(configData.value) : 0;
        if (dailyCount >= 20) { // Límite de 20 videos/día incluyendo bienvenida + felicitación
          console.log('🎬 Límite diario de videos Veo 3 alcanzado');
          break;
        }

        const googleApiKey = env.GEMINI_API_KEY;
        if (!googleApiKey) {
          console.log('🎬 GEMINI_API_KEY no configurada');
          break;
        }

        // Descargar imagen y convertir a base64
        console.log(`🎬 Descargando imagen para bienvenida ${nombre} (${desarrollo})...`);
        const imgBase64 = await descargarImagenBase64(fotoDesarrollo);

        const veoResponse = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-fast-generate-001:predictLongRunning',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': googleApiKey
            },
            body: JSON.stringify({
              instances: [{
                prompt: prompt,
                image: { bytesBase64Encoded: imgBase64, mimeType: 'image/jpeg' }
              }],
              parameters: {
                aspectRatio: '9:16',
                durationSeconds: 8
              }
            })
          }
        );

        if (!veoResponse.ok) {
          const errorText = await veoResponse.text();
          console.error(`Error Veo 3 bienvenida para ${lead.name}:`, errorText);
          continue;
        }

        const veoData = await veoResponse.json() as any;
        const operationName = veoData.name;

        if (operationName) {
          // Normalizar teléfono
          let phoneNormalizado = lead.phone?.replace(/\D/g, '') || '';
          if (phoneNormalizado.length === 10) {
            phoneNormalizado = '521' + phoneNormalizado;
          } else if (phoneNormalizado.startsWith('1') && phoneNormalizado.length === 11) {
            phoneNormalizado = '52' + phoneNormalizado;
          } else if (!phoneNormalizado.startsWith('52')) {
            phoneNormalizado = '52' + phoneNormalizado;
          }

          // Guardar operación pendiente
          await supabase.client.from('pending_videos').insert({
            lead_id: lead.id,
            lead_name: lead.name,
            lead_phone: phoneNormalizado,
            desarrollo: desarrollo,
            operation_id: operationName,
            video_type: 'bienvenida_lead_nuevo',
            sent: false,
            created_at: new Date().toISOString()
          });

          // Marcar en notas que se generó el video
          const notasActualizadas = {
            ...notas,
            video_bienvenida_enviado: hoyStr,
            video_bienvenida_operation: operationName
          };

          await supabase.client
            .from('leads')
            .update({ notes: notasActualizadas })
            .eq('id', lead.id);

          // Actualizar contador diario
          await supabase.client
            .from('system_config')
            .upsert({
              key: 'veo3_daily_count',
              value: String(dailyCount + 1),
              updated_at: new Date().toISOString()
            });

          generados++;
          console.log(`🎬 Video bienvenida iniciado para: ${lead.name} (${desarrollo})`);
        }

        await new Promise(r => setTimeout(r, 3000)); // Pausa entre llamadas API

      } catch (err) {
        console.error(`Error generando video bienvenida para ${lead.name}:`, err);
      }
    }

    console.log(`🎬 Videos de bienvenida iniciados: ${generados}`);
    if (generados > 0) {
      await logEvento(supabase, 'video', `Videos bienvenida leads nuevos: ${generados} iniciados`, { generados, tipo: 'bienvenida' });
    }

  } catch (e) {
    console.error('Error en videoBienvenidaLeadNuevo:', e);
    await logErrorToDB(supabase, 'cron_error', (e as Error).message || String(e), { severity: 'error', source: 'videoBienvenidaLeadNuevo', stack: (e as Error).stack });
  }
}
