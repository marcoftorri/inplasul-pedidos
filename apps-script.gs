/**
 * Pedidos Inplasul — script da Planilha Google
 * Cole este código em: Planilha > Extensões > Apps Script
 *
 * IMPORTANTE: troque o código secreto abaixo por um seu
 * (o mesmo que você vai digitar no app, em Ajustes).
 */
const CODIGO_SECRETO = 'TROQUE-AQUI';

const ABA_PEDIDOS = 'Pedidos';
const ABA_ITENS = 'Itens';
const ABA_CLIENTES = 'Clientes';
const ABA_DADOS = 'Dados (não editar)';

const CAB_PEDIDOS = ['ID', 'Nº', 'Data', 'Cliente', 'CNPJ', 'Cidade/UF', 'Status', 'Total kg', 'Total R$', 'Pagamento', 'Frete', 'Entrega', 'Observações', 'Atualizado em', 'JSON (não editar)'];
const CAB_ITENS = ['ID pedido', 'Nº', 'Data', 'Cliente', 'Material', 'kg', 'R$/kg', 'Subtotal R$', 'Status'];
const CAB_CLIENTES = ['ID', 'Razão social', 'CNPJ', 'Endereço', 'Cidade', 'UF', 'Contato', 'Telefone', 'E-mail'];
const CAMPOS_CLI = ['id', 'nome', 'cnpj', 'endereco', 'cidade', 'uf', 'contato', 'telefone', 'email'];

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return resp({ ok: false, erro: 'requisição inválida' }); }
  if (req.token !== CODIGO_SECRETO) return resp({ ok: false, erro: 'Código secreto incorreto' });

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    prepararAbas(ss);
    if (req.acao === 'teste') return resp({ ok: true, planilha: ss.getName() });
    if (req.acao === 'salvar') {
      (req.pedidos || []).forEach(p => gravarPedido(ss, p));
      (req.excluir || []).forEach(id => apagarPedido(ss, id));
      if (req.clientes) gravarClientes(ss, req.clientes);
      if (req.dados) gravarDados(ss, req.dados);
      return resp({ ok: true });
    }
    if (req.acao === 'carregar') {
      return resp({ ok: true, pedidos: lerPedidos(ss), clientes: lerClientes(ss), dados: lerDados(ss) });
    }
    return resp({ ok: false, erro: 'ação desconhecida' });
  } catch (err) {
    return resp({ ok: false, erro: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return ContentService.createTextOutput('Pedidos Inplasul: script ativo ✓');
}

function resp(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function prepararAbas(ss) {
  [[ABA_PEDIDOS, CAB_PEDIDOS], [ABA_ITENS, CAB_ITENS], [ABA_CLIENTES, CAB_CLIENTES], [ABA_DADOS, ['Chave', 'Valor']]].forEach(([nome, cab]) => {
    let sh = ss.getSheetByName(nome);
    if (!sh) {
      sh = ss.insertSheet(nome);
      sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold').setBackground('#0b4f8a').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
  });
  const s1 = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1');
  if (s1 && s1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s1);
}

function dataBR(iso) { return iso ? iso.slice(0, 10).split('-').reverse().join('/') : ''; }

function linhaDoId(sh, id) {
  const n = sh.getLastRow();
  if (n < 2) return -1;
  const ids = sh.getRange(2, 1, n - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function apagarItens(ss, id) {
  const sh = ss.getSheetByName(ABA_ITENS);
  const n = sh.getLastRow();
  if (n < 2) return;
  const ids = sh.getRange(2, 1, n - 1, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === String(id)) sh.deleteRow(i + 2);
}

function gravarPedido(ss, p) {
  const sh = ss.getSheetByName(ABA_PEDIDOS);
  const c = p.cliente || {};
  const linha = [p.id, ('0000' + p.numero).slice(-4), dataBR(p.data), c.nome, c.cnpj || '', [c.cidade, c.uf].filter(String).join('/'), p.status,
    p.totalKg, p.total, p.pagamento || '', p.frete || '', p.entrega || '', p.obs || '', new Date(p.atualizadoEm || Date.now()), JSON.stringify(p)];
  const r = linhaDoId(sh, p.id);
  if (r > 0) sh.getRange(r, 1, 1, linha.length).setValues([linha]);
  else sh.appendRow(linha);

  apagarItens(ss, p.id);
  const it = ss.getSheetByName(ABA_ITENS);
  const linhas = (p.itens || []).map(i => [p.id, ('0000' + p.numero).slice(-4), dataBR(p.data), c.nome, i.nome, i.kg, i.preco, i.subtotal, p.status]);
  if (linhas.length) it.getRange(it.getLastRow() + 1, 1, linhas.length, linhas[0].length).setValues(linhas);
}

function apagarPedido(ss, id) {
  const sh = ss.getSheetByName(ABA_PEDIDOS);
  const r = linhaDoId(sh, id);
  if (r > 0) sh.deleteRow(r);
  apagarItens(ss, id);
}

function lerPedidos(ss) {
  const sh = ss.getSheetByName(ABA_PEDIDOS);
  const n = sh.getLastRow();
  if (n < 2) return [];
  const col = CAB_PEDIDOS.length;
  return sh.getRange(2, col, n - 1, 1).getValues()
    .map(r => { try { return JSON.parse(r[0]); } catch (e) { return null; } })
    .filter(Boolean);
}

function gravarClientes(ss, clientes) {
  const sh = ss.getSheetByName(ABA_CLIENTES);
  const n = sh.getLastRow();
  if (n > 1) sh.getRange(2, 1, n - 1, CAB_CLIENTES.length).clearContent();
  if (!clientes.length) return;
  const linhas = clientes.map(c => CAMPOS_CLI.map(k => c[k] || ''));
  sh.getRange(2, 1, linhas.length, CAB_CLIENTES.length).setNumberFormat('@').setValues(linhas);
}

function lerClientes(ss) {
  const sh = ss.getSheetByName(ABA_CLIENTES);
  const n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, CAB_CLIENTES.length).getValues()
    .filter(r => r[0] && r[1])
    .map(r => { const o = {}; CAMPOS_CLI.forEach((k, i) => o[k] = String(r[i])); return o; });
}

function gravarDados(ss, dados) {
  const sh = ss.getSheetByName(ABA_DADOS);
  Object.keys(dados).forEach(k => {
    const r = linhaDoId(sh, k);
    const v = JSON.stringify(dados[k]);
    if (r > 0) sh.getRange(r, 2).setValue(v); else sh.appendRow([k, v]);
  });
}

function lerDados(ss) {
  const sh = ss.getSheetByName(ABA_DADOS);
  const n = sh.getLastRow();
  const o = {};
  if (n < 2) return o;
  sh.getRange(2, 1, n - 1, 2).getValues().forEach(r => { try { o[r[0]] = JSON.parse(r[1]); } catch (e) {} });
  return o;
}
