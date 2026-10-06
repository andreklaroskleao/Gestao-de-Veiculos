# Rota — Gestão veicular

Aplicativo web mobile-first para organizar veículos, abastecimentos, manutenções, pneus, despesas e viagens. O app usa JavaScript modular, Firebase Authentication com Google, Cloud Firestore, Vite e Vercel. Usa links externos do Google Maps e Waze para navegacao, sem APIs de mapas; nao usa FIPE, Cloud Functions ou Firebase Storage.

## O que já está implementado

- Login e logout com Google e proteção da área autenticada.
- Cadastro de vários veículos e seletor de veículo ativo.
- Registros de abastecimento, manutenção, pneus, despesas e viagens; despesas podem ser ligadas a uma viagem.
- Viagens comecam em andamento; data final e KM final sao informados ao encerrar, e podem ser removidos ao reabrir. Despesas podem ser adicionadas e editadas depois da criacao.
- O relatorio de viagens identifica origem, destino e datas, soma despesas vinculadas e mostra o KM final apos o encerramento.
- Consumo calculado somente entre tanques cheios; intervalos que misturam combustíveis são omitidos da comparação.
- Custo real por km, totais financeiros e comparação baseada em dados do veículo.
- Histórico recente, gráficos simples, alertas por data/odômetro, tabelas editáveis e filtros financeiros.
- Compartilhamento por convite de e-mail com papéis de editor e visualizador. O convidado precisa entrar com essa conta Google para ativar o acesso.
- Relatório em PDF gerado no navegador, impressão, CSV e backup JSON.
- Regras e índices do Firestore no repositório.

As telas carregam até 250 itens mais recentes por coleção para limitar leituras. O backup JSON exporta os registros carregados na sessão. A importação de JSON e a paginação avançada ainda não estão nesta versão.

## Instalar como aplicativo

A publicacao HTTPS inclui manifesto, icones e service worker para permitir a instalacao como PWA. No Android, use o botao **Instalar aplicativo** ou o menu do navegador. No iPhone/iPad, abra no Safari, toque em **Compartilhar** e escolha **Adicionar a Tela de Inicio**. O app instalado abre em janela propria; consultar e sincronizar dados ainda requer conexao com a internet.

- Cartoes por conta guardam somente nome, instituicao, modalidade (credito ou debito) e quatro ultimos digitos. CVV e validade nao sao solicitados; despesas registram de 1 a 48 parcelas.
- Modulo de prestadores com telefone, endereco completo, CEP e atalhos de rota para Google Maps e Waze.

## 1. Instalar e executar

Instale Node.js 20.19+ ou 22.12+ e npm. No terminal, abra esta pasta e execute:

```bash
npm install
npm run dev
```

Abra o endereço local informado pelo Vite. Para criar a versão de produção:

```bash
npm run build
npm run preview
```

## 2. Configurar o Firebase

O arquivo `js/firebase-config.js` já contém a configuração Web que você forneceu. Esses valores identificam o projeto e são usados no cliente; não são credenciais administrativas. Não adicione chaves de Service Account ao frontend.

No [console do Firebase](https://console.firebase.google.com/project/gestaoveicular-klar):

1. Em **Authentication → Sign-in method**, ative **Google**.
2. Em **Authentication → Settings → Authorized domains**, confira `localhost` para desenvolvimento e adicione o domínio `*.vercel.app` ou o domínio próprio depois da publicação.
3. Em **Firestore Database**, crie o banco em modo de produção.
4. Publique as regras e os índices abaixo antes de usar os dados.

As regras negam acesso anônimo, protegem `ownerId`, validam quem pode escrever em cada veículo e mantêm convites pendentes restritos ao e-mail convidado. O convidado precisa autenticar uma vez para que o convite se transforme em compartilhamento por UID.

### Publicar regras e índices

Publique as regras atualizadas antes de usar cartoes, prestadores, viagens abertas ou parcelas. As regras abrangem `users/{uid}/paymentMethods`, `users/{uid}/serviceProviders`, o estado das viagens e parcelas nos lancamentos. Depois da publicacao, o app tenta remover a validade de cartoes antigos; confirme a limpeza ao entrar novamente.


Instale o Firebase CLI, autentique sua conta e publique este projeto:

```bash
npm install --global firebase-tools
firebase login
firebase deploy --only firestore:rules,firestore:indexes --project gestaoveicular-klar
```

Se preferir não instalar o CLI, copie `firestore.rules` em **Firestore → Rules** e os índices de `firestore.indexes.json` em **Firestore → Indexes**. Aguarde a criação dos índices antes de testar consultas.

## 3. Publicar na Vercel

1. Envie a pasta do projeto para um repositório Git seu.
2. Na Vercel, importe o repositório e defina `outputs/gestao-veicular` como diretório raiz se o repositório incluir pastas acima dele.
3. Use o comando de build `npm run build` e o diretório de saída `dist`.
4. Conclua a publicação e adicione o domínio exibido pela Vercel aos domínios autorizados do Firebase Authentication.

O `vercel.json` aplica o redirecionamento da SPA. Não há variáveis de ambiente administrativas. Se trocar o projeto Firebase, edite apenas `js/firebase-config.js`.

## Estrutura

```text
index.html
css/                  estilos separados por responsabilidade
js/auth.js            autenticação Google
js/firebase-config.js configuração Web pública
js/firebase-init.js   inicialização Firebase
js/firestore.js       operações e consultas do banco
js/calculations.js    cálculos centrais
js/validation.js      validações dos formulários
js/forms.js           formulários
js/views.js           telas e tabelas
js/reports.js         filtros, resumo e exportação
js/pdf.js             geração local de PDF
js/app.js             estado e navegação da interface
firestore.rules       regras de acesso
firestore.indexes.json índices das consultas
```

## Observações de uso

- Cadastre abastecimentos parciais com a quilometragem correta; o consumo é apurado quando houver dois abastecimentos marcados como tanque cheio.
- Não registre o mesmo pagamento em abastecimento/manutenção e novamente como despesa, para evitar duplicidade nos relatórios.
- Registros de viagem guardam despesas em `vehicles/{vehicleId}/trips/{tripId}/expenses`.
- Arquivar um veículo o remove da lista ativa sem apagar os dados. O botão de exclusão permanente remove também os registros e convites associados após confirmação.
- As regras do Firestore são a barreira de segurança. A interface também esconde ações incompatíveis com o papel, mas isso não substitui as regras publicadas.

## Verificação feita

Os arquivos JavaScript passaram pela verificação sintática do Node, os cálculos centrais foram conferidos com dados de exemplo e `npm audit` não encontrou vulnerabilidades nas dependências instaladas. O build de produção não pôde ser concluído neste ambiente: a política do sandbox bloqueou com `EPERM` a criação do processo filho usado pelo Vite/esbuild. Execute `npm run build` em um terminal local para confirmar o bundle. Login e operações remotas precisam ser conferidos no Firebase com Authentication, Firestore, regras e índices ativos.
