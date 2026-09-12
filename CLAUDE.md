# CLAUDE.md

Orientações e convenções para desenvolvimento no repositório **PEGA LADRÃO 2.5D**.

## Visão Geral

"PEGA LADRÃO 2.5D" — jogo inspirado em *Keystone Kapers* (Atari 2600 / Activision, 1983), desenvolvido em JavaScript puro (ES2015+) com renderização procedural sobre `<canvas>` em 2.5D, com física de plataforma, áudio procedural sintetizado em tempo real e suporte a mobile e notebook.

- `index.html`: Shell responsivo, canvas fullscreen, overlay de rotação e modal retrô de ranking.
- `game.js`: Engine completa do jogo (máquina de estados, renderizador 2.5D, física, IA do ladrão, elevador, escadas rolantes, sintetizador Web Audio e touch).
- `server.js`: Servidor HTTP leve com arquivos estáticos, geração de sessões assinadas e API de ranking (com persistência local em JSON e fallback automático/PostgreSQL).
- `manifest.webmanifest` & `service-worker.js`: Suporte completo a Progressive Web App (PWA) e cache offline em orientação landscape.

## Comandos Úteis

```bash
# Executar servidor
npm start         # ou "node server.js" (abre em http://localhost:3005)

# Executar testes
npm test          # ou "node --test"
```

## Arquitetura de `game.js`

1. **Coordenadas Virtuais:**
   - Resolução virtual estável com altura fixa `VH = 720`.
   - Largura virtual `VW = CW / S`, onde `S = CH / VH`.
   - `DPR` é limitado a 2 para garantir alta performance sem desperdício de GPU.

2. **Renderização 2.5D:**
   - 4 andares de 2600px de extensão (`LEVEL_WIDTH = 2600`).
   - Pisos com profundidade quadriculada em perspectiva (`drawFloorPerspective`).
   - Vitrines retrô com molduras tridimensionais e mercadorias temáticas por andar.
   - Escadas rolantes animadas ligando andares alternados.
   - Fosso e cabine do elevador central com cabos e portas pantográficas.
   - Personagens e obstáculos desenhados em blocos/voxels com paleta TIA e sombras projetadas.

3. **Entidades Principais:**
   - `PLAYER` (Oficial Kelly): Singleton com física de corrida, pulo, agachamento (duck) e atordoamento por colisão.
   - `THIEF` (Harry Hooligan): IA que percorre os andares em direção ao telhado e ao balão de fuga.
   - `ELEVATOR`: Máquina de estados (`open`, `closing`, `moving`, `opening`) que viaja entre os andares 1, 2 e 3.
   - `ESCALATORS`: Zonas de transporte diagonal que aceleram a corrida a favor e desaceleram contra.
   - `CARTS`, `BALLS`, `FIRES`, `PLANES`, `COLLECTIBLES`: Obstáculos e bônus por andar.

4. **Hook de Teste Automatizado:**
   - `window.__game` expõe: `getState()`, `setState(s)`, `getPlayer()`, `getThief()`, `getElevator()`, `catchThief()`, `tripPlayer()`, `setKey(k, v)`, `step(dt)` e `resetGame()`.

## Convenções de Código

- JavaScript moderno sem transpiler, sem bundler e sem dependências externas no cliente.
- Manter o código linear, limpo e direto.
- Textos de UI, notificações e instruções em português do Brasil (pt-BR).
