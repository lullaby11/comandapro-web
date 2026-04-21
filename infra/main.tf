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

  # Descomenta y ajusta después de crear el bucket S3 y la tabla DynamoDB
  # (ver outputs.tf para los nombres sugeridos)
  backend "s3" {
     bucket         = "comandapro-terraform-state-839380010537"
     key            = "prod/terraform.tfstate"
     region         = "eu-west-1"
     dynamodb_table = "comandapro-terraform-locks"
     encrypt        = true
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
