# Guía de Despliegue — Centro de Soluciones Neto

## Arquitectura de ambientes

```
LOCAL                    STAGING                        PRODUCCIÓN
─────────────────────    ────────────────────────────   ─────────────────────────────
Angular dev server       Firebase Hosting               Firebase Hosting
  :4200                    csn-staging.web.app            csn-prod.web.app
  │                        │                              │
  │ proxy.conf.json         │ rewrite /api/**              │ rewrite /api/**
  ▼                        ▼                              ▼
FastAPI localhost:8000    Cloud Run: csn-api-staging     Cloud Run: csn-api-prod
  │                        │                              │
  ▼                        ▼                              ▼
PostgreSQL local          Neon DB (csn_staging)          Neon DB (csn_prod)
```

---

## Prerrequisitos

```bash
# Instalar herramientas
npm install -g firebase-tools
gcloud auth login
gcloud config set project soyneto-csn-staging   # o prod
```

---

## Backend — Cloud Run

### Build y deploy (staging)

```bash
cd backend

# Build imagen
gcloud builds submit \
  --tag gcr.io/soyneto-csn-staging/csn-api:latest \
  --project soyneto-csn-staging

# Deploy a Cloud Run
gcloud run deploy csn-api-staging \
  --image gcr.io/soyneto-csn-staging/csn-api:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars ENVIRONMENT=staging \
  --set-secrets "DATABASE_URL=csn-database-url-staging:latest,SECRET_KEY=csn-secret-key-staging:latest,GEMINI_API_KEY=gemini-api-key:latest" \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 5 \
  --project soyneto-csn-staging
```

### Deploy (producción)

```bash
gcloud builds submit \
  --tag gcr.io/soyneto-csn-prod/csn-api:latest \
  --project soyneto-csn-prod

gcloud run deploy csn-api-prod \
  --image gcr.io/soyneto-csn-prod/csn-api:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars ENVIRONMENT=production \
  --set-secrets "DATABASE_URL=csn-database-url-prod:latest,SECRET_KEY=csn-secret-key-prod:latest,GEMINI_API_KEY=gemini-api-key:latest" \
  --memory 1Gi \
  --cpu 2 \
  --min-instances 1 \
  --max-instances 10 \
  --project soyneto-csn-prod
```

---

## Frontend — Firebase Hosting

### Build y deploy (staging)

```bash
cd frontend

# Build con configuración staging
npm run build -- --configuration=staging

# Deploy solo el hosting staging
firebase deploy --only hosting:staging --project staging
```

### Build y deploy (producción)

```bash
cd frontend

# Build con configuración producción
npm run build -- --configuration=production

# Deploy solo el hosting prod
firebase deploy --only hosting:prod --project prod
```

---

## Secretos en GCP Secret Manager

```bash
# Crear secretos (solo primera vez)
echo -n "postgresql://..." | gcloud secrets create csn-database-url-staging \
  --data-file=- --project soyneto-csn-staging

echo -n "$(openssl rand -hex 32)" | gcloud secrets create csn-secret-key-staging \
  --data-file=- --project soyneto-csn-staging

# Dar acceso a Cloud Run SA
gcloud secrets add-iam-policy-binding csn-database-url-staging \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project soyneto-csn-staging
```

---

## Auto-cierre programado (Cloud Scheduler)

```bash
# Crear job para llamar /internal/auto-cierre cada hora
gcloud scheduler jobs create http csn-auto-cierre-staging \
  --location us-central1 \
  --schedule "0 * * * *" \
  --uri "https://csn-api-staging-xxxx.run.app/api/v1/internal/auto-cierre" \
  --http-method POST \
  --time-zone "America/Mexico_City" \
  --project soyneto-csn-staging
```

---

## Verificar despliegue

```bash
# Health check
curl https://csn-api-staging-xxxx.run.app/health
# {"status":"ok","version":"1.3.0","env":"staging"}

# Vía Firebase Hosting
curl https://csn-staging.web.app/api/v1/health
# {"status":"ok","version":"1.3.0","env":"staging"}
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

Ver archivos de referencia: `deploy/env.staging.example` y `deploy/env.prod.example`
