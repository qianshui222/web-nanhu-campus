CREATE TABLE IF NOT EXISTS accounts (
  username VARCHAR(32) PRIMARY KEY,
  password_hash VARCHAR(100) NOT NULL,
  role_name VARCHAR(12) NOT NULL
);
CREATE TABLE IF NOT EXISTS campus_scene (
  id INT PRIMARY KEY,
  revision INT NOT NULL,
  document LONGTEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS personal_items (
  owner_name VARCHAR(32) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  item_id VARCHAR(64) NOT NULL,
  document LONGTEXT NOT NULL,
  PRIMARY KEY (owner_name, kind, item_id),
  FOREIGN KEY (owner_name) REFERENCES accounts(username)
);
CREATE TABLE IF NOT EXISTS scene_revisions (
  revision INT PRIMARY KEY,
  document LONGTEXT NOT NULL,
  editor VARCHAR(32) NOT NULL,
  published_at VARCHAR(32) NOT NULL,
  note VARCHAR(500) NOT NULL,
  restored_from INT
);
CREATE TABLE IF NOT EXISTS scene_drafts (
  owner_name VARCHAR(32) PRIMARY KEY,
  base_revision INT NOT NULL,
  document LONGTEXT NOT NULL,
  draft_token VARCHAR(36) NOT NULL,
  saved_at VARCHAR(32) NOT NULL,
  FOREIGN KEY (owner_name) REFERENCES accounts(username)
);
CREATE TABLE IF NOT EXISTS scene_migrations (
  migration_id VARCHAR(64) PRIMARY KEY
);
