# Prompt — Casos de teste Zenya (CSV Qase / padrão MaffContaby)

Use este texto no **Cadastro de Prompt** do MaffContaby (recomendado) ou em outra IA.

No MaffContaby a resposta deve ser **somente um CSV** — o sistema já exporta para o Qase. Não peça para criar pastas nem arquivos.

Cabeçalho obrigatório: `Suite,Subsuite,Title,Description,Preconditions,Steps,Expected Result,Priority,Tags`

Copie a partir de `# OBJETIVO`.

---

# OBJETIVO

Analise funcionalmente, EXCLUSIVAMENTE, o sistema web Zenya – Plataforma de Gestão Ergonômica:

https://demo.zenyadev.com.br/

O objetivo é realizar um levantamento funcional do sistema e gerar casos de teste funcionais completos, organizados em uma estrutura compatível com o CSV de geração usado no MaffContaby (importação posterior no Qase.io).

IMPORTANTE:

A análise deve ser realizada SOMENTE através do sistema web Zenya.

NÃO utilizar, consultar ou analisar:

- código-fonte de outros projetos
- repositórios locais
- arquivos de outros sistemas
- diretórios locais de outros projetos
- documentação de outros sistemas
- projetos existentes no computador
- informações de sistemas diferentes da Zenya

O único sistema considerado neste trabalho é:

https://demo.zenyadev.com.br/

==================================================
# 1. ACESSO AO SISTEMA
==================================================

Acessar o sistema:

https://demo.zenyadev.com.br/

Utilizar as credenciais disponíveis para acesso ao ambiente de demonstração.

Caso seja necessário realizar login, utilizar as credenciais fornecidas para o ambiente.

NÃO expor usuário ou senha nos arquivos gerados. Use placeholders genéricos (ex.: usuario_valido, senha_incorreta, senha_valida).

Após acessar o sistema, navegar pelas funcionalidades disponíveis e realizar um levantamento funcional completo.

==================================================
# 2. LEVANTAMENTO FUNCIONAL
==================================================

Antes de gerar os casos de teste, analisar o sistema Zenya de forma completa.

Navegar pelos menus, telas e funcionalidades disponíveis.

Identificar:

- Tela de login
- Dashboard
- Menus
- Submenus
- Cadastros
- Consultas
- Pesquisas
- Filtros
- AEP
- AET
- GHE
- Avaliações ergonômicas
- Diagnósticos
- Recomendações
- Planos de ação
- 5W2H
- Relatórios
- Empresas
- Setores
- Funções
- Colaboradores
- Usuários
- Perfis
- Permissões funcionais
- Configurações
- Notificações
- Exportações
- Outras funcionalidades existentes

ATENÇÃO:

A lista acima é apenas uma referência.

NÃO assumir que todas essas funcionalidades existem.

Criar casos de teste SOMENTE para funcionalidades realmente encontradas no sistema.

Se forem encontradas funcionalidades diferentes das listadas acima, incluí-las também.

==================================================
# 3. OBJETIVO DOS CASOS DE TESTE
==================================================

Criar casos de teste funcionais que validem o comportamento do sistema do ponto de vista do usuário.

Priorizar:

- Fluxos principais
- Regras de negócio
- Cadastros
- Alterações
- Exclusões
- Consultas
- Pesquisas
- Filtros
- Formulários
- Campos obrigatórios
- Validações apresentadas ao usuário
- Mensagens exibidas
- Navegação
- Permissões funcionais
- Relatórios
- Documentos
- AEP
- AET
- GHE
- Diagnósticos
- Recomendações
- Planos de ação
- 5W2H
- Status
- Aprovações, quando existirem
- Integrações percebidas pelo usuário

==================================================
# 4. LINGUAGEM DOS TESTES
==================================================

Os casos de teste devem utilizar linguagem:

- simples
- clara
- objetiva
- natural
- funcional
- fácil de entender

Os testes devem ser compreendidos por:

- QA funcional
- Product Owner
- Analista de Negócio
- Ergonomista
- Profissional de SST
- Usuário-chave
- Cliente

