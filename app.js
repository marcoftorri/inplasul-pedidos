/* Pedidos Inplasul — app de pedidos (Marco Torri)
   Dados salvos no aparelho e copiados automaticamente para uma Planilha Google. */
(function () {
'use strict';

// ---------- Materiais (fixos) ----------
const MATERIAIS = [
  { cod: 'FAB',  nome: 'FUNDO ALTA BARREIRA (EVOH) - NATURAL' },
  { cod: 'FMB',  nome: 'FUNDO MÉDIA BARREIRA - NATURAL' },
  { cod: 'TABL', nome: 'TAMPA ALTA BARREIRA (EVOH) - LISO' },
  { cod: 'TMBL', nome: 'TAMPA MÉDIA BARREIRA - LISO' },
  { cod: 'TABI', nome: 'TAMPA ALTA BARREIRA (EVOH) - IMPRESSO' },
  { cod: 'TMBI', nome: 'TAMPA MÉDIA BARREIRA - IMPRESSO' },
];
// Prazo de entrega: lisos/naturais 45 dias, impressos 60 dias
const prazoDe = cod => (/I$/.test(cod) ? 60 : 45);
function prazoTexto(cods) {
  const ps = [...new Set(cods.map(prazoDe))].sort();
  if (!ps.length) return '—';
  if (ps.length === 1) return ps[0] + ' dias';
  return 'Lisos 45 dias / Impressos 60 dias';
}
const STATUS = ['Enviado', 'Faturado', 'Cancelado'];
const CHAVE = 'inplasul_pedidos_v1';

// ---------- Utilidades ----------
const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (v, d = 2) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r2 = v => Math.round((v + Number.EPSILON) * 100) / 100;
function parseBR(s) {
  s = String(s ?? '').trim().replace(/[R$\s]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
const fmtIn = v => (v ? String(v).replace('.', ',') : '');
const fmtPr = v => (v ? num(v) : '');
function hoje() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
const mesAtual = () => hoje().slice(0, 7);
const dataBR = iso => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const numPed = n => String(n).padStart(4, '0');
const nomeMes = m => { const [a, b] = m.split('-'); const t = new Date(+a, +b - 1, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const soDig = s => String(s ?? '').replace(/\D/g, '');
const arquivoNome = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2600); }
function abrirModal(html) { $('#modalBox').innerHTML = html; $('#modal').classList.add('on'); }
function fecharModal() { $('#modal').classList.remove('on'); }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') fecharModal(); });

// ---------- Estado ----------
function padrao() {
  return {
    clientes: [], precos: {}, pedidos: [],
    config: {
      scriptUrl: '', token: '', comissao: 1, proxNumero: 1,
      rep: { nome: 'Marco Torri', tel: '(49) 9 9803-2098', email: 'marcotorri@outlook.com.br' },
      pagamento: '', frete: 'CIF', entrega: ''
    },
    sync: { pedidos: [], clientes: false, precos: false, ultima: null, erro: '' }
  };
}
function carregar() {
  const d = padrao();
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE));
    if (s) return { ...d, ...s, config: { ...d.config, ...s.config, rep: { ...d.config.rep, ...((s.config || {}).rep || {}) } }, sync: { ...d.sync, ...s.sync } };
  } catch (e) { console.warn(e); }
  return d;
}
let S = carregar();
function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(S)); }
  catch (e) { alert('Não foi possível salvar no aparelho: ' + e.message); }
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

const cliente = id => S.clientes.find(c => c.id === id);
const preco = cod => (S.precos[cod] || {}).preco || 0;

// ---------- Navegação ----------
let vista = 'novo';
function ir(v) {
  vista = v;
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  ({ novo: telaPedido, historico: telaHistorico, relatorio: telaRelatorio, clientes: telaClientes, ajustes: telaAjustes })[v]();
  window.scrollTo(0, 0);
}
document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => ir(b.dataset.v)));

// =====================================================================
// NOVO / EDITAR PEDIDO
// =====================================================================
let rasc = null;
function novoRascunho(clienteId) {
  const itens = {};
  MATERIAIS.forEach(m => itens[m.cod] = { kg: 0, preco: preco(m.cod) });
  return { id: null, numero: null, data: hoje(), clienteId: clienteId || '', itens, pagamento: S.config.pagamento, frete: 'CIF', entrega: S.config.entrega, obs: '', status: 'Enviado' };
}
function rascunhoDe(p, duplicar) {
  const r = novoRascunho(p.clienteId);
  p.itens.forEach(i => r.itens[i.cod] = { kg: i.kg, preco: duplicar ? (preco(i.cod) || i.preco) : i.preco });
  Object.assign(r, { pagamento: p.pagamento, frete: p.frete, entrega: p.entrega, obs: p.obs });
  if (!duplicar) Object.assign(r, { id: p.id, numero: p.numero, data: p.data, status: p.status });
  return r;
}

