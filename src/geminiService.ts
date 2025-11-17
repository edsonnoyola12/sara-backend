export const geminiService = {
  async generateResponse(userMessage: string, conversationHistory: any[] = []) {
    return {
      text: '¡Hola! Soy SARA, tu asistente inmobiliaria 🏠\n\nGracias por contactarme. Tenemos increíbles propiedades disponibles:\n\n🏢 Andes Residencial - Desde $2,200,000\n🏡 Vista Real - Desde $1,850,000\n🌳 Hacienda del Bosque - Desde $3,500,000\n\n¿Cuál te interesa? 😊',
      success: true
    };
  }
};
