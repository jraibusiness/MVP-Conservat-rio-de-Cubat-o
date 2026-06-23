# Notas técnicas — skills e o runtime do projeto

Este projeto é um **Google Apps Script (HtmlService)**, não um app React/Next/Vite.
Isso muda como as skills sugeridas se aplicam. Abaixo, o mapeamento honesto do
que cabe, do que não cabe, e do que foi feito.

## Por que a maioria das libs não se aplica "literalmente"

O `gas/` roda no servidor do Google Apps Script. As páginas são HTMLs
templated (`<?!= include('...') ?>`) com `<style>` e `<script>` inline, num
sandbox iframe. Não há `npm`, não há bundler, não há React no client.

| Skill | Aplica? | Por quê / o que foi feito |
|---|---|---|
| **shadcn-ui** | Não (literal) | shadcn são componentes **React** (Radix + Tailwind). Não há React aqui. Aplicamos o **princípio** shadcn: design tokens em `:root` (`--azul`, `--verde`, `--radius`, `--sombra`, `--easing`), componentes acessíveis (FAQ com `aria-expanded`/`aria-controls`, botões com `aria-label`), consistência visual. |
| **tailwindcss** | Não (literal) | O Play CDN (`cdn.tailwindcss.com`) é explícito "não usar em produção" e adicionaria um runtime pesado em cima de um CSS já maduro. O projeto já tem um sistema de tokens bem feito. Mantivemos e estendemos esse sistema (mesma filosofia do Tailwind: tokens + utilidades). Migração futura é possível só numa reescrita do front. |
| **xstate** | Parcial / opcional | xstate é JS puro (cabe via CDN). O wizard de `Index.html` é uma máquina de estados implícita (`intro → steps[] → revisao → termo → sucesso`, com `responsavel` condicional e "editar" que volta). Funciona e está em produção. Reescrevê-lo com xstate seria arriscado agora. Deixei o modelo documentado abaixo como base para uma futura refatoração segura. |
| **vercel/ai** | Não (literal) | O AI SDK é server-side Node. No GAS, o equivalente é chamar a API do modelo direto via `UrlFetchApp` — que é exatamente o que `responderChatbot` faz (Gemini). Adicionamos fallback local para não depender da chave. |

## Modelo do wizard como máquina de estados (base para xstate futuro)

```
intro
  └─ (ciente) ─> steps[0] (nome)
                   └─ next ─> sobrenome ─> nasc
                       │  (idade < 18? sim) ─> responsavel
                       │  (não) ─> pula responsavel
                       └─ email ─> cpf ─> telefone ─> cep ─> numero
                          ─> complemento ─> escolaridade ─> curso
                          ─> instrumento ─> periodo ─> pagamento
                          ─> revisao ─> termo ─> finalizar() ─> sucesso

editar(step): marca retornoRevisao=true, vai ao step; ao avançar, volta à revisao.
```

Estados relevantes do fluxo paralelo: `emInscricao`, `finalizado`,
`retornoRevisao`, `idadeCandidato` (afeta visibilidade do step `responsavel` e a
regra de turno). Num refactor com xstate, estes virariam contexto/guards.

## Decisões de manutenção

- **Não mexer no Asaas nem no ranking** — estão em produção e funcionando.
- **Chatbot**: manteve-se o Gemini como camada principal e adicionou-se fallback
  local. Assim o bot nunca fica mudo, e ativar a IA é só definir
  `GEMINI_API_KEY`.
- **Tradução**: widget do Google Translate + seletor customizado é o único modo
  viável de traduzir *todas* as páginas (Home/Index/Consulta/Admin) sem
  duplicar cada string em 3 idiomas num projeto GAS.
