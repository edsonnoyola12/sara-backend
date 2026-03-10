import { SupabaseService } from './supabase';

// ═══════════════════════════════════════════════════════════════════════════
// ONBOARDING SERVICE - Tenant onboarding wizard (4 steps)
// ═══════════════════════════════════════════════════════════════════════════
// Steps: 0=Not started, 1=WhatsApp, 2=Team, 3=Leads CSV, 4=Configuration
// ═══════════════════════════════════════════════════════════════════════════

export interface OnboardingStep {
  step: number;
  name: string;
  completed: boolean;
  data?: Record<string, any>;
}

export interface OnboardingStatus {
  current_step: number;
  steps: OnboardingStep[];
}

export interface WhatsAppConfig {
  phone_number_id: string;
  access_token: string;
  webhook_secret?: string;
  business_id?: string;
}

export interface TeamInviteData {
  emails: string[];
  invited_at: string;
}

export interface TenantConfiguration {
  timezone?: string;
  business_hours?: Record<string, any>;
  developments?: string[];
}

const STEP_NAMES: Record<number, string> = {
  1: 'Connect WhatsApp Business',
  2: 'Invite team',
  3: 'Import leads (CSV)',
  4: 'Configure (horarios, propiedades, desarrollos)',
};
const TOTAL_STEPS = 4;

// ═══════════════════════════════════════════════════════════════════════════
// FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export async function getOnboardingStatus(supabase: SupabaseService, tenantId: string): Promise<OnboardingStatus> {
  const { data: tenant } = await supabase.client
    .from('tenants').select('onboarding_step, onboarding_metadata').eq('id', tenantId).single();

  const currentStep = tenant?.onboarding_step ?? 0;
  const metadata = tenant?.onboarding_metadata ?? {};

  const steps: OnboardingStep[] = Array.from({ length: TOTAL_STEPS }, (_, i) => {
    const s = i + 1;
    return {
      step: s, name: STEP_NAMES[s], completed: s <= currentStep,
      ...(metadata[`step_${s}`] ? { data: metadata[`step_${s}`] } : {}),
    };
  });
  return { current_step: currentStep, steps };
}

export async function completeStep(
  supabase: SupabaseService, tenantId: string, step: number, data?: Record<string, any>
): Promise<{ success: boolean; next_step: number; error?: string }> {
  if (step < 1 || step > TOTAL_STEPS) {
    return { success: false, next_step: step, error: `Invalid step: ${step}` };
  }

  const { data: tenant } = await supabase.client
    .from('tenants').select('onboarding_step, onboarding_metadata').eq('id', tenantId).single();
  const currentStep = tenant?.onboarding_step ?? 0;

  if (step !== currentStep + 1) {
    return { success: false, next_step: currentStep, error: `Must complete step ${currentStep + 1} first` };
  }

  const metadata = tenant?.onboarding_metadata ?? {};
  if (data) metadata[`step_${step}`] = data;
  metadata[`step_${step}_completed_at`] = new Date().toISOString();

  const isComplete = step >= TOTAL_STEPS;
  const { error } = await supabase.client.from('tenants').update({
    onboarding_step: step,
    onboarding_metadata: metadata,
    ...(isComplete ? { onboarding_completed_at: new Date().toISOString() } : {}),
  }).eq('id', tenantId);

  if (error) return { success: false, next_step: currentStep, error: error.message };
  return { success: true, next_step: isComplete ? TOTAL_STEPS : step + 1 };
}

export async function completeWhatsAppSetup(
  supabase: SupabaseService, tenantId: string, config: WhatsAppConfig
): Promise<{ success: boolean; next_step: number; error?: string }> {
  const { error } = await supabase.client.from('tenants').update({
    whatsapp_phone_number_id: config.phone_number_id,
    whatsapp_access_token: config.access_token,
    whatsapp_webhook_secret: config.webhook_secret ?? null,
    whatsapp_business_id: config.business_id ?? null,
  }).eq('id', tenantId);

  if (error) return { success: false, next_step: 1, error: error.message };
  return completeStep(supabase, tenantId, 1, { phone_number_id: config.phone_number_id });
}

export async function completeTeamInvites(
  supabase: SupabaseService, tenantId: string, emails: string[]
): Promise<{ success: boolean; next_step: number; error?: string }> {
  const invitations = emails.map((email) => ({
    tenant_id: tenantId, email, role: 'vendedor', status: 'pending', invited_at: new Date().toISOString(),
  }));

  const { error } = await supabase.client.from('invitations').insert(invitations);
  if (error) return { success: false, next_step: 2, error: error.message };
  return completeStep(supabase, tenantId, 2, { emails, count: emails.length } as Record<string, any>);
}

export async function completeLeadImport(
  supabase: SupabaseService, tenantId: string, count: number
): Promise<{ success: boolean; next_step: number; error?: string }> {
  return completeStep(supabase, tenantId, 3, { leads_imported: count, imported_at: new Date().toISOString() });
}

export async function completeConfiguration(
  supabase: SupabaseService, tenantId: string, config: TenantConfiguration
): Promise<{ success: boolean; next_step: number; error?: string }> {
  const updates: Record<string, any> = {};
  if (config.timezone) updates.timezone = config.timezone;
  if (config.business_hours) updates.business_hours = config.business_hours;
  if (config.developments) updates.developments = config.developments;

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.client.from('tenants').update(updates).eq('id', tenantId);
    if (error) return { success: false, next_step: 4, error: error.message };
  }
  return completeStep(supabase, tenantId, 4, config as Record<string, any>);
}

export async function isOnboardingComplete(supabase: SupabaseService, tenantId: string): Promise<boolean> {
  const { data: tenant } = await supabase.client
    .from('tenants').select('onboarding_step').eq('id', tenantId).single();
  return (tenant?.onboarding_step ?? 0) >= TOTAL_STEPS;
}
