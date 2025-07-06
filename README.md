# 🎮 Tag Game – Multiplayer 鬼ごっこ（第五人格風ミニマル）

ブラウザだけで遊べるリアルタイム鬼ごっこゲームです。Socket.IO で WebSocket 通信し、複数 PC／タブから同時参加できます。

---

## ✨ 特徴

* **超軽量スタック**：Node.js + Socket.IO + Express
* **即プレイ**：矢印キーで移動、タッチで鬼交代、10 秒逃げ切れば逃げ側勝利
* **IaC 完備**：Terraform 一発で AWS EC2 にデプロイ
* **拡張容易**：コードは 2 ファイル（`server.js` と `index.html`）からスタート

---

## 📁 ディレクトリ構成

```text
.
├── infra/            # Terraform (AWS)
│   └── main.tf
├── public/           # クライアント UI
│   └── index.html
├── src/              # サーバーサイド
│   └── server.js
├── package.json
└── .gitignore
```

---

## 🚀 ローカル実行

```bash
# 1. 取得
git clone https://github.com/<your‑github‑username>/tag-game.git
cd tag-game

# 2. 依存インストール
npm install

# 3. 起動
npm start

# 4. ブラウザ
open http://localhost:3000       # macOS
# または
xdg-open http://localhost:3000   # Linux
```

---

## 🌐 AWS デプロイ

### 前提

| 必要物             | 備考                       |
| --------------- | ------------------------ |
| AWS アカウント       | 東京リージョンで確認済み             |
| EC2 キーペア        | `.pem` 形式で保存済み           |
| Terraform ≥ 1.6 | `terraform -version` で確認 |

### 手順

```bash
cd infra
terraform init                                      # 初期化
terraform apply -auto-approve \
  -var="key_name=<EC2 キーペア名>"                 # 作成

echo "アクセス URL: $(terraform output -raw game_url)"
```

### 片付け

```bash
terraform destroy -auto-approve
```

> **IP 固定したい場合**：`aws_eip` を追加するか、ALB/CloudFront を挟んでください。

---

## 🎮 プレイ方法

| キー      | 動作             |
| ------- | -------------- |
| ↑ ↓ ← → | プレイヤー移動        |
| 鬼       | 他プレイヤーに接触すると交代 |
| 逃げ      | 10 秒逃げ切れば勝利    |

---

## 🛠 開発メモ

* `infra/main.tf` の `git clone` はパブリックリポジトリ想定。プライベートの場合は SSH キーや GitHub トークン対応が必要。
* `.gitignore` に `node_modules/`, `infra/.terraform/`, `*.tfstate` などを含めることでリポジトリをクリーンに保てます。
* 運用時は Elastic IP か ALB を使って IP 変動を吸収してください。

---

## 📌 TODO（拡張案）

* ルーム／ロビー機能
* 障害物・マップ追加
* スコアボード・ランキング
* HTTPS (ACM + ALB) 対応
* CI/CD (GitHub Actions → CodeDeploy など)

---

## 📜 ライセンス

MIT License
