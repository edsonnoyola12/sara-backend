#!/bin/bash

# Backup
cp src/handlers/whatsapp.ts src/handlers/whatsapp.ts.backup_parsing

# Usar sed para arreglar
cat src/handlers/whatsapp.ts | 
  # Fix 1: Detectar "no tengo deudas" ANTES del regex
  sed '/const debtMatch = body.match/i\
      // Detectar negación de deudas primero\
      const hasNoDebt = /(?:no|sin|cero|nada)\\s+(?:tengo|tiene)?\\s*(?:deuda|adeudo)/i.test(body);
' |
  # Fix 2: Modificar el if de debtMatch
  sed 's/if (debtMatch) {/if (hasNoDebt) {\
        mortgageData.current_debt = 0;\
      } else if (debtMatch) {/' |
  # Fix 3: Usar \bmil\b para NO detectar dentro de "millones"
  sed "s|} else if (/mil/i.test(fullMatch.substring(0, 50))) {|} else if (/\\\\bmil\\\\b/i.test(fullMatch.substring(0, 50)) \&\& !/millón/i.test(fullMatch.substring(0, 50))) {|g" \
  > src/handlers/whatsapp.ts.new

mv src/handlers/whatsapp.ts.new src/handlers/whatsapp.ts

echo "✅ Parsing arreglado"