Escrever os casos como instruções para uma pessoa utilizar o sistema.

NÃO escrever os testes utilizando linguagem de programação.

==================================================
# 5. NÃO GERAR TESTES TÉCNICOS
==================================================

NÃO criar testes relacionados a:

- HTML
- DOM
- CSS
- JavaScript
- Console do navegador
- XPath
- Seletores
- IDs técnicos
- Classes CSS
- Componentes internos
- Eventos internos
- Código
- Funções
- Métodos
- Variáveis
- API
- Endpoint
- Request
- Response
- Status HTTP
- Payload
- Banco de dados
- SQL
- Logs técnicos
- Deploy
- Pipeline
- CI/CD
- Infraestrutura
- Servidor
- Container
- Framework
- Arquitetura
- Testes unitários
- Performance técnica

O objetivo é testar o comportamento funcional da Zenya.

==================================================
# 6. REGRA PRINCIPAL
==================================================

Sempre pensar:

"O que o usuário faz?"

e:

"O que o usuário espera que aconteça?"

Não pensar:

"Como o sistema foi desenvolvido?"

EXEMPLO:

NÃO escrever:

"Validar se a API retorna status 200 ao salvar a AET."

ESCREVER:

"Salvar uma AET preenchida corretamente."

Resultado esperado:

"A AET deve ser salva com sucesso e ficar disponível para consulta."

--------------------------------------------------

NÃO escrever:

"Validar persistência do registro no banco."

ESCREVER:

"Salvar o cadastro e pesquisar novamente pelo registro."

Resultado esperado:

"O registro salvo deve ser apresentado na pesquisa."

--------------------------------------------------

NÃO escrever:

"Validar execução do JavaScript."

ESCREVER:

"Preencher o campo com uma informação válida."

Resultado esperado:

"O sistema deve aceitar a informação e permitir continuar."

==================================================
# 7. CASOS POSITIVOS E NEGATIVOS
==================================================

Para cada funcionalidade relevante, avaliar a necessidade de criar:

- Cenário positivo
- Cenário negativo

Exemplo:

POSITIVO:

"Cadastrar empresa com dados válidos"

NEGATIVO:

"Não permitir cadastrar empresa sem informar os campos obrigatórios"

Não criar cenários negativos artificiais.

Os cenários devem representar situações reais de utilização.

Regra de ouro: 1 caso = 1 cenário. Nunca empilhe múltiplas validações independentes no mesmo caso.

==================================================
# 8. LOGIN
==================================================

Caso o login esteja disponível, criar casos para:

- Login com dados válidos
- Login com senha inválida
- Login com usuário inválido
- Login sem usuário
- Login sem senha
- Logout
- Recuperação de senha, caso exista

Testar somente o comportamento apresentado ao usuário.

==================================================
# 9. CADASTROS
==================================================

Para cada cadastro encontrado na Zenya, avaliar:

- Inclusão
- Consulta
- Alteração
- Exclusão, quando disponível
- Campos obrigatórios
- Dados inválidos
- Dados duplicados
- Cancelamento
- Confirmação
- Mensagens
- Pesquisa
- Filtros

Exemplo:

Título:

"Cadastrar empresa com dados válidos"

Pré-condição:

"Usuário autenticado e com acesso ao cadastro de empresas."

Ação:

"Informar os dados obrigatórios da empresa."

Resultado esperado:

"Os dados devem ser aceitos pelo sistema."

Ação:

"Clicar em Salvar."

Resultado esperado:

"A empresa deve ser cadastrada com sucesso."

==================================================
# 10. AEP
==================================================

Se o módulo AEP estiver disponível, analisar seu fluxo completo.

Criar casos para as funcionalidades realmente existentes, como:

- Criar AEP
- Preencher AEP
- Salvar AEP
- Alterar AEP
- Consultar AEP
- Excluir AEP, quando permitido
- Cancelar
- Campos obrigatórios
- Validações
- Avaliações
- Resultados
- Diagnóstico
- Recomendações
- Conclusão
- Status
- Geração de documentos ou relatórios

