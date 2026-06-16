// =====================================================================
//  CONSERVATÓRIO MUNICIPAL DE CUBATÃO — Processo Seletivo 2027
//  Backend consolidado (substitui Code/Ranking/Emails/Asaas + SetupSpreadsheet)
//
//  ESQUEMA ÚNICO da aba 'Inscricoes' (índices 0-based):
//   0 Data/Hora            7  Endereço          14 Asaas Customer ID
//   1 Nome                 8  Escolaridade      15 Asaas Cobrança ID
//   2 Sobrenome            9  Curso             16 Link de Pagamento
//   3 E-mail              10  Período           17 Status do Pagamento
//   4 CPF                 11  Tipo Inscrição    18 Instrumento
//   5 Telefone            12  Comprovante       19 Data Pagamento
//   6 Data Nascimento     13  Forma Pagamento
// =====================================================================

const NOME_ABA_INSCRICOES = 'Inscricoes';
const ASAAS_API_KEY = PropertiesService.getScriptProperties().getProperty('ASAAS_API_KEY');
const ASAAS_API_URL = 'https://api.asaas.com/v3';
const GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');

// =====================================================================
//  SEGURANÇA DO WEBHOOK (ASAAS) — PASSO 1
//  Rode gerarTokenWebhook() uma vez no editor, guarde o token exibido no
//  Log e confirme com verificarToken(). Usado nos próximos passos para
//  validar o parâmetro ?token= do doPost.
// =====================================================================
function gerarTokenWebhook() {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('WEBHOOK_TOKEN', token);
  Logger.log('GUARDE este token: ' + token);
}

function verificarToken() {
  Logger.log(PropertiesService.getScriptProperties().getProperty('WEBHOOK_TOKEN'));
}

// ---------- Índices canônicos (evita números mágicos) ----------
const COL = {
  DATA: 0, NOME: 1, SOBRENOME: 2, EMAIL: 3, CPF: 4, TEL: 5, NASC: 6, ENDERECO: 7,
  ESCOLARIDADE: 8, CURSO: 9, PERIODO: 10, TIPO: 11, COMPROVANTE: 12, FORMA_PGTO: 13,
  ASAAS_CUSTOMER: 14, ASAAS_COBRANCA: 15, LINK_PGTO: 16, STATUS: 17, INSTRUMENTO: 18, DATA_PGTO: 19
};

// =====================================================================
//  SETUP / ABAS DE CONFIGURAÇÃO
// =====================================================================
function configurarPlanilha() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  let aba = planilha.getSheetByName(NOME_ABA_INSCRICOES);
  if (!aba) {
    aba = planilha.insertSheet(NOME_ABA_INSCRICOES);
    const cabecalhos = [
      'Data/Hora', 'Nome', 'Sobrenome', 'E-mail', 'CPF', 'Telefone', 'Data Nascimento',
      'Endereço', 'Escolaridade', 'Curso', 'Período', 'Tipo Inscrição', 'Comprovante Isenção',
      'Forma de Pagamento', 'Asaas Customer ID', 'Asaas Cobrança ID', 'Link de Pagamento',
      'Status do Pagamento', 'Instrumento', 'Data Pagamento'
    ];
    aba.appendRow(cabecalhos);
    aba.getRange(1, 1, 1, cabecalhos.length).setFontWeight('bold').setBackground('#d9ead3');
    aba.setFrozenRows(1);
  }
}

// =====================================================================
//  CORREÇÃO ÚNICA — alinhar abas antigas da Inscricoes ao esquema atual
//  (insere a coluna "Comprovante Isenção" na posição 13, adiciona
//  "Data Pagamento" no final e corrige os cabeçalhos). Rode uma vez e
//  confira manualmente o resultado antes de usar o sistema normalmente.
// =====================================================================
function corrigirEstruturaInscricoes() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const aba = planilha.getSheetByName(NOME_ABA_INSCRICOES);
  const cabecalhosCorretos = [
    'Data/Hora', 'Nome', 'Sobrenome', 'E-mail', 'CPF', 'Telefone', 'Data Nascimento',
    'Endereço', 'Escolaridade', 'Curso', 'Período', 'Tipo Inscrição', 'Comprovante Isenção',
    'Forma de Pagamento', 'Asaas Customer ID', 'Asaas Cobrança ID', 'Link de Pagamento',
    'Status do Pagamento', 'Instrumento', 'Data Pagamento'
  ];

  const numColunasAtual = aba.getLastColumn();
  if (numColunasAtual < 20) {
    // Insere a coluna que falta (Comprovante Isenção) na posição 13
    aba.insertColumnBefore(13);
    // Garante 20 colunas (adiciona "Data Pagamento" no final, se necessário)
    if (aba.getLastColumn() < 20) {
      aba.insertColumnAfter(aba.getLastColumn());
    }
  }

  aba.getRange(1, 1, 1, cabecalhosCorretos.length).setValues([cabecalhosCorretos])
    .setFontWeight('bold').setBackground('#d9ead3');

  Logger.log('Estrutura da aba Inscricoes corrigida. Total de colunas: ' + aba.getLastColumn());
}

function inicializarConfigSistema() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  let aba = planilha.getSheetByName('Config_Sistema');
  if (!aba) {
    aba = planilha.insertSheet('Config_Sistema');
    aba.appendRow(['Chave', 'Valor']);
    aba.appendRow(['Status_Manual', 'ABERTO']);
    aba.appendRow(['Data_Encerramento', '']);
    aba.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#d9ead3');
  }
  return aba;
}

function inicializarConfigAdmin() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  let aba = planilha.getSheetByName('Config_Admin');
  if (!aba) {
    aba = planilha.insertSheet('Config_Admin');
    aba.appendRow(['E-mail', 'Nível']);                         // Nível: DIRETOR | PROFESSOR
    aba.appendRow(['jr.conductor83@gmail.com', 'DIRETOR']);
    aba.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#d9ead3');
  }
  return aba;
}

function obterLimitesVagas() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  let abaConfig = planilha.getSheetByName('Config_Vagas');
  if (!abaConfig) {
    abaConfig = planilha.insertSheet('Config_Vagas');
    abaConfig.appendRow(['Instrumento', 'Limite de Vagas']);
    [['Violão', 10], ['Piano', 5], ['Violino', 5], ['Canto Lírico', 8], ['Sopro', 12]]
      .forEach(r => abaConfig.appendRow(r));
    abaConfig.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#d9ead3');
    abaConfig.autoResizeColumns(1, 2);
  }
  const dados = abaConfig.getDataRange().getValues();
  const limites = {};
  for (let i = 1; i < dados.length; i++) {
    if (dados[i][0]) limites[dados[i][0].toString().trim()] = Number(dados[i][1]) || 0;
  }
  return limites;
}

