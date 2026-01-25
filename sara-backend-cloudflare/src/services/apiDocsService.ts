// ═══════════════════════════════════════════════════════════════════════════
// API DOCS SERVICE - Documentación OpenAPI/Swagger
// ═══════════════════════════════════════════════════════════════════════════
// Genera documentación automática de la API
// Incluye UI interactiva tipo Swagger para probar endpoints
// ═══════════════════════════════════════════════════════════════════════════

export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{ url: string; description: string }>;
  paths: Record<string, any>;
  components: {
    securitySchemes: Record<string, any>;
    schemas: Record<string, any>;
  };
}

/**
 * Genera la especificación OpenAPI de la API de SARA
 */
export function generateOpenAPISpec(baseUrl: string): OpenAPISpec {
  return {
    openapi: '3.0.3',
    info: {
      title: 'SARA Backend API',
      version: '2.0.0',
      description: `
API del backend de SARA - Sistema de Asistencia para Real Estate Automatizado.

## Autenticación
La mayoría de endpoints requieren autenticación via Bearer token o query param:
- Header: \`Authorization: Bearer <API_SECRET>\`
- Query: \`?api_key=<API_SECRET>\`

## Endpoints públicos
Los siguientes endpoints NO requieren autenticación:
- \`/health\` - Health check
- \`/status\` - Dashboard de estado
- \`/analytics\` - Dashboard de métricas
- \`/webhook\` - Webhook de WhatsApp
      `
    },
    servers: [
      { url: baseUrl, description: 'Production' },
      { url: baseUrl.replace('sara-backend', 'sara-backend-staging'), description: 'Staging' }
    ],
    paths: {
      '/health': {
        get: {
          summary: 'Health Check',
          description: 'Verifica que el servicio esté funcionando',
          tags: ['Sistema'],
          responses: {
            '200': {
              description: 'Servicio funcionando',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ok' },
                      timestamp: { type: 'string', format: 'date-time' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/status': {
        get: {
          summary: 'Status Dashboard',
          description: 'Dashboard visual con estado de todos los servicios',
          tags: ['Sistema'],
          responses: {
            '200': {
              description: 'HTML del dashboard o JSON con métricas',
              content: {
                'text/html': { schema: { type: 'string' } },
                'application/json': {
                  schema: { $ref: '#/components/schemas/SystemStatus' }
                }
              }
            }
          }
        }
      },
      '/analytics': {
        get: {
          summary: 'Analytics Dashboard',
          description: 'Métricas de conversión, leads y ventas',
          tags: ['Analytics'],
          parameters: [
            {
              name: 'period',
              in: 'query',
              description: 'Días a analizar',
              schema: { type: 'integer', default: 30 }
            }
          ],
          responses: {
            '200': {
              description: 'Métricas del período',
              content: {
                'text/html': { schema: { type: 'string' } },
                'application/json': {
                  schema: { $ref: '#/components/schemas/Analytics' }
                }
              }
            }
          }
        }
      },
      '/flags': {
        get: {
          summary: 'Obtener Feature Flags',
          description: 'Lista todos los feature flags activos',
          tags: ['Feature Flags'],
          responses: {
            '200': {
              description: 'Feature flags actuales',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/FeatureFlags' }
                }
              }
            }
          }
        },
        put: {
          summary: 'Actualizar Feature Flags',
          description: 'Actualiza uno o más feature flags',
          tags: ['Feature Flags'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: true,
                  example: { ai_responses_enabled: true }
                }
              }
            }
          },
          responses: {
            '200': { description: 'Flags actualizados' },
            '401': { description: 'No autorizado' }
          }
        }
      },
      '/api/team-members': {
        get: {
          summary: 'Listar Team Members',
          description: 'Obtiene lista de miembros del equipo',
          tags: ['Team'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Lista de team members',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/TeamMember' }
                  }
                }
              }
            }
          }
        }
      },
      '/api/reports/preview': {
        get: {
          summary: 'Preview de Reporte',
          description: 'Genera preview del reporte sin enviar email',
          tags: ['Reports'],
          parameters: [
            {
              name: 'days',
              in: 'query',
              description: 'Días a incluir',
              schema: { type: 'integer', default: 7 }
            }
          ],
          responses: {
            '200': {
              description: 'Preview del reporte',
              content: {
                'text/html': { schema: { type: 'string' } },
                'application/json': {
                  schema: { $ref: '#/components/schemas/ReportData' }
                }
              }
            }
          }
        }
      },
      '/api/reports/send': {
        post: {
          summary: 'Enviar Reporte',
          description: 'Envía reporte por email',
          tags: ['Reports'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'period',
              in: 'query',
              description: 'Tipo de reporte',
              schema: { type: 'string', enum: ['daily', 'weekly', 'monthly'] }
            }
          ],
          responses: {
            '200': { description: 'Reporte enviado' },
            '401': { description: 'No autorizado' }
          }
        }
      },
      '/webhook': {
        get: {
          summary: 'Verificar Webhook',
          description: 'Endpoint de verificación para Meta/WhatsApp',
          tags: ['WhatsApp'],
          parameters: [
            { name: 'hub.mode', in: 'query', schema: { type: 'string' } },
            { name: 'hub.verify_token', in: 'query', schema: { type: 'string' } },
            { name: 'hub.challenge', in: 'query', schema: { type: 'string' } }
          ],
          responses: {
            '200': { description: 'Challenge aceptado' },
            '403': { description: 'Token inválido' }
          }
        },
        post: {
          summary: 'Recibir Mensaje',
          description: 'Recibe mensajes entrantes de WhatsApp',
          tags: ['WhatsApp'],
          requestBody: {
            content: {
              'application/json': {
                schema: { type: 'object' }
              }
            }
          },
          responses: {
            '200': { description: 'Mensaje procesado' }
          }
        }
      }
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'API Secret como Bearer token'
        },
        apiKeyQuery: {
          type: 'apiKey',
          in: 'query',
          name: 'api_key',
          description: 'API Secret como query parameter'
        }
      },
      schemas: {
        SystemStatus: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            uptime: { type: 'string' },
            services: {
              type: 'object',
              properties: {
                database: { type: 'string' },
                whatsapp: { type: 'string' },
                cache: { type: 'string' }
              }
            }
          }
        },
        Analytics: {
          type: 'object',
          properties: {
            totalLeads: { type: 'integer' },
            conversionRate: { type: 'number' },
            topSellers: { type: 'array', items: { type: 'object' } }
          }
        },
        FeatureFlags: {
          type: 'object',
          properties: {
            ai_responses_enabled: { type: 'boolean' },
            slack_notifications_enabled: { type: 'boolean' },
            audio_transcription_enabled: { type: 'boolean' }
          }
        },
        TeamMember: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            phone: { type: 'string' },
            role: { type: 'string' },
            active: { type: 'boolean' }
          }
        },
        ReportData: {
          type: 'object',
          properties: {
            period: { type: 'string' },
            totalLeads: { type: 'integer' },
            conversionRate: { type: 'number' },
            topSellers: { type: 'array', items: { type: 'object' } }
          }
        }
      }
    }
  };
}

/**
 * Genera HTML de Swagger UI
 */
export function generateSwaggerUI(specUrl: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SARA API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css">
  <style>
    body { margin: 0; padding: 0; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info { margin: 20px 0; }
    .swagger-ui .info .title { color: #667eea; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: "${specUrl}",
        dom_id: '#swagger-ui',
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout",
        deepLinking: true,
        showExtensions: true,
        showCommonExtensions: true
      });
    };
  </script>
</body>
</html>`;
}

/**
 * Genera HTML de ReDoc (alternativa más limpia)
 */
export function generateReDocUI(specUrl: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SARA API Docs</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    body { margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
  </style>
</head>
<body>
  <redoc spec-url="${specUrl}"
         hide-download-button
         theme='{
           "colors": { "primary": { "main": "#667eea" } },
           "typography": { "fontFamily": "Inter, sans-serif" }
         }'>
  </redoc>
  <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
</body>
</html>`;
}
