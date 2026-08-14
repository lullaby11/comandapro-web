# ── VPC ───────────────────────────────────────────────────────────────────────

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = { Name = "${var.project_name}-vpc" }
}

# ── Subnets privadas (RDS + VPC connector de App Runner) ─────────────────────

resource "aws_subnet" "private" {
  count             = length(var.availability_zones)
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, 10 + count.index) # 10.0.10.0/24, 10.0.11.0/24
  availability_zone = var.availability_zones[count.index]

  tags = { Name = "${var.project_name}-private-${var.availability_zones[count.index]}" }
}

# ── Subnets públicas (necesarias para el Internet Gateway y futuros ALBs) ────

resource "aws_subnet" "public" {
  count                   = length(var.availability_zones)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, 1 + count.index) # 10.0.1.0/24, 10.0.2.0/24
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = { Name = "${var.project_name}-public-${var.availability_zones[count.index]}" }
}

# ── Internet Gateway ──────────────────────────────────────────────────────────

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.project_name}-igw" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = { Name = "${var.project_name}-rt-public" }
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# ── NAT Gateway: única salida a internet de la aplicación ─────────────────────
# Sin esto la API no puede abrir NINGUNA conexión saliente. Se descubrió porque los
# correos de SES fallaban con `connect ETIMEDOUT`: el conector VPC de App Runner estaba
# en las subredes públicas, pero **sus ENI no reciben IP pública**, y un Internet Gateway
# solo encamina tráfico de máquinas que la tienen. Los paquetes salían y no volvía nada.
#
# Un solo NAT en la primera zona: es un punto único de fallo, pero duplicarlo cuesta el
# doble y para este volumen no compensa. Si esa zona cae, se deja de enviar correo — los
# pedidos, la impresión y el dashboard siguen, porque no necesitan salir a internet.

resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "${var.project_name}-nat-eip" }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  tags          = { Name = "${var.project_name}-nat" }

  depends_on = [aws_internet_gateway.main]
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }
  tags = { Name = "${var.project_name}-rt-private" }
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# ── Security Group: App Runner VPC connector ──────────────────────────────────
# App Runner usa este SG para salir al VPC (egress hacia RDS)

resource "aws_security_group" "apprunner_connector" {
  name        = "${var.project_name}-apprunner-connector"
  description = "Permite al conector VPC de App Runner acceder a RDS"
  vpc_id      = aws_vpc.main.id

  egress {
    description = "PostgreSQL hacia RDS"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  # Segundo bloqueo del mismo fallo: este grupo solo dejaba salir al 5432 del propio VPC,
  # así que el HTTPS saliente moría aquí aunque hubiera NAT. Hace falta para SES y, más
  # adelante, para Stripe. Se abre solo el 443: no hay motivo para más.
  egress {
    description = "HTTPS saliente: SES, Stripe y otras APIs"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-apprunner-connector-sg" }
}

# App Runner rechaza crear un conector si ya existe otro con la MISMA combinación de
# grupos de seguridad, aunque las subredes sean distintas. Como el conector hay que
# recrearlo para moverlo a las subredes privadas, el nuevo necesita su propio grupo.
# El anterior (`apprunner_connector`) queda huérfano en cuanto se destruye el conector
# viejo y se retira en el siguiente cambio.
resource "aws_security_group" "apprunner_connector_2" {
  name        = "${var.project_name}-apprunner-connector-2"
  description = "Salida del conector VPC de App Runner: RDS y HTTPS"
  vpc_id      = aws_vpc.main.id

  egress {
    description = "PostgreSQL hacia RDS"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "HTTPS saliente: SES, Stripe y otras APIs"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-apprunner-connector-2-sg" }
}

# ── Security Group: RDS ───────────────────────────────────────────────────────

resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds"
  description = "Permite conexiones PostgreSQL solo desde App Runner"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "PostgreSQL desde App Runner"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    # Los dos: el conector viejo sigue vivo hasta que el servicio apunta al nuevo
    security_groups = [
      aws_security_group.apprunner_connector.id,
      aws_security_group.apprunner_connector_2.id,
    ]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-rds-sg" }
}
