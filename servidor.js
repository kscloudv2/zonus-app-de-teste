// Servidor de teste da Zonus: cada card é uma verificação REAL da plataforma,
// e os botões do fim provocam situações que o painel deve mostrar (carga nas
// métricas, morte do processo com restart automático).
const http = require('node:http');
const os = require('node:os');
const { readFileSync, writeFileSync } = require('node:fs');

const PORTA = Number(process.env.PORT ?? 3000);
const INICIO = new Date();

let infoDoBuild = null;
try { infoDoBuild = JSON.parse(readFileSync('info-do-build.json', 'utf8')); } catch {}

async function testarBanco() {
  if (!process.env.DATABASE_URL) {
    return { ok: null, detalhe: 'DATABASE_URL ausente — crie um banco gerenciado e ele entra sozinho no ambiente' };
  }
  try {
    const { Client } = require('pg');
    const cliente = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 4000 });
    await cliente.connect();
    const r = await cliente.query('SELECT version()');
    await cliente.end();
    return { ok: true, detalhe: r.rows[0].version.slice(0, 70) };
  } catch (erro) {
    return { ok: false, detalhe: String(erro.message).slice(0, 120) };
  }
}

async function testarSaida() {
  // Qualquer RESPOSTA HTTP prova a saída: o pedido chegou ao servidor e voltou.
  // Só "não conectou" (exceção) é falha de egress — um 403/429 do outro lado
  // ainda é a internet funcionando. (api.github.com dava 403 por rate limit do
  // IP e o card ficava vermelho sem motivo.)
  try {
    const r = await fetch('https://example.com', { signal: AbortSignal.timeout(4000) });
    return { ok: true, detalhe: `GET example.com → HTTP ${r.status}: os apps têm internet de saída` };
  } catch (erro) {
    return { ok: false, detalhe: `sem saída para a internet: ${String(erro.message).slice(0, 80)}` };
  }
}

function testarDisco() {
  try {
    writeFileSync('/tmp/zonus-teste.txt', String(Date.now()));
    return { ok: true, detalhe: 'escrita em /tmp ok (disco efêmero do pod)' };
  } catch (erro) {
    return { ok: false, detalhe: String(erro.message).slice(0, 80) };
  }
}

function card(titulo, ok, detalhe) {
  const cor = ok === true ? '#4ade80' : ok === false ? '#f87171' : '#f59e0b';
  const icone = ok === true ? '✓' : ok === false ? '✗' : '·';
  return `<div style="border:1px solid #ffffff22;border-radius:10px;padding:14px 16px;background:#16162b">
    <div style="display:flex;gap:10px;align-items:center">
      <span style="color:${cor};font-weight:700;font-size:18px">${icone}</span>
      <strong>${titulo}</strong>
    </div>
    <div style="margin-top:6px;font-size:13px;color:#f5f0e8aa;font-family:ui-monospace,monospace;word-break:break-all">${detalhe}</div>
  </div>`;
}

