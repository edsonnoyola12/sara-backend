with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Encontrar TODO el bloque de video (desde detección hasta el return)
video_start = content.find("const wantsVideo =")
if video_start == -1:
    print("❌ No encontré wantsVideo")
    exit(1)

# Encontrar el return del video
video_end = content.find("return;", video_start)
if video_end == -1:
    print("❌ No encontré el return del video")
    exit(1)

# Encontrar el final del bloque completo
video_end = content.find("\n", video_end) + 1

# Extraer el bloque completo
video_block = content[video_start:video_end]

# Eliminarlo de donde está
content = content[:video_start] + content[video_end:]

# Insertar AL FINAL, justo antes del prompt de SARA
insert_before = content.find("const catalogoProps = properties.map")
if insert_before == -1:
    print("❌ No encontré catalogoProps")
    exit(1)

content = content[:insert_before] + video_block + "\n\n      " + content[insert_before:]

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Bloque de video movido AL FINAL")
print("   Ahora procesa: datos financieros → citas → video")
