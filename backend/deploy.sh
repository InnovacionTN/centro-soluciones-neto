#!/bin/bash
set -e

PROJECT="gen-lang-client-0189172552"
REGION="us-central1"
REGISTRY="gcr.io/$PROJECT"

SECRETS_STAGING="DATABASE_URL=csn-database-url-staging:latest,SECRET_KEY=csn-secret-key-staging:latest,GEMINI_API_KEY=gemini-api-key:latest,DANY_SYSTEM_TOKEN=dany-webhook:latest"
SECRETS_PROD="DATABASE_URL=csn-database-url-prod:latest,SECRET_KEY=csn-secret-key-prod:latest,GEMINI_API_KEY=gemini-api-key:latest,DANY_SYSTEM_TOKEN=dany-webhook:latest"

case "$1" in
  staging)
    echo "🚀 Desplegando staging..."
    gcloud builds submit . \
      --tag "$REGISTRY/csn-api-staging:latest" \
      --project "$PROJECT"
    gcloud run deploy csn-api-staging \
      --image "$REGISTRY/csn-api-staging:latest" \
      --region "$REGION" \
      --platform managed \
      --allow-unauthenticated \
      --set-secrets "$SECRETS_STAGING" \
      --set-env-vars ENVIRONMENT=staging \
      --memory 512Mi --cpu 1 \
      --min-instances 0 --max-instances 5 \
      --project "$PROJECT"
    echo "✅ Staging listo"
    ;;

  prod)
    echo "⚠️  Desplegando PRODUCCIÓN..."
    read -p "¿Confirmas deploy a prod? [y/N]: " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
      echo "❌ Deploy cancelado"
      exit 0
    fi
    gcloud builds submit . \
      --tag "$REGISTRY/csn-api-prod:latest" \
      --project "$PROJECT"
    gcloud run deploy csn-api-prod \
      --image "$REGISTRY/csn-api-prod:latest" \
      --region "$REGION" \
      --platform managed \
      --allow-unauthenticated \
      --set-secrets "$SECRETS_PROD" \
      --set-env-vars ENVIRONMENT=production \
      --memory 1Gi --cpu 2 \
      --min-instances 1 --max-instances 10 \
      --project "$PROJECT"
    echo "✅ Producción lista"
    ;;

  logs-staging)
    gcloud run services logs tail csn-api-staging \
      --region "$REGION" --project "$PROJECT"
    ;;

  logs-prod)
    gcloud run services logs tail csn-api-prod \
      --region "$REGION" --project "$PROJECT"
    ;;

  *)
    echo "Uso: ./deploy.sh [staging|prod|logs-staging|logs-prod]"
    exit 1
    ;;
esac