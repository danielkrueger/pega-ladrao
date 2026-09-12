# PEGA LADRÃO 2.5D (Keystone Kapers)

O clássico do Atari 2600 **Keystone Kapers** ("Pega Ladrão"), reimaginado em **2.5D** para rodar diretamente no navegador de computadores/notebooks e dispositivos móveis (celular e tablet).

Baseado na arquitetura e filosofia de alto desempenho do projeto [Penumbra](file:///C:/KB/opencode/penumbra): **zero dependências externas no frontend**, renderização procedural em Canvas 2D com visual 2.5D e paleta TIA de 8-bits, efeitos sonoros sintetizados em tempo real (Web Audio API), controles híbridos (teclado, gamepad e multitouch), PWA instalável offline e servidor Node.js com ranking.

---

## 🚀 Como Jogar Localmente

### Pré-requisitos
* Node.js (versão 18+)

### Execução Imediata (Zero Instalação)
```bash
node server.js
```
O servidor inicializa instantaneamente em:
👉 **http://localhost:3005**

### Testes Automatizados
```bash
npm test
```
Executa a suíte de testes com o test runner nativo do Node.js (`node --test`), cobrindo física, jogador, ladrão, escadas, elevador, colisões, manifesto PWA, ícones e API de ranking.

---

## 🎮 Controles

### 💻 No Computador / Notebook
| Ação | Tecla | Gamepad |
| :--- | :--- | :--- |
| **Mover Esquerda / Direita** | `←` / `→` ou `A` / `D` | D-Pad ou Analógico Esquerdo |
| **Pular** | `Espaço` ou `↑` ou `W` | Botão `A` / Cruz |
| **Abaixar / Agachar** | `↓` ou `S` | Botão `B` ou Analógico para baixo |
| **Entrar / Usar Elevador** | `E` ou `Enter` | Botão `X` / `Y` |
| **Filtro Retrô CRT** | `C` | — |
| **Silenciar / Ativar Som** | `M` | — |

> 💡 **Dica tática:** Agachar com `↓` é essencial no **Telhado** para desviar dos aviões biplanos voando baixo!

### 📱 No Celular / Tablet
* **D-Pad Virtual:** polegar esquerdo (`◄`, `►`, `▼`).
* **Botões de Ação:** polegar direito (`PULO`, `ELEV`).
* **Orientação:** Detecção automática de orientação. O jogo solicita girar o celular para a posição horizontal (*landscape*).
* **Instalável (PWA):** Pode ser adicionado à tela inicial como um aplicativo nativo.

---

## 🏢 Os 4 Andares da Loja de Departamentos

1. **1º Andar (Térreo) — Joias & Moda:**
   - Vitrines reluzentes, entrada da loja, elevador central e escada rolante à direita subindo para o 2º andar.
   - Obstáculos: carrinhos de compras desgovernados e bolas saltitantes.
2. **2º Andar — Eletrônicos & Discos:**
   - TVs de tubo CRT, aparelhos de som, escada rolante vindo do térreo (direita) e escada subindo para o 3º andar (esquerda).
   - Obstáculos: carrinhos mais rápidos, bolas e fogueiras/lixeiras acesas.
3. **3º Andar — Brinquedos & Jogos:**
   - Prateleiras de brinquedos, ursos, robôs, elevador central e escadas de acesso ao telhado à direita.
   - Obstáculos velozes.
4. **4º Andar — Telhado & Terraço:**
   - Céu noturno com estrelas, lua retrô e silhueta dos prédios da cidade ao fundo.
   - O ladrão Harry corre para o balão/dirigível de fuga na ponta esquerda!
   - Obstáculo especial: aviões biplanos voando à meia altura (exige agachar para desviar!).

---

## 📡 O Radar / Minimapa Retrô

Na parte inferior da tela, o clássico scanner de 4 trilhos mostra em tempo real:
* 🟢 **Policial Kelly:** ponto verde.
* 🔴 **Ladrão Harry:** ponto vermelho piscante.
* 🟡 **Elevador:** retângulo amarelo em movimento vertical contínuo entre os andares.

Permite planejar se vale a pena esperar o elevador abrir para subir direto ou acelerar pela escada rolante!

---

## 🔊 Áudio Procedural

Sem arquivos pesados de áudio: todos os sons são gerados no sintetizador da **Web Audio API** no chip de som emulado:
- Apito inicial de perseguição policial
- Pulo e quique elástico Atari
- Arrasto e choque metálico de carrinhos de compras
- Som de motor de avião biplano
- Sino ding do elevador
- Tic-tac de relógio sob pressão (quando faltam menos de 12 segundos)
- Fanfarra triunfal ao prender o ladrão

---

## 🏆 Ranking Global & Persistência

- Armazenamento em memória e arquivo local `data/ranking.json` nativo.
- Compatível automaticamente com **PostgreSQL** caso as variáveis de ambiente `PGHOST` ou `DATABASE_URL` estejam presentes.
- Proteção contra requisições forjadas com sessões assinadas de uso único via HMAC-SHA256.
