# Deploy de csn-dany-agent a Cloud Run + prueba desde el CSN

Runbook paso a paso. Proyecto GCP: `gen-lang-client-0189172552` · región `us-central1`.

> Estrategia: el agente es un servicio Cloud Run nuevo. El cutover es **repuntar
> `DANY_WEBHOOK_URL`** del backend al nuevo servicio. Rollback = revertir esa variable.
> **Hacer todo primero en staging.**

---

## 0. Prerrequisitos (una vez)

```bash
gcloud auth login
gcloud config set project gen-lang-client-0189172552
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  secretmanager.googleapis.com artifactregistry.googleapis.com
```

---

## 1. Crear los secretos del agente

Secretos **propios del agente** (separados de los del backend para no acoplarlos):

```bash
# API key de Gemini (la que validamos que funciona)
printf 'TU_GEMINI_API_KEY_AQUI' \
  | gcloud secrets create dany-google-api-key --data-file=-

# Key del servidor de multimedia
printf 'dany-promo-2026-s3cur3-k3y' \
  | gcloud secrets create dany-media-key --data-file=-

# Secreto de entrada al webhook (genera uno; el backend lo mandará en el header)
printf "$(openssl rand -hex 32)" \
  | gcloud secrets create dany-webhook-secret --data-file=-
```

Secretos que **se reutilizan** del backend (ya existen): `dany-webhook` (token al
backend) y `csn-database-url-prod` (memoria en Neon).

> Para **actualizar** un secreto existente: `printf 'nuevo' | gcloud secrets versions add NOMBRE --data-file=-`

Dar acceso a la service account de Cloud Run (la default de compute):

```bash
PROJ_NUM=$(gcloud projects describe gen-lang-client-0189172552 --format='value(projectNumber)')
SA="${PROJ_NUM}-compute@developer.gserviceaccount.com"
for s in dany-google-api-key dany-media-key dany-webhook-secret dany-webhook csn-database-url-prod; do
  gcloud secrets add-iam-policy-binding $s \
    --member="serviceAccount:${SA}" --role="roles/secretmanager.secretAccessor"
done
```

---

## 2. Build de la imagen

Desde `agentes/dany-vercel/`:

```bash
cd agentes/dany-vercel
gcloud builds submit --tag gcr.io/gen-lang-client-0189172552/csn-dany-agent
```

---

## 3. Deploy a Cloud Run (STAGING primero)

```bash
gcloud run deploy csn-dany-agent-staging \
  --image gcr.io/gen-lang-client-0189172552/csn-dany-agent \
  --region us-central1 --platform managed \
  --allow-unauthenticated \
  --set-env-vars="DANY_MODEL=gemini-2.5-flash,CSN_API_URL=https://csn-api-staging-312707215871.us-central1.run.app,DANY_MEDIA_BASE_URL=https://dany.netopower123.com" \
  --set-secrets="GOOGLE_GENERATIVE_AI_API_KEY=dany-google-api-key:latest,DANY_SYSTEM_TOKEN=dany-webhook:latest,DANY_MEDIA_API_KEY=dany-media-key:latest,DATABASE_URL=csn-database-url-prod:latest,DANY_WEBHOOK_SECRET=dany-webhook-secret:latest"
```

> `--allow-unauthenticated` + `DANY_WEBHOOK_SECRET` = el endpoint es público pero solo
> responde a quien manda el header correcto. El backend lo añadirá (paso 6).
> Para la **PRIMera** prueba directa (paso 4) puedes omitir `DANY_WEBHOOK_SECRET` del
> `--set-secrets` para no tener que mandar el header con curl.

Guarda la URL que imprime el deploy:
```bash
URL=$(gcloud run services describe csn-dany-agent-staging --region us-central1 --format='value(status.url)')
echo $URL
```

---

## 4. Probar el servicio directo (sin el CSN todavía)

