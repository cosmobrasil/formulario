BEGIN;

ALTER TABLE public.questionarios
  ADD COLUMN IF NOT EXISTS relatorio_html TEXT;

COMMIT;
