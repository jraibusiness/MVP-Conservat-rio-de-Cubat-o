# Conservatório Municipal de Cubatão — Sistema de Inscrição (Processo Seletivo 2027)

MVP do sistema online de inscrição para o processo seletivo do Conservatório
Municipal de Cubatão (ETMD "Ivanildo Rebouças da Silva"). Inscrição com taxa
(integração Asaas), isenção por comprovante, consulta de status por CPF, painel
administrativo com 2FA, ranking de vagas por instrumento, e-mails automáticos e
chatbot de dúvidas.

---

## Arquitetura — duas vias de deploy

O repositório contém **duas frentes** independentes:

### 1. `gas/` — Google Apps Script (Web App)  ← sistema principal
Versão que roda 100% no Google (planilha + Apps Script + Web App). É o "sistema"
descrito no arquivo `.md` de origem e o que está em produção.

| Arquivo | Papel |
|---|---|
| `gas/Codigo.gs` | Backend: rotas `doGet`/`doPost`, webhook Asaas, persistência na planilha `Inscricoes`, ranking/vagas, e-mails, admin 2FA, chatbot (Gemini + fallback local). |
| `gas/Home.html` | Hub de navegação (Inscrição / Consulta / Admin) + FAQ recolhível. |
| `gas/Index.html` | Wizard de inscrição passo a passo. |
| `gas/Consulta.html` | Consulta pública por CPF. |
| `gas/Admin.html` | Painel administrativo (login 2FA, dashboard, busca, relatório PDF, QR). |
| `gas/Chatbot.html` | Widget de chat flutuante (partial incluído nas páginas). |
| `gas/Tradutor.html` | Menu fixo de tradução PT/EN/ES (partial incluído nas páginas). |

### 2. `index.html` + `server/` — versão auto-hospedada (Node/Express)
Página única estática que fala com a Asaas por um proxy Node (a chave fica no
servidor, não no navegador). O `server/` mantém a chave em segredo e repassa o
webhook do Asaas para o `doPost` do GAS. Deploy no Hetzner descrito em
`server/README.md`. **Esta via não foi alterada nesta rodada** — o foco foi o
GAS.

---

## Deploy do Web App (GAS)

1. Crie/abra a planilha e o projeto Apps Script.
2. Cole o conteúdo de `gas/Codigo.gs` no arquivo `Codigo.gs`.
3. Crie os arquivos HTML `Home`, `Index`, `Consulta`, `Admin`, `Chatbot` e
   `Tradutor` (cada um com o conteúdo do respectivo `.html`).
4. **Propriedades do script** (Configurações do projeto → Propriedades do
   script) — defina:
   - `ASAAS_API_KEY` — chave da Asaas
   - `GEMINI_API_KEY` — **opcional** (veja chatbot abaixo)
   - `WEBHOOK_TOKEN` — gere rodando `gerarTokenWebhook()` uma vez no editor
5. Rode uma vez `configurarPlanilha()`, `inicializarConfigSistema()`,
   `inicializarConfigAdmin()` e `obterLimitesVagas()` para criar as abas.
6. Implante como **Aplicativo da Web** (`doGet`), acesso restrito à
   secretaria/equipe conforme a necessidade.

---

## Refinamentos desta rodada (mantêm o sistema funcionando)

### a) FAQ recolhível na Home (`Home.html`)
As "Perguntas Frequentes" ficam **ocultas por padrão**. Há um botão
"❓ Perguntas Frequentes" que, ao ser clicado, revela o bloco (com animação).
Cada pergunta continua abrindo/fechando individualmente.

### b) Menu fixo de tradução PT/EN/ES (`Tradutor.html`)
Menu fixo no canto superior esquerdo (🌐 PT/EN/ES) incluído em **todas as
páginas** (Home, Index, Consulta, Admin). Usa o widget do Google Translate com
um seletor customizado; a escolha persiste em cookie (`googtrans`) e vale para
todas as páginas da mesma origem. A barra padrão do Google fica oculta.

### c) Chatbot funcionando (`Codigo.gs` + `Chatbot.html`)
- O bot agora **sempre responde** sobre o processo seletivo: se a
  `GEMINI_API_KEY` não estiver configurada — ou se a API falhar — ele cai num
  **respondedor local por palavras-chave** (`responderChatbotLocal`), baseado na
  mesma base de conhecimento. Com a chave configurada, usa o Gemini.
- Corrigido o bug que enviava a última pergunta duas vezes ao modelo.
- Adicionados **chips de sugestão** (Quanto custa? / Cursos / Datas 2027 /
  Endereço) para o usuário começar rápido.
- Para ativar a versão com IA: defina `GEMINI_API_KEY` nas Propriedades do
  script. Sem ela, o bot já funciona (modo local).

### d) Skills (xstate / shadcn-ui / tailwind / vercel-ai)
Veja `NOTAS_TECNICAS.md` — este é um projeto Google Apps Script (HtmlService),
não um app React/Next. As libs não se aplicam literalmente; aplicamos seus
**princípios** (design tokens, componentes acessíveis, FSM no wizard) sem
quebrar o que funciona.

---

## Esquema da aba `Inscricoes` (índices 0-based)

```
0 Data/Hora        7 Endereço          14 Asaas Customer ID
1 Nome             8 Escolaridade      15 Asaas Cobrança ID
2 Sobrenome        9 Curso             16 Link de Pagamento
3 E-mail          10 Período           17 Status do Pagamento
4 CPF             11 Tipo Inscrição    18 Instrumento
5 Telefone        12 Comprovante       19 Data Pagamento
6 Data Nascimento 13 Forma Pagamento
```

Abas auxiliares: `Config_Sistema`, `Config_Admin`, `Config_Vagas`,
`Resultado_Final`.
