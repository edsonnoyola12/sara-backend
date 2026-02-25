-- Atomic append to conversation_history JSONB array.
-- Prevents race condition when two webhooks process the same lead concurrently.
-- p_max_entries: if > 0, keeps only the last N entries after appending.
--
-- Usage:
--   SELECT append_to_conversation_history('lead-uuid', '[{"role":"user","content":"hola"}]'::jsonb);
--   SELECT append_to_conversation_history('lead-uuid', '[...]'::jsonb, 30);

CREATE OR REPLACE FUNCTION append_to_conversation_history(
  p_lead_id UUID,
  p_entries JSONB,
  p_max_entries INT DEFAULT 0
) RETURNS void AS $$
DECLARE
  combined JSONB;
  arr_len INT;
BEGIN
  combined := COALESCE(
    (SELECT conversation_history FROM leads WHERE id = p_lead_id),
    '[]'::jsonb
  ) || p_entries;

  IF p_max_entries > 0 THEN
    arr_len := jsonb_array_length(combined);
    IF arr_len > p_max_entries THEN
      -- Keep last p_max_entries elements
      combined := (
        SELECT jsonb_agg(elem ORDER BY ord)
        FROM (
          SELECT elem, ord
          FROM jsonb_array_elements(combined) WITH ORDINALITY AS t(elem, ord)
          WHERE ord > (arr_len - p_max_entries)
        ) sub
      );
    END IF;
  END IF;

  UPDATE leads
  SET conversation_history = combined
  WHERE id = p_lead_id;
END;
$$ LANGUAGE plpgsql;
