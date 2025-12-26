with open('src/handlers/whatsapp.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Actualizar links uno por uno (sin regex)
content = content.replace(
    "'Ceiba': 'https://www.google.com/maps?q=22.7665,-102.5935'",
    "'Ceiba': 'https://www.google.com.mx/maps/place/PRIVADA+LOS+ENCINOS+-+Grupo+Santa+Rita/@22.7416487,-102.6030276,17z/data=!3m1!4b1!4m5!3m4!1s0x86824f33f542846d:0xb4931cf537cc9a51!8m2!3d22.7416487!4d-102.6008389'"
)
content = content.replace(
    "'Eucalipto': 'https://www.google.com/maps?q=22.7665,-102.5935'",
    "'Eucalipto': 'https://www.google.com.mx/maps/place/PRIVADA+LOS+ENCINOS+-+Grupo+Santa+Rita/@22.7416487,-102.6030276,17z/data=!3m1!4b1!4m5!3m4!1s0x86824f33f542846d:0xb4931cf537cc9a51!8m2!3d22.7416487!4d-102.6008389'"
)
content = content.replace(
    "'Cedro': 'https://www.google.com/maps?q=22.7665,-102.5935'",
    "'Cedro': 'https://www.google.com.mx/maps/place/PRIVADA+LOS+ENCINOS+-+Grupo+Santa+Rita/@22.7416487,-102.6030276,17z/data=!3m1!4b1!4m5!3m4!1s0x86824f33f542846d:0xb4931cf537cc9a51!8m2!3d22.7416487!4d-102.6008389'"
)
content = content.replace(
    "'Abeto': 'https://www.google.com/maps?q=22.7650,-102.5950'",
    "'Abeto': 'https://www.google.com/maps/search/?api=1&query=Monte+Verde+Colinas+del+Padre+Zacatecas'"
)
content = content.replace(
    "'Fresno': 'https://www.google.com/maps?q=22.7650,-102.5950'",
    "'Fresno': 'https://www.google.com/maps/search/?api=1&query=Monte+Verde+Colinas+del+Padre+Zacatecas'"
)
content = content.replace(
    "'Roble': 'https://www.google.com/maps?q=22.7650,-102.5950'",
    "'Roble': 'https://www.google.com/maps/search/?api=1&query=Monte+Verde+Colinas+del+Padre+Zacatecas'"
)
content = content.replace(
    "'Madroño': 'https://www.google.com/maps?q=22.7680,-102.5880'",
    "'Madroño': 'https://www.google.com.mx/maps/place/PRIVADA+MONTE+REAL+-+Grupo+Santa+Rita/@22.7399971,-102.6022833,17z/data=!3m1!4b1!4m5!3m4!1s0x86824f30d886fd53:0xfd697cf8e7379698!8m2!3d22.7399971!4d-102.6000946'"
)
content = content.replace(
    "'Avellano': 'https://www.google.com/maps?q=22.7680,-102.5880'",
    "'Avellano': 'https://www.google.com.mx/maps/place/PRIVADA+MONTE+REAL+-+Grupo+Santa+Rita/@22.7399971,-102.6022833,17z/data=!3m1!4b1!4m5!3m4!1s0x86824f30d886fd53:0xfd697cf8e7379698!8m2!3d22.7399971!4d-102.6000946'"
)
content = content.replace(
    "'Lavanda': 'https://www.google.com/maps?q=22.7710,-102.5850'",
    "'Lavanda': 'https://goo.gl/maps/FT6xVbjHPNcUz3J5A'"
)
content = content.replace(
    "'Tulipán': 'https://www.google.com/maps?q=22.7710,-102.5850'",
    "'Tulipán': 'https://goo.gl/maps/FT6xVbjHPNcUz3J5A'"
)
content = content.replace(
    "'Azalea': 'https://www.google.com/maps?q=22.7710,-102.5850'",
    "'Azalea': 'https://goo.gl/maps/FT6xVbjHPNcUz3J5A'"
)
content = content.replace(
    "'Almendro': 'https://www.google.com/maps?q=22.7715,-102.5845'",
    "'Almendro': 'https://www.google.com/maps/search/?api=1&query=Miravalle+Colinas+del+Padre+Zacatecas'"
)
content = content.replace(
    "'Olivo': 'https://www.google.com/maps?q=22.7715,-102.5845'",
    "'Olivo': 'https://www.google.com/maps/search/?api=1&query=Miravalle+Colinas+del+Padre+Zacatecas'"
)
content = content.replace(
    "'Girasol': 'https://www.google.com/maps?q=22.7720,-102.5860'",
    "'Girasol': 'https://www.google.com/maps/search/?api=1&query=Villa+Galiano,+Zacatecas'"
)
content = content.replace(
    "'Gardenia': 'https://www.google.com/maps?q=22.7720,-102.5860'",
    "'Gardenia': 'https://www.google.com/maps/search/?api=1&query=Villa+Galiano,+Zacatecas'"
)
content = content.replace(
    "'Halcón': 'https://www.google.com/maps?q=22.7630,-102.5250'",
    "'Halcón': 'https://www.google.com.mx/maps/place/PRIVADA+DISTRITO+FALCO+-+Grupo+Santa+Rita/@22.7711248,-102.5331916,17z/data=!3m1!4b1!4m5!3m4!1s0x86824eb359ad753d:0x9da80a7bc640e4a6!8m2!3d22.7711248!4d-102.5310029'"
)
content = content.replace(
    "'Águila': 'https://www.google.com/maps?q=22.7630,-102.5250'",
    "'Águila': 'https://www.google.com.mx/maps/place/PRIVADA+DISTRITO+FALCO+-+Grupo+Santa+Rita/@22.7711248,-102.5331916,17z/data=!3m1!4b1!4m5!3m4!1s0x86824eb359ad753d:0x9da80a7bc640e4a6!8m2!3d22.7711248!4d-102.5310029'"
)
content = content.replace(
    "'Sauce': 'https://www.google.com/maps?q=22.7610,-102.5220'",
    "'Sauce': 'https://www.google.com/maps/search/?api=1&query=Villa+Campelo,+Guadalupe,+Zacatecas'"
)
content = content.replace(
    "'Nogal': 'https://www.google.com/maps?q=22.7610,-102.5220'",
    "'Nogal': 'https://www.google.com/maps/search/?api=1&query=Villa+Campelo,+Guadalupe,+Zacatecas'"
)
content = content.replace(
    "'Orquídea': 'https://www.google.com/maps?q=22.7480,-102.5110'",
    "'Orquídea': 'https://www.google.com/maps/search/?api=1&query=Privada+Alpes+Cordilleras+Guadalupe+Zacatecas'"
)
content = content.replace(
    "'Dalia': 'https://www.google.com/maps?q=22.7480,-102.5110'",
    "'Dalia': 'https://www.google.com/maps/search/?api=1&query=Privada+Alpes+Cordilleras+Guadalupe+Zacatecas'"
)

with open('src/handlers/whatsapp.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Links oficiales actualizados")
