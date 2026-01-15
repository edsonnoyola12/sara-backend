import { describe, it, expect } from 'vitest';
import { ServiceFactory } from '../services/ServiceFactory';

// Mock env para tests
const mockEnv = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'test-key',
  ANTHROPIC_API_KEY: 'test-claude-key',
  TWILIO_ACCOUNT_SID: 'test-sid',
  TWILIO_AUTH_TOKEN: 'test-token',
  TWILIO_PHONE_NUMBER: '+1234567890',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: 'test@test.iam.gserviceaccount.com',
  GOOGLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
  GOOGLE_CALENDAR_ID: 'test@group.calendar.google.com',
  META_PHONE_NUMBER_ID: '123456789',
  META_ACCESS_TOKEN: 'test-meta-token',
};

describe('ServiceFactory', () => {
  it('debe crear instancia correctamente', () => {
    const factory = new ServiceFactory(mockEnv);
    expect(factory).toBeDefined();
  });

  it('debe retornar misma instancia de Supabase (singleton)', () => {
    const factory = new ServiceFactory(mockEnv);
    const supabase1 = factory.getSupabase();
    const supabase2 = factory.getSupabase();
    expect(supabase1).toBe(supabase2);
  });

  it('debe retornar misma instancia de Meta (singleton)', () => {
    const factory = new ServiceFactory(mockEnv);
    const meta1 = factory.getMeta();
    const meta2 = factory.getMeta();
    expect(meta1).toBe(meta2);
  });

  it('debe retornar misma instancia de Calendar (singleton)', () => {
    const factory = new ServiceFactory(mockEnv);
    const cal1 = factory.getCalendar();
    const cal2 = factory.getCalendar();
    expect(cal1).toBe(cal2);
  });

  it('getAll debe retornar todos los servicios', () => {
    const factory = new ServiceFactory(mockEnv);
    const all = factory.getAll();

    expect(all.supabase).toBeDefined();
    expect(all.claude).toBeDefined();
    expect(all.meta).toBeDefined();
    expect(all.calendar).toBeDefined();
    expect(all.twilio).toBeDefined();
  });

  it('getEnv debe retornar el env original', () => {
    const factory = new ServiceFactory(mockEnv);
    expect(factory.getEnv()).toBe(mockEnv);
  });
});
