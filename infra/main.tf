terraform {
  required_version = ">= 1.4"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Estado remoto con bloqueo. El terraform.tfstate que queda en esta carpeta es el
  # residuo vacío de la migración: el estado bueno vive en S3.
  backend "s3" {
    bucket         = "comandapro-terraform-state-839380010537"
    key            = "prod/terraform.tfstate"
    region         = "eu-west-1"
    dynamodb_table = "comandapro-terraform-locks"
    encrypt        = true
  }
}

# Proveedor para los recursos de SES: la identidad de olyda.app está verificada en
# eu-west-3, y tanto el conjunto de configuración como sus eventos deben vivir en la
# misma región que la identidad que los usa.
provider "aws" {
  alias  = "ses"
  region = var.ses_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
