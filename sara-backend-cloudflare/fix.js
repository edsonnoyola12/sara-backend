const fs = require('fs');
let c = fs.readFileSync('src/whatsapp.ts', 'utf8');

c = c.replace(/console\.log\('🎬 Video para:', clientName, '-', matchedProperty\.name, '- Primera vez:', esPrimeraInteraccion\);/, `const partesVideo = matchedProperty.name.split(' ');
        const desarrolloVideo = partesVideo.length > 1 ? partesVideo.slice(1).join(' ') : matchedProperty.name;
        console.log('🎬 Video para:', clientName, '- Desarrollo:', desarrolloVideo);`);

c = c.replace("VIDEO_SERVER_URL + '/generate-and-send'", "'https://sara-backend.edson-633.workers.dev/generate-video'");

c = c.replace(/propertyName: matchedProperty\.name/g, 'propertyName: desarrolloVideo');

c = c.replace(/\$\{matchedProperty\.name\}/g, '${desarrolloVideo}');

c = c.replace(`const modelo = pendingProperty.name.split(' ')[0] || '';
          const mapsLink = MAPS_UBICACIONES[modelo] || '';
          
          // Obtener link del desarrollo desde la BD
          const desarrolloLink = pendingProperty.website_url || '';`, `const nombrePartes = pendingProperty.name.split(' ');
          const modelo = nombrePartes[0] || '';
          const desarrollo = nombrePartes.length > 1 ? nombrePartes.slice(1).join(' ') : pendingProperty.name;
          console.log('🏠 Desarrollo:', desarrollo);
          let mapsLink = MAPS_UBICACIONES[modelo] || '';
          let desarrolloLink = pendingProperty.website_url || '';`);

c = c.replace('1) PROHIBIDO HABLAR DE "CONTADO"', '0) PEDIR NOMBRE Y CEL RAPIDO - Cuando mencione desarrollo pide nombre y cel ANTES de dar info larga\n\n1) NUNCA DECIR OK AL FINAL\n\n2) PROHIBIDO HABLAR DE CONTADO');

fs.writeFileSync('src/whatsapp.ts', c);
console.log('LISTO');
