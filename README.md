# Zonus — app de teste da esteira

Cada card da página é uma verificação real da plataforma, e os botões provocam
situações que o painel deve refletir.

## O que a página valida sozinha
- **Domínio e TLS**: por qual host/protocolo a visita chegou — funciona para o
  endereço automático e para **domínio próprio** (aba Domínios do serviço)
- **PORT** do ambiente, escutando em 0.0.0.0
- **Build**: o script `build` grava a data — novo push, nova data na página
- **Instância**: hostname do pod, versão do Node, memória
- **Proxy**: o IP do visitante chega via X-Forwarded-For
- **Variáveis**: defina `MENSAGEM_DE_TESTE` no painel e recarregue
- **Banco**: com um Postgres gerenciado vinculado, mostra a versão do servidor
- **Egress** e **disco efêmero**

## Testes interativos
- `/carga?segundos=15` — pico de CPU (veja as Métricas; com autoscaling, réplicas)
- `/memoria?mb=50` — memória retida em degraus
- `/morrer` — mata o processo; o Kubernetes reergue o pod (uptime zera)
- `/health` — usado como health check

Cada requisição é logada — acompanhe na aba Logs.
