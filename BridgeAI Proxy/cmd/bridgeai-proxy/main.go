package main

import (
	"log"
	"os"
	"path/filepath"

	"bridgeai-proxy/internal/app"
	"bridgeai-proxy/internal/storage"
)

func main() {
	baseDir, err := os.UserConfigDir()
	if err != nil {
		log.Fatal(err)
	}
	dataDir := filepath.Join(baseDir, "bridgeai-proxy")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		log.Fatal(err)
	}

	store, err := storage.Open(filepath.Join(dataDir, "bridgeai.db"))
	if err != nil {
		log.Fatal(err)
	}
	defer store.Close()

	if err := app.New(store).Run("127.0.0.1:8080"); err != nil {
		log.Fatal(err)
	}
}