function setConfigValue(aba, chave, valor) {
  const dados = aba.getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) {
    if (dados[i][0] === chave) { aba.getRange(i + 1, 2).setValue(valor); return; }
  }
  aba.appendRow([chave, valor]);
}

// =====================================================================
//  ROTEAMENTO WEB
// =====================================================================
function verificarDisponibilidadeFormulario() {
  const aba = inicializarConfigSistema();
  const sysData = aba.getDataRange().getValues();
  let statusManual = 'ABERTO', dataEncerramento = '';
  for (let i = 1; i < sysData.length; i++) {
    if (sysData[i][0] === 'Status_Manual') statusManual = sysData[i][1];
    if (sysData[i][0] === 'Data_Encerramento') dataEncerramento = sysData[i][1];
  }
  if (statusManual === 'FECHADO') return false;
  if (dataEncerramento && new Date() > new Date(dataEncerramento)) return false;
  return true;
}

function include(nomeArquivo) {
  return HtmlService.createHtmlOutputFromFile(nomeArquivo).getContent();
}

function doGet(e) {
  const view = e.parameter.view;
  const urlApp = ScriptApp.getService().getUrl();

  if (view === 'admin') {
    return HtmlService.createTemplateFromFile('Admin').evaluate()
      .setTitle('Painel Administrativo - Conservatório de Cubatão')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  if (view === 'consulta') {
    return HtmlService.createTemplateFromFile('Consulta').evaluate()
      .setTitle('Consultar Inscrição - Conservatório de Cubatão')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  if (view === 'inscricao') {
    if (!verificarDisponibilidadeFormulario()) {
      return HtmlService.createHtmlOutput(`
        <div style="font-family:Arial,sans-serif;text-align:center;padding:50px;background:#f9f9f9;height:100vh;box-sizing:border-box;">
          <div style="background:#fff;padding:40px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.1);max-width:500px;margin:0 auto;">
            <h1 style="color:#E2231A;margin-top:0;">Inscrições Encerradas</h1>
            <p style="color:#555;line-height:1.6;">O período de inscrições para a seletiva do Conservatório Municipal de Cubatão encontra-se encerrado no momento.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:25px 0;">
            <p style="color:#888;font-size:14px;">Para mais informações, entre em contato com a secretaria.</p>
            <div style="margin-top:30px;font-size:13px;">
              <a href="${urlApp}" style="color:#1D8ECE;text-decoration:none;font-weight:bold;">⬅ Voltar à tela inicial</a>
            </div>
          </div>
        </div>`).setTitle('Inscrições Encerradas')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }
    return HtmlService.createTemplateFromFile('Index').evaluate()
      .setTitle('Inscrição - Processo Seletivo')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  // Tela inicial (hub de navegação)
  return HtmlService.createTemplateFromFile('Home').evaluate()
    .setTitle('Conservatório Municipal de Cubatão')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// =====================================================================
//  WEBHOOK ASAAS  (corrigido: match em col 16 / status col 18 / data pgto col 20)
// =====================================================================
// Reconsulta o status oficial de uma cobrança direto na API do Asaas
// (fonte da verdade — nunca confiar no payload recebido no webhook).
function consultarStatusPagamentoAsaas(cobrancaId) {
  const resp = UrlFetchApp.fetch(`${ASAAS_API_URL}/payments/${cobrancaId}`, {
    method: 'get',
    headers: { 'access_token': ASAAS_API_KEY },
    muteHttpExceptions: true
  });
  const json = JSON.parse(resp.getContentText());
  return json && json.status ? json.status : null;
}

function doPost(e) {
  try {
    const tokenEsperado = PropertiesService.getScriptProperties().getProperty('WEBHOOK_TOKEN');
    if (!tokenEsperado || e.parameter.token !== tokenEsperado) {
      return respostaJSON({ sucesso: false, message: 'Não autorizado.' });
    }

    const postData = JSON.parse(e.postData.contents);
    const cobrancaId = postData.payment ? postData.payment.id : null;
    if (!cobrancaId) return respostaJSON({ sucesso: true, ignorado: true });

    // Não confiamos no payload do POST (pode ser forjado): reconsultamos o
    // status real da cobrança direto na API do Asaas, autenticado com nossa chave.
    const statusReal = consultarStatusPagamentoAsaas(cobrancaId);
    if (!statusReal) return respostaJSON({ sucesso: true, ignorado: true });

    const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_INSCRICOES);
    const dados = aba.getDataRange().getValues();

    for (let i = 1; i < dados.length; i++) {
      if (dados[i][COL.ASAAS_COBRANCA] !== cobrancaId) continue;

      if (statusReal === 'CONFIRMED' || statusReal === 'RECEIVED' || statusReal === 'RECEIVED_IN_CASH') {
        aba.getRange(i + 1, COL.STATUS + 1).setValue('PAGO');
        aba.getRange(i + 1, COL.DATA_PGTO + 1).setValue(new Date());

        const ranking = calcularRanking();
        const cpf = String(dados[i][COL.CPF]).replace(/\D/g, '');
        const resultado = ranking[cpf] || { status: 'LISTA DE ESPERA', posicao: '-' };

        enviarConfirmacaoPagamento({
          nomeCompleto: dados[i][COL.NOME] + ' ' + dados[i][COL.SOBRENOME],
          email: dados[i][COL.EMAIL],
          instrumento: dados[i][COL.INSTRUMENTO],
          statusVaga: resultado.status,
          posicao: resultado.posicao
        });
      }

      if (statusReal === 'OVERDUE' || statusReal === 'DELETED' || statusReal === 'REFUNDED') {
        aba.getRange(i + 1, COL.STATUS + 1).setValue('EXPIRADO');
        calcularRanking();
      }
      break;
    }
    return respostaJSON({ sucesso: true });
  } catch (erro) {
    return respostaJSON({ sucesso: false, erro: erro.toString() });
  }
}

function respostaJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// =====================================================================
//  PERSISTÊNCIA DE INSCRIÇÃO
// =====================================================================
function salvarNaPlanilha(d) {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  let aba = planilha.getSheetByName(NOME_ABA_INSCRICOES);
  if (!aba) { configurarPlanilha(); aba = planilha.getSheetByName(NOME_ABA_INSCRICOES); }

  let linkComprovante = '';
  let statusInicial = 'PENDENTE';
  if (d.tipoInscricao === 'ISENÇÃO' && d.arquivoBase64) {
    linkComprovante = salvarComprovanteNoDrive(d.arquivoBase64, d.arquivoNome, d.cpf);
    statusInicial = 'PAGO';
  }

  const novaLinha = [
    new Date(), d.nome, d.sobrenome, d.email, d.cpf.replace(/\D/g, ''), d.telefone,
    d.dataNascimento, d.endereco, d.escolaridade, d.curso, d.periodo, d.tipoInscricao,
    linkComprovante, d.tipoInscricao === 'ISENÇÃO' ? 'ISENTO' : d.formaPagamento,
    '', '', '', statusInicial, d.instrumento,
    d.tipoInscricao === 'ISENÇÃO' ? new Date() : ''
  ];
  aba.appendRow(novaLinha);
  const linha = aba.getLastRow();
  if (d.responsavel) {
    const nota = 'RESPONSÁVEL LEGAL: ' + d.responsavel.nome + ' ' + d.responsavel.sobrenome
      + ' | RG: ' + d.responsavel.rg + ' | CPF: ' + d.responsavel.cpf
      + ' | Nasc.: ' + d.responsavel.nascimento;
    aba.getRange(linha, 1).setNote(nota);
  }
  return { linha: linha, dados: novaLinha };
}

function salvarComprovanteNoDrive(base64Data, nomeArquivo, cpfCandidato) {
  try {
    const pasta = DriveApp.getFoldersByName('Comprovantes_Isencao_Cubatao');
    const dest = pasta.hasNext() ? pasta.next() : DriveApp.createFolder('Comprovantes_Isencao_Cubatao');
    const partes = base64Data.split(',');
    const blob = Utilities.newBlob(Utilities.base64Decode(partes[1]), 'application/pdf', 'Comprovante_' + cpfCandidato + '_' + nomeArquivo);
    return dest.createFile(blob).getUrl();
  } catch (e) { return 'Erro no upload: ' + e.message; }
}

function atualizarLinhaComPagamento(linha, customerId, cobrancaId, linkPagamento) {
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_INSCRICOES);
  aba.getRange(linha, COL.ASAAS_CUSTOMER + 1).setValue(customerId);
  aba.getRange(linha, COL.ASAAS_COBRANCA + 1).setValue(cobrancaId);
  aba.getRange(linha, COL.LINK_PGTO + 1).setValue(linkPagamento);
}

function verificarInscricaoDuplicada(cpf, instrumento) {
  const cpfLimpo = String(cpf).replace(/\D/g, '');
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_INSCRICOES);
  if (!aba) return { duplicado: false };
  const dados = aba.getDataRange().getValues();
  const statusAtivos = ['PENDENTE', 'PAGO'];
  for (let i = 1; i < dados.length; i++) {
    const cpfLinha = String(dados[i][COL.CPF]).replace(/\D/g, '');
    if (cpfLinha === cpfLimpo && dados[i][COL.INSTRUMENTO] === instrumento && statusAtivos.includes(dados[i][COL.STATUS])) {
      return {
        duplicado: true,
        mensagem: `Já localizamos uma inscrição ${dados[i][COL.STATUS] === 'PAGO' ? 'confirmada' : 'pendente'} para "${instrumento}" atrelada a este CPF.`
      };
    }
  }
  return { duplicado: false, mensagem: '' };
}

function calcularIdade(dataNascString) {
  const hoje = new Date(), nasc = new Date(dataNascString);
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

// =====================================================================
//  INTEGRAÇÃO ASAAS
// =====================================================================
function criarClienteAsaas(nome, email, cpf, telefone) {
  const response = UrlFetchApp.fetch(`${ASAAS_API_URL}/customers`, {
    method: 'post', contentType: 'application/json', headers: { access_token: ASAAS_API_KEY },
    payload: JSON.stringify({ name: nome, email, cpfCnpj: String(cpf).replace(/\D/g, ''), mobilePhone: telefone }),
    muteHttpExceptions: true
  });
  const json = JSON.parse(response.getContentText());
  if (![200, 201].includes(response.getResponseCode()))
    throw new Error(json.errors ? json.errors[0].description : 'Erro ao criar cliente no Asaas');
  return json.id;
}

function criarCobrancaAsaas(customerId, formaPagamento) {
  const vencimento = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const response = UrlFetchApp.fetch(`${ASAAS_API_URL}/payments`, {
    method: 'post', contentType: 'application/json', headers: { access_token: ASAAS_API_KEY },
    payload: JSON.stringify({
      customer: customerId, billingType: formaPagamento, value: 20.00, dueDate: vencimento,
      description: 'Taxa de Inscrição - Seletiva do Conservatório de Cubatão'
    }),
    muteHttpExceptions: true
  });
  const json = JSON.parse(response.getContentText());
  if (![200, 201].includes(response.getResponseCode()))
    throw new Error(json.errors ? json.errors[0].description : 'Erro ao gerar cobrança no Asaas');
  return { cobrancaId: json.id, invoiceUrl: json.invoiceUrl };
}

// =====================================================================
//  MOTOR CENTRAL
// =====================================================================
function processarInscricao(formData) {
  try {
    const checagem = verificarInscricaoDuplicada(formData.cpf, formData.instrumento);
    if (checagem.duplicado) return { sucesso: false, erro: checagem.mensagem };

    const idade = calcularIdade(formData.dataNascimento);
    if (formData.instrumento === 'Piano' && idade < 7)
      return { sucesso: false, erro: 'A idade mínima para o curso de Piano é de 7 anos.' };
    if (['Violão', 'Cello', 'Contrabaixo Acústico', 'Contrabaixo'].includes(formData.instrumento) && idade < 12)
      return { sucesso: false, erro: `A idade mínima para o instrumento ${formData.instrumento} é de 12 anos.` };
    if (formData.curso === 'Técnico') {
      if (idade < 14) return { sucesso: false, erro: 'A idade mínima para o Curso Técnico é de 14 anos.' };
      if (!['Ensino Médio', 'Ensino Superior'].includes(formData.escolaridade))
        return { sucesso: false, erro: 'O Curso Técnico exige estar cursando ou ter concluído o Ensino Médio.' };
    }
    if (idade >= 18 && formData.periodo === 'Manhã')
      return { sucesso: false, erro: 'O período da manhã é exclusivo para crianças. Candidatos adultos devem selecionar Tarde ou Noite.' };

    const registro = salvarNaPlanilha(formData);

    if (formData.tipoInscricao === 'ISENÇÃO') {
      calcularRanking();
      return { sucesso: true, isento: true };
    }

    const customerId = criarClienteAsaas(formData.nome + ' ' + formData.sobrenome, formData.email, formData.cpf, formData.telefone);
    const cobranca = criarCobrancaAsaas(customerId, formData.formaPagamento);
    atualizarLinhaComPagamento(registro.linha, customerId, cobranca.cobrancaId, cobranca.invoiceUrl);

    enviarConfirmacaoInscricao({ nome: formData.nome, instrumento: formData.instrumento, email: formData.email, pagamentoUrl: cobranca.invoiceUrl });
    return { sucesso: true, pagamentoUrl: cobranca.invoiceUrl, isento: false };
  } catch (erro) {
    return { sucesso: false, erro: 'Falha na comunicação de processos: ' + erro.message };
  }
}

// =====================================================================
//  RANKING / VAGAS  (corrigido p/ status col 17 / instrumento col 18 / data pgto col 19)
// =====================================================================
function calcularRanking() {
  const LIMITES = obterLimitesVagas();
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const abaInsc = planilha.getSheetByName(NOME_ABA_INSCRICOES);

  let abaRes = planilha.getSheetByName('Resultado_Final') || planilha.insertSheet('Resultado_Final');
  abaRes.clear();
  abaRes.appendRow(['Posição Geral', 'Posição no Curso', 'Nome Completo', 'CPF', 'E-mail', 'Instrumento', 'Status da Vaga', 'Data Confirmação']);
  abaRes.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#b4a7d6');

  const mapa = {};
  if (!abaInsc) return mapa;
  const dados = abaInsc.getDataRange().getValues();
  if (dados.length <= 1) return mapa;

  const pagos = [];
  for (let i = 1; i < dados.length; i++) {
    if (dados[i][COL.STATUS] === 'PAGO') {
      pagos.push({
        cpf: String(dados[i][COL.CPF]).replace(/\D/g, ''),
        nomeCompleto: dados[i][COL.NOME] + ' ' + dados[i][COL.SOBRENOME],
        email: dados[i][COL.EMAIL],
        instrumento: dados[i][COL.INSTRUMENTO] ? dados[i][COL.INSTRUMENTO].toString().trim() : 'Não Informado',
        dataPagamento: dados[i][COL.DATA_PGTO] ? new Date(dados[i][COL.DATA_PGTO]) : new Date(dados[i][COL.DATA])
      });
    }
  }
  pagos.sort((a, b) => a.dataPagamento - b.dataPagamento);

  const vagasPorCurso = {}, espera = {};
  pagos.forEach((c, index) => {
    const inst = c.instrumento;
    const limite = LIMITES[inst] !== undefined ? LIMITES[inst] : 999;
    let statusVaga, posicaoCurso;
    if ((vagasPorCurso[inst] || 0) < limite) {
      vagasPorCurso[inst] = (vagasPorCurso[inst] || 0) + 1;
      posicaoCurso = vagasPorCurso[inst]; statusVaga = 'APROVADO';
    } else {
      espera[inst] = (espera[inst] || 0) + 1;
      posicaoCurso = espera[inst]; statusVaga = 'LISTA DE ESPERA';
    }
    abaRes.appendRow([
      index + 1, statusVaga === 'APROVADO' ? posicaoCurso : `Espera (${posicaoCurso})`,
      c.nomeCompleto, c.cpf, c.email, inst, statusVaga,
      Utilities.formatDate(c.dataPagamento, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss')
    ]);
    mapa[c.cpf] = { status: statusVaga, posicao: posicaoCurso };
  });

  abaRes.setFrozenRows(1);
  abaRes.autoResizeColumns(1, 8);
  return mapa;
}

function obterVagasFormulario() {
  const LIMITES = obterLimitesVagas();
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_INSCRICOES);
  const ocupadas = {};
  Object.keys(LIMITES).forEach(inst => ocupadas[inst] = 0);

  if (aba) {
    const dados = aba.getDataRange().getValues();
    for (let i = 1; i < dados.length; i++) {
      const inst = dados[i][COL.INSTRUMENTO] ? dados[i][COL.INSTRUMENTO].toString().trim() : '';
      if (dados[i][COL.STATUS] === 'PAGO' && ocupadas.hasOwnProperty(inst)) ocupadas[inst]++;
    }
  }
  return Object.keys(LIMITES).map(inst => ({
    instrumento: inst,
    vagasRestantes: Math.max(0, LIMITES[inst] - ocupadas[inst])
  }));
}

// =====================================================================
//  CONSULTA PÚBLICA  (corrigido instrumento col 18 / status col 17)
// =====================================================================
function consultarPosicaoPorCpf(cpfDigitado) {
  const cpfLimpo = String(cpfDigitado).replace(/\D/g, '');
  if (cpfLimpo.length !== 11) return { encontrado: false, message: 'CPF inválido. Digite os 11 números do CPF.' };

  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_INSCRICOES);
  const dados = aba.getDataRange().getValues();

  let resultados = [];
  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][COL.CPF]).replace(/\D/g, '') !== cpfLimpo) continue;
    const dataInsc = new Date(dados[i][COL.DATA]);
    const dataExp = new Date(dataInsc.getTime() + 3 * 60 * 60 * 1000);
    resultados.push({
      instrumento: dados[i][COL.INSTRUMENTO] || 'N/A',
      status: dados[i][COL.STATUS],
      dataInscricao: Utilities.formatDate(dataInsc, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'),
      dataExpiracao: Utilities.formatDate(dataExp, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')
    });
  }
  if (resultados.length === 0) return { encontrado: false, message: 'Nenhuma inscrição encontrada para este CPF.' };

  const abaRes = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Resultado_Final');
  const dadosRes = abaRes ? abaRes.getDataRange().getValues() : [];

  resultados = resultados.map(r => {
    if (r.status !== 'PAGO') return { ...r, posicao: null, statusVaga: traduzirStatus(r.status) };
    for (let j = 1; j < dadosRes.length; j++) {
      if (String(dadosRes[j][3]).replace(/\D/g, '') === cpfLimpo && dadosRes[j][5] === r.instrumento)
        return { ...r, posicao: dadosRes[j][1], statusVaga: dadosRes[j][6] };
    }
    return { ...r, posicao: null, statusVaga: 'Processando...' };
  });
  return { encontrado: true, resultados };
}