function telaPedido() {
  if (!rasc) rasc = novoRascunho();
  const c = cliente(rasc.clienteId);
  const semPreco = MATERIAIS.every(m => !preco(m.cod));
  $('#main').innerHTML = `
    <h2>${rasc.id ? 'Editar pedido Nº ' + numPed(rasc.numero) : 'Novo pedido'}</h2>
    ${semPreco ? `<div class="card dica">⚠️ A tabela de preços ainda está vazia. Preencha em <b>Ajustes → Tabela de preços</b> para os valores entrarem automaticamente.</div>` : ''}
    <div class="card">
      <label>Cliente</label>
      <div id="cliBox">${c ? cliSelHTML(c) : cliBuscaHTML()}</div>
      <label>Data do pedido</label>
      <input type="date" id="pData" value="${rasc.data}">
    </div>
    <div class="card" id="itensBox">${itensHTML()}</div>
    <div class="totais"><div><div style="font-size:13px;opacity:.8">Total</div><span id="tKg">${num(totKg())} kg</span></div><b id="tVal">${brl(totVal())}</b></div>
    <div class="card">
      <label>Condição de pagamento</label>
      <input id="pPag" value="${esc(rasc.pagamento)}" placeholder="Ex.: 28 dias / 28-35-42 dias">
      <div class="row">
        <div><label>Frete</label><input value="CIF" disabled style="background:var(--azul-claro);color:var(--azul);font-weight:700"></div>
        <div><label>Prazo de entrega</label><input id="pEnt" value="${prazoTexto(MATERIAIS.filter(m => rasc.itens[m.cod].kg > 0).map(m => m.cod))}" disabled style="background:var(--azul-claro);color:var(--azul);font-weight:700"></div>
      </div>
      <label>Observações (arte, medidas, espessura etc.)</label>
      <textarea id="pObs">${esc(rasc.obs)}</textarea>
    </div>
    <button class="btn" id="btSalvar">${rasc.id ? 'Salvar alterações' : 'Salvar pedido'}</button>
    ${rasc.id ? '<button class="btn sec" id="btCancelarEd">Cancelar edição</button>' : '<button class="btn sec" id="btLimpar">Limpar</button>'}
  `;
  ligarBuscaCliente();
  $('#pData').onchange = e => rasc.data = e.target.value;
  $('#pPag').oninput = e => rasc.pagamento = e.target.value;
  $('#pObs').oninput = e => rasc.obs = e.target.value;
  ligarItens();
  $('#btSalvar').onclick = salvarPedido;
  if ($('#btLimpar')) $('#btLimpar').onclick = () => { if (confirm('Limpar o pedido em andamento?')) { rasc = novoRascunho(); telaPedido(); } };
  if ($('#btCancelarEd')) $('#btCancelarEd').onclick = () => { rasc = null; ir('historico'); };
}
function cliSelHTML(c) {
  return `<div class="cli-sel"><div><div class="t"><b>${esc(c.nome)}</b></div><div class="s">${esc([c.cnpj, [c.cidade, c.uf].filter(Boolean).join('/')].filter(Boolean).join(' · '))}</div></div>
    <button class="btn min sec" id="btTrocaCli">Trocar</button></div>`;
}
function cliBuscaHTML() {
  return `<input id="cliBusca" placeholder="${S.clientes.length ? 'Digite nome, cidade ou CNPJ…' : 'Nenhum cliente cadastrado ainda'}" autocomplete="off"><div id="cliRes"></div>`;
}
function ligarBuscaCliente() {
  const tr = $('#btTrocaCli');
  if (tr) tr.onclick = () => { rasc.clienteId = ''; $('#cliBox').innerHTML = cliBuscaHTML(); ligarBuscaCliente(); $('#cliBusca').focus(); };
  const inp = $('#cliBusca');
  if (!inp) return;
  inp.oninput = () => {
    const q = norm(inp.value), qd = soDig(inp.value);
    if (!q) { $('#cliRes').innerHTML = ''; return; }
    const achados = S.clientes.filter(c => norm(c.nome + ' ' + c.cidade + ' ' + c.contato).includes(q) || (qd.length >= 3 && soDig(c.cnpj).includes(qd))).slice(0, 12);
    $('#cliRes').innerHTML = `<div class="res">${achados.map(c => `<div data-id="${c.id}"><b>${esc(c.nome)}</b><br><span class="dica">${esc([c.cidade, c.uf].filter(Boolean).join('/'))}</span></div>`).join('') || '<div class="dica">Nenhum cliente encontrado. Cadastre em <b>Clientes</b>.</div>'}</div>`;
    $('#cliRes').querySelectorAll('[data-id]').forEach(el => el.onclick = () => {
      rasc.clienteId = el.dataset.id;
      $('#cliBox').innerHTML = cliSelHTML(cliente(rasc.clienteId)); ligarBuscaCliente();
    });
  };
}
function itensHTML() {
  return `<div style="font-weight:700;margin-bottom:4px">Itens <span class="dica" style="font-weight:400">— preencha os kg só dos materiais do pedido</span></div>` +
    MATERIAIS.map(m => {
      const it = rasc.itens[m.cod];
      return `<div class="mat ${it.kg > 0 ? 'ativo' : ''}" data-cod="${m.cod}">
        <div class="nome">${m.nome}</div>
        <div class="campos">
          <div><label>Qtde (kg)</label><input inputmode="decimal" class="iKg" value="${fmtIn(it.kg)}" placeholder="0"></div>
          <div><label>R$/kg</label><input inputmode="decimal" class="iPr" value="${fmtPr(it.preco)}" placeholder="0,00"></div>
          <div class="sub">${it.kg > 0 ? brl(it.kg * it.preco) : '—'}</div>
        </div></div>`;
    }).join('');
}
function ligarItens() {
  document.querySelectorAll('.mat').forEach(el => {
    const cod = el.dataset.cod;
    const atual = () => {
      const it = rasc.itens[cod];
      it.kg = parseBR(el.querySelector('.iKg').value);
      it.preco = parseBR(el.querySelector('.iPr').value);
      el.classList.toggle('ativo', it.kg > 0);
      el.querySelector('.sub').textContent = it.kg > 0 ? brl(it.kg * it.preco) : '—';
      $('#tKg').textContent = num(totKg()) + ' kg';
      $('#tVal').textContent = brl(totVal());
      $('#pEnt').value = prazoTexto(MATERIAIS.filter(m => rasc.itens[m.cod].kg > 0).map(m => m.cod));
    };
    el.querySelector('.iKg').oninput = atual;
    el.querySelector('.iPr').oninput = atual;
  });
}
const totKg = () => MATERIAIS.reduce((s, m) => s + (rasc.itens[m.cod].kg || 0), 0);
const totVal = () => MATERIAIS.reduce((s, m) => s + (rasc.itens[m.cod].kg || 0) * (rasc.itens[m.cod].preco || 0), 0);

function salvarPedido() {
  const c = cliente(rasc.clienteId);
  if (!c) return alert('Escolha o cliente.');
  const itens = MATERIAIS.filter(m => rasc.itens[m.cod].kg > 0).map(m => {
    const it = rasc.itens[m.cod];
    return { cod: m.cod, nome: m.nome, kg: it.kg, preco: it.preco, subtotal: r2(it.kg * it.preco), prazo: prazoDe(m.cod) };
  });
  if (!itens.length) return alert('Informe a quantidade (kg) de pelo menos um material.');
  if (itens.some(i => !i.preco) && !confirm('Há item sem preço (R$ 0,00). Salvar mesmo assim?')) return;
  const agora = new Date().toISOString();
  const base = {
    data: rasc.data || hoje(), clienteId: c.id,
    cliente: { nome: c.nome, cnpj: c.cnpj, cidade: c.cidade, uf: c.uf, contato: c.contato, telefone: c.telefone, email: c.email, endereco: c.endereco },
    itens, totalKg: r2(itens.reduce((s, i) => s + i.kg, 0)), total: r2(itens.reduce((s, i) => s + i.subtotal, 0)),
    pagamento: rasc.pagamento.trim(), frete: 'CIF', entrega: prazoTexto(itens.map(i => i.cod)), obs: rasc.obs.trim(), atualizadoEm: agora
  };
  let p;
  if (rasc.id) {
    p = S.pedidos.find(x => x.id === rasc.id);
    Object.assign(p, base);
  } else {
    p = { id: uid(), numero: S.config.proxNumero, status: 'Enviado', criadoEm: agora, ...base };
    S.config.proxNumero++;
    S.pedidos.push(p);
  }
  marcarPedido(p.id);
  rasc = null;
  salvar(); sincronizar();
  toast('Pedido Nº ' + numPed(p.numero) + ' salvo');
  ir('historico');
  verPedido(p.id);
}

