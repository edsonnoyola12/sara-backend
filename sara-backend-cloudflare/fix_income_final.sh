#!/bin/bash

# Encontrar y reemplazar la lógica de parsing de ingreso
perl -i -pe '
if (/if \(incomeMatch\)/) {
  $_ = "      if (incomeMatch) {
        let rawIncome = incomeMatch[1].replace(/,/g, \"\");
        const fullMatch = body.substring(incomeMatch.index, incomeMatch.index + 100);
        // Verificar millones PRIMERO (más específico)
        if (/millón(?:es)?/i.test(fullMatch)) {
          rawIncome = (parseFloat(rawIncome) * 1000000).toString();
        } else if (/\\bmil\\b/i.test(fullMatch) && !/millón/i.test(fullMatch)) {
          rawIncome = (parseFloat(rawIncome) * 1000).toString();
        }
        mortgageData.monthly_income = parseFloat(rawIncome);
      }
";
}
' src/handlers/whatsapp.ts

echo "✅ Ingreso arreglado"
