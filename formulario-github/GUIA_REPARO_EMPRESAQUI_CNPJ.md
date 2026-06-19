# Guia de reparo da API EmpresaAqui e padronizacao da mensagem de CNPJ

## Objetivo

Padronizar o comportamento de qualquer aplicacao que consulte a API EmpresaAqui para CNPJ.

Regra unica de interface:

> `Conferir o numero do CNPJ - faca o preenchimento das informacoes abaixo`

Essa mensagem deve aparecer sempre que houver:

- CNPJ digitado com erro
- CNPJ inexistente
- retorno `404` da API
- falha de rede
- erro temporario do backend

O usuario nao deve ver erros tecnicos como `404`, `502`, `Falha no servidor` ou `CNPJ nao encontrado`.

## Escopo

Este guia serve para aplicar a mesma correcao em 3 aplicativos diferentes que usem a mesma integracao com a API EmpresaAqui.

Use o mesmo padrao em cada app:

1. Frontend principal do formulario
2. Aplicativo administrativo ou dashboard
3. Segundo dashboard, painel ou front-end que tambem consulte CNPJ

## Problema que este reparo resolve

Em alguns cenarios, a interface mostra mensagens diferentes para o mesmo tipo de falha:

- `❌ CNPJ nao encontrado.`
- `❌ Falha no servidor (404). Tente novamente.`
- mensagens de erro de rede ou resposta invalida

Isso gera confusao no usuario e mistura problema de dado informado com problema de API.

## Solucao padrao

### 1. Frontend

Toda tela que consultar CNPJ deve:

- validar o campo com 14 digitos
- tentar consultar a API
- em caso de qualquer falha, mostrar sempre a mesma mensagem amigavel
- registrar o detalhe tecnico apenas no console

Exemplo:

```js
const CNPJ_ERROR_MESSAGE = 'Conferir o numero do CNPJ - faca o preenchimento das informacoes abaixo';

function mostrarErroCNPJ() {
  mostrarFeedbackCNPJ(CNPJ_ERROR_MESSAGE, 'text-red-600');
}
```

Uso:

```js
if (cnpj.length !== 14) {
  mostrarErroCNPJ();
  return;
}

try {
  const response = await fetch(`/api/cnpj/${cnpj}`);
  const data = await response.json();

  if (!response.ok || !data.success) {
    console.warn('Falha na consulta de CNPJ:', { response, data });
    mostrarErroCNPJ();
    return;
  }

  // preencher campos do formulario
} catch (error) {
  console.error('Erro na consulta de CNPJ:', error);
  mostrarErroCNPJ();
}
```

### 2. Backend

O backend pode continuar retornando erros tecnicos para monitoramento, mas o frontend nao deve expor esses detalhes.

Recomendacao:

- manter a rota `GET /api/cnpj/:cnpj`
- retornar JSON consistente
- registrar detalhes tecnicos no log do servidor
- nao depender da mensagem do provedor para o texto exibido ao usuario

Exemplo de resposta tecnica:

```json
{
  "success": false,
  "error": "CNPJ nao encontrado."
}
```

Mesmo assim, a interface deve exibir apenas:

`Conferir o numero do CNPJ - faca o preenchimento das informacoes abaixo`

## Pontos para revisar em cada aplicativo

### A. Configuracao da base da API

Verificar se o app nao depende apenas de `window.location` ou de um redirect externo fragil.

Boas praticas:

- usar uma `API_URL` explicita em producao
- manter `localhost` para desenvolvimento
- evitar base vazia quando o app esta em producao

### B. Funcao de consulta

Localizar o trecho que faz:

- `fetch('/api/cnpj/...')`
- ou `fetch(`${API_URL}/api/cnpj/...`)`

Trocar qualquer mensagem especifica por uma mensagem unica e padronizada.

### C. Tratamento de erro

Em qualquer bloco `catch`, `else` ou status nao-OK:

- nao mostrar status HTTP para o usuario
- nao mostrar `CNPJ nao encontrado`
- nao mostrar `Falha no servidor (404)`
- mostrar sempre a mensagem unica

### D. Logs internos

Manter logs apenas para depuracao:

```js
console.warn('Falha na consulta de CNPJ:', { response, data, error });
```

## Checklist de implementacao nos 3 apps

Para cada aplicativo:

- [ ] localizar a tela ou componente que consulta o CNPJ
- [ ] criar a constante `CNPJ_ERROR_MESSAGE`
- [ ] substituir mensagens diferentes pela mensagem unica
- [ ] garantir que erros de rede caiam no mesmo fluxo
- [ ] validar que a API continua preenchendo os dados quando responde com sucesso
- [ ] testar CNPJ valido
- [ ] testar CNPJ invalido
- [ ] testar backend fora do ar
- [ ] testar resposta `404`
- [ ] confirmar que a UI mostra sempre a mesma mensagem

## Aplicacao pratica em 3 apps

### App 1

Aplicar no formulario principal.

Arquivos tipicos:

- `index.html`
- arquivo JS do formulario, por exemplo `app-postgres.js`

### App 2

Aplicar no segundo front-end que use consulta de CNPJ.

Regras:

- localizar a funcao de consulta
- padronizar a mensagem
- manter log tecnico no console

### App 3

Aplicar no terceiro front-end ou painel que use a mesma API.

Regras:

- mesmo texto padrao
- mesma validacao de erro
- mesma experiencia de usuario

## Referencia de comportamento desejado

- Se o usuario digitar um CNPJ invalido: mostrar a mensagem unica
- Se a API EmpresaAqui responder 404: mostrar a mensagem unica
- Se o backend cair: mostrar a mensagem unica
- Se a resposta vier em formato inesperado: mostrar a mensagem unica

## Observacao final

Este padrao evita confusao e deixa a experiencia do usuario previsivel.

Se for necessario diagnostico tecnico, usar apenas os logs internos e o console do servidor.
