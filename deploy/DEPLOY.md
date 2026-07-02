# Guía de Despliegue — Centro de Soluciones Neto

## Proyecto GCP único

```
Proyecto: gen-lang-client-0189172552  (Centro Soluciones Neto)
```

Todo vive en el mismo proyecto: Cloud Run staging, Cloud Run prod, Secret Manager, Cloud Scheduler y Firebase Hosting (2 sites).

## Arquitectura de ambientes

```
LOCAL                    STAGING                              PRODUCCIÓN
─────────────────────    ──────────────────────────────────   ──────────────────────────────────
Angular dev server       Firebase Hosting                     Firebase Hosting
  :4200                    csn-staging.web.app                  csn-prod.web.app
  │                        │                                    │
  │ proxy.conf.json         │ rewrite /api/**                    │ rewrite /api/**
  ▼                        ▼                                    ▼
FastAPI localhost:8000    Cloud Run: csn-api-staging           Cloud Run: csn-api-prod
  │                        │                                    │
  ▼                        ▼                                    ▼
PostgreSQL local          Neon DB (csn_staging)                Neon DB (csn_prod)

Todos en el mismo proyecto GCP: gen-lang-client-0189172552
```

---

## Variables de entorno por ambiente

| Variable | Local | Staging | Prod |
|---|---|---|---|
| `ENVIRONMENT` | development | staging | production |
| `DATABASE_URL` | localhost/csn_dev | Neon staging | Neon prod |
| `SECRET_KEY` | dev-secret | Secret Manager | Secret Manager |
| `STORAGE_BACKEND` | local | gcs | gcs |
| `GCS_BUCKET_NAME` | — | csn-uploads-staging | csn-uploads-prod |
| Swagger `/docs` | ✅ | ✅ | ❌ deshabilitado |
| HSTS header | ❌ | ❌ | ✅ |

---

## FASE 0 — Prerrequisitos (solo una vez)

```bash
npm install -g firebase-tools
# gcloud CLI: https://cloud.google.com/sdk/docs/install

gcloud auth login
firebase login

gcloud config set project gen-lang-client-0189172552
```

---

## FASE 1 — Habilitar APIs (solo primera vez)

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com \
  containerregistry.googleapis.com \
  --project gen-lang-client-0189172552
```

---

## FASE 2 — Secretos en Secret Manager (solo primera vez)

```bash
# DATABASE_URL staging
echo -n "postgresql://user:pass@host.neon.tech/csn_staging?sslmode=require" \
  | gcloud secrets create csn-database-url-staging \
    --data-file=- --project gen-lang-client-0189172552

# DATABASE_URL prod
echo -n "postgresql://user:pass@host.neon.tech/csn_prod?sslmode=require" \
  | gcloud secrets create csn-database-url-prod \
    --data-file=- --project gen-lang-client-0189172552

# SECRET_KEY staging
echo -n "$(openssl rand -hex 32)" \
  | gcloud secrets create csn-secret-key-staging \
    --data-file=- --project gen-lang-client-0189172552

# SECRET_KEY prod
echo -n "$(openssl rand -hex 32)" \
  | gcloud secrets create csn-secret-key-prod \
    --data-file=- --project gen-lang-client-0189172552

# GEMINI_API_KEY (compartida entre ambientes)
echo -n "AIza..." \
  | gcloud secrets create gemini-api-key \
    --data-file=- --project gen-lang-client-0189172552
```

### Dar acceso al SA de Cloud Run

```bash
PROJECT_NUM=$(gcloud projects describe gen-lang-client-0189172552 --format='value(projectNumber)')
SA="${PROJECT_NUM}-compute@developer.gserviceaccount.com"

