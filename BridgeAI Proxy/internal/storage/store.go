package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"time"

	_ "modernc.org/sqlite"

	"bridgeai-proxy/internal/model"
)

type Store struct {
	db *sql.DB
}

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if err := initSchema(db); err != nil {
		_ = db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

func initSchema(db *sql.DB) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS providers (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			base_url TEXT NOT NULL,
			api_key TEXT NOT NULL DEFAULT '',
			model TEXT NOT NULL,
			protocol TEXT NOT NULL,
			created_at TIMESTAMP NOT NULL,
			updated_at TIMESTAMP NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS app_settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);`,
	}
	for _, stmt := range stmts {
		if _, err := db.Exec(stmt); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *Store) ListProviders(ctx context.Context) ([]model.Provider, error) {
	activeID, _ := s.getActiveProviderID(ctx)

	rows, err := s.db.QueryContext(ctx, `SELECT id, name, base_url, api_key, model, protocol, created_at, updated_at FROM providers ORDER BY id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	providers := make([]model.Provider, 0)
	for rows.Next() {
		var p model.Provider
		if err := rows.Scan(&p.ID, &p.Name, &p.BaseURL, &p.APIKey, &p.Model, &p.Protocol, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		p.IsActive = activeID != nil && p.ID == *activeID
		providers = append(providers, p)
	}
	return providers, rows.Err()
}

func (s *Store) GetProvider(ctx context.Context, id int64) (model.Provider, error) {
	var p model.Provider
	err := s.db.QueryRowContext(ctx, `SELECT id, name, base_url, api_key, model, protocol, created_at, updated_at FROM providers WHERE id = ?`, id).
		Scan(&p.ID, &p.Name, &p.BaseURL, &p.APIKey, &p.Model, &p.Protocol, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return model.Provider{}, fmt.Errorf("provider %d not found", id)
	}
	return p, err
}

func (s *Store) SaveProvider(ctx context.Context, p *model.Provider) (int64, error) {
	now := time.Now().UTC()
	if p.Protocol != model.ProtocolOpenAI && p.Protocol != model.ProtocolAnthropic {
		return 0, fmt.Errorf("unsupported protocol %q", p.Protocol)
	}
	if p.ID == 0 {
		res, err := s.db.ExecContext(ctx, `INSERT INTO providers (name, base_url, api_key, model, protocol, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, p.Name, p.BaseURL, p.APIKey, p.Model, p.Protocol, now, now)
		if err != nil {
			return 0, err
		}
		id, err := res.LastInsertId()
		if err != nil {
			return 0, err
		}
		p.ID = id
		p.CreatedAt = now
		p.UpdatedAt = now
		return id, nil
	}
	res, err := s.db.ExecContext(ctx, `UPDATE providers SET name = ?, base_url = ?, api_key = ?, model = ?, protocol = ?, updated_at = ? WHERE id = ?`, p.Name, p.BaseURL, p.APIKey, p.Model, p.Protocol, now, p.ID)
	if err != nil {
		return 0, err
	}
	count, err := res.RowsAffected()
	if err != nil {
		return 0, err
	}
	if count == 0 {
		return 0, fmt.Errorf("provider %d not found", p.ID)
	}
	p.UpdatedAt = now
	return p.ID, nil
}

func (s *Store) SetActiveProvider(ctx context.Context, id int64) error {
	if _, err := s.GetProvider(ctx, id); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO app_settings(key, value) VALUES('active_provider_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, strconv.FormatInt(id, 10))
	return err
}

func (s *Store) GetActiveProvider(ctx context.Context) (model.Provider, error) {
	activeID, err := s.getActiveProviderID(ctx)
	if err != nil {
		return model.Provider{}, err
	}
	if activeID == nil {
		return model.Provider{}, errors.New("no active provider configured")
	}
	return s.GetProvider(ctx, *activeID)
}

func (s *Store) getActiveProviderID(ctx context.Context) (*int64, error) {
	var raw string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM app_settings WHERE key = 'active_provider_id'`).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return nil, err
	}
	return &id, nil
}
