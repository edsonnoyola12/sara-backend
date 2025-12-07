with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar el constructor
old_constructor = """export class WhatsAppHandler {
  constructor(
    private supabase: SupabaseService,
    private openai: OpenAIService,
    private twilio: TwilioService
  ) {}"""

new_constructor = """export class WhatsAppHandler {
  constructor(
    private supabase: SupabaseService,
    private openai: OpenAIService,
    private twilio: TwilioService,
    private calendar: any
  ) {}"""

content = content.replace(old_constructor, new_constructor)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Constructor actualizado con CalendarService")
