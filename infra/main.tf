########################################
#  main.tf  (Terraform >=1.6, AWS prov. ~>5)
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

#####################
#  Variables
#####################
variable "aws_region" {
  description = "デプロイ先リージョン"
  type        = string
  default     = "ap-northeast-1"   # 東京
}

variable "instance_type" {
  description = "EC2 インスタンスタイプ"
  type        = string
  default     = "t3.micro"
}

variable "key_name" {
  description = "既存の EC2 キーペア名（必須）"
  type        = string
}

#####################
#  Provider
#####################
provider "aws" {
  region = var.aws_region
}

#####################
#  Base network
#####################
data "aws_vpc" "default" {
  default = true
}

#####################
#  Security Group
#####################
resource "aws_security_group" "tag_game_sg" {
  name_prefix = "tag-game-"                     # ← 衝突を避ける
  description = "Allow SSH + TCP 3000"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "Game port"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "tag-game-sg" }
}

#####################
#  AMI (Amazon Linux 2023)
#####################
data "aws_ami" "al2023" {
  owners      = ["amazon"]
  most_recent = true
  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
}

#####################
#  EC2 instance
#####################
resource "aws_instance" "tag_game" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  key_name               = var.key_name
  vpc_security_group_ids = [aws_security_group.tag_game_sg.id]

  user_data = <<-EOF
    #!/bin/bash
    set -eux
    dnf install -y git
    curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
    dnf install -y nodejs
    if [ -d /opt/tag-game ]; then
      git -C /opt/tag-game pull
    else
      git clone https://github.com/<your>/tag-game.git /opt/tag-game
    fi
    cd /opt/tag-game
    npm install --omit=dev
    pkill -f "node src/server.js" || true
    nohup node src/server.js > /var/log/tag-game.log 2>&1 &
  EOF

  tags = { Name = "tag-game" }
}

#####################
#  Outputs
#####################
output "game_url" {
  description = "ブラウザでアクセスする URL"
  value       = "http://${aws_instance.tag_game.public_ip}:3000"
}
