#!/usr/bin/env bash
# Script de instalação do backend Asaas no servidor (Ubuntu) da Hetzner.
#
# Uso:
#   1. Copie a pasta "server/" para o servidor (ex: scp -r server root@SEU_IP:/opt/conservatorio-backend)
#   2. SSH no servidor: ssh root@SEU_IP
#   3. cd /opt/conservatorio-backend
#   4. chmod +x install.sh
#   5. sudo ./install.sh
#
# O script vai perguntar: domínio, chave da API Asaas, e ambiente (produção/sandbox).

set -e

if [ "$EUID" -ne 0 ]; then
  echo "Rode este script como root (sudo ./install.sh)"
  exit 1
fi

echo "=== Instalação do backend Asaas - Conservatório de Cubatão ==="
echo

read -rp "Domínio (ex: conservatoriocubatao.com.br): " DOMAIN
read -rp "Chave da API Asaas (começa com \$aact_): " ASAAS_KEY
read -rp "Ambiente Asaas [producao/sandbox] (padrão: producao): " ASAAS_ENV
ASAAS_ENV=${ASAAS_ENV:-producao}

if [ "$ASAAS_ENV" = "sandbox" ]; then
  ASAAS_URL="https://sandbox.asaas.com/api/v3"
else
  ASAAS_URL="https://api.asaas.com/v3"
fi

APP_DIR="/opt/conservatorio-backend"
PORT=3001

echo
echo ">> Atualizando pacotes..."
apt-get update -y

echo
echo ">> Instalando Node.js 20.x (se necessário)..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo
echo ">> Instalando Nginx e Certbot (se necessário)..."
apt-get install -y nginx certbot python3-certbot-nginx

echo
echo ">> Instalando dependências do backend..."
cd "$APP_DIR"
npm install --production

echo
echo ">> Criando arquivo .env..."
cat > "$APP_DIR/.env" <<EOF
ASAAS_KEY=$ASAAS_KEY
ASAAS_URL=$ASAAS_URL
PORT=$PORT
ALLOWED_ORIGIN=https://$DOMAIN
EOF
chmod 600 "$APP_DIR/.env"

echo
echo ">> Instalando PM2 e iniciando o backend..."
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi
pm2 start "$APP_DIR/server.js" --name asaas-backend --update-env || pm2 restart asaas-backend --update-env
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null

echo
echo ">> Configurando Nginx..."
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
cat > "$NGINX_CONF" <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    location /api/asaas/ {
        proxy_pass http://localhost:$PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        root /var/www/$DOMAIN;
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

mkdir -p "/var/www/$DOMAIN"
ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/$DOMAIN"
nginx -t && systemctl reload nginx

echo
echo ">> Solicitando certificado HTTPS (Let's Encrypt)..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN" --redirect || \
  echo "AVISO: certbot falhou. Verifique se o DNS do domínio já aponta para este servidor e rode novamente: certbot --nginx -d $DOMAIN"

echo
echo "=== Concluído! ==="
echo "Backend rodando em: http://localhost:$PORT (proxy em https://$DOMAIN/api/asaas/)"
echo
echo "Próximo passo: copie o conteúdo de index.html para /var/www/$DOMAIN/index.html"
echo "e ajuste no index.html: const ASAAS_PROXY_URL = 'https://$DOMAIN/api/asaas';"
