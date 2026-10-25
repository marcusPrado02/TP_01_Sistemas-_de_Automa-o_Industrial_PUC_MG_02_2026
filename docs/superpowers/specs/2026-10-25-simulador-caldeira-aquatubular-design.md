# Design — Simulador "Sistema de Geração de Vapor com Caldeira Aquatubular"

Data: 2026-10-25 · Autor do pedido: Marcus Prado Silva (TP 01 — Sistemas de Automação Industrial, PUC Minas, 2º/2026)

## 1. Intenção e porquê

O grupo (Lucas Dias Borges, Marcus Prado Silva, Marlon Bento Azevedo) apresenta o deck
**"Sistema de Geração de Vapor com Caldeira Aquatubular"** (versão 3 do .pptx). O slide 14 ("Demonstração —
A lógica rodando num mini-SCADA") precisa de um simulador próprio do grupo. Existe um simulador de referência
(`JosuePN2/simulador-caldeira`, Streamlit/Python) para outra versão da planta; o nosso deve ser **totalmente diferente
em código e visual**, mas simular **a mesma planta do P&ID atualizado** (`docs/referencia/pid-planta.png`, TAGs série 2xx).

O momento que importa: **Marcus opera o simulador ao vivo no projetor e a turma precisa VER o SIS atuando** —
a causa sendo detectada, o MFT disparando e a sequência de segurança acontecendo passo a passo.

## 2. Fonte da verdade

1. `docs/referencia/pid-planta.png` — P&ID (equipamentos, TAGs, ligações).
2. Deck v3: `~/Downloads/Sistema de Geração de Vapor com Caldeira Aquatubular (3).pptx` — limites, malhas, sequência de trip.
   (Os valores relevantes estão transcritos abaixo; o builder não precisa abrir o .pptx.)

Se P&ID e deck divergirem, vale o deck v3.

## 3. Objetivos

- Sinótico P&ID animado fiel à planta (todos os equipamentos e instrumentos da imagem).
- Três malhas de controle funcionando (PID simplificado) com faceplates auto/manual.
- SIS/BMS com os 7 intertravamentos e limites do deck v3, MFT com trava (latch), sequência de trip visível,
  purga temporizada e permissivos de partida.
- Cenários prontos acionáveis por botão e teclado.
- Dois eixos independentes de visualização/operação:
  - **Layout:** Sala de controle (padrão) · Matriz · Palco.
  - **Fonte de dados:** Simulação dinâmica (padrão) · Entrada manual por sliders.
- Rodar abrindo um link (GitHub Pages) e também localmente sem instalação.

## 4. Não-objetivos

- Simulação física rigorosa (termodinâmica, balanço de massa real). Dinâmica é didática, de primeira ordem.
- Backend, login, multiusuário, persistência de dados.
- Uso em celular como alvo principal (deve ao menos não quebrar; alvo é notebook + projetor 1366×768 a 1920×1080).
- Editar ou gerar o deck — o deck é responsabilidade do grupo.

## 5. Anti-objetivos (fracasso mesmo que "funcione")

- Parecer com o original: Streamlit, sliders como interface principal, mesmo layout ou trechos de código copiados.
- SIS escondido ou pequeno: se a turma não percebe o trip acontecendo no projetor, falhou.
- TAGs, limites ou nomes inconsistentes com o deck v3 (ex.: aparecer "LT-101", "TT-109" ou limite de 20%).
- Demo que trava, exige internet de CDN instável ou depende de passos de build.

## 6. Restrições (decididas)

- **Stack:** HTML + CSS + JavaScript puro (ES modules), sem build, sem framework. Decidido com o usuário.
- **Repositório:** `git@github.com:marcusPrado02/TP_01_Sistemas-_de_Automa-o_Industrial_PUC_MG_02_2026.git` (público, já existe, só tem README).
- **Deploy:** GitHub Pages a partir da branch `main` (raiz). O link entra no slide 14.
- **Idioma da interface:** português do Brasil.
- **Layout padrão = Sala de controle (A)**, com os outros modos alternáveis. Decidido com o usuário.
- **Modo sliders** como alternativa, no estilo do original. Pedido do usuário.

## 7. A planta

### 7.1 Equipamentos (do P&ID)

Tanque de alimentação → bomba **P-201** → **LV-201** → **Tambor / Caldeira aquatubular** (feixe tubular e fornalha, queimador)
→ **Superaquecedor** → **TV-205** → **Turbina** → **Gerador (G)**.
Rede de gás natural → **FV-206** → queimador. Ventilador / ar de combustão → **Damper** → fornalha.
Fornalha → **Chaminé e exaustão**.

### 7.2 Transmissores (10) — slide 6

| TAG | Variável | Unidade / faixa sugerida (minha escolha) | Valor normal |
|---|---|---|---|
| LT-201 | Nível do tambor | 0–100 % | 50 % (SP) |
| FT-202 | Vazão de água de alimentação | 0–100 % | segue LV-201 |
| FT-203 | Vazão de vapor | 0–100 % | ~60 % (carga) |
| PT-204 | Pressão do coletor de vapor | 0–100 bar | 60 bar (SP) |
| TT-205 | Temperatura do vapor superaquecido | 100–600 °C | 420 °C (SP) |
| FT-206 | Vazão de gás natural | 0–100 % | segue FV-206 |
| FT-207 | Vazão de ar de combustão | 0–100 % | segue damper (relação ar/gás) |
| AT-208 | O₂ nos gases de exaustão | 0–15 % | ~3 % |
| PT-210 | Pressão da fornalha (tiragem) | −20 a +20 mbar | ~−2 mbar |
| PT-211 | Pressão de suprimento de gás | 0–10 bar | ~4 bar |

Não existe TT-209 (removido no P&ID atualizado). Também aparece **PSV-230** (válvula de segurança no tambor):
mostrar como instrumento; ela "abre" visualmente se PT-204 > 85 bar (minha escolha), mas o SIS deve tripar antes (75 bar).

### 7.3 Malhas de controle — slide 10

| Malha | Medição → Controlador → Atuador | Setpoint | Ação |
|---|---|---|---|
| Nível | LT-201 → **LIC-201** → LV-201 | 50 % | nível baixo abre LV-201 |
| Pressão | PT-204 → **PIC-204** → FV-206 | 60 bar (minha escolha, nominal da folha de dados do slide 9) | pressão baixa abre FV-206 |
| Temperatura | TT-205 → **TIC-205** → TV-205 (spray) | 420 °C | temperatura alta abre TV-205 |

Supervisão (sem malha própria): FT-206/FT-207/AT-208 (relação ar/gás, O₂) e PT-210 (tiragem).
O damper segue o gás com relação ar/combustível fixa em operação normal e abre 100 % durante a purga.

Cada malha tem faceplate: PV, SP (editável), MV (% abertura), modo AUTO/MAN (em MAN o operador define a MV).
**A segurança tem prioridade:** com MFT ativo, FV-206 = 0 % independentemente da malha/modo.

### 7.4 SIS / BMS — matriz de causa e efeito (slide 12, valores do deck v3)

| TAG | Evento | Limite | Efeito |
|---|---|---|---|
| LSLL-221 | Nível muito baixo | LT-201 < 15 % | MFT: fecha FV-206 · apaga piloto · purga |
| LSHH-227 | Nível muito alto | LT-201 > 85 % | **Só alarme** + fecha/reduz LV-201 (sem MFT) |
| PSHH-222 | Pressão de vapor muito alta | PT-204 > 75 bar | MFT: fecha FV-206 · apaga piloto · purga |
| BE-223 | Perda de chama | digital | MFT: fecha FV-206 · apaga piloto · purga |
| PSLL-224 | Gás com pressão muito baixa | PT-211 < 1,5 bar | MFT: fecha FV-206 |
| PSHH-225 | Gás com pressão muito alta | PT-211 > 6,5 bar | MFT: fecha FV-206 |
| HS-226 | Botão de emergência | digital | MFT geral + bloqueia nova partida |

`MFT = LSLL-221 OR PSHH-222 OR BE-223 OR PSLL-224 OR PSHH-225 OR HS-226`

Efeitos do MFT (para os 6): FV-206 fecha, piloto apaga, damper abre para purga, alarme geral, trip da caldeira,
permissivo de partida bloqueado. (A matriz do deck lista "apaga piloto · purga" só em 3 causas; para manter a lógica
simples e segura, **todo MFT executa a sequência completa** — minha escolha; a matriz exibida na tela reproduz as
colunas do deck.)
**Decisão (aprovada pelo usuário ao pedir a implementação):** opção (a) — todo MFT executa a sequência completa e a
matriz na tela mostra isso; o grupo ajusta o texto do slide 12 se quiser. Colunas da matriz na tela:
Trip (MFT) · Fecha FV-206 · Apaga piloto · Purga · Alarme geral · Bloqueia partida · Fecha/reduz LV-201.

### 7.5 Sequência de trip — slide 13 (o centro da demo)

Máquina de estados do BMS:

```
OPERANDO ──causa──▶ TRIP/MFT (travado) ──▶ PURGA (contagem) ──▶ AGUARDANDO RESET ──reset──▶ PARTIDA ──▶ OPERANDO
```

1. **Detecta** — a chave/detector que causou fica destacada (sinótico + matriz + faixa do SIS).
2. **Dispara o MFT** — trava; não se desfaz sozinho quando a causa some (first-out: registra a primeira causa).
3. **Fecha a FV-206** — gás a 0 %, FT-206 cai.
4. **Apaga o piloto** — chama some no sinótico.
5. **Purga** — damper 100 %, FT-207 alto, contagem regressiva (padrão 30 s para a demo; real seriam minutos — minha escolha, ajustável 10–60 s).

Cada passo acende em sequência na faixa do SIS com pequeno intervalo (~0,6 s) para a turma acompanhar.

**Permissivos de partida** (todos verdes para habilitar RESET/partida — minha escolha):
nenhuma causa de MFT ativa · purga concluída · HS-226 liberado · nível entre 30 % e 70 % · PT-211 entre 1,5 e 6,5 bar.

**Partida:** ao confirmar, acende piloto, FV-206 sobe em rampa, malhas voltam para AUTO e a planta retorna ao regime.

### 7.6 Recuperação após o trip (minha escolha — evita demo travada no palco)

- Cenários de falha injetam uma falha **persistente** (P-201 parada, PT-211 baixa/alta, chama perdida etc.).
- **Tecla 0 / "Operação normal"** remove a falha injetada; **não** desfaz o MFT (o latch é o ponto da demo).
  A dinâmica de recuperação é acelerada (nível volta à faixa 30–70 % e PT-211 normaliza em ≤ 5 s).
- Acionar outro cenário durante um trip substitui a falha anterior.
- HS-226: tecla E alterna (pressiona/libera); botão na tela mostra estado travado.
- Durante o trip, a água de alimentação continua (LIC-201 segue em AUTO) — só o combustível é cortado.
- Fluxo típico no palco: **cenário → trip → purga (30 s) → 0 → R**. Total ≲ 45 s por cenário.

## 8. Comportamento

### 8.1 Simulação dinâmica (padrão)

Loop em ~10 passos/s. Modelo didático de primeira ordem (minha escolha de forma, o builder ajusta constantes para
o comportamento "parecer certo" em segundos, não minutos):
- Nível sobe com FT-202 e desce com FT-203.
- Pressão sobe com calor da chama (∝ FT-206 com chama acesa) e desce com FT-203.
- Temperatura sobe com o calor e desce com spray (TV-205).
- FT-207 segue o damper; AT-208 deriva da relação ar/gás (excesso de ar → O₂ alto); PT-210 levemente negativo com ventilador.
- Ruído pequeno nas medições para parecer instrumento real.
- Sem chama: pressão e temperatura decaem; turbina/gerador param de girar no sinótico.

Os cenários **injetam a perturbação** e deixam a dinâmica levar ao limite (ex.: "nível muito baixo" = bomba P-201 falha
→ nível cai até LSLL-221). O tempo até o trip deve ficar em poucos segundos (≤ 10 s) para a demo.

### 8.2 Entrada manual por sliders (alternativa)

A dinâmica pausa; aparece um painel lateral com um slider por transmissor (os 10) + checkboxes BE-223 e HS-226.
O SIS avalia direto os valores dos sliders (arrastar LT-201 para 14 % → LSLL-221 → MFT). Malhas calculam as MVs a partir
desses valores. Cenários, quando acionados nesse modo, posicionam os sliders.

Semântica (minha escolha): sliders são **medições**; atuadores (FV-206, piloto, damper, LV-201, TV-205) são estado separado
que o SIS e as malhas escrevem. Com MFT, FV-206 vai a 0 % e o damper a 100 % no sinótico mesmo que o slider FT-206 continue
alto (é exatamente "o que o sensor diz" vs. "o que o SIS manda"). Purga temporiza normalmente. Alternar S durante um trip
**preserva** o estado do SIS (o BMS é um só); ao voltar para dinâmica, a simulação parte dos valores atuais dos sliders.

### 8.3 Cenários (botões + atalhos de teclado)

| Tecla | Cenário |
|---|---|
| 0 | Operação normal |
| 1 | Nível muito baixo (LSLL-221) |
| 2 | Nível muito alto (LSHH-227 — só alarme) |
| 3 | Falha de chama (BE-223) |
| 4 | Vapor em sobrepressão (PSHH-222) |
| 5 | Gás com pressão baixa (PSLL-224) |
| 6 | Gás com pressão alta (PSHH-225) |
| E | Emergência (HS-226) |
| R | Reset / partida (se permissivos OK) |
| M | Alterna layout · S alterna fonte de dados |

(Os 6 do slide 14 + gás alto + normal.)

### 8.4 Alarmes e registro

Lista de eventos estilo SCADA com hora, TAG, descrição e estado (ativo / reconhecido / normalizado). Primeira causa (first-out)
marcada. Botão "reconhecer". Sem som por padrão (minha escolha; o projetor pode ter som ruim) — toggle opcional.

### 8.5 Tendências

Gráficos dos últimos ~2 min de LT-201, PT-204 e TT-205 com linhas de SP e de limite de trip. Desenhados em `<canvas>`
sem biblioteca externa (minha escolha — evita depender de CDN na hora da apresentação).

## 9. Tela

### 9.1 Layouts (alternáveis por botão no topo e tecla M)

- **Sala de controle (padrão):** coluna esquerda com cenários, faceplates LIC/PIC/TIC e RESET; centro com o sinótico P&ID animado;
  **faixa do SIS fixa no rodapé** com os 5 passos da sequência, a causa first-out, contagem da purga e permissivos.
  Tendências e alarmes em painel recolhível.
- **Matriz:** sinótico à esquerda; à direita a matriz causa × efeito ao vivo (linhas = 7 causas, colunas = efeitos);
  causa ativa acende a linha e os efeitos na hora.
- **Palco:** sinótico em tela cheia; no trip, um painel grande do SIS sobe por cima com a sequência e a contagem da purga.

Em todos os layouts o estado do MFT é sempre visível.

### 9.2 Sinótico

SVG desenhado à mão seguindo o P&ID: equipamentos, linhas e balões ISA com as TAGs 2xx, mesmas convenções do slide 7:
**contínua = processo · tracejada azul = controle · pontilhada vermelha = SIS/BMS**. Valores ao vivo ao lado dos transmissores;
válvulas mostram % de abertura; animação de fluxo nas linhas, chama no queimador, rotação da turbina;
no trip, as linhas de SIS da causa pulsam em vermelho até o bloco SIS/BMS.

Fidelidade (minha escolha): desenhar **apenas o que o P&ID mostra**. Só LSLL-221, LSHH-227 e BE-223 têm balão e linha vermelha
própria; PSHH-222, PSLL-224, PSHH-225 e HS-226 acendem como itens dentro do bloco SIS/BMS (que já os lista no P&ID) e, para
PSHH-222/PSLL-224/PSHH-225, o transmissor de origem (PT-204/PT-211) fica com contorno vermelho. A linha vermelha SIS → FV-206
pulsa em qualquer MFT. TV-205 é desenhada em linha como no P&ID; o faceplate a chama de "spray / atemperação".

### 9.3 Estilo visual (minha escolha)

Linguagem de **IHM de alto desempenho (ISA-101)**: fundo cinza-escuro neutro, equipamentos em cinza, cor reservada para o que é
anormal (vermelho = trip/alarme alto, âmbar = alarme, azul = controle, verde só em permissivos OK). Alto contraste e fontes grandes
para projetor. Claramente diferente do visual Streamlit do original. Fontes de sistema/locais (sem dependência de rede).

## 10. Qualidade

- Lógica pura (modelo, PID, SIS/máquina de estados, cenários) em módulos separados da interface e testada com `node --test`
  (Node já disponível; sem dependências npm).
- Testes cobrem no mínimo: cada um dos 7 intertravamentos no limite exato (15/85 %, 75 bar, 1,5/6,5 bar), latch do MFT,
  LSHH-227 sem MFT, FV-206 = 0 com MFT mesmo em MAN, permissivos bloqueando reset, purga concluindo.
- Verificação manual no navegador de todos os cenários antes de entregar.

## 11. Entregáveis

- Código na raiz do repositório (`index.html` servível pelo Pages).
- `README.md` em português: objetivo, link do Pages, como rodar local (abrir via servidor simples, ex. `python3 -m http.server`,
  pois ES modules não carregam via `file://`), TAGs, malhas, matriz, atalhos, como apresentar.
- `docs/referencia/pid-planta.png`.
- Push para `main` e GitHub Pages ativo — **só após confirmação do usuário** (ação externa).

## 12. Escopo e prioridade

Usuário pediu a implementação completa de uma vez (todos os layouts, as duas fontes de dados, tendências, log e testes).
Faixa de AT-208 ampliada para 0–21 % (O₂ do ar ambiente aparece durante a purga) — minha escolha.

## 13. Deixado para o builder

Estrutura de pastas/módulos, constantes do modelo dinâmico, detalhes de animação, tipografia exata, organização do CSS,
formato do log de eventos, desde que respeitem as seções acima.
