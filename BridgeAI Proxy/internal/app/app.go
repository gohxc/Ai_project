package app

import (
	"fmt"
	"net/http"

	"bridgeai-proxy/internal/gui"
	"bridgeai-proxy/internal/proxy"
	"bridgeai-proxy/internal/storage"
)

type App struct {
	mux *http.ServeMux
}

func New(store *storage.Store) *App {
	mux := http.NewServeMux()
	guiServer := gui.New(store)
	proxyServer := proxy.NewHandler(store)

	mux.Handle("/", guiServer)
	mux.Handle("/providers", guiServer)
	mux.Handle("/providers/", guiServer)
	mux.Handle("/v1/chat/completions", proxyServer)
	mux.Handle("/v1/messages", proxyServer)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	return &App{mux: mux}
}

func (a *App) Run(addr string) error {
	fmt.Printf("BridgeAI Proxy listening on %s\n", addr)
	return http.ListenAndServe(addr, a.mux)
}
