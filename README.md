# Eleições 2026 | Geografia eleitoral

Aplicação web interativa para explorar resultados presidenciais de 2026 por turno e território, usando dados oficiais do TSE e malhas geográficas do IBGE.

O projeto transforma dados públicos complexos em uma experiência visual para investigação territorial: mapas, filtros, rankings, tabela municipal, zonas eleitorais e perfil demográfico agregado do eleitorado.

> No primeiro turno, o painel compara Lula e Flávio Bolsonaro; isso não significa que o líder do recorte seja necessariamente o vencedor oficial entre todos os candidatos. No segundo turno, os resultados são exibidos para um candidato por vez, sem comparação entre turnos. Os gráficos demográficos do primeiro turno descrevem o perfil do eleitorado dos territórios, não o perfil individual de quem votou em cada candidato, pois o voto é secreto.

## Principais recursos

- Mapa interativo por estados, municípios e modo nacional detalhado.
- Seletor para consultar os turnos separadamente.
- Consulta do segundo turno por candidato, estado e município, sem cálculo de variações entre turnos.
- Filtros por região, estado, município e candidato líder.
- Zoom, pan, hover e seleção no mapa SVG.
- Destaque visual de capitais.
- Cores por candidato e tratamento neutro para margens exibidas como `0,00 p.p.`.
- Ranking de municípios mais equilibrados e maiores margens por candidato.
- Tabela municipal paginada com ordenação por margem, nome e percentual.
- Painel de detalhes para estado ou município selecionado.
- Modal de zonas eleitorais com resumo agregado de seções e comparecimento; no segundo turno, votos por zona do candidato selecionado.
- Seção de perfil do eleitorado no primeiro turno com idade, sexo e votos por região no recorte filtrado.
- Pipeline de dados para gerar JSONs estáticos a partir de fontes oficiais.
- Documentação técnica com arquitetura, modelo de dados, pipeline, decisões e estratégia de testes.

## Stack

- Next.js `16`
- React `19`
- TypeScript
- Tailwind CSS `4`
- SVG customizado para renderização cartográfica
- Dados estáticos em `public/data`
- Route Handler em `/api/election/zones` para detalhamento sob demanda por zona

## Fontes de dados

- Resultados eleitorais: arquivos oficiais de divulgação do TSE.
- Perfil do eleitorado: base `Eleitorado - 2026` do Portal de Dados Abertos do TSE.
- Geometria: malhas GeoJSON do IBGE.

O pipeline está em:

```text
scripts/election/generate-data.mjs
```

Ele gera:

```text
public/data/election/2026/president/turn-1/
public/data/geo/
```

## Como rodar

Requisitos:

- Node.js 20
- pnpm

Instale as dependências:

```bash
pnpm install
```

Rode em desenvolvimento:

```bash
pnpm dev
```

Abra:

```text
http://localhost:3000
```

Build de produção:

```bash
pnpm build
pnpm start
```

## Gerar dados novamente

O repositório já contém os dados gerados em `public/data`. Para atualizar a base a partir das fontes oficiais:

```bash
pnpm election:generate
```

Esse comando acessa serviços externos do TSE e do IBGE, baixa arquivos grandes e reescreve os JSONs/GeoJSONs estáticos.

Para atualizar apenas os resultados oficiais do segundo turno:

```bash
pnpm election:generate:turn-2
```

Esse comando salva os registros oficiais por candidato, estado e município em `public/data/election/2026/president/turn-2/`. O dashboard carrega esses arquivos quando o segundo turno é selecionado; a consulta apresenta um candidato por vez.

## Validação

Comandos usados para validar o projeto:

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

## Documentação

A documentação completa fica em [`docs/`](./docs):

- [`docs/overview.md`](./docs/overview.md): visão de produto.
- [`docs/architecture.md`](./docs/architecture.md): arquitetura da aplicação.
- [`docs/data-pipeline.md`](./docs/data-pipeline.md): geração e fontes de dados.
- [`docs/data-model.md`](./docs/data-model.md): modelo de dados.
- [`docs/map-strategy.md`](./docs/map-strategy.md): estratégia do mapa SVG.
- [`docs/design.md`](./docs/design.md): estrutura visual e UX.
- [`docs/testing.md`](./docs/testing.md): validação e lacunas de testes.
- [`docs/decisions/`](./docs/decisions): decisões arquiteturais.

## Limitações conhecidas

- A comparação de candidatos está hard-coded para Lula e Flávio Bolsonaro.
- O app tem uma única rota principal (`/`).
- O mapa é uma solução SVG própria, não uma biblioteca GIS completa.
- A seção demográfica é uma análise territorial agregada, não uma inferência sobre voto individual.
- Ainda não há suíte automatizada de testes unitários, integração ou E2E.

## Objetivo do projeto

Este projeto foi construído como um estudo aplicado de produto, visualização de dados e engenharia de dados públicos: uma SPA que combina exploração geográfica, performance razoável no client, pipeline reproduzível e cuidado metodológico na interpretação dos dados.