function traduzirStatus(status) {
  return { PENDENTE: 'Aguardando pagamento', EXPIRADO: 'Link expirado — faça uma nova inscrição', PAGO: 'Pago' }[status] || status;
}

function obterUrlQrConsulta() {
  const url = ScriptApp.getService().getUrl() + '?view=consulta';
  return { url, qr: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(url) };
}

// QR do formulário principal (usado no Admin)
function obterUrlQrInscricao() {
  const url = ScriptApp.getService().getUrl();
  return { url, qr: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(url) };
}

// =====================================================================
//  E-MAILS
// =====================================================================
const CORES = { azul: '#1D8ECE', vermelho: '#E2231A', verde: '#009E49', dourado: '#C9A227', amarelo: '#FFF200', cinza: '#C3C3C3', texto: '#1a1a1a' };

function montarEmailHTML(tituloDestaque, corDestaque, conteudoHtml) {
  return `
  <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #eee;">
    <div style="background:${CORES.azul};padding:24px 32px;">
      <h1 style="color:#fff;font-size:18px;margin:0;letter-spacing:1px;text-transform:uppercase;">Conservatório Municipal de Cubatão</h1>
    </div>
    <div style="border-top:4px solid ${corDestaque};padding:32px;">
      <h2 style="color:${corDestaque};font-size:20px;margin-top:0;">${tituloDestaque}</h2>
      <div style="color:${CORES.texto};font-size:15px;line-height:1.6;">${conteudoHtml}</div>
    </div>
    <div style="background:#f4f4f4;padding:16px 32px;font-size:12px;color:#888;">
      Processo Seletivo 2027 · Conservatório Municipal de Cubatão<br>Este é um e-mail automático, por favor não responda.
    </div>
  </div>`;
}