NÃO inventar etapas.

==================================================
# 11. AET
==================================================

Se o módulo AET estiver disponível, analisar o fluxo completo.

Criar casos para as funcionalidades realmente encontradas.

Considerar:

- Criar AET
- Preencher informações
- Selecionar informações disponíveis
- Realizar avaliação
- Registrar resultados
- Gerar diagnóstico
- Registrar recomendações
- Salvar
- Alterar
- Consultar
- Concluir
- Gerar documento ou relatório, quando disponível

Também criar cenários negativos para campos e informações obrigatórias.

==================================================
# 12. GHE
==================================================

Se houver GHE, avaliar:

- Criar
- Alterar
- Consultar
- Excluir, quando permitido
- Associar informações
- Pesquisar
- Filtrar
- Campos obrigatórios
- Dados inválidos

==================================================
# 13. DIAGNÓSTICO
==================================================

Caso exista funcionalidade de diagnóstico:

Testar funcionalmente:

- Criação
- Preenchimento
- Alteração
- Consulta
- Classificação
- Resultado
- Conclusão
- Salvamento
- Mensagens

==================================================
# 14. RECOMENDAÇÕES
==================================================

Caso existam recomendações:

Testar:

- Inclusão
- Alteração
- Exclusão
- Consulta
- Associação com avaliação
- Campos obrigatórios
- Salvamento
- Cancelamento

==================================================
# 15. PLANO DE AÇÃO / 5W2H
==================================================

Caso exista essa funcionalidade, avaliar:

- Criar plano
- Preencher informações
- Alterar
- Consultar
- Definir responsável
- Definir prazo
- Alterar status
- Salvar
- Cancelar
- Campos obrigatórios
- Pesquisa
- Filtros

==================================================
# 16. RELATÓRIOS
==================================================

Para cada relatório encontrado, avaliar:

- Acesso
- Filtros
- Pesquisa
- Geração
- Visualização
- Ausência de resultados
- Exportação, quando disponível

==================================================
# 17. PERMISSÕES
==================================================

Caso existam diferentes perfis de usuário, testar apenas permissões que possam ser verificadas através da utilização normal do sistema.

Exemplos:

- Acesso permitido
- Acesso não permitido
- Funcionalidades disponíveis para determinado perfil
- Restrição de acesso

NÃO testar permissões através de banco de dados, API ou código.

==================================================
# 18. ORGANIZAÇÃO NO QASE (SUITE / SUBSUITE)
==================================================

Organizar os casos em:

- Suites
- SubSuites, quando necessário
- Casos de teste

Os campos Suite e Subsuite são OBRIGATÓRIOS em todos os casos.

Não use uma única Suite para o sistema inteiro.

Exemplo:

Suite:

"AEP"

SubSuites:

"Cadastro"
"Avaliação"
"Diagnóstico"
"Recomendações"
"Conclusão"

Suite:

"AET"

SubSuites:

"Cadastro"
"Avaliação"
"Diagnóstico"
"Recomendações"
"Conclusão"

Suite:

"Cadastros"

SubSuites:

"Empresas"
"Setores"
"Funções"
"Colaboradores"
"GHE"

IMPORTANTE:

Essa estrutura é apenas uma sugestão.

Adaptar a organização às funcionalidades realmente encontradas na Zenya.

Não criar Suites para funcionalidades inexistentes.

Para cada módulo principal, garanta no MÍNIMO:

- 1 caso de caminho feliz
- 2 casos negativos ou de validação de campos
- 1 caso de mensagem/feedback
- 1 caso de permissão ou sessão, quando aplicável

==================================================
# 19. ESTRUTURA DE CADA CASO
==================================================

Cada caso de teste deve conter:

- Title (título)
- Description (descrição)
- Preconditions (pré-condição)
- Steps (passos/ações com resultado esperado de cada passo)
- Expected Result (resultado esperado geral do caso)
- Priority
- Tags
- Suite
- Subsuite

PADRÃO DE ESCRITA

