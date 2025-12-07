with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# En lugar de mover el bloque, simplemente crear una variable ANTES
# y actualizarla cuando se detecte la cita

# Buscar donde están las variables mortgageData
insert_before = content.find("let mortgageData: any = {")

# Agregar la variable citaData ahí mismo
new_vars = """let citaData: any = null;
      
      """

content = content[:insert_before] + new_vars + content[insert_before:]

print("✅ Variable citaData declarada en scope correcto")

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)
