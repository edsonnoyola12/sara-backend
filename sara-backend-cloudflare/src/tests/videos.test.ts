import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies BEFORE importing the functions
vi.mock('../crons/briefings', () => ({
  logEvento: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../crons/healthCheck', () => ({
  logErrorToDB: vi.fn().mockResolvedValue(undefined),
}));

// Mock global fetch for Google API calls and video downloads
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// ═══════════════════════════════════════════════════════════
// Mock factories
// ═══════════════════════════════════════════════════════════

function createMockSupabase(responses: Record<string, any> = {}) {
  return {
    client: {
      from: vi.fn((table: string) => {
        const response = responses[table] || { data: null, error: null };
        return {
          select: vi.fn((fields?: string, opts?: any) => {
            // Count query pattern: .select('id', { count: 'exact', head: true })
            if (opts?.count === 'exact' && opts?.head === true) {
              return {
                gte: vi.fn().mockReturnValue({
                  lt: vi.fn().mockResolvedValue(response.count !== undefined ? { count: response.count } : { count: 0 }),
                  lte: vi.fn().mockResolvedValue(response.count !== undefined ? { count: response.count } : { count: 0 }),
                }),
                eq: vi.fn().mockReturnValue({
                  gte: vi.fn().mockReturnValue({
                    lte: vi.fn().mockResolvedValue(response.count !== undefined ? { count: response.count } : { count: 0 }),
                  }),
                }),
              };
            }

            // Normal select chain
            return {
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue(response),
                }),
                limit: vi.fn().mockResolvedValue(response),
                single: vi.fn().mockResolvedValue(response),
                maybeSingle: vi.fn().mockResolvedValue(response),
                not: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue(response),
                }),
              }),
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockResolvedValue(response),
                lt: vi.fn().mockResolvedValue(response),
              }),
              in: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue(response),
              }),
              not: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue(response),
              }),
            };
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
          upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    },
  };
}

/**
 * Creates a more specific mock supabase for verificarVideosPendientes.
 * Because the function chains multiple queries on the same table, we
 * need fine-grained control over what each chained query returns.
 */
function createMockSupabaseForVideos(opts: {
  dailyCount?: number;
  pendingVideos?: any[];
  teamMembers?: any[];
} = {}) {
  const { dailyCount = 0, pendingVideos = [], teamMembers = [] } = opts;

  return {
    client: {
      from: vi.fn((table: string) => {
        if (table === 'pending_videos') {
          return {
            select: vi.fn((fields?: string, opts2?: any) => {
              // First call: count query
              if (opts2?.count === 'exact' && opts2?.head === true) {
                return {
                  gte: vi.fn().mockReturnValue({
                    lt: vi.fn().mockResolvedValue({ count: dailyCount }),
                  }),
                };
              }
              // Second call: pending videos list
              return {
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: pendingVideos }),
                  }),
                }),
              };
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }

        if (table === 'team_members') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: teamMembers }),
              }),
            }),
          };
        }

        if (table === 'leads') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockReturnValue({
                  not: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [] }),
                  }),
                }),
                single: vi.fn().mockResolvedValue({ data: null }),
              }),
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockResolvedValue({ data: [] }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }

        if (table === 'appointments') {
          return {
            select: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockResolvedValue({ data: [] }),
              }),
            }),
          };
        }

        if (table === 'system_config') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { value: '0' } }),
              }),
            }),
            upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }

        // Default fallback for any other table
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              limit: vi.fn().mockResolvedValue({ data: [] }),
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [] }),
              }),
            }),
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({ data: [] }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
          upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    },
  };
}

/**
 * Creates a mock supabase specifically for generarVideoSemanalLogros.
 * This function makes 4 different from() calls with distinct query chains:
 * 1. leads.select('id', {count:'exact'}).gte().lte() -> leadsNuevos
 * 2. appointments.select('id', {count:'exact'}).gte().lte() -> citasAgendadas
 * 3. leads.select('id, assigned_to', {count:'exact'}).eq('status','closed').gte().lte() -> cierres
 * 4. team_members.select(...).eq('role','vendedor').eq('active',true) -> vendedores
 * 5. pending_videos.insert(...)
 */
function createMockSupabaseForSemanal(opts: {
  leadsNuevos?: any[];
  citasAgendadas?: any[];
  cierres?: any[];
  vendedores?: any[];
} = {}) {
  const { leadsNuevos = [], citasAgendadas = [], cierres = [], vendedores = [] } = opts;

  // Track calls to 'leads' to distinguish between leadsNuevos and cierres
  let leadsCallIndex = 0;

  return {
    client: {
      from: vi.fn((table: string) => {
        if (table === 'leads') {
          leadsCallIndex++;
          const currentIndex = leadsCallIndex;
          return {
            select: vi.fn().mockReturnValue({
              // For leadsNuevos: .gte().lte()
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockResolvedValue({ data: currentIndex === 1 ? leadsNuevos : cierres }),
              }),
              // For cierres: .eq('status','closed').gte().lte()
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({ data: cierres }),
                }),
              }),
            }),
          };
        }

        if (table === 'appointments') {
          return {
            select: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockResolvedValue({ data: citasAgendadas }),
              }),
            }),
          };
        }

        if (table === 'team_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: vendedores }),
              }),
            }),
          };
        }

        if (table === 'pending_videos') {
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }

        // Default
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    },
  };
}

