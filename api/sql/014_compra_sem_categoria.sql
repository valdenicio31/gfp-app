-- 014: compra de fatura pode entrar sem categoria.

-- No cadastro manual a categoria sempre foi obrigatória, e a coluna nasceu
-- NOT NULL. Na importação isso não se sustenta: a fatura pode não trazer
-- categoria alguma, ou trazer uma que ainda não tem de-para. Obrigar um valor
-- ali significaria inventar classificação — e a importação inteira falhava com
-- erro 500 quando a fatura não vinha classificada.
--
-- Sem categoria é um estado legítimo: o relatório por categoria já soma o que
-- está sem classificação em "Outros", e a tela permite classificar depois.
alter table card_purchases alter column category drop not null;