for SECRET in csn-database-url-staging csn-database-url-prod csn-secret-key-staging csn-secret-key-prod gemini-api-key; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:${SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --project gen-lang-client-0189172552
done
```

---

## FASE 3 — Firebase Hosting (solo primera vez)

```bash
# Crear los 2 sites dentro del mismo proyecto Firebase
firebase hosting:sites:create csn-staging --project gen-lang-client-0189172552
firebase hosting:sites:create csn-prod    --project gen-lang-client-0189172552

# Aplicar targets del .firebaserc
firebase target:apply hosting staging csn-staging --project gen-lang-client-0189172552
firebase target:apply hosting prod    csn-prod    --project gen-lang-client-0189172552
```

---

## FASE 4 — Deploy Backend STAGING

```bash
cd backend

# Build imagen
gcloud builds submit \
  --tag gcr.io/gen-lang-client-0189172552/csn-api-staging:latest \
  --project gen-lang-client-0189172552

# Deploy Cloud Run
gcloud run deploy csn-api-staging \
  --image gcr.io/gen-lang-client-0189172552/csn-api-staging:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars ENVIRONMENT=staging \
  --set-secrets "DATABASE_URL=csn-database-url-staging:latest,SECRET_KEY=csn-secret-key-staging:latest,GEMINI_API_KEY=gemini-api-key:latest" \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 5 \
  --project gen-lang-client-0189172552
```

---

## FASE 5 — Deploy Frontend STAGING

```bash
cd frontend
npm run build -- --configuration=staging
firebase deploy --only hosting:staging --project gen-lang-client-0189172552
```

URL: `https://csn-staging.web.app`

---

## FASE 6 — Deploy Backend PRODUCCIÓN

```bash
cd backend

gcloud builds submit \
  --tag gcr.io/gen-lang-client-0189172552/csn-api-prod:latest \
  --project gen-lang-client-0189172552

gcloud run deploy csn-api-prod \
  --image gcr.io/gen-lang-client-0189172552/csn-api-prod:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars ENVIRONMENT=production \
  --set-secrets "DATABASE_URL=csn-database-url-prod:latest,SECRET_KEY=csn-secret-key-prod:latest,GEMINI_API_KEY=gemini-api-key:latest" \
  --memory 1Gi \
  --cpu 2 \
  --min-instances 1 \
  --max-instances 10 \
  --project gen-lang-client-0189172552
```

---

## FASE 7 — Deploy Frontend PRODUCCIÓN

```bash
cd frontend
npm run build -- --configuration=production
firebase deploy --only hosting:prod --project gen-lang-client-0189172552
```

URL: `https://csn-prod.web.app`

---

## FASE 8 — Cloud Scheduler (solo primera vez)

```bash
# Staging
STAGING_URL=$(gcloud run services describe csn-api-staging \
  --region us-central1 --project gen-lang-client-0189172552 \
  --format='value(status.url)')

gcloud scheduler jobs create http csn-auto-cierre-staging \
  --location us-central1 \
  --schedule "0 * * * *" \
  --uri "${STAGING_URL}/api/v1/internal/auto-cierre" \
  --http-method POST \
  --time-zone "America/Mexico_City" \
  --project gen-lang-client-0189172552

# Prod
PROD_URL=$(gcloud run services describe csn-api-prod \
  --region us-central1 --project gen-lang-client-0189172552 \
  --format='value(status.url)')

gcloud scheduler jobs create http csn-auto-cierre-prod \
  --location us-central1 \
  --schedule "0 * * * *" \
  --uri "${PROD_URL}/api/v1/internal/auto-cierre" \
  --http-method POST \
  --time-zone "America/Mexico_City" \
  --project gen-lang-client-0189172552
```

---

## Comandos rápidos (deploys posteriores)

### Solo backend staging
```bash
cd backend
gcloud builds submit --tag gcr.io/gen-lang-client-0189172552/csn-api-staging:latest --project gen-lang-client-0189172552
gcloud run deploy csn-api-staging --image gcr.io/gen-lang-client-0189172552/csn-api-staging:latest --region us-central1 --project gen-lang-client-0189172552
```

### Solo frontend staging
```bash
cd frontend && npm run build -- --configuration=staging
firebase deploy --only hosting:staging --project gen-lang-client-0189172552
```

### Solo backend prod
```bash
cd backend
gcloud builds submit --tag gcr.io/gen-lang-client-0189172552/csn-api-prod:latest --project gen-lang-client-0189172552
gcloud run deploy csn-api-prod --image gcr.io/gen-lang-client-0189172552/csn-api-prod:latest --region us-central1 --project gen-lang-client-0189172552
```

### Solo frontend prod
```bash
cd frontend && npm run build -- --configuration=production
firebase deploy --only hosting:prod --project gen-lang-client-0189172552
```

### Ambos a staging (backend + frontend)
```bash
cd backend
gcloud builds submit --tag gcr.io/gen-lang-client-0189172552/csn-api-staging:latest --project gen-lang-client-0189172552
gcloud run deploy csn-api-staging --image gcr.io/gen-lang-client-0189172552/csn-api-staging:latest --region us-central1 --project gen-lang-client-0189172552
cd ../frontend && npm run build -- --configuration=staging
firebase deploy --only hosting:staging --project gen-lang-client-0189172552
```

---

## Verificar despliegue

```bash
# Health check directo al Cloud Run
curl https://csn-api-staging-xxxx.run.app/health

# A través de Firebase Hosting (valida el rewrite)
curl https://csn-staging.web.app/api/v1/health
# {"status":"ok","version":"1.3.0","env":"staging"}

curl https://csn-prod.web.app/api/v1/health
# {"status":"ok","version":"1.3.0","env":"production"}
```

---

## Actualizar un secreto existente

```bash
# Agregar nueva versión (la anterior queda en historial)
echo -n "nuevo-valor" | gcloud secrets versions add csn-database-url-staging \
  --data-file=- --project gen-lang-client-0189172552

# Forzar redeploy de Cloud Run para que tome la nueva versión
gcloud run deploy csn-api-staging \
  --image gcr.io/gen-lang-client-0189172552/csn-api-staging:latest \
  --region us-central1 --project gen-lang-client-0189172552
```
