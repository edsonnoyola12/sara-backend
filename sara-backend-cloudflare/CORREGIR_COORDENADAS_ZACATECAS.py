with open('src/handlers/whatsapp.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Buscar y reemplazar el objeto completo con coordenadas correctas de Zacatecas
old_maps = """const MAPS_UBICACIONES: { [key: string]: string } = {
  'Ceiba': 'https://www.google.com/maps?q=19.0319,-98.2063',
  'Eucalipto': 'https://www.google.com/maps?q=19.0319,-98.2063',
  'Cedro': 'https://www.google.com/maps?q=19.0319,-98.2063',
  'Abeto': 'https://www.google.com/maps?q=19.0325,-98.2070',
  'Fresno': 'https://www.google.com/maps?q=19.0325,-98.2070',
  'Roble': 'https://www.google.com/maps?q=19.0325,-98.2070',
  'Madroño': 'https://www.google.com/maps?q=19.0330,-98.2075',
  'Avellano': 'https://www.google.com/maps?q=19.0330,-98.2075',
  'Lavanda': 'https://www.google.com/maps?q=19.0315,-98.2055',
  'Tulipán': 'https://www.google.com/maps?q=19.0315,-98.2055',
  'Azalea': 'https://www.google.com/maps?q=19.0315,-98.2055',
  'Almendro': 'https://www.google.com/maps?q=19.0340,-98.2080',
  'Olivo': 'https://www.google.com/maps?q=19.0340,-98.2080',
  'Girasol': 'https://www.google.com/maps?q=19.0310,-98.2050',
  'Gardenia': 'https://www.google.com/maps?q=19.0310,-98.2050',
  'Halcón': 'https://www.google.com/maps?q=19.0450,-98.1850',
  'Águila': 'https://www.google.com/maps?q=19.0450,-98.1850',
  'Sauce': 'https://www.google.com/maps?q=19.0460,-98.1860',
  'Nogal': 'https://www.google.com/maps?q=19.0460,-98.1860',
  'Orquídea': 'https://www.google.com/maps?q=19.0200,-98.2200',
  'Dalia': 'https://www.google.com/maps?q=19.0200,-98.2200'
};"""

new_maps = """const MAPS_UBICACIONES: { [key: string]: string } = {
  'Ceiba': 'https://www.google.com/maps?q=22.7665,-102.5935',
  'Eucalipto': 'https://www.google.com/maps?q=22.7665,-102.5935',
  'Cedro': 'https://www.google.com/maps?q=22.7665,-102.5935',
  'Abeto': 'https://www.google.com/maps?q=22.7650,-102.5950',
  'Fresno': 'https://www.google.com/maps?q=22.7650,-102.5950',
  'Roble': 'https://www.google.com/maps?q=22.7650,-102.5950',
  'Madroño': 'https://www.google.com/maps?q=22.7680,-102.5880',
  'Avellano': 'https://www.google.com/maps?q=22.7680,-102.5880',
  'Lavanda': 'https://www.google.com/maps?q=22.7710,-102.5850',
  'Tulipán': 'https://www.google.com/maps?q=22.7710,-102.5850',
  'Azalea': 'https://www.google.com/maps?q=22.7710,-102.5850',
  'Almendro': 'https://www.google.com/maps?q=22.7715,-102.5845',
  'Olivo': 'https://www.google.com/maps?q=22.7715,-102.5845',
  'Girasol': 'https://www.google.com/maps?q=22.7720,-102.5860',
  'Gardenia': 'https://www.google.com/maps?q=22.7720,-102.5860',
  'Halcón': 'https://www.google.com/maps?q=22.7630,-102.5250',
  'Águila': 'https://www.google.com/maps?q=22.7630,-102.5250',
  'Sauce': 'https://www.google.com/maps?q=22.7610,-102.5220',
  'Nogal': 'https://www.google.com/maps?q=22.7610,-102.5220',
  'Orquídea': 'https://www.google.com/maps?q=22.7480,-102.5110',
  'Dalia': 'https://www.google.com/maps?q=22.7480,-102.5110'
};"""

content = content.replace(old_maps, new_maps)

with open('src/handlers/whatsapp.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Coordenadas corregidas a Zacatecas:")
print("  ZONA 1 (SO): Los Encinos, Monte Verde, Monte Real, Andes, Miravalle, Villa Galiano")
print("  ZONA 2 (NE): Distrito Falco, Villa Campelo")
print("  ZONA 3 (SE): Alpes")
