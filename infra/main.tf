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
variable "aws_region"  { default = "ap-northeast-1" }      # 東京リージョン
variable "instance_type" { default = "t3.micro" }
variable "key_name" { description = "既存の EC2 キーペア名" }

#####################
#  Provider
#####################
provider "aws" {
  region = var.aws_region
}

#####################
#  Base network
#####################
data "aws_vpc" "default" {               # デフォルト VPC
  default = true
}

#####################
#  Security Group
#####################
resource "aws_security_group" "tag_game_sg" {
  name        = "tag-game-sg"
  description = "Allow SSH + TCP 3000"
  vpc_id      = data.aws_vpc.default.id

  ingress {                    # SSH
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {                    # ゲーム用
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {                     # 全許可
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
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
}

#####################
#  EC2 instance
#####################
resource "aws_instance" "tag_game" {
  ami           = data.aws_ami.al2023.id
  instance_type = var.instance_type
  key_name      = var.key_name
  vpc_security_group_ids = [aws_security_group.tag_game_sg.id]

   user_data = <<-EOF
    #!/bin/bash
    set -eux
    dnf update -y
    dnf install -y git
    curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
    dnf install -y nodejs
    git clone https://github.com/frtkng/game-tag.git /opt/tag-game
    cd /opt/tag-game
    npm install --omit=dev
    nohup npm start > /var/log/tag-game.log 2>&1 &
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
