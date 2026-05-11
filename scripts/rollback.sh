#!/usr/bin/env bash
# Rollback manual de ComandaPro (aplicación + BD opcional)
#
# Uso:
#   ./scripts/rollback.sh <SHA_ANTERIOR>
#   ./scripts/rollback.sh <SHA_ANTERIOR> <SNAPSHOT_ID>
#
# Ejemplos:
#   ./scripts/rollback.sh abc1234
#   ./scripts/rollback.sh abc1234 comandapro-db-predeploy-20260511120000-abc1234
#
# Variables de entorno requeridas (o exportadas desde .envrc):
#   AWS_REGION, ECR_REGISTRY, ECR_REPOSITORY_NAME, APPRUNNER_SERVICE_ARN
#   RDS_DB_IDENTIFIER  (solo si restauras la BD)

set -euo pipefail

# ── Parámetros ───────────────────────────────────────────────────────────────
TARGET_SHA="${1:?Proporciona el SHA de la imagen a restaurar como primer argumento}"
SNAPSHOT_ID="${2:-}"

# ── Variables de entorno ─────────────────────────────────────────────────────
: "${AWS_REGION:?Falta AWS_REGION}"
: "${ECR_REGISTRY:?Falta ECR_REGISTRY  (ej: 123456789.dkr.ecr.eu-west-1.amazonaws.com)}"
: "${ECR_REPOSITORY_NAME:?Falta ECR_REPOSITORY_NAME}"
: "${APPRUNNER_SERVICE_ARN:?Falta APPRUNNER_SERVICE_ARN}"

echo "======================================================"
echo " ComandaPro — Rollback de aplicación"
echo "======================================================"
echo " SHA objetivo : $TARGET_SHA"
echo " Región       : $AWS_REGION"
echo " Repositorio  : $ECR_REGISTRY/$ECR_REPOSITORY_NAME"
echo "======================================================"
echo ""

# ── Paso 1: Verificar que la imagen SHA existe en ECR ────────────────────────
echo "[1/3] Verificando imagen en ECR..."
IMAGE_EXISTS=$(aws ecr describe-images \
  --repository-name "$ECR_REPOSITORY_NAME" \
  --image-ids imageTag="$TARGET_SHA" \
  --region "$AWS_REGION" \
  --query 'imageDetails[0].imageTags' \
  --output text 2>/dev/null || echo "")

if [ -z "$IMAGE_EXISTS" ]; then
  echo "ERROR: La imagen con tag '$TARGET_SHA' no existe en ECR."
  echo "  Imágenes disponibles (últimas 10):"
  aws ecr describe-images \
    --repository-name "$ECR_REPOSITORY_NAME" \
    --region "$AWS_REGION" \
    --query 'sort_by(imageDetails, &imagePushedAt)[-10:].imageTags' \
    --output table
  exit 1
fi
echo "  OK — imagen encontrada: $IMAGE_EXISTS"

# ── Paso 2: Re-etiquetar la imagen anterior como :latest ────────────────────
echo "[2/3] Re-etiquetando $TARGET_SHA como :latest en ECR..."
MANIFEST=$(aws ecr batch-get-image \
  --repository-name "$ECR_REPOSITORY_NAME" \
  --image-ids imageTag="$TARGET_SHA" \
  --region "$AWS_REGION" \
  --query 'images[0].imageManifest' \
  --output text)

aws ecr put-image \
  --repository-name "$ECR_REPOSITORY_NAME" \
  --image-tag latest \
  --image-manifest "$MANIFEST" \
  --region "$AWS_REGION" > /dev/null

echo "  OK — :latest apunta ahora a $TARGET_SHA"

# ── Paso 3: Forzar re-deploy en App Runner ───────────────────────────────────
echo "[3/3] Disparando despliegue en App Runner..."
aws apprunner start-deployment \
  --service-arn "$APPRUNNER_SERVICE_ARN" \
  --region "$AWS_REGION" > /dev/null

echo "  OK — despliegue iniciado"
echo ""
echo "Monitorear estado:"
echo "  aws apprunner describe-service --service-arn \"$APPRUNNER_SERVICE_ARN\" \\"
echo "    --query Service.Status --output text --region $AWS_REGION"
echo ""

# ── Restauración de BD (opcional) ────────────────────────────────────────────
if [ -n "$SNAPSHOT_ID" ]; then
  : "${RDS_DB_IDENTIFIER:?Falta RDS_DB_IDENTIFIER para restaurar la BD}"

  echo "======================================================"
  echo " Instrucciones para restaurar la base de datos"
  echo "======================================================"
  echo ""
  echo "  ADVERTENCIA: Restaurar un snapshot reemplaza la BD actual."
  echo "  Todos los datos posteriores al snapshot se perderán."
  echo ""
  echo "  Snapshot a restaurar: $SNAPSHOT_ID"
  echo ""
  echo "  Pasos:"
  echo ""
  echo "  1. Verificar que el snapshot está disponible:"
  echo "     aws rds describe-db-snapshots \\"
  echo "       --db-snapshot-identifier $SNAPSHOT_ID \\"
  echo "       --query 'DBSnapshots[0].Status' --output text"
  echo ""
  echo "  2. Restaurar el snapshot a una nueva instancia:"
  echo "     aws rds restore-db-instance-from-db-snapshot \\"
  echo "       --db-instance-identifier ${RDS_DB_IDENTIFIER}-restored \\"
  echo "       --db-snapshot-identifier $SNAPSHOT_ID \\"
  echo "       --region $AWS_REGION"
  echo ""
  echo "  3. Esperar a que la instancia restaurada esté disponible (~10 min):"
  echo "     aws rds wait db-instance-available \\"
  echo "       --db-instance-identifier ${RDS_DB_IDENTIFIER}-restored"
  echo ""
  echo "  4. Actualizar DATABASE_URL en SSM Parameter Store con el endpoint nuevo:"
  echo "     ENDPOINT=\$(aws rds describe-db-instances \\"
  echo "       --db-instance-identifier ${RDS_DB_IDENTIFIER}-restored \\"
  echo "       --query 'DBInstances[0].Endpoint.Address' --output text)"
  echo "     # Actualizar la URL en SSM con el nuevo endpoint"
  echo "     aws ssm put-parameter --name /comandapro/database_url \\"
  echo "       --value \"postgresql://USER:PASS@\$ENDPOINT:5432/DB\" \\"
  echo "       --overwrite"
  echo ""
  echo "  5. Re-desplegar App Runner para que tome la nueva BD:"
  echo "     aws apprunner start-deployment --service-arn \"$APPRUNNER_SERVICE_ARN\""
  echo ""
  echo "  6. Cuando todo esté verificado, renombrar o eliminar la instancia antigua:"
  echo "     aws rds delete-db-instance \\"
  echo "       --db-instance-identifier $RDS_DB_IDENTIFIER \\"
  echo "       --skip-final-snapshot"
fi

echo "======================================================"
echo " Rollback de aplicación completado."
echo "======================================================"