```bash
# Salud
curl -s $URL/health | jq

# Conversación ADMIN (read-only, seguro)
curl -s -X POST $URL/dany-csn \
  -H "Content-Type: application/json" \
  -H "X-Dany-Webhook-Secret: $(gcloud secrets versions access latest --secret=dany-webhook-secret)" \
  --data-raw '{"message":"dame un resumen del sistema","session_id":"deploy-test-1","rol_usuario":"ADMIN","usuario_id":3687}' | jq

# Conversación TIENDA (hardware)
curl -s -X POST $URL/dany-csn \
  -H "Content-Type: application/json" \
  -H "X-Dany-Webhook-Secret: $(gcloud secrets versions access latest --secret=dany-webhook-secret)" \
  --data-raw '{"message":"la impresora no imprime","session_id":"deploy-test-2","tienda_id":749,"tienda_nombre":"PANZACOLA","rol_usuario":"TIENDA"}' | jq
```

Esperado: `respuesta` con el saludo/estatus o la FASE A de impresora.

---

## 5. (Backend) Adaptar el proxy para mandar el secreto de entrada

En `backend/app/api/v1/endpoints/routes.py`, el proxy `POST /dany/chat` debe incluir
el header `X-Dany-Webhook-Secret` al reenviar (ver `BACKEND_CAMBIOS.md`):

```python
resp = await client.post(
    webhook_url,
    json=payload,
    headers={"X-Dany-Webhook-Secret": get_settings().DANY_WEBHOOK_SECRET},
)
```

Añadir `DANY_WEBHOOK_SECRET` a `config.py` y al deploy del backend (mismo secreto
`dany-webhook-secret`). Si decides NO usar el secreto de entrada, omite este paso y
no setees `DANY_WEBHOOK_SECRET` en el agente.

---

## 6. Cutover: repuntar el CSN al nuevo agente (STAGING)

Apuntar `DANY_WEBHOOK_URL` del **backend de staging** al nuevo servicio:

```bash
gcloud run services update csn-api-staging --region us-central1 \
  --update-env-vars="DANY_WEBHOOK_URL=${URL}/dany-csn"
```

> El path es **`/dany-csn`** (no solo la URL base).

---

## 7. Probar desde el portal CSN (staging)

1. Entra al portal de **staging** como tienda de prueba (ej. `t749@soyneto.com`).
2. Abre el chat de Dany y escribe "la impresora no imprime".
3. Verifica: responde con FASE A y pregunta (sin crear ticket).
4. Login como agente (`christian.gutierrez@soyneto.com`) → chat → "¿cuál atiendo primero?".
5. Login como admin → "resumen del sistema".

Revisar logs en vivo:
```bash
gcloud run services logs tail csn-dany-agent-staging --region us-central1
```

---

## 8. Promover a PRODUCCIÓN

Repite el deploy con nombre prod y `CSN_API_URL` de prod:

```bash
gcloud run deploy csn-dany-agent \
  --image gcr.io/gen-lang-client-0189172552/csn-dany-agent \
  --region us-central1 --platform managed --allow-unauthenticated \
  --set-env-vars="DANY_MODEL=gemini-2.5-flash,CSN_API_URL=https://csn-api-prod-312707215871.us-central1.run.app,DANY_MEDIA_BASE_URL=https://dany.netopower123.com" \
  --set-secrets="GOOGLE_GENERATIVE_AI_API_KEY=dany-google-api-key:latest,DANY_SYSTEM_TOKEN=dany-webhook:latest,DANY_MEDIA_API_KEY=dany-media-key:latest,DATABASE_URL=csn-database-url-prod:latest,DANY_WEBHOOK_SECRET=dany-webhook-secret:latest"

URL_PROD=$(gcloud run services describe csn-dany-agent --region us-central1 --format='value(status.url)')

# Cutover de producción
gcloud run services update csn-api-prod --region us-central1 \
  --update-env-vars="DANY_WEBHOOK_URL=${URL_PROD}/dany-csn"
```

