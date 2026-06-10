# Backend de pagamento (proxy Asaas)

Pequeno servidor Node/Express que guarda a chave da API Asaas em segredo no
servidor e repassa as requisições do front-end (`index.html`) para a Asaas.

## Por que isso é necessário

A chave de API da Asaas dá acesso total à conta financeira do conservatório.
Se ela ficar no `index.html` (front-end), qualquer pessoa que abrir o site
consegue ver o código-fonte e roubar a chave. Este backend resolve isso:
a chave fica só no servidor, em uma variável de ambiente.

## Deploy no servidor Hetzner (Ubuntu)

1. **Conectar no servidor via SSH**
   ```bash
   ssh root@SEU_IP_DO_SERVIDOR
   ```

2. **Instalar Node.js** (se ainda não tiver)
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

3. **Copiar a pasta `server/` para o servidor**
   Do seu computador:
   ```bash
   scp -r server root@SEU_IP_DO_SERVIDOR:/opt/conservatorio-backend
   ```

4. **Configurar as variáveis de ambiente**
   No servidor:
   ```bash
   cd /opt/conservatorio-backend
   cp .env.example .env
   nano .env
   ```
   Preencha:
   - `ASAAS_KEY` = sua chave de API da Asaas (pegue em Asaas > Configurações > Integrações > API)
   - `ASAAS_URL` = `https://api.asaas.com/v3` (produção) ou `https://sandbox.asaas.com/api/v3` (testes)
   - `ALLOWED_ORIGIN` = o domínio onde o `index.html` será publicado (ex: `https://conservatoriocubatao.com.br`)

5. **Instalar dependências e testar**
   ```bash
   npm install
   node server.js
   ```
   Deve aparecer: `Backend Asaas rodando na porta 3001`

6. **Manter rodando sempre (com pm2)**
   ```bash
   sudo npm install -g pm2
   pm2 start server.js --name asaas-backend
   pm2 save
   pm2 startup
   ```

7. **Expor via Nginx + HTTPS** (recomendado)
   Configure o Nginx para fazer proxy de `https://seu-dominio.com/api/asaas/`
   para `http://localhost:3001/api/asaas/`, e use o Certbot para gerar um
   certificado SSL gratuito (Let's Encrypt).

   Exemplo de bloco Nginx:
   ```nginx
   location /api/asaas/ {
       proxy_pass http://localhost:3001;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
   }
   ```

## Endpoints disponíveis

- `POST /api/asaas/customers` — cria/busca cliente
- `POST /api/asaas/payments` — cria cobrança (PIX, boleto, cartão)
- `GET /api/asaas/payments/:id/pixQrCode` — QR Code do PIX
- `GET /api/asaas/payments/:id/identificationField` — linha digitável do boleto
- `GET /api/asaas/health` — checagem de status

Qualquer outro caminho `/api/asaas/<algo>` é repassado automaticamente para
`https://api.asaas.com/v3/<algo>`.

## Ajustar o front-end

No `index.html`, a constante `ASAAS_PROXY_URL` deve apontar para o seu domínio:

```js
const ASAAS_PROXY_URL = 'https://seu-dominio.com/api/asaas';
```

(Se o front-end e o backend estiverem no mesmo domínio, `/api/asaas` já funciona.)