function enviarConfirmacaoInscricao(dados) {
  const conteudo = `
    <p>Olá, <strong>${dados.nome}</strong>!</p>
    <p>Sua ficha de inscrição para o curso de <strong>${dados.instrumento}</strong> foi recebida com sucesso.</p>
    <div style="background:#FFF4E5;border:1px solid ${CORES.dourado};border-radius:6px;padding:16px;margin:20px 0;">
      <p style="margin:0;font-size:15px;">⏰ <strong>ATENÇÃO: prazo de 3 horas!</strong><br>
      Para garantir sua vaga, o pagamento da taxa de <strong>R$&nbsp;20,00</strong> deve ser realizado em até <strong>3 horas</strong>.
      Após esse prazo, o link expira automaticamente e sua inscrição não terá validade.</p>
    </div>
    <p style="text-align:center;margin:28px 0;">
      <a href="${dados.pagamentoUrl}" style="background:${CORES.vermelho};color:#fff;text-decoration:none;padding:14px 32px;border-radius:4px;font-weight:bold;font-size:15px;display:inline-block;">Pagar Taxa de Inscrição Agora</a>
    </p>
    <p style="font-size:13px;color:#666;">As vagas são preenchidas estritamente por <strong>ordem de confirmação do pagamento</strong>. Quanto antes pagar, melhor sua posição!</p>`;
  MailApp.sendEmail({
    to: dados.email,
    subject: '⏳ Atenção! Sua inscrição expira em 3 horas - Conservatório de Cubatão',
    htmlBody: montarEmailHTML('Inscrição Recebida', CORES.dourado, conteudo)
  });
}