// =====================================================================
// HISTÓRICO
// =====================================================================
let filtroHist = { mes: mesAtual(), q: '' };
function telaHistorico() {
  $('#main').innerHTML = `
    <h2>Histórico</h2>
    <div class="card">
      <div class="row">
        <div><label>Mês</label><input type="month" id="hMes" value="${filtroHist.mes}"></div>
        <div><label>Buscar</label><input id="hQ" value="${esc(filtroHist.q)}" placeholder="Cliente ou nº"></div>
      </div>
      <div class="chips" style="margin-top:10px"><button id="hTodos" class="${filtroHist.mes ? '' : 'on'}">Todos os meses</button></div>
    </div>
    <div class="card lista" id="hLista"></div>`;
  $('#hMes').onchange = e => { filtroHist.mes = e.target.value; telaHistorico(); };
  $('#hQ').oninput = e => { filtroHist.q = e.target.value; listarHist(); };
  $('#hTodos').onclick = () => { filtroHist.mes = filtroHist.mes ? '' : mesAtual(); telaHistorico(); };
  listarHist();
}
function listarHist() {
  const q = norm(filtroHist.q);
  const lista = S.pedidos
    .filter(p => !filtroHist.mes || p.data.slice(0, 7) === filtroHist.mes)
    .filter(p => !q || norm(p.cliente.nome).includes(q) || numPed(p.numero).includes(q))
    .sort((a, b) => b.data.localeCompare(a.data) || b.numero - a.numero);
  $('#hLista').innerHTML = lista.length ? lista.map(p => `
    <div class="item" data-id="${p.id}">
      <div><div class="t">Nº ${numPed(p.numero)} · ${esc(p.cliente.nome)}</div>
      <div class="s">${dataBR(p.data)} · ${num(p.totalKg)} kg</div></div>
      <div class="d"><div class="t">${brl(p.total)}</div><span class="badge b-${p.status}">${p.status}</span>${S.sync.pedidos.includes(p.id) ? ' <span class="dica">⏳</span>' : ''}</div>
    </div>`).join('') : '<div class="vazio">Nenhum pedido neste período.</div>';
  $('#hLista').querySelectorAll('.item').forEach(el => el.onclick = () => verPedido(el.dataset.id));
}
function verPedido(id) {
  const p = S.pedidos.find(x => x.id === id);
  if (!p) return;
  abrirModal(`
    <div class="topo"><h2 style="margin:0">Pedido Nº ${numPed(p.numero)}</h2><button class="fechar" onclick="App.fechar()">✕</button></div>
    <div class="card">
      <b>${esc(p.cliente.nome)}</b><div class="dica">${esc([p.cliente.cnpj, [p.cliente.cidade, p.cliente.uf].filter(Boolean).join('/')].filter(Boolean).join(' · '))}</div>
      <div class="dica" style="margin-top:6px">Data: ${dataBR(p.data)}</div>
    </div>
    <div class="card"><table>
      <tr><th>Material</th><th class="n">kg</th><th class="n">R$/kg</th><th class="n">Subtotal</th></tr>
      ${p.itens.map(i => `<tr><td>${esc(i.nome)}</td><td class="n">${num(i.kg)}</td><td class="n">${num(i.preco)}</td><td class="n">${brl(i.subtotal)}</td></tr>`).join('')}
      <tr><td><b>Total</b></td><td class="n"><b>${num(p.totalKg)}</b></td><td></td><td class="n"><b>${brl(p.total)}</b></td></tr>
    </table>
    <div class="dica" style="margin-top:10px">Pagamento: ${esc(p.pagamento || '—')} · Frete: ${p.frete} · Entrega: ${esc(p.entrega || '—')}</div>
    ${p.obs ? `<div class="dica" style="margin-top:6px">Obs.: ${esc(p.obs)}</div>` : ''}
    </div>
    <div class="card"><label style="margin-top:0">Status</label>
      <div class="chips">${STATUS.map(s => `<button data-s="${s}" class="${p.status === s ? 'on' : ''}">${s}</button>`).join('')}</div>
    </div>
    <button class="btn" id="mPdf">📄 Gerar PDF / Compartilhar</button>
    <div class="row"><button class="btn sec" id="mEd">Editar</button><button class="btn sec" id="mDup">Duplicar</button></div>
    <button class="btn perigo" id="mDel">Excluir pedido</button>
  `);
  document.querySelectorAll('#modalBox [data-s]').forEach(b => b.onclick = () => {
    p.status = b.dataset.s; p.atualizadoEm = new Date().toISOString();
    marcarPedido(p.id); salvar(); sincronizar(); verPedido(id); if (vista === 'historico') listarHist();
  });
  $('#mPdf').onclick = () => compartilharPDF(pdfPedido(p), `Pedido-Inplasul-${numPed(p.numero)}-${arquivoNome(p.cliente.nome)}.pdf`);
  $('#mEd').onclick = () => { rasc = rascunhoDe(p, false); fecharModal(); ir('novo'); };
  $('#mDup').onclick = () => { rasc = rascunhoDe(p, true); fecharModal(); ir('novo'); toast('Pedido duplicado com os preços atuais'); };
  $('#mDel').onclick = () => {
    if (!confirm('Excluir o pedido Nº ' + numPed(p.numero) + '? Para pedidos que não vão acontecer, prefira marcar como "Cancelado".')) return;
    p.excluido = true; p.atualizadoEm = new Date().toISOString();
    S.pedidos = S.pedidos.filter(x => x.id !== p.id);
    S.sync.excluir = [...(S.sync.excluir || []), p.id];
    S.sync.pedidos = S.sync.pedidos.filter(x => x !== p.id);
    salvar(); sincronizar(); fecharModal(); ir('historico'); toast('Pedido excluído');
  };
}