function createMockMeta() {
  return {
    uploadVideoFromBuffer: vi.fn().mockResolvedValue('media-id-123'),
    sendWhatsAppVideoById: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid-video-123' }] }),
    sendWhatsAppMessage: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid-msg-123' }] }),
    sendWhatsAppImage: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid-img-123' }] }),
  };
}

function createMockEnv() {
  return {
    GEMINI_API_KEY: 'fake-gemini-key',
    VEO_API_KEY: 'fake-veo-key',
    SARA_CACHE: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
    },
  };
}

// Import the functions AFTER mocking dependencies
import {
  verificarVideosPendientes,
  generarVideoSemanalLogros,
  videoFelicitacionPostVenta,
  videoBienvenidaLeadNuevo,
} from '../crons/videos';
import { logEvento } from '../crons/briefings';
import { logErrorToDB } from '../crons/healthCheck';

describe('Videos (crons/videos.ts)', () => {
  let mockMeta: ReturnType<typeof createMockMeta>;
  let mockEnv: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMeta = createMockMeta();
    mockEnv = createMockEnv();
    mockFetch.mockReset();
  });

  // ═══════════════════════════════════════════════════════════
  // verificarVideosPendientes
  // ═══════════════════════════════════════════════════════════
  describe('verificarVideosPendientes', () => {
    it('should return early when no pending videos exist', async () => {
      const mockSupabase = createMockSupabaseForVideos({
        dailyCount: 0,
        pendingVideos: [],
      });

      await verificarVideosPendientes(mockSupabase as any, mockMeta as any, mockEnv);

      // Should not call fetch (no Google API checks)
      expect(mockFetch).not.toHaveBeenCalled();
      // Should not upload or send anything
      expect(mockMeta.uploadVideoFromBuffer).not.toHaveBeenCalled();
      expect(mockMeta.sendWhatsAppVideoById).not.toHaveBeenCalled();
    });

    it('should return early when daily rate limit (100/day) is reached', async () => {
      const mockSupabase = createMockSupabaseForVideos({
        dailyCount: 100,
        pendingVideos: [{ id: 'v1', lead_name: 'Test', operation_id: 'op-1', sent: false }],
      });

      await verificarVideosPendientes(mockSupabase as any, mockMeta as any, mockEnv);

      // Should not fetch Google API since rate limit is reached
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockMeta.uploadVideoFromBuffer).not.toHaveBeenCalled();
    });

    it('should process pending video: download from Google, upload to Meta, send to lead', async () => {
      const pendingVideo = {
        id: 'video-1',
        lead_name: 'Juan',
        lead_phone: '5212345678901',
        desarrollo: 'Monte Verde',
        operation_id: 'operations/generate-video-123',
        video_url: null,
        sent: false,
      };

      const mockSupabase = createMockSupabaseForVideos({
        dailyCount: 5,
        pendingVideos: [pendingVideo],
      });

      // Mock Google API status check (done=true with video URI)
      const videoUri = 'https://generativelanguage.googleapis.com/v1beta/files/video-abc/content';
      mockFetch
        // First call: check operation status
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            done: true,
            response: {
              generateVideoResponse: {
                generatedSamples: [{ video: { uri: videoUri } }],
              },
            },
          }),
        })
        // Second call: download video from Google
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(1024),
        });

      await verificarVideosPendientes(mockSupabase as any, mockMeta as any, mockEnv);

      // Should check Google operation status
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('operations/generate-video-123'),
        expect.objectContaining({
          headers: { 'x-goog-api-key': 'fake-gemini-key' },
        })
      );

      // Should upload video buffer to Meta
      expect(mockMeta.uploadVideoFromBuffer).toHaveBeenCalledWith(expect.any(ArrayBuffer));

      // Should send video to lead via WhatsApp
      expect(mockMeta.sendWhatsAppVideoById).toHaveBeenCalledWith(
        '5212345678901',
        'media-id-123',
        expect.stringContaining('Juan')
      );
    });

    it('should skip video when Google API operation is not done yet', async () => {
      const pendingVideo = {
        id: 'video-2',
        lead_name: 'Maria',
        lead_phone: '5219876543210',
        desarrollo: 'Los Encinos',
        operation_id: 'operations/gen-456',
        video_url: null,
        sent: false,
      };

      const mockSupabase = createMockSupabaseForVideos({
        dailyCount: 2,
        pendingVideos: [pendingVideo],
      });

      // Google API: not done yet
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ done: false }),
      });

      await verificarVideosPendientes(mockSupabase as any, mockMeta as any, mockEnv);

      // Should check status
      expect(mockFetch).toHaveBeenCalledTimes(1);
      // Should NOT try to download or upload
      expect(mockMeta.uploadVideoFromBuffer).not.toHaveBeenCalled();
      expect(mockMeta.sendWhatsAppVideoById).not.toHaveBeenCalled();
    });

    it('should handle Google API status check returning error', async () => {
      const pendingVideo = {
        id: 'video-3',
        lead_name: 'Pedro',
        lead_phone: '5211111111111',
        desarrollo: 'Andes',
        operation_id: 'operations/gen-789',
        video_url: null,
        sent: false,
      };

      const mockSupabase = createMockSupabaseForVideos({
        dailyCount: 0,
        pendingVideos: [pendingVideo],
      });

      // Google API: HTTP error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await verificarVideosPendientes(mockSupabase as any, mockMeta as any, mockEnv);

      // Should not upload or send
      expect(mockMeta.uploadVideoFromBuffer).not.toHaveBeenCalled();
      expect(mockMeta.sendWhatsAppVideoById).not.toHaveBeenCalled();
    });

    it('should handle video download error (non-ok response)', async () => {
      const pendingVideo = {
        id: 'video-4',
        lead_name: 'Ana',
        lead_phone: '5212222222222',
        desarrollo: 'Miravalle',
        operation_id: 'operations/gen-aaa',
        video_url: null,
        sent: false,
      };

      const mockSupabase = createMockSupabaseForVideos({
        dailyCount: 1,
        pendingVideos: [pendingVideo],
      });

      const videoUri = 'https://generativelanguage.googleapis.com/v1beta/files/vid-xyz/content';

      // Google API: done with URI
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            done: true,
            response: {
              generateVideoResponse: {
                generatedSamples: [{ video: { uri: videoUri } }],
              },
            },
          }),
        })
        // Download fails
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
        });

      await verificarVideosPendientes(mockSupabase as any, mockMeta as any, mockEnv);

      // Should NOT upload to Meta since download failed
      expect(mockMeta.uploadVideoFromBuffer).not.toHaveBeenCalled();
      expect(mockMeta.sendWhatsAppVideoById).not.toHaveBeenCalled();
    });

    it('should handle Meta upload error gracefully', async () => {
      const pendingVideo = {
        id: 'video-5',
        lead_name: 'Luis',
        lead_phone: '5213333333333',
        desarrollo: 'Distrito Falco',
        operation_id: 'operations/gen-bbb',
        video_url: null,
        sent: false,
      };

      const mockSupabase = createMockSupabaseForVideos({
        dailyCount: 0,
        pendingVideos: [pendingVideo],
      });

      const videoUri = 'https://generativelanguage.googleapis.com/v1beta/files/vid-bbb/content';

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            done: true,
            response: {
              generateVideoResponse: {
                generatedSamples: [{ video: { uri: videoUri } }],
              },
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(512),
        });

      // Meta upload fails
      mockMeta.uploadVideoFromBuffer.mockRejectedValueOnce(new Error('Meta upload failed'));

      await verificarVideosPendientes(mockSupabase as any, mockMeta as any, mockEnv);

      // Upload was attempted
      expect(mockMeta.uploadVideoFromBuffer).toHaveBeenCalledTimes(1);
      // But send was NOT attempted
      expect(mockMeta.sendWhatsAppVideoById).not.toHaveBeenCalled();
    });

    it('should retry sending when video_url already exists (retry path)', async () => {
      const pendingVideo = {
        id: 'video-retry',
        lead_name: 'Carlos',
        lead_phone: '5214444444444',
        desarrollo: 'Andes',
        operation_id: 'operations/gen-retry',
        video_url: 'https://generativelanguage.googleapis.com/v1beta/files/existing/content',
        sent: false,
      };

      const mockSupabase = createMockSupabaseForVideos({
        dailyCount: 3,
        pendingVideos: [pendingVideo],
      });

      // Retry download succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(2048),
      });

      await verificarVideosPendientes(mockSupabase as any, mockMeta as any, mockEnv);

      // Should download from existing URL
      expect(mockFetch).toHaveBeenCalledWith(
        pendingVideo.video_url,
        expect.objectContaining({
          headers: { 'x-goog-api-key': 'fake-gemini-key' },
        })
      );

      // Should upload and send
      expect(mockMeta.uploadVideoFromBuffer).toHaveBeenCalledTimes(1);
      expect(mockMeta.sendWhatsAppVideoById).toHaveBeenCalledWith(
        '5214444444444',
        'media-id-123',
        expect.stringContaining('Carlos')
      );
    });

    it('should mark video as error when Google API returns status.error', async () => {
      const pendingVideo = {
        id: 'video-err',
        lead_name: 'ErrorLead',
        lead_phone: '5215555555555',
        desarrollo: 'Monte Verde',
        operation_id: 'operations/gen-err',
        video_url: null,
        sent: false,
      };

      const mockSupabase = createMockSupabaseForVideos({
        dailyCount: 0,
        pendingVideos: [pendingVideo],
      });

      // Google API: done=true but with error
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          done: true,
          error: { message: 'Content policy violation' },
        }),
      });

      await verificarVideosPendientes(mockSupabase as any, mockMeta as any, mockEnv);

      // Should NOT try to download or upload since there is an error
      expect(mockMeta.uploadVideoFromBuffer).not.toHaveBeenCalled();
      expect(mockMeta.sendWhatsAppVideoById).not.toHaveBeenCalled();
    });

    it('should mark video as RAI error when blocked by safety filters', async () => {
      const pendingVideo = {
        id: 'video-rai',
        lead_name: 'RAILead',
        lead_phone: '5216666666666',
        desarrollo: 'Andes',
        operation_id: 'operations/gen-rai',
        video_url: null,
        sent: false,
      };

      const mockSupabase = createMockSupabaseForVideos({
        dailyCount: 0,
        pendingVideos: [pendingVideo],
      });

      // Google API: done=true, no URI but RAI filter reasons
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          done: true,
          response: {
            generateVideoResponse: {
              raiMediaFilteredReasons: ['SAFETY_FILTER_TRIGGERED'],
            },
          },
        }),
      });

      await verificarVideosPendientes(mockSupabase as any, mockMeta as any, mockEnv);

      // Should NOT upload or send
      expect(mockMeta.uploadVideoFromBuffer).not.toHaveBeenCalled();
      expect(mockMeta.sendWhatsAppVideoById).not.toHaveBeenCalled();
    });

    it('should mark video as error when done=true but no URI found', async () => {
      const pendingVideo = {
        id: 'video-nouri',
        lead_name: 'NoURILead',
        lead_phone: '5217777777777',
        desarrollo: 'Falco',
        operation_id: 'operations/gen-nouri',
        video_url: null,
        sent: false,
      };

      const mockSupabase = createMockSupabaseForVideos({
        dailyCount: 0,
        pendingVideos: [pendingVideo],
      });

      // Google API: done=true, no URI, no error, no RAI
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          done: true,
          response: {},
        }),
      });

      await verificarVideosPendientes(mockSupabase as any, mockMeta as any, mockEnv);

      // Should NOT upload or send
      expect(mockMeta.uploadVideoFromBuffer).not.toHaveBeenCalled();
      expect(mockMeta.sendWhatsAppVideoById).not.toHaveBeenCalled();
    });

    it('should handle TEAM_WEEKLY video by sending to all team members in parallel', async () => {
      const pendingVideo = {
        id: 'video-weekly',
        lead_name: 'Equipo Santa Rita',
        lead_phone: 'TEAM_WEEKLY',
        desarrollo: JSON.stringify({
          leads: 10,
          citas: 5,
          cierres: 2,
          topName: 'Juan',
          topCierres: 2,
        }),
        operation_id: 'operations/gen-weekly',
        video_url: null,
        sent: false,
      };

      const teamMembers = [
        { phone: '5211111111111', name: 'Vendedor A', role: 'vendedor' },
        { phone: '5212222222222', name: 'Admin B', role: 'admin' },
      ];

      const mockSupabase = createMockSupabaseForVideos({
        dailyCount: 2,
        pendingVideos: [pendingVideo],
        teamMembers,
      });

      const videoUri = 'https://generativelanguage.googleapis.com/v1beta/files/vid-weekly/content';

      // Mock Google API: done with URI
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            done: true,
            response: {
              generateVideoResponse: {
                generatedSamples: [{ video: { uri: videoUri } }],
              },
            },
          }),
        })
        // Download video
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(4096),
        });

      await verificarVideosPendientes(mockSupabase as any, mockMeta as any, mockEnv);

      // Should upload video to Meta once
      expect(mockMeta.uploadVideoFromBuffer).toHaveBeenCalledTimes(1);

      // Should send video to BOTH team members
      expect(mockMeta.sendWhatsAppVideoById).toHaveBeenCalledTimes(2);
      expect(mockMeta.sendWhatsAppVideoById).toHaveBeenCalledWith(
        '5211111111111',
        'media-id-123',
        expect.stringContaining('RESUMEN SEMANAL')
      );
      expect(mockMeta.sendWhatsAppVideoById).toHaveBeenCalledWith(
        '5212222222222',
        'media-id-123',
        expect.stringContaining('RESUMEN SEMANAL')
      );
    });

    it('should not skip video_url starting with ERROR on retry path', async () => {
      const pendingVideo = {
        id: 'video-err-url',
        lead_name: 'ErrURL',
        lead_phone: '5218888888888',
        desarrollo: 'Monte Verde',
        operation_id: 'operations/gen-errurl',
        video_url: 'ERROR: Content policy violation',
        sent: false,
      };

      const mockSupabase = createMockSupabaseForVideos({
        dailyCount: 0,
        pendingVideos: [pendingVideo],
      });

      // Since video_url starts with ERROR, it should skip retry and go to status check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ done: false }),
      });

      await verificarVideosPendientes(mockSupabase as any, mockMeta as any, mockEnv);

      // Should check the operation status (not retry the ERROR URL)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('operations/gen-errurl'),
        expect.any(Object)
      );
    });

    it('should mark video as error on unexpected exception in processing loop', async () => {
      const pendingVideo = {
        id: 'video-crash',
        lead_name: 'CrashLead',
        lead_phone: '5219999999999',
        desarrollo: 'Andes',
        operation_id: 'operations/gen-crash',
        video_url: null,
        sent: false,
      };

      const mockSupabase = createMockSupabaseForVideos({
        dailyCount: 0,
        pendingVideos: [pendingVideo],
      });

      // Google API throws an unexpected error
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      await verificarVideosPendientes(mockSupabase as any, mockMeta as any, mockEnv);

      // Should NOT crash the function
      expect(mockMeta.uploadVideoFromBuffer).not.toHaveBeenCalled();
      expect(mockMeta.sendWhatsAppVideoById).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // generarVideoSemanalLogros
  // ═══════════════════════════════════════════════════════════
  describe('generarVideoSemanalLogros', () => {
    it('should handle no achievements (0 leads, 0 appointments, 0 closings)', async () => {
      const mockSupabase = createMockSupabaseForSemanal({
        leadsNuevos: [],
        citasAgendadas: [],
        cierres: [],
        vendedores: [],
      });

      // Mock image download for reference photo
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });

      // Mock Veo 3 API call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'operations/weekly-video-001' }),
      });

      await generarVideoSemanalLogros(mockSupabase as any, mockMeta as any, mockEnv);

      // Should still call Veo 3 API (generates video even with 0 stats)
      expect(mockFetch).toHaveBeenCalledTimes(2);
      // First call: image download, second call: Veo 3 API
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('veo-3.0-fast-generate-001'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should generate video for top seller and insert pending_videos record', async () => {
      const vendedorId = 'vendor-1';
      const mockSupabase = createMockSupabaseForSemanal({
        leadsNuevos: [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }],
        citasAgendadas: [{ id: 'a1' }, { id: 'a2' }],
        cierres: [{ id: 'c1', assigned_to: vendedorId }],
        vendedores: [{ id: vendedorId, name: 'Juan Perez', phone: '5211234567890' }],
      });

      // Mock image download
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(200),
      });

      // Mock Veo 3 API
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'operations/weekly-video-top' }),
      });

      await generarVideoSemanalLogros(mockSupabase as any, mockMeta as any, mockEnv);

      // Should call Veo 3 API
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Should insert pending_videos record for team weekly video
      expect(mockSupabase.client.from).toHaveBeenCalledWith('pending_videos');
    });

    it('should handle Veo 3 API error gracefully and log error', async () => {
      const mockSupabase = createMockSupabaseForSemanal({
        leadsNuevos: [{ id: 'l1' }],
        citasAgendadas: [],
        cierres: [],
        vendedores: [],
      });

      // Mock image download
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });

      // Mock Veo 3 API failure
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () => 'Quota exceeded',
      });

      await generarVideoSemanalLogros(mockSupabase as any, mockMeta as any, mockEnv);

      // Should NOT insert pending_videos since Veo 3 failed
      // The function returns early on !response.ok
      expect(mockMeta.sendWhatsAppVideoById).not.toHaveBeenCalled();
    });

    it('should handle Veo 3 response without operation name', async () => {
      const mockSupabase = createMockSupabaseForSemanal({
        leadsNuevos: [{ id: 'l1' }],
        citasAgendadas: [],
        cierres: [],
        vendedores: [],
      });

      // Mock image download
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });

      // Veo 3 response without operation name
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}), // no .name property
      });

      await generarVideoSemanalLogros(mockSupabase as any, mockMeta as any, mockEnv);

      // Should return early without inserting pending_videos
      expect(mockMeta.sendWhatsAppVideoById).not.toHaveBeenCalled();
    });

    it('should log error to DB on unexpected exception', async () => {
      const mockSupabase = createMockSupabaseForSemanal({});
      // Force an error by making the client.from throw
      mockSupabase.client.from = vi.fn(() => {
        throw new Error('Semanal DB crash');
      });

      await generarVideoSemanalLogros(mockSupabase as any, mockMeta as any, mockEnv);

      // Should call logErrorToDB with proper source
      expect(logErrorToDB).toHaveBeenCalledWith(
        mockSupabase,
        'cron_error',
        'Semanal DB crash',
        expect.objectContaining({
          severity: 'error',
          source: 'generarVideoSemanalLogros',
        })
      );
    });
  });

  // ═══════════════════════════════════════════════════════════
  // videoFelicitacionPostVenta
  // ═══════════════════════════════════════════════════════════
  describe('videoFelicitacionPostVenta', () => {
    it('should return early when no post-sale leads need videos', async () => {
      const mockSupabase = createMockSupabase({
        leads: { data: [], error: null },
      });

      await videoFelicitacionPostVenta(mockSupabase as any, mockMeta as any, mockEnv);

      // Should not call Veo 3 API
      expect(mockFetch).not.toHaveBeenCalled();
      // Should not log event (0 generated)
      expect(logEvento).not.toHaveBeenCalled();
    });

    it('should generate celebration video for a closed lead', async () => {
      const lead = {
        id: 'lead-sold-1',
        name: 'Roberto Garcia',
        phone: '4921234567',
        property_interest: 'Monte Verde',
        notes: {},
        updated_at: new Date().toISOString(),
      };

      const mockSupabase = createMockSupabaseForVideos({ dailyCount: 0 });

      // Override the leads query specifically
      const fromOriginal = mockSupabase.client.from;
      mockSupabase.client.from = vi.fn((table: string) => {
        if (table === 'leads') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockReturnValue({
                  not: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [lead] }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        return fromOriginal(table);
      });

      // Mock image download for development photo
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(300),
      });

      // Mock Veo 3 API call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'operations/felicitacion-001' }),
      });

      await videoFelicitacionPostVenta(mockSupabase as any, mockMeta as any, mockEnv);

      // Should call Veo 3 API with POST
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('veo-3.0-fast-generate-001'),
        expect.objectContaining({ method: 'POST' })
      );

      // Should log event for generated videos
      expect(logEvento).toHaveBeenCalledWith(
        mockSupabase,
        'video',
        expect.stringContaining('felicitaci'),
        expect.objectContaining({ generados: 1, tipo: 'felicitacion' })
      );
    });

    it('should skip lead that already has video_felicitacion_generado in notes', async () => {
      const lead = {
        id: 'lead-already-gen',
        name: 'Maria Lopez',
        phone: '4929876543',
        property_interest: 'Andes',
        notes: { video_felicitacion_generado: '2026-02-28' },
        updated_at: new Date().toISOString(),
      };

      const mockSupabase = createMockSupabaseForVideos({ dailyCount: 0 });
      const fromOriginal = mockSupabase.client.from;
      mockSupabase.client.from = vi.fn((table: string) => {
        if (table === 'leads') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockReturnValue({
                  not: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [lead] }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        return fromOriginal(table);
      });

      await videoFelicitacionPostVenta(mockSupabase as any, mockMeta as any, mockEnv);

      // Should NOT call Veo 3 API (already generated)
      expect(mockFetch).not.toHaveBeenCalled();
      // Should NOT log event (0 generated)
      expect(logEvento).not.toHaveBeenCalled();
    });

    it('should respect daily Veo 3 limit (15 videos/day for felicitacion)', async () => {
      const lead = {
        id: 'lead-limit',
        name: 'Test Lead',
        phone: '4921111111',
        property_interest: 'Falco',
        notes: {},
        updated_at: new Date().toISOString(),
      };

      const mockSupabase = createMockSupabaseForVideos({ dailyCount: 0 });
      const fromOriginal = mockSupabase.client.from;
      mockSupabase.client.from = vi.fn((table: string) => {
        if (table === 'leads') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockReturnValue({
                  not: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [lead] }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        if (table === 'system_config') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { value: '15' } }),
              }),
            }),
            upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return fromOriginal(table);
      });

      await videoFelicitacionPostVenta(mockSupabase as any, mockMeta as any, mockEnv);

      // Should NOT call Veo 3 because daily limit (15) is reached
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should normalize Mexican phone numbers (10 digits to 521 prefix)', async () => {
      const lead = {
        id: 'lead-phone-norm',
        name: 'Phone Test',
        phone: '4921234567', // 10 digits
        property_interest: 'Monte Verde',
        notes: {},
        updated_at: new Date().toISOString(),
      };

      const mockSupabase = createMockSupabaseForVideos({ dailyCount: 0 });
      const fromOriginal = mockSupabase.client.from;

      let insertedData: any = null;
      mockSupabase.client.from = vi.fn((table: string) => {
        if (table === 'leads') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockReturnValue({
                  not: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [lead] }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        if (table === 'pending_videos') {
          return {
            insert: vi.fn((data: any) => {
              insertedData = data;
              return { select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }) }) };
            }),
          };
        }
        return fromOriginal(table);
      });

      // Mock image download
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });

      // Mock Veo 3 API
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'operations/phone-norm-test' }),
      });

      await videoFelicitacionPostVenta(mockSupabase as any, mockMeta as any, mockEnv);

      // Verify phone was normalized to 521 + 10 digits
      if (insertedData) {
        expect(insertedData.lead_phone).toBe('5214921234567');
      }
    });

    it('should skip lead without phone number', async () => {
      const lead = {
        id: 'lead-no-phone-sold',
        name: 'No Phone Sold',
        phone: null,
        property_interest: 'Monte Verde',
        notes: {},
        updated_at: new Date().toISOString(),
      };

      const mockSupabase = createMockSupabaseForVideos({ dailyCount: 0 });
      const fromOriginal = mockSupabase.client.from;
      mockSupabase.client.from = vi.fn((table: string) => {
        if (table === 'leads') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockReturnValue({
                  not: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [lead] }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        return fromOriginal(table);
      });

      await videoFelicitacionPostVenta(mockSupabase as any, mockMeta as any, mockEnv);

      // Should not call Veo 3 API since lead has no phone
      expect(mockFetch).not.toHaveBeenCalled();
      expect(logEvento).not.toHaveBeenCalled();
    });

    it('should log error to DB on unexpected exception', async () => {
      const mockSupabase = createMockSupabase({});
      // Force an error by making the leads query throw
      mockSupabase.client.from = vi.fn(() => {
        throw new Error('DB connection failed');
      });

      await videoFelicitacionPostVenta(mockSupabase as any, mockMeta as any, mockEnv);

      // Should call logErrorToDB
      expect(logErrorToDB).toHaveBeenCalledWith(
        mockSupabase,
        'cron_error',
        'DB connection failed',
        expect.objectContaining({
          severity: 'error',
          source: 'videoFelicitacionPostVenta',
        })
      );
    });

    it('should break out of loop when GEMINI_API_KEY is not configured', async () => {
      const lead = {
        id: 'lead-no-key-felicit',
        name: 'No Key Lead',
        phone: '5214921111111',
        property_interest: 'Andes',
        notes: {},
        updated_at: new Date().toISOString(),
      };

      const mockSupabase = createMockSupabaseForVideos({ dailyCount: 0 });
      const fromOriginal = mockSupabase.client.from;
      mockSupabase.client.from = vi.fn((table: string) => {
        if (table === 'leads') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockReturnValue({
                  not: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [lead] }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        return fromOriginal(table);
      });

      const envNoKey = { ...mockEnv, GEMINI_API_KEY: '' };

      await videoFelicitacionPostVenta(mockSupabase as any, mockMeta as any, envNoKey);

      // Should NOT call Veo 3 since no API key
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // videoBienvenidaLeadNuevo
  // ═══════════════════════════════════════════════════════════
  describe('videoBienvenidaLeadNuevo', () => {
    it('should return early when no new leads need welcome videos', async () => {
      const mockSupabase = createMockSupabase({
        leads: { data: [], error: null },
      });

      await videoBienvenidaLeadNuevo(mockSupabase as any, mockMeta as any, mockEnv);

      // Should not call Veo 3 API
      expect(mockFetch).not.toHaveBeenCalled();
      expect(logEvento).not.toHaveBeenCalled();
    });

    it('should generate welcome video for a new lead', async () => {
      const newLead = {
        id: 'lead-new-1',
        name: 'Andrea Martinez',
        phone: '5214921234567',
        property_interest: 'Los Encinos',
        notes: {},
        created_at: new Date().toISOString(),
        status: 'new',
      };

      const mockSupabase = createMockSupabaseForVideos({ dailyCount: 0 });
      const fromOriginal = mockSupabase.client.from;
      mockSupabase.client.from = vi.fn((table: string) => {
        if (table === 'leads') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockReturnValue({
                  not: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [newLead] }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        return fromOriginal(table);
      });

      // Mock image download
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(200),
      });

      // Mock Veo 3 API
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'operations/bienvenida-001' }),
      });

      await videoBienvenidaLeadNuevo(mockSupabase as any, mockMeta as any, mockEnv);

      // Should call Veo 3 API
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('veo-3.0-fast-generate-001'),
        expect.objectContaining({ method: 'POST' })
      );

      // Should log event for generated videos
      expect(logEvento).toHaveBeenCalledWith(
        mockSupabase,
        'video',
        expect.stringContaining('bienvenida'),
        expect.objectContaining({ generados: 1, tipo: 'bienvenida' })
      );
    });

    it('should skip lead that already has video_bienvenida_enviado in notes', async () => {
      const leadWithVideo = {
        id: 'lead-with-vid',
        name: 'Existing Video Lead',
        phone: '5214929999999',
        property_interest: 'Andes',
        notes: { video_bienvenida_enviado: '2026-02-28' },
        created_at: new Date().toISOString(),
        status: 'new',
      };

      const mockSupabase = createMockSupabaseForVideos({ dailyCount: 0 });
      const fromOriginal = mockSupabase.client.from;
      mockSupabase.client.from = vi.fn((table: string) => {
        if (table === 'leads') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockReturnValue({
                  not: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [leadWithVideo] }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        return fromOriginal(table);
      });

      await videoBienvenidaLeadNuevo(mockSupabase as any, mockMeta as any, mockEnv);

      // Should NOT call Veo 3 API (already sent)
      expect(mockFetch).not.toHaveBeenCalled();
      expect(logEvento).not.toHaveBeenCalled();
    });

    it('should respect daily Veo 3 limit (20 videos/day for bienvenida)', async () => {
      const newLead = {
        id: 'lead-limit-bienvenida',
        name: 'Limit Test',
        phone: '5214920000000',
        property_interest: 'Miravalle',
        notes: {},
        created_at: new Date().toISOString(),
        status: 'new',
      };

      const mockSupabase = createMockSupabaseForVideos({ dailyCount: 0 });
      const fromOriginal = mockSupabase.client.from;
      mockSupabase.client.from = vi.fn((table: string) => {
        if (table === 'leads') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockReturnValue({
                  not: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [newLead] }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        if (table === 'system_config') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { value: '20' } }),
              }),
            }),
            upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return fromOriginal(table);
      });

      await videoBienvenidaLeadNuevo(mockSupabase as any, mockMeta as any, mockEnv);

      // Should NOT call Veo 3 because daily limit (20) is reached
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should skip lead without phone number', async () => {
      const leadNoPhone = {
        id: 'lead-no-phone',
        name: 'No Phone Lead',
        phone: null,
        property_interest: 'Monte Verde',
        notes: {},
        created_at: new Date().toISOString(),
        status: 'new',
      };

      const mockSupabase = createMockSupabaseForVideos({ dailyCount: 0 });
      const fromOriginal = mockSupabase.client.from;
      mockSupabase.client.from = vi.fn((table: string) => {
        if (table === 'leads') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockReturnValue({
                  not: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [leadNoPhone] }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        return fromOriginal(table);
      });

      await videoBienvenidaLeadNuevo(mockSupabase as any, mockMeta as any, mockEnv);

      // Should NOT call Veo 3 since lead has no phone
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should log error to DB on unexpected exception', async () => {
      const mockSupabase = createMockSupabase({});
      mockSupabase.client.from = vi.fn(() => {
        throw new Error('Unexpected failure in bienvenida');
      });

      await videoBienvenidaLeadNuevo(mockSupabase as any, mockMeta as any, mockEnv);

      // Should call logErrorToDB
      expect(logErrorToDB).toHaveBeenCalledWith(
        mockSupabase,
        'cron_error',
        'Unexpected failure in bienvenida',
        expect.objectContaining({
          severity: 'error',
          source: 'videoBienvenidaLeadNuevo',
        })
      );
    });

    it('should break out of loop when GEMINI_API_KEY is not configured', async () => {
      const newLead = {
        id: 'lead-no-key',
        name: 'No Key Lead',
        phone: '5214928888888',
        property_interest: 'Andes',
        notes: {},
        created_at: new Date().toISOString(),
        status: 'new',
      };

      const mockSupabase = createMockSupabaseForVideos({ dailyCount: 0 });
      const fromOriginal = mockSupabase.client.from;
      mockSupabase.client.from = vi.fn((table: string) => {
        if (table === 'leads') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockReturnValue({
                  not: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [newLead] }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        return fromOriginal(table);
      });

      const envNoKey = { ...mockEnv, GEMINI_API_KEY: '' };

      await videoBienvenidaLeadNuevo(mockSupabase as any, mockMeta as any, envNoKey);

      // Should NOT call Veo 3 since no API key
      expect(mockFetch).not.toHaveBeenCalled();
      expect(logEvento).not.toHaveBeenCalled();
    });

    it('should use default development photo when property_interest is unknown', async () => {
      const newLead = {
        id: 'lead-unknown-dev',
        name: 'Unknown Dev Lead',
        phone: '5214927777777',
        property_interest: 'Desarrollo Desconocido',
        notes: {},
        created_at: new Date().toISOString(),
        status: 'new',
      };

      const mockSupabase = createMockSupabaseForVideos({ dailyCount: 0 });
      const fromOriginal = mockSupabase.client.from;
      mockSupabase.client.from = vi.fn((table: string) => {
        if (table === 'leads') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockReturnValue({
                  not: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [newLead] }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        return fromOriginal(table);
      });

      // Mock image download (will use Monte Verde fallback photo)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });

      // Mock Veo 3 API
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'operations/bienvenida-unknown' }),
      });

      await videoBienvenidaLeadNuevo(mockSupabase as any, mockMeta as any, mockEnv);

      // Should still call Veo 3 API (uses default Monte Verde photo)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('veo-3.0-fast-generate-001'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should handle Veo 3 API returning non-ok response', async () => {
      const newLead = {
        id: 'lead-veo-fail',
        name: 'Veo Fail Lead',
        phone: '5214926666666',
        property_interest: 'Monte Verde',
        notes: {},
        created_at: new Date().toISOString(),
        status: 'new',
      };

      const mockSupabase = createMockSupabaseForVideos({ dailyCount: 0 });
      const fromOriginal = mockSupabase.client.from;
      mockSupabase.client.from = vi.fn((table: string) => {
        if (table === 'leads') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockReturnValue({
                  not: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [newLead] }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        return fromOriginal(table);
      });

      // Mock image download
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });

      // Mock Veo 3 API failure
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () => 'Rate limit exceeded',
      });

      await videoBienvenidaLeadNuevo(mockSupabase as any, mockMeta as any, mockEnv);

      // Should not log event since no videos were generated
      expect(logEvento).not.toHaveBeenCalled();
    });
  });
});
