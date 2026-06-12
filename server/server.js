require('dotenv').config();
const express = require('express');
const cors = require('cors');

const ASAAS_KEY = process.env.ASAAS_KEY;
const ASAAS_URL = process.env.ASAAS_URL || 'https://api.asaas.com/v3';
const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const GAS_WEBHOOK_URL = process.env.GAS_WEBHOOK_URL;
const ASAAS_WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN;

if (!ASAAS_KEY) {
    console.error('ERRO: variável de ambiente ASAAS_KEY não definida. Configure o arquivo .env.');
    process.exit(1);
}

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json());

// Encaminha requisições para a API da Asaas, injetando a chave no servidor.
async function asaasRequest(method, path, body) {
    const res = await fetch(ASAAS_URL + path, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'access_token': ASAAS_KEY,
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    return { status: res.status, data };
}

app.get('/api/asaas/health', (req, res) => res.json({ ok: true }));

// Proxy genérico: encaminha qualquer rota /api/asaas/<resto> para a API da Asaas,
// preservando método, query string e corpo, e injetando a chave no servidor.
app.all(/^\/api\/asaas\/(.*)/, async (req, res) => {
    const subPath = '/' + req.params[0] + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
    try {
        const { status, data } = await asaasRequest(req.method, subPath, ['GET', 'HEAD'].includes(req.method) ? undefined : req.body);
        res.status(status).json(data);
    } catch (err) {
        res.status(500).json({ errors: [{ description: err.message }] });
    }
});

// Recebe o webhook do Asaas (configurado em Asaas > Integrações > Webhooks)
// e repassa o evento para o Web App do Google Apps Script (doPost).
app.post('/api/webhook/asaas', async (req, res) => {
    // Valida o token enviado pelo Asaas no header "asaas-access-token"
    if (ASAAS_WEBHOOK_TOKEN && req.headers['asaas-access-token'] !== ASAAS_WEBHOOK_TOKEN) {
        return res.status(401).json({ erro: 'token inválido' });
    }

    if (!GAS_WEBHOOK_URL) {
        console.error('GAS_WEBHOOK_URL não configurada; evento recebido mas não repassado.');
        return res.status(500).json({ erro: 'GAS_WEBHOOK_URL não configurada' });
    }

    try {
        const gasRes = await fetch(GAS_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body),
            redirect: 'follow',
        });
        const text = await gasRes.text();
        res.status(200).json({ recebido: true, gas: text });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Backend Asaas rodando na porta ${PORT}`);
});
