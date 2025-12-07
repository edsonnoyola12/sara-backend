import re

with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# FIX 1: Parsing de millón en todos los campos
# Ingreso
content = re.sub(
    r'if \(/mil/i\.test\(fullMatch\.substring\(0, 50\)\)\) \{\s*rawIncome = \(parseFloat\(rawIncome\) \* 1000\)\.toString\(\);\s*\}',
    '''if (/mill[oó]n/i.test(fullMatch.substring(0, 50))) {
          rawIncome = (parseFloat(rawIncome) * 1000000).toString();
        } else if (/mil/i.test(fullMatch.substring(0, 50))) {
          rawIncome = (parseFloat(rawIncome) * 1000).toString();
        }''',
    content
)

# Deudas
content = re.sub(
    r'if \(/mil/i\.test\(debtContext\.substring\(0, 50\)\)\) \{\s*rawDebt = \(parseFloat\(rawDebt\) \* 1000\)\.toString\(\);\s*\}',
    '''if (/mill[oó]n/i.test(debtContext.substring(0, 50))) {
          rawDebt = (parseFloat(rawDebt) * 1000000).toString();
        } else if (/mil/i.test(debtContext.substring(0, 50))) {
          rawDebt = (parseFloat(rawDebt) * 1000).toString();
        }''',
    content
)

# Enganche
content = re.sub(
    r'if \(/mil/i\.test\(downContext\.substring\(0, 50\)\)\) \{\s*rawDown = \(parseFloat\(rawDown\) \* 1000\)\.toString\(\);\s*\}',
    '''if (/mill[oó]n/i.test(downContext.substring(0, 50))) {
          rawDown = (parseFloat(rawDown) * 1000000).toString();
        } else if (/mil/i.test(downContext.substring(0, 50))) {
          rawDown = (parseFloat(rawDown) * 1000).toString();
        }''',
    content
)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ TODOS LOS FIXES APLICADOS")
