with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# 1. Agregar import de CalendarService
if 'CalendarService' not in content:
    content = content.replace(
        "import { TwilioService } from '../services/twilio';",
        "import { TwilioService } from '../services/twilio';\nimport { CalendarService } from '../services/calendar';"
    )

# 2. Modificar constructor
old_constructor = '''  constructor(
    private supabase: SupabaseService,
    private openai: OpenAIService,
    private twilio: TwilioService
  ) {}'''

new_constructor = '''  constructor(
    private supabase: SupabaseService,
    private openai: OpenAIService,
    private twilio: TwilioService,
    private calendar: CalendarService
  ) {}'''

content = content.replace(old_constructor, new_constructor)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ CalendarService agregado al handler")
