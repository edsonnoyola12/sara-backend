with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Reemplazar la línea correcta
old = "const words = bodyLower.split(' ');"
new = "const words = bodyLower.replace(/[.,!?;:]/g, ' ').split(' ').filter(w => w.length > 0);"

content = content.replace(old, new)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)
    
print("✅ Puntuación eliminada en matching")
