########################################
# Tag-Game on ALB  (HTTP・ポート80版)
########################################
terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

#####################  Variables  #####################
variable "aws_region"    { default = "ap-northeast-1" }
variable "instance_type" { default = "t3.micro" }
variable "key_name"      { description = "EC2 key-pair name" }

#####################  Provider  #####################
provider "aws" { region = var.aws_region }

#####################  Network  #####################
data "aws_vpc" "default" { default = true }

data "aws_subnets" "public" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }

  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

#####################  Security Groups  #####################
resource "aws_security_group" "alb_sg" {
  name_prefix = "alb-tag-game-"
  vpc_id      = data.aws_vpc.default.id

  # ★ 443 → 80 に変更しても OK だが、80 は許可不要（ALB は自分で開ける）
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "ec2_sg" {
  name_prefix = "ec2-tag-game-"
  vpc_id      = data.aws_vpc.default.id

  ingress { 
    description="SSH" 
    from_port=22 
    to_port=22 
    protocol="tcp" 
    cidr_blocks=["0.0.0.0/0"] 
  }

  ingress {
    description              = "Game 3000 from ALB"
    from_port                = 3000
    to_port                  = 3000
    protocol                 = "tcp"
    security_groups          = [aws_security_group.alb_sg.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

#####################  EC2  #####################
data "aws_ami" "al2023" {
  owners      = ["amazon"]
  most_recent = true
  filter { 
    name="name" 
    values=["al2023-ami-*-x86_64"] 
  }
}

resource "aws_instance" "game" {
  ami                    = data.aws_ami.al2023.id
  subnet_id              = data.aws_subnets.public.ids[0]
  instance_type          = var.instance_type
  key_name               = var.key_name
  vpc_security_group_ids = [aws_security_group.ec2_sg.id]

  user_data = <<-USERDATA
    #!/bin/bash
    set -eux
    dnf -y install git
    curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
    dnf -y install nodejs
    if [ -d /opt/tag-game ]; then
      git -C /opt/tag-game pull
    else
      git clone https://github.com/frtkng/game-tag.git /opt/tag-game
    fi
    cd /opt/tag-game
    npm install --omit=dev
    pkill -f "node src/server.js" || true
    nohup node src/server.js > /var/log/tag-game.log 2>&1 &
  USERDATA

  tags = { Name = "tag-game" }
}

#####################  ALB & Target Group  #####################
resource "aws_lb" "alb" {
  name               = "tag-game-alb"
  load_balancer_type = "application"
  subnets            = data.aws_subnets.public.ids
  security_groups    = [aws_security_group.alb_sg.id]
}

resource "aws_lb_target_group" "tg" {
  name     = "tag-game-tg"
  port     = 3000
  protocol = "HTTP"
  vpc_id   = data.aws_vpc.default.id

  health_check {
    path     = "/"
    protocol = "HTTP"
    matcher  = "200-404"
  }
}

resource "aws_lb_target_group_attachment" "attach" {
  target_group_arn = aws_lb_target_group.tg.arn
  target_id        = aws_instance.game.id
  port             = 3000
}

#####################  HTTP Listener ★変更  #####################
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.alb.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.tg.arn
  }
}

#####################  Outputs  #####################
output "game_url" {
  value       = "http://${aws_lb.alb.dns_name}"
  description = "プロキシ下でもアクセスできる HTTP URL"
}
