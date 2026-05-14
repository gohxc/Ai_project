package proxy

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"bridgeai-proxy/internal/model"
)

type fakeStore struct {
	provider model.Provider
}

func (s fakeStore) GetActiveProvider(context.Context) (model.Provider, error) {
	return s.provider, nil
}

func (s fakeStore) ListProviders(context.Context) ([]model.Provider, error) {
	return []model.Provider{s.provider}, nil
}

func (s fakeStore) SaveProvider(context.Context, *model.Provider) (int64, error) {
	return 1, nil
}

func (s fakeStore) SetActiveProvider(context.Context, int64) error {
	return nil
}

func TestOpenAIToAnthropicConversion(t *testing.T) {
	var upstreamBody map[string]any
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/messages" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("x-api-key") != "secret" {
			t.Fatal("missing x-api-key")
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(body, &upstreamBody); err != nil {
			t.Fatal(err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"msg_1","type":"message"}`))
	}))
	defer upstream.Close()

	handler := NewHandler(fakeStore{provider: model.Provider{
		BaseURL:  upstream.URL,
		APIKey:   "secret",
		Model:    "claude-test",
		Protocol: model.ProtocolAnthropic,
	}})

	body := `{"model":"ignored","messages":[{"role":"system","content":"sys"},{"role":"user","content":"hello"}],"stream":true,"max_tokens":77}`
	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(body))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d body=%s", res.Code, res.Body.String())
	}
	if upstreamBody["model"] != "claude-test" || upstreamBody["system"] != "sys" || upstreamBody["stream"] != true {
		t.Fatalf("unexpected upstream body: %#v", upstreamBody)
	}
}