- Título: comece com verbo no infinitivo + objeto + condição/resultado. Seja específico.
  - Exemplos bons:
    - "Realizar login com credenciais válidas"
    - "Cadastrar empresa com dados válidos"
    - "Impedir salvamento de AET sem campos obrigatórios"
  - Exemplos ruins (NÃO use): "Validar tela", "Testar login", "Verificar funcionamento".
- Description: 1 frase curta explicando a INTENÇÃO do teste (o porquê / qual regra está sendo coberta).
- Preconditions: estado inicial específico e verificável (ex.: "Usuário autenticado e com acesso ao cadastro de empresas"). Se não houver pré-condição, deixe vazio.
- Steps: ações no imperativo, concretas e observáveis pelo usuário. Cada passo descreve UMA ação e UM resultado esperado observável. Máximo de 7 passos por caso.
- Expected Result (de cada passo e do caso): descreva o que o usuário vê / sente / consegue confirmar — texto exato de mensagem quando possível, item visível, página/aba carregada, registro presente na lista, campo destacado, etc.

ANTI-PATTERNS PROIBIDOS

- Passos genéricos: "clicar no botão", "validar a tela", "verificar se funciona".
- Resultados esperados vagos: "funcionar corretamente", "tudo certo", "sem erros".
- Múltiplos cenários no mesmo caso (ex.: testar login válido E inválido no mesmo caso).
- Casos duplicados em Suites diferentes.
- Conteúdo técnico nos casos: HTML, CSS, JavaScript, console do navegador, requisições HTTP/API, banco de dados, performance, logs, código-fonte.
- Senhas, tokens ou dados sensíveis reais. Use placeholders (usuario_valido, senha_valida, senha_incorreta, email_existente).

CRITÉRIOS DE PRIORIDADE (use exatamente low, medium ou high)

- high: fluxos críticos de negócio, autenticação, segurança, cadastros centrais do sistema, qualquer risco de perda ou corrupção de dado.
- medium: validações de campo, fluxos secundários, mensagens de erro/sucesso, filtros, buscas, edições.
- low: navegação secundária, textos de ajuda, links institucionais, ajustes cosméticos observáveis.

Distribua as prioridades — NÃO marque tudo como medium.

PADRÃO DE TAGS (campo Tags, separadas por ponto e vírgula)

Use um vocabulário consistente. Combine 1 a 3 tags por caso, escolhendo entre:

- Categoria do teste: happy-path, negativo, validacao, boundary, permissao, sessao, navegacao, mensagem, busca, filtro, ordenacao, responsivo, acessibilidade.
- Tipo de execução: smoke, regressao, critico.

Não repita o nome da Suite ou Subsuite como tag.

==================================================
# 20. FORMATO CSV (OBRIGATÓRIO)
==================================================

Gerar CSV válido no padrão de geração do MaffContaby (não gerar XML).

A PRIMEIRA linha de cada arquivo CSV deve ser exatamente o cabeçalho:

Suite,Subsuite,Title,Description,Preconditions,Steps,Expected Result,Priority,Tags

Regras:

- Use vírgula (,) como separador de colunas.
- Envolva entre aspas duplas qualquer campo que contenha vírgula, quebra de linha ou aspas. Dentro de campo com aspas, escape aspas como "".
- O campo Steps deve vir formatado exatamente assim (com quebras de linha reais dentro do campo, envolvendo o conteúdo em aspas):

  1. Ação que o usuário realiza
  Resultado esperado: O que deve acontecer na tela

  2. Próxima ação
  Resultado esperado: ...

- Máximo de 7 passos por caso.
- Priority: somente low, medium ou high (em minúsculo).
- Tags: separadas por ponto e vírgula (ex.: happy-path;validacao;regressao).
- Suite e Subsuite são obrigatórios em todos os casos.
- Todo o texto em português do Brasil.
- Não use o CSV oficial Qase.io v2 (25 colunas). Use somente o cabeçalho de 9 colunas acima.
- Sem frase introdutória, sem comentários, sem markdown, sem blocos de código dentro do CSV.

