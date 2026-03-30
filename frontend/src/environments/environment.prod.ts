export const environment = {
  production: true,
  apiUrl: '/api/v1',
  // En producción Firebase Hosting reescribe /api/** → Cloud Run csn-api-prod
  // No se necesita URL absoluta del backend aquí.
};
