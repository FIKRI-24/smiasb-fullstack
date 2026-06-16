ALTER TABLE chat_history
  DROP FOREIGN KEY fk_chat_history_instrumen,
  DROP INDEX idx_chat_history_user_instrumen_created,
  DROP INDEX idx_chat_history_instrumen,
  DROP COLUMN is_error,
  DROP COLUMN instrumen_id;
