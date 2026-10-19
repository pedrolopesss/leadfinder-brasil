# LeadFinder Brasil — PWA MVP

Aplicativo web progressivo para pesquisar negócios locais usando dados do OpenStreetMap, salvar leads no dispositivo e exportar CSV.

## O que está incluído
- Pesquisa por cidade, segmento e raio aproximado.
- Geocodificação via Nominatim e busca via Overpass API.
- Filtro para negócios sem site informado.
- Salvamento local, deduplicação, etapas simples de prospecção e exportação CSV.
- Interface responsiva e arquivos básicos de PWA/offline shell.

## Limitações importantes
- O MVP usa serviços públicos compartilhados, sem garantia de disponibilidade, cobertura ou tempo de resposta.
- A falta de um site nos dados do OpenStreetMap **não prova** que o negócio não tenha site.
- Telefones, endereços e sites podem estar ausentes ou desatualizados.
- O aplicativo não raspa Instagram nem coleta dados privados.
- Os leads ficam no armazenamento local deste navegador/dispositivo. Limpar os dados do navegador pode apagá-los; exporte CSV como backup.
- A busca precisa de internet. A interface e o shell básico podem abrir offline após a primeira visita.
- Respeite os termos e limites de uso do Nominatim e Overpass. Evite fazer muitas buscas seguidas.

## Como testar localmente
O service worker e a instalação PWA exigem HTTPS ou localhost. Para teste local, use um servidor estático em `localhost` (não abra o HTML diretamente por `file://`).

## Como publicar gratuitamente no GitHub Pages
1. Crie uma conta no GitHub e um repositório público chamado `leadfinder-brasil`.
2. Envie todos os arquivos e pastas deste projeto para a raiz do repositório.
3. Abra **Settings → Pages**.
4. Em **Build and deployment**, escolha **Deploy from a branch**, selecione `main` e `/ (root)`, e salve.
5. Aguarde a URL publicada. Abra no Android com Chrome.
6. No menu do Chrome, escolha **Instalar app** ou **Adicionar à tela inicial**.

## Fonte e atribuição
Os dados de negócios vêm de OpenStreetMap contributors: https://www.openstreetmap.org/copyright
Nominatim usage policy: https://operations.osmfoundation.org/policies/nominatim/
Overpass API: https://wiki.openstreetmap.org/wiki/Overpass_API