function botao(rotulo, url, aviso) {
  const confirmacao = aviso ? `onclick="return confirm('${aviso}')"` : '';
  return `<a href="${url}" ${confirmacao} style="display:inline-block;border:1px solid #ffffff33;border-radius:8px;padding:8px 14px;color:#f5f0e8;text-decoration:none;font-size:13px;background:#1b1b30">${rotulo}</a>`;
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://interno');

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  // Queima CPU por N segundos: as MÉTRICAS do painel devem mostrar o pico —
  // e, com autoscaling ligado, réplicas novas devem nascer.
  if (url.pathname === '/carga') {
    const segundos = Math.min(Number(url.searchParams.get('segundos') ?? 15), 60);
    const fim = Date.now() + segundos * 1000;
    while (Date.now() < fim) Math.sqrt(Math.random());
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(`<meta charset="utf-8">CPU queimada por ${segundos}s nesta instância (${os.hostname()}). Confira a aba Métricas. <a href="/">voltar</a>`);
  }

  // Aloca memória (fica retida): o gráfico de memória deve subir em degraus.
  if (url.pathname === '/memoria') {
    const mb = Math.min(Number(url.searchParams.get('mb') ?? 50), 300);
    global.__lastro = global.__lastro ?? [];
    global.__lastro.push(Buffer.alloc(mb * 1048576, 1));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(`<meta charset="utf-8">+${mb} MB retidos (total RSS ${Math.round(process.memoryUsage().rss / 1048576)} MB). <a href="/">voltar</a>`);
  }

  // Mata o processo: o Kubernetes deve reerguer o pod sozinho — recarregue a
  // página alguns segundos depois e o uptime terá zerado.
  if (url.pathname === '/morrer') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<meta charset="utf-8">Morrendo... recarregue a página inicial em ~10s: o pod volta sozinho e o uptime zera.');
    return setTimeout(() => process.exit(1), 300);
  }

  const [banco, saida] = await Promise.all([testarBanco(), testarSaida()]);
  const disco = testarDisco();
  const host = req.headers.host ?? '(sem host)';
  const proto = String(req.headers['x-forwarded-proto'] ?? 'http');
  const visitante = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '?').split(',')[0];
  const varsProprias = Object.keys(process.env).filter((k) => !k.startsWith('KUBERNETES_') && !k.startsWith('npm_'));

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Zonus · app de teste</title></head>
  <body style="margin:0;background:#10101f;color:#f5f0e8;font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:32px 16px">
  <div style="max-width:680px;margin:0 auto">
    <p style="font-family:ui-monospace,monospace;font-size:12px;letter-spacing:.1em;color:#be123c;text-transform:uppercase">Zonus · esteira verificada</p>
    <h1 style="margin:8px 0 24px;font-size:28px">Este deploy é de verdade 🎉</h1>
    <div style="display:grid;gap:10px">
      ${card('Aplicação no ar', true, `desde ${INICIO.toLocaleString('pt-BR')} · uptime ${Math.round(process.uptime())}s — use /morrer e veja zerar`)}
      ${card('Domínio e TLS desta visita', proto === 'https', `${proto}://${host} — aponte um domínio próprio na aba Domínios e acesse por ele: este card deve continuar verde com o SEU host`)}
      ${card('Porta veio do ambiente (PORT)', Boolean(process.env.PORT), process.env.PORT ? `PORT=${PORTA}, escutando em 0.0.0.0` : 'PORT ausente — usando 3000')}
      ${card('Build da plataforma executou', Boolean(infoDoBuild), infoDoBuild ? `script build rodou em ${new Date(infoDoBuild.construidoEm).toLocaleString('pt-BR')} — novo push, nova data` : 'info-do-build.json não encontrado')}
      ${card('Instância (pod)', true, `${os.hostname()} · Node ${process.version} · ${Math.round(process.memoryUsage().rss / 1048576)} MB RSS`)}
      ${card('Proxy/ingress repassa o visitante', Boolean(req.headers['x-forwarded-for']), `você chegou de ${visitante}`)}
      ${card('Variáveis de ambiente', true, `${varsProprias.length} visíveis${process.env.MENSAGEM_DE_TESTE ? ` · MENSAGEM_DE_TESTE="${process.env.MENSAGEM_DE_TESTE}"` : ' · defina MENSAGEM_DE_TESTE no painel e recarregue'}`)}
      ${card('Banco gerenciado (DATABASE_URL)', banco.ok, banco.detalhe)}
      ${card('Rede de saída (egress)', saida.ok, saida.detalhe)}
      ${card('Disco efêmero', disco.ok, disco.detalhe)}
    </div>
    <h2 style="margin:28px 0 10px;font-size:16px">Testes interativos</h2>
    <p style="margin:0 0 12px;font-size:13px;color:#f5f0e8aa">Provoque a plataforma e confira a reação no painel (Métricas, Logs, status do pod):</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${botao('Queimar CPU por 15s', '/carga?segundos=15')}
      ${botao('Reter +50 MB de memória', '/memoria?mb=50')}
      ${botao('💀 Derrubar o processo', '/morrer', 'O pod vai morrer e o Kubernetes deve reergue-lo sozinho. Continuar?')}
    </div>
    <p style="margin-top:24px;font-size:12px;color:#f5f0e866">Cada requisição é logada — confira a aba Logs em tempo real. Recarregue após um novo git push para ver a data de build mudar.</p>
  </div></body></html>`;
  console.log(`${new Date().toISOString()} ${req.method} ${url.pathname} de ${visitante} via ${host}`);
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
});

servidor.listen(PORTA, '0.0.0.0', () => console.log(`no ar na porta ${PORTA}`));
