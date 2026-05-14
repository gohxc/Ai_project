package storage

import (
	"context"
	"path/filepath"
	"testing"

	"bridgeai-proxy/internal/model"
)

func TestStoreSavesAndActivatesProvider(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	ctx := context.Background()
	provider := &model.Provider{
		Name:     "local",
		BaseURL:  "http://127.0.0.1:9999",
		Model:    "test-model",
		Protocol: model.ProtocolOpenAI,
	}
	id, err := store.SaveProvider(ctx, provider)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.SetActiveProvider(ctx, id); err != nil {
		t.Fatal(err)
	}

	active, err := store.GetActiveProvider(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if active.ID != id || active.Model != "test-model" {
		t.Fatalf("unexpected active provider: %#v", active)
	}
}
