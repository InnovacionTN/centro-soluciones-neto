# Dónde alojar la multimedia de Dany (recomendación)

## Problema actual
Los archivos (imágenes/videos de los procedimientos) viven en `neto.com/recursos/`
(host interno, no alcanzable desde fuera) y se listan vía `dany.netopower123.com/api/media/files`
(da 502). Dependemos de **un host interno + un API de listado** → frágil.

## ✅ Recomendación: Google Cloud Storage (GCS), público y servido directo

Es lo más estable y **nativo a su stack** (ya están en GCP: Cloud Run, mismo proyecto
`gen-lang-client-0189172552`). Un bucket de GCS da URLs HTTPS estables, escala solo,
cuesta centavos (unos cientos de archivos) y lo respalda la CDN de Google.

> Alternativa equivalente: **Firebase Storage** (es GCS por debajo) si prefieren la consola
> de Firebase que ya usan para el hosting. Misma idea.

### Beneficio extra: eliminamos el API de listado (más estable aún)
Hoy el agente llama `/api/media/files` para mapear "Vid CPU 1" → URL. **Ya no hace falta:**
los nombres exactos de cada archivo ya están en `flujos.json` (`multimedia_disponible`).
Con un bucket de nombre estable, el agente **construye la URL directo**:

```
https://storage.googleapis.com/<bucket>/<archivo>
```

Así quitamos la dependencia del API flaky. Una sola fuente: el bucket.

## Pasos

### 1. Crear el bucket (público de lectura)
```bash
gcloud storage buckets create gs://csn-dany-media \
  --project=gen-lang-client-0189172552 --location=us-central1 \
  --uniform-bucket-level-access
# lectura pública (la media de soporte no es sensible)
gcloud storage buckets add-iam-policy-binding gs://csn-dany-media \
  --member=allUsers --role=roles/storage.objectViewer
```
> Si la política de la organización bloquea `allUsers` (como pasó con Cloud Run),
> servimos vía el proxy del backend o con URLs firmadas. Pero lo ideal es público.

### 2. Convención de nombres (importante)
`flujos.json` referencia archivos como `IMG CPU 1`, `Vid MON 1` (con espacios, sin extensión).
Recomiendo subir con **el nombre exacto + extensión**, respetando mayúsculas:
```
IMG CPU 1.jpg
Vid CPU 1.mp4
IMG MON 5.png
...
```
Y mantener un criterio fijo de extensión por tipo (imágenes `.jpg`/`.png`, videos `.mp4`).
Al construir la URL se hace `encodeURIComponent` del nombre (los espacios → `%20`).

### 3. Subir los archivos
Necesitan los **archivos originales** (de Neto / del servidor actual cuando esté arriba).
Una vez en una carpeta local:
```bash
gcloud storage cp -r ./media-originales/* gs://csn-dany-media/
```

### 4. CORS (si se sirven directo al navegador)
```bash
echo '[{"origin":["*"],"method":["GET"],"responseHeader":["Content-Type"],"maxAgeSeconds":3600}]' > cors.json
gcloud storage buckets update gs://csn-dany-media --cors-file=cors.json
```
(Con público + CORS, el frontend puede cargar las URLs directo, sin el proxy del backend.)

### 5. Apuntar el agente al bucket
```bash
# en .env local y en el deploy de Cloud Run:
DANY_MEDIA_BASE_URL=https://storage.googleapis.com/csn-dany-media
```
Y un ajuste pequeño en `src/csn/media.ts`: `resolveMediaUrls` construye la URL desde el
nombre del archivo (de `flujos.json`) en vez de pedir el listado al API. (Lo hago yo.)

## Resumen
- **Sube los archivos a un bucket de GCS público** (`csn-dany-media`).
- El agente arma las URLs directo desde los nombres en `flujos.json` → sin API de listado.
- Resultado: media **estable, rápida, sin hosts internos ni 502**, en su mismo GCP.

> Nota: esto resuelve la **MEDIA (archivos)**. Los **motores de precios/promos/SION**
> son APIs, no archivos → esos siguen necesitando la decisión de red (VPC / endpoint
> público), que es tema aparte.
