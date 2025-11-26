export async function generatePropertyVideo(
  property: any,
  clientName: string,
  apiKey: string
) {
  const prompt = `Video profesional de ${property.name} en ${property.neighborhood}, Zacatecas. 
${property.bedrooms} recámaras, ${property.bathrooms} baños, ${property.area_m2}m². 
Para ${clientName}.`;

  // Por ahora, usar video existente de YouTube
  return {
    success: true,
    property: property.name,
    clientName: clientName,
    videoUrl: property.website_url || 'https://youtu.be/gy50mYOCKHk',
    prompt: prompt,
    galleryUrls: property.gallery_urls || [],
    message: 'Video ready - Using existing YouTube video',
    note: 'Veo 3.1 requiere Vertex AI con autenticación OAuth. Próxima fase.'
  };
}
