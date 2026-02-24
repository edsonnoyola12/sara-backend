// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SERVICE FACTORY - Singleton pattern para servicios
// Evita crear múltiples instancias de servicios en cada request
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { SupabaseService } from './supabase';
import { ClaudeService } from './claude';
import { MetaWhatsAppService } from './meta-whatsapp';
import { CalendarService } from './calendar';
import { FollowupService } from './followupService';
import { NotificationService } from './notificationService';
import { BroadcastQueueService } from './broadcastQueueService';
import { AppointmentService } from './appointmentService';
import { TwilioService } from './twilio';

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ANTHROPIC_API_KEY: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  GOOGLE_CALENDAR_ID: string;
  META_PHONE_NUMBER_ID: string;
  META_ACCESS_TOKEN: string;
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
}

/**
 * ServiceFactory - Crea y cachea instancias de servicios
 *
 * Uso:
 * ```
 * const factory = new ServiceFactory(env);
 * const supabase = factory.getSupabase();
 * const meta = factory.getMeta();
 * ```
 */
export class ServiceFactory {
  private env: Env;

  // Cache de instancias
  private _supabase: SupabaseService | null = null;
  private _claude: ClaudeService | null = null;
  private _meta: MetaWhatsAppService | null = null;
  private _calendar: CalendarService | null = null;
  private _twilio: TwilioService | null = null;
  private _followup: FollowupService | null = null;
  private _notification: NotificationService | null = null;
  private _broadcast: BroadcastQueueService | null = null;
  private _appointment: AppointmentService | null = null;

  constructor(env: Env) {
    this.env = env;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SERVICIOS BASE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  getSupabase(): SupabaseService {
    if (!this._supabase) {
      this._supabase = new SupabaseService(
        this.env.SUPABASE_URL,
        this.env.SUPABASE_ANON_KEY
      );
    }
    return this._supabase;
  }

  getClaude(): ClaudeService {
    if (!this._claude) {
      this._claude = new ClaudeService(this.env.ANTHROPIC_API_KEY);
    }
    return this._claude;
  }

  getMeta(): MetaWhatsAppService {
    if (!this._meta) {
      this._meta = new MetaWhatsAppService(
        this.env.META_PHONE_NUMBER_ID,
        this.env.META_ACCESS_TOKEN
      );
    }
    return this._meta;
  }

  getCalendar(): CalendarService {
    if (!this._calendar) {
      this._calendar = new CalendarService(
        this.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        this.env.GOOGLE_PRIVATE_KEY,
        this.env.GOOGLE_CALENDAR_ID
      );
    }
    return this._calendar;
  }

  getTwilio(): TwilioService {
    if (!this._twilio) {
      this._twilio = new TwilioService(
        this.env.TWILIO_ACCOUNT_SID,
        this.env.TWILIO_AUTH_TOKEN,
        this.env.TWILIO_PHONE_NUMBER
      );
    }
    return this._twilio;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SERVICIOS COMPUESTOS (dependen de otros servicios)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  getFollowup(): FollowupService {
    if (!this._followup) {
      this._followup = new FollowupService(
        this.getSupabase()
      );
    }
    return this._followup;
  }

  getNotification(): NotificationService {
    if (!this._notification) {
      this._notification = new NotificationService(
        this.getSupabase(),
        this.getMeta(),
        this.env.OPENAI_API_KEY
      );
    }
    return this._notification;
  }

  getBroadcast(): BroadcastQueueService {
    if (!this._broadcast) {
      this._broadcast = new BroadcastQueueService(
        this.getSupabase()
      );
    }
    return this._broadcast;
  }

  getAppointment(): AppointmentService {
    if (!this._appointment) {
      this._appointment = new AppointmentService(
        this.getSupabase(),
        this.getCalendar(),
        this.getTwilio()
      );
    }
    return this._appointment;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // UTILIDADES
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Obtiene todos los servicios principales en un objeto
   * Útil para pasar a handlers que necesitan múltiples servicios
   */
  getAll() {
    return {
      supabase: this.getSupabase(),
      claude: this.getClaude(),
      meta: this.getMeta(),
      calendar: this.getCalendar(),
      twilio: this.getTwilio(),
      followup: this.getFollowup(),
      notification: this.getNotification(),
      broadcast: this.getBroadcast(),
      appointment: this.getAppointment(),
    };
  }

  /**
   * Obtiene el env original (para servicios que lo necesitan directamente)
   */
  getEnv(): Env {
    return this.env;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPER: Crear factory desde request context
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Cache global para el factory (persiste entre requests en el mismo isolate)
let globalFactory: ServiceFactory | null = null;
let globalEnvHash: string | null = null;

function hashEnv(env: Env): string {
  return `${env.SUPABASE_URL}:${env.META_PHONE_NUMBER_ID}`;
}

/**
 * Obtiene o crea un ServiceFactory
 * Usa cache global para reutilizar entre requests del mismo isolate
 */
export function getServiceFactory(env: Env): ServiceFactory {
  const envHash = hashEnv(env);

  // Si el env cambió (diferente worker/env), crear nuevo factory
  if (!globalFactory || globalEnvHash !== envHash) {
    globalFactory = new ServiceFactory(env);
    globalEnvHash = envHash;
  }

  return globalFactory;
}
