require('dotenv').config();
const express = require('express');
const cors = require('cors');

const ASAAS_KEY = process.env.ASAAS_KEY;
const ASAAS_URL = process.env.ASAAS_URL || 'https://api.asaas.com/v3';
const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

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

app.listen(PORT, () => {
    console.log(`Backend Asaas rodando na porta ${PORT}`);
});