EXEMPLO DE REFERÊNCIA (apenas estilo — NÃO inclua este caso na resposta se o módulo não existir na Zenya)

Suite: Autenticação
Subsuite: Login
Title: Realizar login com credenciais válidas
Description: Garantir que o usuário com credenciais corretas consiga acessar a área restrita.
Preconditions: Usuário usuario_valido cadastrado e ativo; navegador na tela de login.
Steps:

1. Informar o usuário usuario_valido no campo "Usuário".
Resultado esperado: O campo "Usuário" exibe o valor informado.

2. Informar a senha senha_valida no campo "Senha".
Resultado esperado: O campo "Senha" exibe os caracteres mascarados.

3. Clicar no botão "Entrar".
Resultado esperado: O sistema redireciona para a tela inicial autenticada e exibe o nome do usuário no topo.

Expected Result: Usuário autenticado, com sessão ativa e acesso aos módulos permitidos pelo seu perfil.
Priority: high
Tags: happy-path;smoke;critico

Linha CSV correspondente (o campo Steps contém quebras de linha reais, por isso vai entre aspas):

```
Suite,Subsuite,Title,Description,Preconditions,Steps,Expected Result,Priority,Tags
Autenticação,Login,Realizar login com credenciais válidas,Garantir que o usuário com credenciais corretas consiga acessar a área restrita,"Usuário usuario_valido cadastrado e ativo; navegador na tela de login.","1. Informar o usuário usuario_valido no campo ""Usuário"".
Resultado esperado: O campo ""Usuário"" exibe o valor informado.

2. Informar a senha senha_valida no campo ""Senha"".
Resultado esperado: O campo ""Senha"" exibe os caracteres mascarados.

3. Clicar no botão ""Entrar"".
Resultado esperado: O sistema redireciona para a tela inicial autenticada e exibe o nome do usuário no topo.","Usuário autenticado, com sessão ativa e acesso aos módulos permitidos pelo seu perfil.",high,happy-path;smoke;critico
```

==================================================
# 21. ARQUIVOS DE SAÍDA
==================================================

SE ESTE PROMPT FOR USADO NO MAFFCONTABY (Cadastro de Prompt + Gerar Casos de Teste):

- NÃO criar pastas
- NÃO gravar arquivos no disco
- NÃO criar documentacao-testes-qase
- NÃO criar inventario-funcional.md
- A resposta inteira deve ser UM único CSV com o cabeçalho:
  Suite,Subsuite,Title,Description,Preconditions,Steps,Expected Result,Priority,Tags
- O MaffContaby já salva e exporta o CSV para o Qase

SE ESTE PROMPT FOR USADO EM OUTRA IA / CHAT DO CURSOR (fora do MaffContaby):

Criar os arquivos na pasta do projeto ATUAL que estiver aberta no Cursor.

NÃO utilizar caminhos específicos de outros projetos.

NÃO utilizar:

C:\Sistemas\fabianofernandeseventos

NÃO utilizar qualquer outro diretório que não esteja relacionado ao projeto atual.

Criar uma pasta:

documentacao-testes-qase

dentro do projeto atual.

Exemplo:

documentacao-testes-qase/

    login.csv

    cadastros.csv

    aep.csv

    aet.csv

    ghe.csv

    diagnostico.csv

    recomendacoes.csv

    plano-acao.csv

    relatorios.csv

Cada arquivo CSV deve começar com o cabeçalho:

Suite,Subsuite,Title,Description,Preconditions,Steps,Expected Result,Priority,Tags

Caso o sistema possua poucos módulos, pode ser utilizado um único CSV.

==================================================
# 22. INVENTÁRIO FUNCIONAL
==================================================

No MaffContaby: NÃO gerar arquivo de inventário. A análise fica só na cabeça; a resposta é só o CSV.

Fora do MaffContaby, criar também:

documentacao-testes-qase/inventario-funcional.md

O documento deve apresentar:

1. Módulos encontrados
2. Funcionalidades encontradas
3. Quantidade de casos por módulo
4. Funcionalidades cobertas
5. Funcionalidades sem cobertura
6. Possíveis riscos funcionais

