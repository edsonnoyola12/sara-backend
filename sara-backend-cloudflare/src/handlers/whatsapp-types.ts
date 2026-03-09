import { SupabaseService } from '../services/supabase';
import { ClaudeService } from '../services/claude';
import { TwilioService } from '../services/twilio';
import { MetaWhatsAppService } from '../services/meta-whatsapp';
import type { TenantContext } from '../middleware/tenant';

export interface HandlerContext {
  supabase: SupabaseService;
  claude: ClaudeService;
  twilio: TwilioService;
  calendar: any;
  meta: MetaWhatsAppService;
  env: any;
  tenant: TenantContext;
}