function enviarConfirmacaoPagamento(dados) {
  const aprovado = dados.statusVaga === 'APROVADO';
  const conteudo = aprovado
    ? `<p>Olá, <strong>${dados.nomeCompleto}</strong>!</p>
       <p>Seu pagamento foi confirmado e sua vaga para <strong>${dados.instrumento}</strong> está <strong style="color:${CORES.azul}">GARANTIDA</strong>!</p>
       <div style="background:#E8F5E9;border:1px solid #4CAF50;border-radius:6px;padding:16px;margin:20px 0;">
         <p style="margin:0;">✅ Sua posição: <strong>${dados.posicao}º colocado(a)</strong> em ${dados.instrumento}.</p></div>
       <p>Em breve enviaremos informações sobre datas e locais da seletiva.</p>`
    : `<p>Olá, <strong>${dados.nomeCompleto}</strong>!</p>
       <p>Recebemos a confirmação do seu pagamento para <strong>${dados.instrumento}</strong>. Obrigado!</p>
       <div style="background:#FFF4E5;border:1px solid ${CORES.dourado};border-radius:6px;padding:16px;margin:20px 0;">
         <p style="margin:0;">📋 As vagas deste instrumento já foram preenchidas. Você está na <strong>Lista de Espera</strong>, posição <strong>${dados.posicao}</strong>.</p></div>
       <p>Se algum aprovado desistir, vagas serão remanejadas pela ordem da lista. Avisaremos por e-mail.</p>`;

  MailApp.sendEmail({
    to: dados.email,
    subject: aprovado ? '🎉 Vaga Garantida! Inscrição Confirmada - Conservatório de Cubatão' : '📋 Pagamento Confirmado - Lista de Espera',
    htmlBody: montarEmailHTML(aprovado ? 'Vaga Confirmada' : 'Lista de Espera', aprovado ? CORES.azul : CORES.dourado, conteudo)
  });
  MailApp.sendEmail({
    to: 'jr.conductor83@gmail.com',
    subject: `[NOVA INSCRIÇÃO PAGA - ${dados.statusVaga}] ${dados.instrumento}`,
    htmlBody: montarEmailHTML('Nova Inscrição Paga', CORES.azul,
      `<p><strong>${dados.nomeCompleto}</strong> (${dados.email}) confirmou pagamento para <strong>${dados.instrumento}</strong>.</p>
       <p>Status: <strong>${dados.statusVaga}</strong> — Posição: <strong>${dados.posicao}</strong></p>`)
  });
}

