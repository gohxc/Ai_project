package proxy

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"bridgeai-proxy/internal/model"
	anthropicx "bridgeai-proxy/internal/transform/anthropic"
	openaix "bridgeai-proxy/internal/transform/openai"
)

type Store interface {
	GetActiveProvider(context.Context) (model.Provider, error)
	ListProviders(context.Context) ([]model.Provider, error)
	SaveProvider(context.Context, *model.Provider) (int64, error)
	SetActiveProvider(context.Context, int64) error
}

type Handler struct {
	store  Store
	client *http.Client
}

func NewHandler(store Store) *Handler {
	return &Handler{
		store:  store,
		client: &http.Client{},
	}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.URL.Path == "/v1/chat/completions":
		h.forward(w, r, "openai")
	case r.URL.Path == "/v1/messages":
		h.forward(w, r, "anthropic")
	default:
		http.NotFound(w, r)
	}
}

func (h *Handler) forward(w http.ResponseWriter, r *http.Request, inbound string) {
	provider, err := h.store.GetActiveProvider(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	upstreamReq, err := h.buildUpstreamRequest(r.Context(), provider, inbound, body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	resp, err := h.client.Do(upstreamReq)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for k, values := range resp.Header {
		if strings.EqualFold(k, "Content-Length") {
			continue
		}
		for _, v := range values {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func (h *Handler) buildUpstreamRequest(ctx context.Context, provider model.Provider, inbound string, body []byte) (*http.Request, error) {
	upstreamURL := strings.TrimRight(provider.BaseURL, "/") + providerPath(provider.Protocol)
	if provider.Protocol == model.ProtocolOpenAI && inbound == "openai" {
		return h.newRequest(ctx, upstreamURL, body, provider)
	}
	if provider.Protocol == model.ProtocolAnthropic && inbound == "anthropic" {
		return h.newRequest(ctx, upstreamURL, body, provider)
	}
	if inbound == "openai" && provider.Protocol == model.ProtocolAnthropic {
		var req openaix.ChatRequest
		if err := json.Unmarshal(body, &req); err != nil {
			return nil, err
		}
		system, messages := openaix.ToAnthropicSystem(req.Messages)
		converted := anthropicx.MessageRequest{
			Model:       provider.Model,
			MaxTokens:   1024,
			System:      system,
			Messages:    make([]anthropicx.Message, 0, len(messages)),
			Stream:      req.Stream,
			Temperature: req.Temperature,
			TopP:        req.TopP,
		}
		if req.MaxTokens != nil {
			converted.MaxTokens = *req.MaxTokens
		}
		for _, msg := range messages {
			converted.Messages = append(converted.Messages, anthropicx.Message{Role: msg.Role, Content: msg.Content})
		}
		payload, err := json.Marshal(converted)
		if err != nil {
			return nil, err
		}
		return h.newRequest(ctx, upstreamURL, payload, provider)
	}
	if inbound == "anthropic" && provider.Protocol == model.ProtocolOpenAI {
		var req anthropicx.MessageRequest
		if err := json.Unmarshal(body, &req); err != nil {
			return nil, err
		}
		messages := make([]openaix.Message, 0, len(req.Messages)+1)
		if strings.TrimSpace(req.System) != "" {
			messages = append(messages, openaix.Message{Role: "system", Content: req.System})
		}
		for _, msg := range req.Messages {
			messages = append(messages, openaix.Message{Role: msg.Role, Content: msg.Content})
		}
		maxTokens := req.MaxTokens
		converted := openaix.ChatRequest{
			Model:       provider.Model,
			Messages:    messages,
			Stream:      req.Stream,
			MaxTokens:   &maxTokens,
			Temperature: req.Temperature,
			TopP:        req.TopP,
		}
		payload, err := json.Marshal(converted)
		if err != nil {
			return nil, err
		}
		return h.newRequest(ctx, upstreamURL, payload, provider)
	}
	return nil, fmt.Errorf("unsupported protocol combination: inbound=%s provider=%s", inbound, provider.Protocol)
}

func (h *Handler) newRequest(ctx context.Context, url string, body []byte, provider model.Provider) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if provider.Protocol == model.ProtocolAnthropic {
		req.Header.Set("x-api-key", provider.APIKey)
		req.Header.Set("anthropic-version", "2023-06-01")
	} else {
		req.Header.Set("Authorization", "Bearer "+provider.APIKey)
	}
	return req, nil
}

func providerPath(protocol model.Protocol) string {
	switch protocol {
	case model.ProtocolAnthropic:
		return "/v1/messages"
	default:
		return "/v1/chat/completions"
	}
}