---

## 8.4 Redeploy COMPLETO (backend + agente + frontend)

Orden: **backend → agente → frontend** (el agente usa los endpoints nuevos del backend).
Reautenticar si hace falta: \`gcloud auth login\` · \`gcloud config set project gen-lang-client-0189172552\`.

**1) Backend** (endpoints nuevos /dany/agente/*, /dany/admin/kpis). Solo cambia la imagen;
conserva secretos y env vars (DATABASE_URL prod, DANY_WEBHOOK_URL→agente, etc.):
\`\`\`bash
cd backend
gcloud builds submit --tag gcr.io/gen-lang-client-0189172552/csn-api-prod
gcloud run deploy csn-api-prod --image gcr.io/gen-lang-client-0189172552/csn-api-prod --region us-central1
\`\`\`
> El \`.env\` local (BD dev / localhost) NO se sube (gitignored) y las env vars de Cloud Run mandan. Seguro.

**2) Agente** (98 flujos, multimedia GCS, personalidad, tools de los 3 roles). Fija las URLs de
media (GCS) y motor por si quedaron viejas; conserva secretos:
\`\`\`bash
cd ../agentes/dany-vercel
gcloud builds submit --tag gcr.io/gen-lang-client-0189172552/csn-dany-agent
gcloud run deploy csn-dany-agent-staging \\
  --image gcr.io/gen-lang-client-0189172552/csn-dany-agent --region us-central1 \\
  --update-env-vars="DANY_MEDIA_BASE_URL=https://storage.googleapis.com/csn-dany-media,DANY_MOTOR_BASE_URL=https://dany.netopower123.com"
\`\`\`

**3) Frontend** (Firebase):
\`\`\`bash
cd ../../frontend
npm run build
firebase deploy --only hosting
\`\`\`

**4) Verificar en prod** (ver 8.6 abajo).

## 8.5 Redeploy (actualizar versión del agente o frontend)

Cuando ya hay cambios validados en local y solo quieres actualizar:

**Agente** (solo cambia la imagen; conserva env vars y secretos):
```bash
cd agentes/dany-vercel
gcloud builds submit --tag gcr.io/gen-lang-client-0189172552/csn-dany-agent
gcloud run deploy csn-dany-agent-staging \
  --image gcr.io/gen-lang-client-0189172552/csn-dany-agent --region us-central1
# verificar:
URL=$(gcloud run services describe csn-dany-agent-staging --region us-central1 --format='value(status.url)')
curl -s -H "Authorization: Bearer $(gcloud auth print-identity-token)" $URL/health
```

**Frontend** (Firebase Hosting):
```bash
cd frontend
npm run build
firebase deploy --only hosting
```
Verificar: abrir el portal y confirmar la versión en el menú de usuario (ej. `CSN · v0.4.0`).

## 9. Rollback (si algo falla)

```bash
# Volver al webhook anterior (n8n)
gcloud run services update csn-api-prod --region us-central1 \
  --update-env-vars="DANY_WEBHOOK_URL=https://webhook.soyneto.com/webhook/dany-csn"
```

El n8n sigue intacto, así que el rollback es inmediato y sin pérdida.

---

## Checklist de cutover

- [ ] Secretos creados y con IAM a la service account
- [ ] Imagen construida y deploy en staging OK (`/health` responde)
- [ ] Pruebas directas con curl OK (las 3 personas)
- [ ] Backend manda `X-Dany-Webhook-Secret` (o se omite el secreto)
- [ ] `DANY_WEBHOOK_URL` de staging repuntado y probado desde el portal
- [ ] Aplicados los cambios de `BACKEND_CAMBIOS.md` (fix de auth de los endpoints de contexto)
- [ ] Deploy a prod + cutover de prod
- [ ] Monitoreo de logs 24-48h antes de apagar n8n
