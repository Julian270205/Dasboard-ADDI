// Configuración del tablero.
// api: URL base de los webhooks de n8n (flujos 01, 02 y 03). Con los flujos ACTIVOS la ruta es /webhook/addi;
//      si los pruebas sin activar ("Listen for test event"), usa /webhook-test/addi.
window.ADDI_CONFIG = {
  api: "http://localhost:5678/webhook/addi",
  timeout: 2500
};
