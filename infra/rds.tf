resource "random_password" "db" {
  length           = 32
  special          = true
  # Solo chars seguros en URLs de PostgreSQL — excluye : @ / ? # [ ] % que rompen el parsing
  override_special = "!&*()-_=+{}"
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db-subnet-group"
  subnet_ids = aws_subnet.private[*].id
  tags       = { Name = "${var.project_name}-db-subnet-group" }
}

resource "aws_db_instance" "postgres" {
  identifier = "${var.project_name}-db"

  engine               = "postgres"
  engine_version       = "16"   # AWS elige el último patch disponible en la región
  instance_class       = var.db_instance_class
  allocated_storage    = var.db_allocated_storage
  max_allocated_storage = var.db_allocated_storage * 3 # Auto-scaling hasta 3x

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  multi_az            = var.db_multi_az
  storage_type        = "gp3"
  storage_encrypted   = true

  backup_retention_period = 7        # 7 días de backups automáticos
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.project_name}-db-final-snapshot"

  performance_insights_enabled = false # Activar si necesitas análisis de queries

  tags = { Name = "${var.project_name}-postgres" }
}