function enviarLembretePagamento() {
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_INSCRICOES);
  const dados = aba.getDataRange().getValues();
  const agora = new Date();
  for (let i = 1; i < dados.length; i++) {
    const diff = (agora - new Date(dados[i][COL.DATA])) / 36e5;
    if (dados[i][COL.STATUS] === 'PENDENTE' && diff >= 24 && diff < 48) {
      MailApp.sendEmail({
        to: dados[i][COL.EMAIL],
        subject: 'Sua inscrição expirou - Conservatório de Cubatão',
        htmlBody: montarEmailHTML('Inscrição Expirada', CORES.vermelho,
          `<p>Olá, <strong>${dados[i][COL.NOME]}</strong>.</p>
           <p>Notamos que você iniciou sua inscrição, mas o link de pagamento expirou sem confirmação.</p>
           <p>Para garantir sua vaga, faça uma nova inscrição em nosso formulário.</p>`)
      });
    }
  }
}

function testeEnviarEmail() {
  MailApp.sendEmail('jr.conductor83@gmail.com', 'Teste de Permissão', 'Forçando a liberação do MailApp.');
}

// =====================================================================
//  ADMIN — autenticação 2FA + painel  (RECRIADO do SetupSpreadsheet apagado)
// =====================================================================
function obterNivelAdmin(email) {
  const aba = inicializarConfigAdmin();
  const dados = aba.getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][0]).toLowerCase().trim() === email) return dados[i][1] || 'PROFESSOR';
  }
  return null;
}

function solicitarAcessoAdmin(email) {
  try {
    const e = String(email).toLowerCase().trim();
    const nivel = obterNivelAdmin(e);
    if (!nivel) return { sucesso: false, message: 'E-mail não autorizado. Verifique a aba Config_Admin.' };

    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    CacheService.getScriptCache().put('OTP_' + e, codigo, 600); // 10 min

    MailApp.sendEmail({
      to: e,
      subject: 'Código de acesso administrativo - Conservatório de Cubatão',
      htmlBody: montarEmailHTML('Token de Acesso', CORES.azul,
        `<p>Seu código de acesso ao painel administrativo é:</p>
         <p style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;color:${CORES.azul};margin:24px 0;">${codigo}</p>
         <p style="font-size:13px;color:#666;">Válido por 10 minutos. Se você não solicitou, ignore este e-mail.</p>`)
    });
    return { sucesso: true };
  } catch (err) {
    return { sucesso: false, message: 'Erro ao enviar o token: ' + err.message };
  }
}

function validarCodigoAdmin(email, codigo) {
  const e = String(email).toLowerCase().trim();
  const salvo = CacheService.getScriptCache().get('OTP_' + e);
  if (!salvo) return { sucesso: false, message: 'Código expirado ou inexistente. Solicite um novo.' };
  if (String(codigo).trim() !== salvo) return { sucesso: false, message: 'Código incorreto.' };
  CacheService.getScriptCache().remove('OTP_' + e);
  return { sucesso: true, nivel: obterNivelAdmin(e) };
}

function obterDadosPainelCompleto() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();

  const abaVagas = planilha.getSheetByName('Config_Vagas');
  const dadosVagas = abaVagas ? abaVagas.getDataRange().getValues() : [];
  const vagas = [];
  let totalCapacidade = 0;
  const detalheInstrumentos = {};
  for (let i = 1; i < dadosVagas.length; i++) {
    if (dadosVagas[i][0]) {
      const nome = dadosVagas[i][0].toString().trim();
      const qtd = Number(dadosVagas[i][1]) || 0;
      vagas.push({ instrumento: nome, vagas: qtd });
      totalCapacidade += qtd;
      detalheInstrumentos[nome] = { total: 0, pagos: 0, pendentes: 0, limite: qtd };
    }
  }

  const abaSys = inicializarConfigSistema();
  const sysData = abaSys.getDataRange().getValues();
  let statusManual = 'ABERTO', dataEncerramento = '';
  for (let i = 1; i < sysData.length; i++) {
    if (sysData[i][0] === 'Status_Manual') statusManual = sysData[i][1];
    if (sysData[i][0] === 'Data_Encerramento') dataEncerramento = sysData[i][1];
  }

  const abaInsc = planilha.getSheetByName(NOME_ABA_INSCRICOES);
  const dadosInsc = abaInsc ? abaInsc.getDataRange().getValues() : [];
  let totalGeral = 0, confirmados = 0, pendentes = 0;
  for (let i = 1; i < dadosInsc.length; i++) {
    if (!dadosInsc[i][COL.DATA]) continue;
    totalGeral++;
    const status = dadosInsc[i][COL.STATUS];
    const inst = dadosInsc[i][COL.INSTRUMENTO] ? dadosInsc[i][COL.INSTRUMENTO].toString().trim() : '';
    if (status === 'PAGO') confirmados++;
    else if (status === 'PENDENTE') pendentes++;
    if (inst) {
      if (!detalheInstrumentos[inst]) detalheInstrumentos[inst] = { total: 0, pagos: 0, pendentes: 0, limite: 0 };
      detalheInstrumentos[inst].total++;
      if (status === 'PAGO') detalheInstrumentos[inst].pagos++;
      if (status === 'PENDENTE') detalheInstrumentos[inst].pendentes++;
    }
  }

  return {
    vagas, statusManual, dataEncerramento, detalheInstrumentos,
    dashboard: { totalInscricoes: totalGeral, pagos: confirmados, aguardando: pendentes, capacidadeTotal: totalCapacidade }
  };
}

function adminConsultarCandidato(termoBusca) {
  const termo = String(termoBusca).toLowerCase().trim();
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_INSCRICOES);
  if (!aba) return [];
  const dados = aba.getDataRange().getValues();
  const termoCpf = termo.replace(/\D/g, '');
  const resultados = [];
  for (let i = 1; i < dados.length; i++) {
    const nome = String(dados[i][COL.NOME] + ' ' + dados[i][COL.SOBRENOME]).toLowerCase();
    const email = String(dados[i][COL.EMAIL]).toLowerCase();
    const cpf = String(dados[i][COL.CPF]).replace(/\D/g, '');
    if (nome.includes(termo) || email.includes(termo) || (termoCpf && cpf.includes(termoCpf))) {
      resultados.push({
        nome: dados[i][COL.NOME] + ' ' + dados[i][COL.SOBRENOME],
        cpf: dados[i][COL.CPF], email: dados[i][COL.EMAIL],
        instrumento: dados[i][COL.INSTRUMENTO] || 'N/A',
        status: dados[i][COL.STATUS],
        data: Utilities.formatDate(new Date(dados[i][COL.DATA]), Session.getScriptTimeZone(), 'dd/MM/yyyy')
      });
    }
  }
  return resultados;
}