// =====================================================================
// PDF DO PEDIDO (sem comissão)
// =====================================================================
const AZUL = [11, 79, 138];
function cabecalho(doc, titulo, direita1, direita2) {
  const W = doc.internal.pageSize.getWidth(), M = 14, rep = S.config.rep;
  doc.setFillColor(...AZUL); doc.rect(0, 0, W, 27, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
  doc.text('INPLASUL EMBALAGENS', M, 12);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.text(`Representante: ${rep.nome}  |  ${rep.tel}  |  ${rep.email}`, M, 20);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text(direita1, W - M, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(direita2, W - M, 20, { align: 'right' });
  doc.setTextColor(30);
  void titulo;
}
function rodape(doc, texto) {
  const n = doc.getNumberOfPages(), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(130);
    doc.text(texto, 14, H - 8);
    doc.text(`Página ${i} de ${n}`, W - 14, H - 8, { align: 'right' });
  }
}
function pdfPedido(p) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), M = 14;
  cabecalho(doc, 'Pedido', 'PEDIDO Nº ' + numPed(p.numero), 'Data: ' + dataBR(p.data));
  let y = 36;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...AZUL);
  doc.text('DADOS DO CLIENTE', M, y); y += 2;
  doc.setDrawColor(...AZUL); doc.setLineWidth(0.4); doc.line(M, y, W - M, y); y += 6;
  const c = p.cliente, linhas = [
    ['Razão social', c.nome], ['CNPJ', c.cnpj], ['Endereço', c.endereco],
    ['Cidade/UF', [c.cidade, c.uf].filter(Boolean).join(' / ')], ['Contato', c.contato],
    ['Telefone', c.telefone], ['E-mail', c.email]
  ].filter(l => l[1]);
  doc.setFontSize(9.5);
  linhas.forEach(([k, v]) => {
    doc.setFont('helvetica', 'bold'); doc.setTextColor(90); doc.text(k + ':', M, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(20);
    const t = doc.splitTextToSize(String(v), W - M - 45); doc.text(t, M + 28, y); y += 5 * t.length;
  });
  doc.autoTable({
    startY: y + 4, margin: { left: M, right: M }, theme: 'grid',
    head: [['Material', 'Qtde (kg)', 'Preço (R$/kg)', 'Subtotal (R$)', 'Entrega']],
    body: p.itens.map(i => [i.nome, num(i.kg), num(i.preco), num(i.subtotal), (i.prazo || prazoDe(i.cod)) + ' dias']),
    foot: [['TOTAL', num(p.totalKg), '', brl(p.total), '']],
    styles: { fontSize: 9.5, cellPadding: 2.6, lineColor: [210, 218, 228], lineWidth: 0.2 },
    headStyles: { fillColor: AZUL, textColor: 255 },
    footStyles: { fillColor: [230, 238, 247], textColor: 20, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right', cellWidth: 24 }, 2: { halign: 'right', cellWidth: 27 }, 3: { halign: 'right', cellWidth: 31 }, 4: { halign: 'center', cellWidth: 20 } },
    didParseCell: d => { if (d.section !== 'body' && d.column.index > 0) d.cell.styles.halign = d.column.index === 4 ? 'center' : 'right'; }
  });
  y = doc.lastAutoTable.finalY + 9;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...AZUL);
  doc.text('CONDIÇÕES', M, y); y += 2; doc.line(M, y, W - M, y); y += 6;
  doc.setFontSize(9.5);
  [['Pagamento', p.pagamento || '—'], ['Frete', p.frete], ['Prazo de entrega', p.entrega || '—']].forEach(([k, v]) => {
    doc.setFont('helvetica', 'bold'); doc.setTextColor(90); doc.text(k + ':', M, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(20); doc.text(String(v), M + 34, y); y += 5;
  });
  if (p.obs) {
    y += 3; doc.setFont('helvetica', 'bold'); doc.setTextColor(90); doc.text('Observações:', M, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(20);
    const t = doc.splitTextToSize(p.obs, W - 2 * M); doc.text(t, M, y); y += 4.6 * t.length;
  }
  const H = doc.internal.pageSize.getHeight();
  if (y > H - 45) { doc.addPage(); y = 30; }
  y = Math.max(y + 22, H - 40);
  doc.setDrawColor(120); doc.setLineWidth(0.3);
  doc.line(M, y, M + 75, y); doc.line(W - M - 75, y, W - M, y);
  doc.setFontSize(8.5); doc.setTextColor(80);
  doc.text('Cliente (assinatura e carimbo)', M + 37.5, y + 5, { align: 'center' });
  doc.text(S.config.rep.nome + ' - Representante', W - M - 37.5, y + 5, { align: 'center' });
  rodape(doc, `Cópia do pedido Nº ${numPed(p.numero)} - emitida em ${new Date().toLocaleString('pt-BR')}`);
  return doc;
}
async function compartilharPDF(doc, nome) {
  const blob = doc.output('blob');
  try {
    const f = new File([blob], nome, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: nome }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  doc.save(nome);
}

// =====================================================================
// RELATÓRIO MENSAL (com comissão)
// =====================================================================
let filtroRel = { mes: mesAtual(), so: 'todos' };
function dadosMes() {
  const peds = S.pedidos.filter(p => p.data.slice(0, 7) === filtroRel.mes && p.status !== 'Cancelado' && (filtroRel.so === 'todos' || p.status === 'Faturado'))
    .sort((a, b) => a.data.localeCompare(b.data) || a.numero - b.numero);
  const total = r2(peds.reduce((s, p) => s + p.total, 0));
  const kg = r2(peds.reduce((s, p) => s + p.totalKg, 0));
  const pct = Number(S.config.comissao) || 0;
  const porCli = {}, porMat = {};
  peds.forEach(p => {
    const k = p.cliente.nome;
    porCli[k] = porCli[k] || { nome: k, pedidos: 0, kg: 0, total: 0 };
    porCli[k].pedidos++; porCli[k].kg += p.totalKg; porCli[k].total += p.total;
    p.itens.forEach(i => { porMat[i.nome] = porMat[i.nome] || { nome: i.nome, kg: 0, total: 0 }; porMat[i.nome].kg += i.kg; porMat[i.nome].total += i.subtotal; });
  });
  const cancelados = S.pedidos.filter(p => p.data.slice(0, 7) === filtroRel.mes && p.status === 'Cancelado').length;
  return {
    peds, total, kg, pct, comissao: r2(total * pct / 100), cancelados,
    porCli: Object.values(porCli).sort((a, b) => b.total - a.total),
    porMat: MATERIAIS.map(m => porMat[m.nome]).filter(Boolean)
  };
}
function telaRelatorio() {
  const d = dadosMes();
  $('#main').innerHTML = `
    <h2>Relatório mensal</h2>
    <div class="card">
      <label style="margin-top:0">Mês</label><input type="month" id="rMes" value="${filtroRel.mes}">
      <label>Considerar</label>
      <div class="chips"><button data-so="todos" class="${filtroRel.so === 'todos' ? 'on' : ''}">Enviados + Faturados</button><button data-so="fat" class="${filtroRel.so === 'fat' ? 'on' : ''}">Só faturados</button></div>
      <div class="dica" style="margin-top:8px">Pedidos cancelados ficam fora${d.cancelados ? ` (${d.cancelados} neste mês)` : ''}.</div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="l">Pedidos</div><div class="v">${d.peds.length}</div></div>
      <div class="kpi"><div class="l">Volume</div><div class="v">${num(d.kg)} kg</div></div>
      <div class="kpi"><div class="l">Total vendido</div><div class="v">${brl(d.total)}</div></div>
      <div class="kpi dest"><div class="l">Comissão (${num(d.pct, 1)}%)</div><div class="v">${brl(d.comissao)}</div></div>
    </div>
    ${d.peds.length ? `
    <div class="card"><b>Por cliente</b><table>
      <tr><th>Cliente</th><th class="n">kg</th><th class="n">Total</th></tr>
      ${d.porCli.map(c => `<tr><td>${esc(c.nome)}<div class="dica">${c.pedidos} pedido(s)</div></td><td class="n">${num(c.kg)}</td><td class="n">${brl(c.total)}</td></tr>`).join('')}
    </table></div>
    <div class="card"><b>Por material</b><table>
      <tr><th>Material</th><th class="n">kg</th><th class="n">Total</th></tr>
      ${d.porMat.map(m => `<tr><td>${esc(m.nome)}</td><td class="n">${num(m.kg)}</td><td class="n">${brl(m.total)}</td></tr>`).join('')}
    </table></div>
    <button class="btn" id="rPdf">📄 Relatório em PDF</button>
    <button class="btn sec" id="rXls">📊 Relatório em Excel</button>` : '<div class="card vazio">Nenhum pedido neste mês.</div>'}
  `;
  $('#rMes').onchange = e => { filtroRel.mes = e.target.value || mesAtual(); telaRelatorio(); };
  document.querySelectorAll('[data-so]').forEach(b => b.onclick = () => { filtroRel.so = b.dataset.so; telaRelatorio(); });
  if ($('#rPdf')) $('#rPdf').onclick = () => compartilharPDF(pdfRelatorio(d), `Relatorio-Inplasul-${filtroRel.mes}.pdf`);
  if ($('#rXls')) $('#rXls').onclick = () => excelRelatorio(d);
}
function pdfRelatorio(d) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), M = 14;
  cabecalho(doc, 'Relatório', 'RELATÓRIO MENSAL', nomeMes(filtroRel.mes));
  let y = 36;
  const caixas = [['Pedidos', String(d.peds.length)], ['Volume', num(d.kg) + ' kg'], ['Total vendido', brl(d.total)], [`Comissão (${num(d.pct, 1)}%)`, brl(d.comissao)]];
  const bw = (W - 2 * M - 9) / 4;
  caixas.forEach(([l, v], i) => {
    const x = M + i * (bw + 3);
    if (i === 3) doc.setFillColor(...AZUL); else doc.setFillColor(236, 242, 249);
    doc.roundedRect(x, y, bw, 18, 2, 2, 'F');
    doc.setTextColor(i === 3 ? 220 : 90); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(l, x + 3, y + 6);
    doc.setTextColor(i === 3 ? 255 : 20); doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.text(v, x + 3, y + 14);
  });
  y += 24;
  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
  doc.text(filtroRel.so === 'todos' ? 'Considera pedidos enviados e faturados (cancelados excluídos).' : 'Considera apenas pedidos faturados.', M, y);
  const est = { didParseCell: d => { if (d.section === 'foot' && d.column.index > 0) d.cell.styles.halign = d.column.index === 1 && d.table.columns.length === 5 ? 'center' : 'right'; }, styles: { fontSize: 9, cellPadding: 2.2, lineColor: [210, 218, 228], lineWidth: 0.2 }, headStyles: { fillColor: AZUL, textColor: 255 }, footStyles: { fillColor: [230, 238, 247], textColor: 20, fontStyle: 'bold' }, margin: { left: M, right: M }, theme: 'grid' };
  const tit = (t, yy) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...AZUL); doc.text(t, M, yy); };
  tit('POR CLIENTE', y + 8);
  doc.autoTable({ ...est, startY: y + 10,
    head: [['Cliente', 'Pedidos', 'kg', 'Total (R$)', 'Comissão (R$)']],
    body: d.porCli.map(c => [c.nome, c.pedidos, num(c.kg), num(c.total), num(c.total * d.pct / 100)]),
    foot: [['TOTAL', d.peds.length, num(d.kg), num(d.total), num(d.comissao)]],
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } } });
  tit('POR MATERIAL', doc.lastAutoTable.finalY + 9);
  doc.autoTable({ ...est, startY: doc.lastAutoTable.finalY + 11,
    head: [['Material', 'kg', 'Total (R$)']],
    body: d.porMat.map(m => [m.nome, num(m.kg), num(m.total)]),
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } } });
  tit('PEDIDOS DO MÊS', doc.lastAutoTable.finalY + 9);
  doc.autoTable({ ...est, startY: doc.lastAutoTable.finalY + 11,
    head: [['Nº', 'Data', 'Cliente', 'Status', 'kg', 'Total (R$)']],
    body: d.peds.map(p => [numPed(p.numero), dataBR(p.data), p.cliente.nome, p.status, num(p.totalKg), num(p.total)]),
    columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' } } });
  rodape(doc, `Relatório ${nomeMes(filtroRel.mes)} - ${S.config.rep.nome} - emitido em ${new Date().toLocaleString('pt-BR')}`);
  return doc;
}
function excelRelatorio(d) {
  const wb = XLSX.utils.book_new();
  const resumo = [
    ['Relatório mensal Inplasul', nomeMes(filtroRel.mes)],
    ['Representante', S.config.rep.nome],
    ['Critério', filtroRel.so === 'todos' ? 'Enviados + Faturados' : 'Só faturados'],
    [],
    ['Pedidos', d.peds.length], ['Volume (kg)', d.kg], ['Total vendido (R$)', d.total],
    ['Comissão (%)', d.pct], ['Comissão (R$)', d.comissao], [],
    ['Cliente', 'Pedidos', 'kg', 'Total (R$)', 'Comissão (R$)'],
    ...d.porCli.map(c => [c.nome, c.pedidos, r2(c.kg), r2(c.total), r2(c.total * d.pct / 100)]),
    [], ['Material', 'kg', 'Total (R$)'],
    ...d.porMat.map(m => [m.nome, r2(m.kg), r2(m.total)])
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(resumo); ws1['!cols'] = [{ wch: 42 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Resumo');
  const ws2 = XLSX.utils.aoa_to_sheet([['Nº', 'Data', 'Cliente', 'CNPJ', 'Cidade/UF', 'Status', 'kg', 'Total (R$)', 'Pagamento', 'Frete', 'Entrega', 'Obs'],
    ...d.peds.map(p => [numPed(p.numero), dataBR(p.data), p.cliente.nome, p.cliente.cnpj, [p.cliente.cidade, p.cliente.uf].filter(Boolean).join('/'), p.status, p.totalKg, p.total, p.pagamento, p.frete, p.entrega, p.obs])]);
  ws2['!cols'] = [{ wch: 6 }, { wch: 11 }, { wch: 36 }, { wch: 19 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 6 }, { wch: 12 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Pedidos');
  const ws3 = XLSX.utils.aoa_to_sheet([['Nº', 'Data', 'Cliente', 'Material', 'kg', 'R$/kg', 'Subtotal (R$)', 'Status'],
    ...d.peds.flatMap(p => p.itens.map(i => [numPed(p.numero), dataBR(p.data), p.cliente.nome, i.nome, i.kg, i.preco, i.subtotal, p.status]))]);
  ws3['!cols'] = [{ wch: 6 }, { wch: 11 }, { wch: 36 }, { wch: 40 }, { wch: 10 }, { wch: 9 }, { wch: 13 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Itens');
  const nome = `Relatorio-Inplasul-${filtroRel.mes}.xlsx`;
  const blob = new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  compartilharBlob(blob, nome);
}
async function compartilharBlob(blob, nome) {
  try {
    const f = new File([blob], nome, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: nome }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// =====================================================================
// CLIENTES
// =====================================================================
let filtroCli = '';
function telaClientes() {
  $('#main').innerHTML = `
    <h2>Clientes <span class="dica" style="font-weight:400">(${S.clientes.length})</span></h2>
    <div class="row"><button class="btn" id="cNovo">+ Novo cliente</button><button class="btn sec" id="cImp">Importar planilha</button></div>
    <div class="card" style="margin-top:12px"><input id="cQ" value="${esc(filtroCli)}" placeholder="Buscar por nome, cidade ou CNPJ"></div>
    <div class="card lista" id="cLista"></div>
    <div class="dica">A importação aceita Excel ou CSV com colunas como: Razão social / Cliente, CNPJ, Endereço, Cidade, UF, Contato, Telefone, E-mail. Clientes repetidos (mesmo CNPJ ou nome) são atualizados, não duplicados.</div>`;
  $('#cNovo').onclick = () => editarCliente();
  $('#cImp').onclick = () => $('#arquivoClientes').click();
  $('#cQ').oninput = e => { filtroCli = e.target.value; listarCli(); };
  listarCli();
}
function listarCli() {
  const q = norm(filtroCli), qd = soDig(filtroCli);
  const l = S.clientes.filter(c => !q || norm(c.nome + ' ' + c.cidade + ' ' + c.contato).includes(q) || (qd.length >= 3 && soDig(c.cnpj).includes(qd)))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  $('#cLista').innerHTML = l.length ? l.map(c => `<div class="item" data-id="${c.id}"><div><div class="t">${esc(c.nome)}</div><div class="s">${esc([c.cidade, c.uf].filter(Boolean).join('/') || '—')}${c.contato ? ' · ' + esc(c.contato) : ''}</div></div><div class="d s">›</div></div>`).join('')
    : `<div class="vazio">${S.clientes.length ? 'Nenhum cliente encontrado.' : 'Nenhum cliente ainda. Importe a planilha de clientes ou cadastre manualmente.'}</div>`;
  $('#cLista').querySelectorAll('.item').forEach(el => el.onclick = () => editarCliente(el.dataset.id));
}
const CAMPOS_CLI = [['nome', 'Razão social / Nome *'], ['cnpj', 'CNPJ'], ['endereco', 'Endereço'], ['cidade', 'Cidade'], ['uf', 'UF'], ['contato', 'Contato / Comprador'], ['telefone', 'Telefone / WhatsApp'], ['email', 'E-mail']];
function editarCliente(id) {
  const c = id ? cliente(id) : {};
  const qtd = id ? S.pedidos.filter(p => p.clienteId === id).length : 0;
  abrirModal(`
    <div class="topo"><h2 style="margin:0">${id ? 'Editar cliente' : 'Novo cliente'}</h2><button class="fechar" onclick="App.fechar()">✕</button></div>
    <div class="card">${CAMPOS_CLI.map(([k, l]) => `<label>${l}</label><input id="f_${k}" value="${esc(c[k] || '')}" ${k === 'uf' ? 'maxlength="2" style="text-transform:uppercase"' : ''}${k === 'email' ? ' type="email"' : ''}${k === 'telefone' ? ' type="tel"' : ''}>`).join('')}</div>
    <button class="btn" id="fSalvar">Salvar</button>
    ${id ? `<button class="btn sec" id="fPedido">Novo pedido para este cliente</button>
    ${qtd ? `<div class="dica" style="margin-top:10px">${qtd} pedido(s) deste cliente no histórico.</div>` : '<button class="btn perigo" id="fDel">Excluir cliente</button>'}` : ''}
  `);
  $('#fSalvar').onclick = () => {
    const dados = {};
    CAMPOS_CLI.forEach(([k]) => dados[k] = $('#f_' + k).value.trim());
    dados.uf = dados.uf.toUpperCase();
    if (!dados.nome) return alert('Informe o nome do cliente.');
    if (id) Object.assign(c, dados); else S.clientes.push({ id: uid(), ...dados });
    S.sync.clientes = true; salvar(); sincronizar(); fecharModal();
    if (vista === 'clientes') listarCli();
    toast('Cliente salvo');
  };
  if ($('#fPedido')) $('#fPedido').onclick = () => { rasc = novoRascunho(id); fecharModal(); ir('novo'); };
  if ($('#fDel')) $('#fDel').onclick = () => {
    if (!confirm('Excluir este cliente?')) return;
    S.clientes = S.clientes.filter(x => x.id !== id); S.sync.clientes = true; salvar(); sincronizar(); fecharModal(); listarCli();
  };
}
// Importação Excel/CSV
const COLS = {
  nome: ['razao social', 'razao', 'nome fantasia', 'cliente', 'empresa', '=nome'],
  cnpj: ['cnpj', 'cpf'],
  endereco: ['endereco', 'logradouro', '=rua'],
  cidade: ['cidade', 'municipio'],
  uf: ['=uf', '=estado', '=est'],
  contato: ['contato', 'comprador', 'responsavel'],
  telefone: ['telefone', 'fone', 'celular', 'whatsapp', '=tel'],
  email: ['e-mail', 'email']
};
function pegar(linha, alts) {
  const ks = Object.keys(linha);
  for (const a of alts) {
    const exato = a.startsWith('='), alvo = exato ? a.slice(1) : a;
    const k = ks.find(k => exato ? norm(k) === alvo : norm(k).includes(alvo));
    if (k !== undefined && String(linha[k]).trim()) return String(linha[k]).trim();
  }
  return '';
}
// CSV do Excel brasileiro: separador ";" e acentos em UTF-8 ou Windows-1252
function lerCSV(buf) {
  let txt;
  try { txt = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { txt = new TextDecoder('windows-1252').decode(buf); }
  txt = txt.replace(/^﻿/, '');
  const prim = txt.split(/\r?\n/)[0] || '';
  const sep = (prim.match(/;/g) || []).length >= (prim.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cel = '', aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (aspas) { if (ch === '"') { if (txt[i + 1] === '"') { cel += '"'; i++; } else aspas = false; } else cel += ch; }
    else if (ch === '"') aspas = true;
    else if (ch === sep) { row.push(cel); cel = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; row.push(cel); rows.push(row); row = []; cel = ''; }
    else cel += ch;
  }
  if (cel || row.length) { row.push(cel); rows.push(row); }
  const cab = rows.shift() || [];
  return rows.filter(r => r.some(c => c.trim())).map(r => { const o = {}; cab.forEach((h, i) => o[h || 'col' + i] = r[i] || ''); return o; });
}
$('#arquivoClientes').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const buf = await f.arrayBuffer();
    let linhas;
    if (/\.csv$/i.test(f.name)) linhas = lerCSV(buf);
    else { const wb = XLSX.read(buf); linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false }); }
    let novos = 0, atual = 0;
    linhas.forEach(l => {
      const d = {}; Object.keys(COLS).forEach(k => d[k] = pegar(l, COLS[k]));
      if (!d.nome) return;
      d.uf = d.uf.toUpperCase().slice(0, 2);
      const ex = S.clientes.find(c => (d.cnpj && soDig(c.cnpj) && soDig(c.cnpj) === soDig(d.cnpj)) || norm(c.nome) === norm(d.nome));
      if (ex) { Object.keys(d).forEach(k => { if (d[k]) ex[k] = d[k]; }); atual++; }
      else { S.clientes.push({ id: uid(), ...d }); novos++; }
    });
    S.sync.clientes = true; salvar(); sincronizar();
    alert(`Importação concluída:\n${novos} cliente(s) novo(s)\n${atual} atualizado(s)`);
    if (vista === 'clientes') telaClientes();
  } catch (err) { alert('Não consegui ler o arquivo: ' + err.message); }
});

// =====================================================================
// AJUSTES: preços, dados, planilha Google, backup
// =====================================================================
function telaAjustes() {
  const cf = S.config;
  $('#main').innerHTML = `
    <h2>Ajustes</h2>
    <h3>Tabela de preços (R$/kg)</h3>
    <div class="card">
      ${MATERIAIS.map(m => { const p = S.precos[m.cod] || {}; return `<div class="mat"><div class="nome">${m.nome}</div>
        <div class="campos"><div><input inputmode="decimal" class="pp" data-cod="${m.cod}" value="${fmtPr(p.preco)}" placeholder="0,00"></div>
        <div class="sub" style="padding-bottom:0">${p.data ? 'atualizado<br>' + dataBR(p.data) : 'sem preço'}</div></div></div>`; }).join('')}
      <button class="btn" id="aPrecos">Salvar preços</button>
      <div class="dica" style="margin-top:8px">Pedidos já feitos mantêm o preço do dia em que foram feitos.</div>
    </div>

    <h3>Padrões do pedido</h3>
    <div class="card">
      <label style="margin-top:0">Condição de pagamento padrão</label><input id="aPag" value="${esc(cf.pagamento)}">
      <div class="dica" style="margin-top:8px">Frete: sempre CIF · Entrega (automático): lisos/naturais 45 dias, impressos 60 dias.</div>
      <div class="row"><div><label>Comissão no relatório (%)</label><input inputmode="decimal" id="aCom" value="${fmtIn(cf.comissao)}"></div>
      <div><label>Próximo nº de pedido</label><input inputmode="numeric" id="aNum" value="${cf.proxNumero}"></div></div>
    </div>

    <h3>Representante (sai no PDF)</h3>
    <div class="card">
      <label style="margin-top:0">Nome</label><input id="aRepN" value="${esc(cf.rep.nome)}">
      <label>Telefone</label><input id="aRepT" value="${esc(cf.rep.tel)}">
      <label>E-mail</label><input id="aRepE" value="${esc(cf.rep.email)}">
      <button class="btn" id="aSalvarCfg">Salvar ajustes</button>
    </div>

    <h3>Planilha Google (backup automático)</h3>
    <div class="card">
      <label style="margin-top:0">Endereço do script (URL do app da web)</label>
      <input id="aUrl" value="${esc(cf.scriptUrl)}" placeholder="https://script.google.com/macros/s/…/exec">
      <label>Código secreto</label><input id="aTok" value="${esc(cf.token)}" placeholder="O mesmo que está no script">
      <button class="btn" id="aConectar">Salvar e testar conexão</button>
      <div class="dica" style="margin-top:8px" id="aStatus">${statusTexto()}</div>
      <button class="btn sec" id="aEnviarTudo">Enviar todos os dados para a planilha</button>
      <button class="btn sec" id="aRestaurar">Restaurar dados da planilha</button>
    </div>

    <h3>Backup em arquivo</h3>
    <div class="card">
      <div class="row"><button class="btn sec" id="aExp">Exportar backup</button><button class="btn sec" id="aImp">Importar backup</button></div>
    </div>
    <div class="dica" style="text-align:center;margin:16px 0">Pedidos Inplasul · versão 1.0</div>
  `;
  $('#aPrecos').onclick = () => {
    document.querySelectorAll('.pp').forEach(i => {
      const v = parseBR(i.value), old = S.precos[i.dataset.cod] || {};
      if (v !== old.preco) S.precos[i.dataset.cod] = { preco: v, data: hoje() };
    });
    S.sync.precos = true; salvar(); sincronizar(); toast('Preços salvos'); telaAjustes();
  };
  $('#aSalvarCfg').onclick = () => {
    cf.pagamento = $('#aPag').value.trim(); cf.frete = 'CIF';
    cf.comissao = parseBR($('#aCom').value);
    const n = parseInt($('#aNum').value, 10); if (n > 0) cf.proxNumero = n;
    cf.rep = { nome: $('#aRepN').value.trim(), tel: $('#aRepT').value.trim(), email: $('#aRepE').value.trim() };
    S.sync.precos = true; salvar(); sincronizar(); toast('Ajustes salvos');
  };
  $('#aConectar').onclick = async () => {
    cf.scriptUrl = $('#aUrl').value.trim(); cf.token = $('#aTok').value.trim(); salvar();
    if (!cf.scriptUrl) return toast('Cole o endereço do script');
    $('#aStatus').textContent = 'Testando…';
    try { const r = await chamar({ acao: 'teste' }); $('#aStatus').textContent = '✅ Conectado à planilha "' + (r.planilha || '') + '"'; sincronizar(); }
    catch (e) { $('#aStatus').textContent = '❌ ' + e.message; }
  };
  $('#aEnviarTudo').onclick = () => {
    if (!cf.scriptUrl) return toast('Configure a planilha primeiro');
    S.sync.pedidos = S.pedidos.map(p => p.id); S.sync.clientes = true; S.sync.precos = true; salvar(); sincronizar(true);
  };
  $('#aRestaurar').onclick = restaurar;
  $('#aExp').onclick = () => compartilharBlob(new Blob([JSON.stringify({ app: 'pedidos-inplasul', versao: 1, em: new Date().toISOString(), clientes: S.clientes, precos: S.precos, pedidos: S.pedidos, config: { ...S.config, token: '' } })], { type: 'application/json' }), `backup-pedidos-inplasul-${hoje()}.json`);
  $('#aImp').onclick = () => $('#arquivoBackup').click();
}
$('#arquivoBackup').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const b = JSON.parse(await f.text());
    if (b.app !== 'pedidos-inplasul') throw new Error('arquivo não é um backup deste app');
    if (!confirm(`Substituir os dados do aparelho pelo backup de ${dataBR(b.em)}?\n${b.pedidos.length} pedidos, ${b.clientes.length} clientes.`)) return;
    const tok = S.config.token, url = S.config.scriptUrl;
    S.clientes = b.clientes; S.precos = b.precos; S.pedidos = b.pedidos;
    S.config = { ...S.config, ...b.config, token: tok, scriptUrl: url };
    ajustarNumero(); salvar(); toast('Backup restaurado'); ir('historico');
  } catch (err) { alert('Não foi possível importar: ' + err.message); }
});
function ajustarNumero() {
  const max = S.pedidos.reduce((m, p) => Math.max(m, p.numero || 0), 0);
  if (S.config.proxNumero <= max) S.config.proxNumero = max + 1;
}

// =====================================================================
// SINCRONIZAÇÃO COM A PLANILHA GOOGLE
// =====================================================================
function marcarPedido(id) { if (!S.sync.pedidos.includes(id)) S.sync.pedidos.push(id); }
async function chamar(req) {
  if (!S.config.scriptUrl) throw new Error('Planilha não configurada');
  const r = await fetch(S.config.scriptUrl, { method: 'POST', body: JSON.stringify({ ...req, token: S.config.token }) });
  let j;
  try { j = await r.json(); } catch (e) { throw new Error('Resposta inválida. Confira o endereço e se o script foi implantado com acesso "Qualquer pessoa".'); }
  if (!j.ok) throw new Error(j.erro || 'erro desconhecido');
  return j;
}
let sincronizando = false;
async function sincronizar(avisar) {
  if (!S.config.scriptUrl) { badge(); if (avisar === true) { toast('Configure a planilha em Ajustes'); } return; }
  if (sincronizando) return;
  if (!navigator.onLine) { badge(); if (avisar === true) toast('Sem internet. Os pedidos serão enviados quando conectar.'); return; }
  const ids = [...S.sync.pedidos], excl = [...(S.sync.excluir || [])], cli = S.sync.clientes, pre = S.sync.precos;
  if (!ids.length && !excl.length && !cli && !pre) { badge(); if (avisar === true) toast('Tudo sincronizado ✓'); return; }
  sincronizando = true; badge();
  S.sync.clientes = false; S.sync.precos = false;
  try {
    const req = { acao: 'salvar', pedidos: ids.map(id => S.pedidos.find(p => p.id === id)).filter(Boolean), excluir: excl };
    if (cli) req.clientes = S.clientes;
    if (pre) req.dados = { precos: S.precos, config: { ...S.config, token: '', scriptUrl: '' } };
    await chamar(req);
    S.sync.pedidos = S.sync.pedidos.filter(id => !ids.includes(id));
    S.sync.excluir = (S.sync.excluir || []).filter(id => !excl.includes(id));
    S.sync.ultima = new Date().toISOString(); S.sync.erro = '';
    if (avisar === true) toast('Planilha atualizada ✓');
  } catch (e) {
    if (cli) S.sync.clientes = true; if (pre) S.sync.precos = true;
    S.sync.erro = e.message; if (avisar === true) toast('Erro: ' + e.message);
  } finally {
    sincronizando = false; salvar(); badge();
    if (S.sync.pedidos.some(id => !ids.includes(id)) || (S.sync.clientes && !cli) || (S.sync.precos && !pre)) setTimeout(sincronizar, 500);
  }
}
function pendentes() { return S.sync.pedidos.length + (S.sync.excluir || []).length + (S.sync.clientes ? 1 : 0) + (S.sync.precos ? 1 : 0); }
function statusTexto() {
  if (!S.config.scriptUrl) return 'Planilha ainda não configurada.';
  const n = pendentes();
  return (n ? `${n} alteração(ões) aguardando envio.` : 'Tudo enviado para a planilha.') + (S.sync.ultima ? ' Último envio: ' + new Date(S.sync.ultima).toLocaleString('pt-BR') + '.' : '') + (S.sync.erro && n ? ' Último erro: ' + S.sync.erro : '');
}
function badge() {
  const b = $('#sync'); const n = pendentes();
  if (!S.config.scriptUrl) b.textContent = '⚠︎ sem planilha';
  else if (sincronizando) b.textContent = '↻ enviando…';
  else if (!n) b.textContent = '☁︎ salvo';
  else b.textContent = (navigator.onLine ? '⏳ ' : '⚡ offline · ') + n + ' pendente' + (n > 1 ? 's' : '');
  if ($('#aStatus') && !sincronizando) $('#aStatus').textContent = statusTexto();
}
async function restaurar() {
  if (!S.config.scriptUrl) return toast('Configure a planilha primeiro');
  if (!confirm('Trazer da planilha todos os pedidos, clientes e preços? Os dados deste aparelho serão substituídos.')) return;
  try {
    toast('Baixando da planilha…');
    const r = await chamar({ acao: 'carregar' });
    S.pedidos = r.pedidos || []; S.clientes = r.clientes || [];
    if (r.dados && r.dados.precos) S.precos = r.dados.precos;
    if (r.dados && r.dados.config) { const { token, scriptUrl } = S.config; S.config = { ...S.config, ...r.dados.config, token, scriptUrl }; }
    S.sync = { ...S.sync, pedidos: [], excluir: [], clientes: false, precos: false, erro: '' };
    ajustarNumero(); salvar(); badge();
    alert(`Restaurado: ${S.pedidos.length} pedidos e ${S.clientes.length} clientes.`);
    ir('historico');
  } catch (e) { alert('Não foi possível restaurar: ' + e.message); }
}
window.addEventListener('online', () => sincronizar());
window.addEventListener('offline', badge);
document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizar(); });

// ---------- Início ----------
window.App = { fechar: fecharModal, sincronizar };
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
ir(S.clientes.length ? 'novo' : 'clientes');
badge(); sincronizar();
})();
