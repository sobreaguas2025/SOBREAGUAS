# 📋 INSTRUÇÕES DE INSTALAÇÃO — Módulo Fechamento de Caixa
## SobreÁguas Distribuidora

---

## 📁 ARQUIVOS CRIADOS

| Arquivo         | Onde colocar              | Descrição                          |
|-----------------|---------------------------|------------------------------------|
| `relatorio.js`  | pasta `SCRIPT/`           | Lógica do relatório e fechamento   |
| `relatorio.css` | pasta `STYLE/`            | Estilos do modal (visual do painel)|

---

## 🔧 PASSO A PASSO DE INSTALAÇÃO

### 1. Copiar os arquivos

```
Seu projeto/
├── adm.html                  ← não muda nada aqui (só adiciona 3 linhas)
├── index.html
├── SCRIPT/
│   ├── script.js             ← original, sem tocar
│   └── relatorio.js          ← NOVO — copie aqui
└── STYLE/
    ├── style.css             ← original, sem tocar
    └── relatorio.css         ← NOVO — copie aqui
```

---

### 2. Adicionar no adm.html (apenas 3 linhas no final, antes de `</body>`)

Abra o `adm.html` e localize a linha:
```html
<!-- Login já tratado pelo fazerLogin() no script principal -->
```

**Logo ANTES** dessa linha, adicione:

```html
<!-- ============================================================
     MÓDULO: Fechamento de Caixa / Relatório PDF
     CDN do jsPDF (necessário para gerar o PDF)
============================================================ -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="SCRIPT/relatorio.js"></script>
```

**Pronto.** Não muda mais nada.

---

## ✅ O QUE ACONTECE AUTOMATICAMENTE

Depois de adicionar as 3 linhas:

1. O módulo injeta um **botão "Fechar Caixa"** na sidebar do ADM automaticamente
2. O botão aparece na seção **"Caixa"** na barra lateral esquerda, em amarelo
3. Ao clicar, abre um **modal** com todos os dados do dia atual
4. O modal mostra:
   - Total de vendas, entradas, saídas e saldo
   - Número de pedidos (concluídos, pendentes, cancelados)
   - Produtos vendidos com quantidade e valor
   - Lançamentos do dia
   - Equipe (funcionários cadastrados)
5. Botão **"Gerar PDF"** → baixa o arquivo automaticamente
6. Botão **"Apagar Dados do Dia"** → aparece após gerar o PDF
   - Pede confirmação antes de apagar
   - Apaga APENAS comandas e lançamentos do dia atual
   - NÃO apaga produtos, funcionários ou configurações

---

## 📂 ESTRUTURA DO PDF GERADO

```
caixa_YYYY-MM-DD.pdf
├── Cabeçalho (nome da empresa, data, hora)
├── Resumo Financeiro (cards: vendas, entradas, saídas, saldo)
├── Pedidos do Dia (total, concluídos, pendentes, cancelados)
├── Produtos Vendidos (tabela com qtd e valor por produto)
├── Lançamentos do Dia (receitas e despesas)
├── Equipe (funcionários cadastrados)
├── Fechamento do Caixa (saldo final destacado)
└── Rodapé (empresa, data/hora, paginação)
```

---

## ⚠️ OBSERVAÇÕES IMPORTANTES

- O módulo usa a **mesma conexão Firebase** já aberta pelo `script.js`
- Não conflita com nenhuma função existente
- Funciona em qualquer dispositivo com acesso à internet
- O PDF é gerado e salvo **localmente** no dispositivo (sem servidor)
- O botão só aparece **após o login** no painel ADM

---

## 🐛 PROBLEMAS COMUNS

### Botão não aparece na sidebar
→ Verifique se o `<script src="SCRIPT/relatorio.js">` está no `adm.html`
→ Faça logout e login novamente — o botão é injetado após o login

### "jsPDF não encontrado"
→ Verifique se o CDN do jsPDF está carregando (precisa de internet)
→ Confirme que a linha do CDN está ANTES da linha do `relatorio.js`

### Dados não aparecem no relatório
→ Verifique se o Firebase está conectado (ver console do navegador)
→ Confirme que há comandas/lançamentos com a data de hoje no banco

### PDF com caracteres errados
→ O jsPDF usa fonte padrão (helvetica) que não suporta acentos
→ Os valores monetários e números aparecem corretamente

---

## 📞 RESUMO RÁPIDO

```
1. Coloque relatorio.js em SCRIPT/
2. Coloque relatorio.css em STYLE/
3. Adicione no adm.html (antes de </body>):
   <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
   <script src="SCRIPT/relatorio.js"></script>
4. Pronto ✅
```
