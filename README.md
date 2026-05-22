# bernardocb.com

Personal site of Bernardo Calaça Brugnara, served by GitHub Pages from the `master` branch. Custom domain is wired via `CNAME`.

## Estrutura

```
.
├── index.html              # Home (bernardocb.com/) — CRT/synthwave landing + music player
├── 404.html                # GitHub Pages fallback; handles legacy redirects + outcomes-factory SPA
├── CNAME                   # Custom domain (bernardocb.com)
├── robots.txt              # Crawler rules
├── sitemap.xml             # Sitemap
│
├── assets/                 # Media usado pela home
│   ├── bg.mp4              #   Vídeo de fundo
│   ├── collact-folha-…png  #   Recorte da Folha (file viewer)
│   └── music/              #   Playlist do player (mp3s)
│
├── obrigado-stone/         # /obrigado-stone   — página de despedida da Stone
├── outcomes-factory/       # /outcomes-factory — SPA (single-page app, tem 404.html próprio)
│
├── old-projects/           # Arquivo de projetos antigos (sem manutenção ativa)
│   ├── index.html          #   Landing terminal escuro listando o arquivo
│   ├── bolao-oscar-2026/   #   Bolão do Oscar 2026
│   └── workshop/           #   Workshop IA — Purple Metrics
│       ├── workshop-backlog/   #   Backlog
│       ├── workshop-logs/      #   Logs
│       └── workshop-resumo/    #   Resumo
│
├── worker/                 # Cloudflare Worker (bernardocb-chat) — backend do workshop
└── scripts/                # Utilitários (feedback-loop.sh)
```

## Páginas publicadas

| URL                                     | Pasta                                |
| --------------------------------------- | ------------------------------------ |
| `/`                                  | `index.html`                         |
| `/obrigado-stone/`                   | `obrigado-stone/`                    |
| `/outcomes-factory/`                 | `outcomes-factory/` (SPA)            |
| `/old-projects/`                     | `old-projects/`                      |
| `/old-projects/bolao-oscar-2026/`    | `old-projects/bolao-oscar-2026/`     |
| `/old-projects/workshop/`            | `old-projects/workshop/`             |
| `/old-projects/workshop/workshop-*/` | `old-projects/workshop/workshop-*/`  |

URLs antigas (`/bolao-oscar-2026`, `/workshop`, `/workshop-backlog`, `/workshop-logs`, `/workshop-resumo`) redirecionam para `/old-projects/...` via `404.html`.

## Rodando localmente

Site estático — qualquer servidor de arquivos funciona:

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

## Deploy

Push para `master`. GitHub Pages publica automaticamente em ~1 min.

## Worker (backend do workshop)

```bash
cd worker
npm install
npm run dev      # wrangler dev local
npm run deploy   # publica em bernardocb-chat.bernardocb.workers.dev
```

Endpoints expostos: `/workshop/{chat,save,logs,summary,feedback,feedback/resolve}`. Bindings de KV definidos em `worker/wrangler.toml`.

## Scripts

`scripts/feedback-loop.sh` — loop que consulta feedback aprovado do workshop via API. Requer `WORKSHOP_ADMIN_TOKEN` exportado e `jq` instalado.
