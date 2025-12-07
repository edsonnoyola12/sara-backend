with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Reemplazar todos los usos de needsMortgage por needsMortgageStatus
content = content.replace(
    'if (needsMortgage || matchedProperty)',
    'if (needsMortgageStatus || matchedProperty)'
)

content = content.replace(
    'if (needsMortgage && mortgageData.monthly_income)',
    'if (needsMortgageStatus && mortgageData.monthly_income)'
)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ needsMortgage → needsMortgageStatus")
