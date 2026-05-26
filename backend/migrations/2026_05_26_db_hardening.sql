-- F4 PR-A DB hardening (Audit consolidado + ScrumDev AI)
-- Aplicar en orden. Idempotente donde se puede.

BEGIN;

-- 1) Drop tablas muertas (0 filas, redundantes con chat_messages)
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;

-- 2) FKs cross-tabla — solo si no existen ya
DO $$ BEGIN
  -- chat_messages -> projects (cascade)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_chat_messages_project') THEN
    ALTER TABLE chat_messages
      ADD CONSTRAINT fk_chat_messages_project
      FOREIGN KEY (project_key) REFERENCES projects(key) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_backlog_items_project') THEN
    ALTER TABLE backlog_items
      ADD CONSTRAINT fk_backlog_items_project
      FOREIGN KEY (project_key) REFERENCES projects(key) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_build_runs_project') THEN
    ALTER TABLE build_runs
      ADD CONSTRAINT fk_build_runs_project
      FOREIGN KEY (project_key) REFERENCES projects(key) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_brand_kits_project') THEN
    ALTER TABLE brand_kits
      ADD CONSTRAINT fk_brand_kits_project
      FOREIGN KEY (project_key) REFERENCES projects(key) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_visions_project') THEN
    ALTER TABLE project_visions
      ADD CONSTRAINT fk_project_visions_project
      FOREIGN KEY (project_key) REFERENCES projects(key) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_assets_project') THEN
    ALTER TABLE project_assets
      ADD CONSTRAINT fk_project_assets_project
      FOREIGN KEY (project_key) REFERENCES projects(key) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_human_decisions_project') THEN
    ALTER TABLE human_decisions
      ADD CONSTRAINT fk_human_decisions_project
      FOREIGN KEY (project_key) REFERENCES projects(key) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_policy_violations_project') THEN
    ALTER TABLE policy_violations
      ADD CONSTRAINT fk_policy_violations_project
      FOREIGN KEY (project_key) REFERENCES projects(key) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_nfr_captures_project') THEN
    ALTER TABLE nfr_captures
      ADD CONSTRAINT fk_nfr_captures_project
      FOREIGN KEY (project_key) REFERENCES projects(key) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_architecture_decisions_project') THEN
    ALTER TABLE architecture_decisions
      ADD CONSTRAINT fk_architecture_decisions_project
      FOREIGN KEY (project_key) REFERENCES projects(key) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_workflow_runs_project') THEN
    ALTER TABLE workflow_runs
      ADD CONSTRAINT fk_workflow_runs_project
      FOREIGN KEY (project_key) REFERENCES projects(key) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_code_artifacts_story') THEN
    ALTER TABLE code_artifacts
      ADD CONSTRAINT fk_code_artifacts_story
      FOREIGN KEY (story_id) REFERENCES backlog_items(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3) CHECK constraints (enum-as-string)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_chat_messages_role') THEN
    ALTER TABLE chat_messages ADD CONSTRAINT chk_chat_messages_role CHECK (role IN ('user','assistant','system'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_human_decisions_status') THEN
    ALTER TABLE human_decisions ADD CONSTRAINT chk_human_decisions_status CHECK (status IN ('pending','approved','rejected'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_backlog_items_priority') THEN
    ALTER TABLE backlog_items ADD CONSTRAINT chk_backlog_items_priority CHECK (priority IN ('low','medium','high','critical'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_backlog_items_status') THEN
    ALTER TABLE backlog_items ADD CONSTRAINT chk_backlog_items_status CHECK (status IN ('backlog','in_progress','done','blocked','cancelled'));
  END IF;
END $$;

-- 4) Indices compuestos para hot-paths
CREATE INDEX IF NOT EXISTS ix_backlog_proj_order ON backlog_items(project_key, order_index);
CREATE INDEX IF NOT EXISTS ix_build_proj_started ON build_runs(project_key, started_at DESC);
CREATE INDEX IF NOT EXISTS ix_chat_proj_user_created ON chat_messages(project_key, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_workflow_proj_created ON workflow_runs(project_key, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_corr_occurred ON audit_events(correlation_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_code_artifacts_story ON code_artifacts(story_id) WHERE story_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_human_decisions_proj_status ON human_decisions(project_key, status);

COMMIT;