==================================================
# 23. REVISÃO DOS CASOS
==================================================

Depois de gerar os casos, revisar TODOS os casos.

Para cada caso verificar:

- O título está claro e começa com verbo no infinitivo?
- A descrição está simples?
- A pré-condição é necessária?
- As ações são compreensíveis?
- O resultado esperado é claro?
- O resultado pode ser observado pelo usuário?
- O caso representa uma funcionalidade real?
- Existe duplicidade?
- Existe linguagem técnica?
- Existe alguma validação de código?
- Existe alguma validação de API?
- Existe alguma validação de banco?
- Existe alguma validação de JavaScript?
- Existe algum teste de deploy?
- Existe algum teste de infraestrutura?
- Suite e Subsuite estão preenchidos?
- Priority é low, medium ou high?
- Há no máximo 7 passos?
- O CSV usa o cabeçalho de 9 colunas (não XML e não o CSV Qase v2)?

Se existir qualquer teste técnico, remover ou reescrever como teste funcional.

==================================================
# 24. TERMOS PROIBIDOS
==================================================

Antes de finalizar os arquivos, verificar se existem termos técnicos como:

DOM
HTML
CSS
JavaScript
API
endpoint
request
response
HTTP
payload
SQL
database
banco
query
XPath
selector
console
log
deploy
pipeline
CI/CD
framework
componente
evento
função
método
variável
código

Caso algum desses termos apareça em um caso de teste, revisar e reescrever.

==================================================
# 25. NÃO INVENTAR FUNCIONALIDADES
==================================================

Não inventar:

- telas
- campos
- mensagens
- regras de negócio
- permissões
- fluxos
- cálculos
- classificações
- resultados
- funcionalidades

Somente criar testes com base no que for realmente identificado na Zenya.

Quando uma funcionalidade não puder ser confirmada, registrar essa informação no inventário.

==================================================
# 26. COBERTURA
==================================================

Para cada funcionalidade relevante encontrada, avaliar a criação de:

- Pelo menos um cenário positivo
- Pelo menos um cenário negativo

Para cadastros, considerar:

- Inclusão
- Alteração
- Consulta
- Exclusão, quando disponível
- Campos obrigatórios

Para fluxos mais complexos:

- Fluxo principal
- Validações
- Cancelamento
- Alteração
- Conclusão
- Consulta
- Regras de negócio

Não criar casos apenas para aumentar a quantidade.

Priorizar qualidade e cobertura funcional.

==================================================
# 27. RESULTADO FINAL
==================================================

Ao finalizar, apresentar:

- Quantidade de Suites
- Quantidade de SubSuites
- Quantidade total de casos
- Quantidade de casos por módulo
- Funcionalidades encontradas
- Funcionalidades sem cobertura
- Possíveis riscos funcionais
- Arquivos gerados (CSV + inventário)
- Local onde os arquivos foram salvos

==================================================
# REGRA FINAL
==================================================

O trabalho deve ser realizado EXCLUSIVAMENTE sobre o sistema:

https://demo.zenyadev.com.br/

Não utilizar informações de outros sistemas.

Não utilizar diretórios de outros projetos.

Não utilizar código-fonte de outros sistemas.

Não utilizar arquivos de outros projetos.

Não assumir funcionalidades que não foram encontradas.

Não gerar XML.

Não gerar o CSV oficial Qase.io v2 (25 colunas).

O resultado deve parecer uma documentação criada por um QA funcional experiente.

Os testes devem ser:

- Claros
- Simples
- Funcionais
- Objetivos
- Orientados ao usuário
- Orientados às regras de negócio
- Fáceis de executar
- Fáceis de entender

A pergunta principal para cada caso deve ser:

"Se eu fosse um usuário utilizando a Zenya, o que eu faria e o que esperaria que acontecesse?"

No MaffContaby: faça o levantamento em silêncio e responda só com o CSV (um único arquivo lógico, sem prosa).

Fora do MaffContaby: somente gravar os CSVs em disco após concluir o levantamento funcional da Zenya.