function salvarDadosPainelCompleto(pacote) {
  try {
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    let abaV = planilha.getSheetByName('Config_Vagas') || planilha.insertSheet('Config_Vagas');
    abaV.clear();
    abaV.appendRow(['Instrumento', 'Limite de Vagas']);
    (pacote.vagas || []).forEach(v => { if (v.instrumento) abaV.appendRow([v.instrumento, Number(v.vagas) || 0]); });
    abaV.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#d9ead3');

    const abaS = inicializarConfigSistema();
    setConfigValue(abaS, 'Status_Manual', pacote.statusManual || 'ABERTO');
    setConfigValue(abaS, 'Data_Encerramento', pacote.dataEncerramento || '');

    calcularRanking(); // recalcula caso limites tenham mudado
    return { sucesso: true };
  } catch (e) {
    return { sucesso: false, message: e.message };
  }
}

/**
 * Gera um PDF executivo com ocupação por instrumento (tabela + gráfico de barras)
 * e salva no Google Drive. Retorna { url, nome } para abrir/baixar no Admin.html.
 */
function gerarRelatorioPDF() {
  const limites = obterLimitesVagas();
  calcularRanking(); // recalcula Resultado_Final antes de gerar o relatório

  const abaResultado = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Resultado_Final');
  const dados = abaResultado.getDataRange().getValues();

  // Agrega contagens por instrumento
  const stats = {}; // { instrumento: { aprovados, espera, limite } }
  Object.keys(limites).forEach(inst => {
    stats[inst] = { aprovados: 0, espera: 0, limite: limites[inst] };
  });

  // Coluna 5 = Instrumento, Coluna 6 = Status da Vaga (índices 0-based de Resultado_Final)
  for (let i = 1; i < dados.length; i++) {
    const inst = dados[i][5];
    const status = dados[i][6];
    if (!inst) continue;
    if (!stats[inst]) stats[inst] = { aprovados: 0, espera: 0, limite: limites[inst] || 0 };
    if (status === 'APROVADO') stats[inst].aprovados++;
    else stats[inst].espera++;
  }

  const dataGeracao = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
  const instrumentos = Object.keys(stats);

  // Monta linhas da tabela
  let linhas = '';
  instrumentos.forEach(inst => {
    const s = stats[inst];
    const ocupacao = s.limite > 0 ? Math.round((s.aprovados / s.limite) * 100) : 0;
    linhas += `<tr>
      <td>${inst}</td>
      <td style="text-align:center;">${s.aprovados}/${s.limite}</td>
      <td style="text-align:center;">${ocupacao}%</td>
      <td style="text-align:center;">${s.espera}</td>
    </tr>`;
  });

  const totalAprovados = instrumentos.reduce((a, inst) => a + stats[inst].aprovados, 0);
  const totalEspera = instrumentos.reduce((a, inst) => a + stats[inst].espera, 0);
  const totalVagas = instrumentos.reduce((a, inst) => a + stats[inst].limite, 0);

  // Monta URL do gráfico de barras (Google Charts - Image Charts)
  // Duas séries: Aprovados (azul) e Lista de Espera (dourado), por instrumento
  const chW = 600, chH = 300;
  const labels = instrumentos.map(i => encodeURIComponent(i)).join('|');
  const dataAprovados = instrumentos.map(i => stats[i].aprovados).join(',');
  const dataEspera = instrumentos.map(i => stats[i].espera).join(',');
  const maxVal = Math.max(1, ...instrumentos.map(i => stats[i].aprovados + stats[i].espera));

  const chartUrl = 'https://chart.googleapis.com/chart'
    + '?chs=' + chW + 'x' + chH
    + '&cht=bvg'
    + '&chd=t:' + dataAprovados + '|' + dataEspera
    + '&chds=0,' + maxVal + ',0,' + maxVal
    + '&chco=1A45AA,C9A227'
    + '&chbh=20,10,30'
    + '&chxt=x,y'
    + '&chxl=0:|' + labels
    + '&chdl=Aprovados|Lista+de+Espera'
    + '&chtt=Ocupação+por+Instrumento';

  const html = `
  <html><head><style>
    body { font-family: Arial, sans-serif; color:#1a1a1a; }
    h1 { color:#1A45AA; font-size:18px; border-bottom:3px solid #C9A227; padding-bottom:8px; }
    table { width:100%; border-collapse:collapse; margin-top:16px; font-size:12px; }
    th, td { border:1px solid #ddd; padding:8px; }
    th { background:#1A45AA; color:#fff; text-align:left; }
    .resumo { margin-top:20px; font-size:13px; }
    .resumo strong { color:#C41E3A; }
    .grafico { margin-top:24px; text-align:center; }
    .footer { margin-top:30px; font-size:10px; color:#888; }
  </style></head><body>
    <h1>Relatório Executivo — Processo Seletivo · Conservatório Municipal de Cubatão</h1>
    <p>Gerado em: ${dataGeracao}</p>
    <table>
      <tr><th>Instrumento</th><th>Vagas Ocupadas</th><th>% Ocupação</th><th>Lista de Espera</th></tr>
      ${linhas}
    </table>
    <div class="resumo">
      <p>Total de aprovados: <strong>${totalAprovados}</strong> / ${totalVagas} vagas</p>
      <p>Total em lista de espera: <strong>${totalEspera}</strong></p>
    </div>
    <div class="grafico">
      <img src="${chartUrl}" width="${chW}" height="${chH}">
    </div>
    <div class="footer">Documento gerado automaticamente pelo sistema de inscrição online.</div>
  </body></html>`;

  const blob = Utilities.newBlob(html, 'text/html', 'relatorio.html').getAs('application/pdf');
  const nomeArquivo = `Relatorio_Seletiva_${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmm")}.pdf`;
  blob.setName(nomeArquivo);

  const arquivo = DriveApp.createFile(blob);
  return { url: arquivo.getUrl(), nome: nomeArquivo };
}

// =====================================================================
//  CHATBOT — DÚVIDAS SOBRE O PROCESSO SELETIVO
// =====================================================================

