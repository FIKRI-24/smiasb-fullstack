ALTER TABLE chat_history
  ADD COLUMN instrumen_id INT NULL AFTER user_id,
  ADD COLUMN is_error TINYINT(1) NOT NULL DEFAULT 0 AFTER balasan,
  ADD INDEX idx_chat_history_instrumen (instrumen_id),
  ADD INDEX idx_chat_history_user_instrumen_created (user_id, instrumen_id, created_at),
  ADD CONSTRAINT fk_chat_history_instrumen
    FOREIGN KEY (instrumen_id) REFERENCES instrumen(id)
    ON DELETE SET NULL;