// Base de conhecimento curada: edite aqui sempre que houver mudanças no edital,
// cronograma, cursos, contatos, etc.
const BASE_CONHECIMENTO_CHATBOT = `
INSTITUIÇÃO
- Nome oficial: Escola Técnica de Música e Dança (ETMD) "Ivanildo Rebouças da Silva", popularmente conhecida como Conservatório de Cubatão.
- Endereço da secretaria: Av. Nações Unidas, 168 – Vila Nova, Cubatão – SP.
- Horário de atendimento presencial: dias úteis, das 9h às 11h, das 14h às 17h e das 18h às 20h.
- Canais oficiais: site da Prefeitura de Cubatão (cubatao.sp.gov.br), Diário Oficial Eletrônico de Cubatão (diariooficial.cubatao.sp.gov.br) e Instagram @conservatoriodecubatao.

PROCESSO SELETIVO 2027
- O processo seletivo ocorre anualmente entre outubro e dezembro, seguindo o mesmo padrão dos anos anteriores.
- Histórico de referência: em 2025 as inscrições foram de 7 a 25/10/2024 com testes em dezembro/2024; em 2026 (Portaria nº 26/SEDUC) as inscrições foram de 29/10 a 7/11/2025, homologados em 14/11/2025, testes de 8 a 12/12/2025 e resultado final em 12/01/2026.
- Previsão para 2027: o edital/portaria específico deve ser publicado no Diário Oficial e no site da ETMD no final de setembro/início de outubro de 2026, com testes em dezembro/2026 e início das aulas em 2027. As datas exatas só são confirmadas com a publicação da portaria oficial — sempre oriente o candidato a confirmar no Diário Oficial, no site da ETMD ou diretamente com a secretaria.

CURSOS E FAIXAS ETÁRIAS
- Dança Iniciante: geralmente para crianças de 6 a 10 anos.
- Dança Avançada (pontas): adolescentes de 11 a 14 anos.
- Técnico em Dança (Clássica ou Contemporânea): exige estar matriculado ou ter concluído o Ensino Médio.
- Música (instrumentos, canto, canto coral e regência): há vagas de Atividades Complementares para iniciantes (alunos do Ensino Fundamental) e vagas do Curso Técnico Profissionalizante.
- Instrumentos oferecidos incluem (conforme configuração de vagas do ano): Violão, Piano, Violino, Canto Lírico, Sopro, entre outros divulgados no edital de cada ano.

CUSTOS E ISENÇÃO
- O ensino é 100% gratuito (instituição pública municipal).
- Há uma taxa de inscrição única de R$ 20,00, revertida para a Associação de Pais e Mestres (APM), usada na manutenção e afinação de instrumentos.
- Candidatos de baixa renda inscritos em programas sociais do Governo Federal (ex.: CadÚnico) podem solicitar isenção total dessa taxa no ato da inscrição.

CRITÉRIOS DE PRIORIDADE DE VAGA
1. Alunos matriculados na Rede Municipal de Ensino de Cubatão.
2. Moradores de Cubatão matriculados em escolas estaduais ou particulares.
3. Candidatos gerais de outras cidades (vagas remanescentes / cadastro de reserva).

TESTES DE SELEÇÃO
- Para crianças/iniciantes: testes práticos e de aptidão (ritmo, percepção musical, coordenação motora/flexibilidade para dança).
- Para cursos técnicos: prova escrita de teoria musical e prova prática (execução de peça musical ou sequência coreográfica diante de banca avaliadora).

COMO FUNCIONA ESTE SISTEMA ONLINE
- A inscrição é feita pelo próprio site (opção "Realizar Inscrição"), disponível apenas durante o período de inscrições aberto.
- Após preencher a ficha, pode ser gerada uma cobrança (PIX ou boleto) referente à taxa de R$ 20,00, com prazo de pagamento limitado (normalmente algumas horas). Se vencer sem pagamento, a vaga não é mais reservada e é necessário se inscrever novamente.
- O candidato pode consultar sua posição/situação a qualquer momento pela opção "Consultar Status", informando o CPF usado na inscrição.
- Em caso de dúvidas que não constam aqui, ou problemas técnicos no sistema, oriente o candidato a procurar a secretaria da ETMD pelos canais oficiais acima.
`;

/**
 * Responde perguntas do candidato sobre o processo seletivo usando a base de
 * conhecimento curada acima + a API do Gemini.
 * historico: array opcional de {autor:'usuario'|'bot', texto:string} das últimas mensagens.
 */
function responderChatbot(pergunta, historico) {
  if (!pergunta || !pergunta.trim()) {
    return { sucesso: false, message: 'Digite sua pergunta.' };
  }
  if (!GEMINI_API_KEY) {
    return { sucesso: false, message: 'Chatbot indisponível no momento. Entre em contato com a secretaria.' };
  }

  const instrucaoSistema = 'Você é o assistente virtual do Conservatório Municipal de Cubatão (ETMD "Ivanildo Rebouças da Silva"). '
    + 'Responda em português do Brasil, de forma breve, simpática e objetiva, tirando dúvidas de candidatos e familiares sobre o processo seletivo, cursos, prazos, valores e contatos. '
    + 'Use APENAS as informações fornecidas abaixo. Se a pergunta não puder ser respondida com essas informações, diga que não tem certeza e oriente o candidato a confirmar com a secretaria da ETMD ou nos canais oficiais (site da Prefeitura, Diário Oficial ou Instagram @conservatoriodecubatao). Nunca invente datas, valores ou regras.\n\n'
    + BASE_CONHECIMENTO_CHATBOT;

  const contents = [];
  (historico || []).slice(-6).forEach(function (m) {
    contents.push({ role: m.autor === 'bot' ? 'model' : 'user', parts: [{ text: m.texto }] });
  });
  contents.push({ role: 'user', parts: [{ text: pergunta }] });

  const payload = {
    systemInstruction: { parts: [{ text: instrucaoSistema }] },
    contents: contents,
    generationConfig: { temperature: 0.3, maxOutputTokens: 400 }
  };

  try {
    const resp = UrlFetchApp.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY,
      {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      }
    );
    const json = JSON.parse(resp.getContentText());
    if (json && json.error) {
      return { sucesso: false, message: 'Erro da API (' + resp.getResponseCode() + '): ' + json.error.message };
    }
    const texto = json && json.candidates && json.candidates[0]
      && json.candidates[0].content && json.candidates[0].content.parts
      && json.candidates[0].content.parts[0] && json.candidates[0].content.parts[0].text;
    if (!texto) {
      return { sucesso: false, message: 'Não consegui responder agora. Tente novamente em instantes.' };
    }
    return { sucesso: true, resposta: texto.trim() };
  } catch (err) {
    return { sucesso: false, message: 'Erro ao consultar o assistente: ' + err.message };
  }
}
