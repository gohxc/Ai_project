package openai

import (
	"strings"

	"bridgeai-proxy/internal/model"
)

type ChatRequest struct {
	Model       string    `json:"model"`
	Messages    []Message `json:"messages"`
	Stream      bool      `json:"stream,omitempty"`
	MaxTokens   *int      `json:"max_tokens,omitempty"`
	Temperature *float64  `json:"temperature,omitempty"`
	TopP        *float64  `json:"top_p,omitempty"`
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatResponse struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Created int64  `json:"created"`
	Model   string `json:"model"`
	Choices []struct {
		Index   int     `json:"index"`
		Message Message `json:"message"`
		Finish  string  `json:"finish_reason"`
	} `json:"choices"`
}

type ProviderRequest struct {
	Model       string     `json:"model"`
	Messages    []Message  `json:"messages"`
	Stream      bool       `json:"stream,omitempty"`
	MaxTokens   int        `json:"max_tokens,omitempty"`
	Temperature *float64   `json:"temperature,omitempty"`
	TopP        *float64   `json:"top_p,omitempty"`
}

func ToProviderRequest(req ChatRequest, provider model.Provider) ProviderRequest {
	messages := make([]Message, 0, len(req.Messages))
	for _, msg := range req.Messages {
		if msg.Content == "" {
			continue
		}
		messages = append(messages, msg)
	}
	out := ProviderRequest{
		Model:       provider.Model,
		Messages:    messages,
		Stream:      req.Stream,
		Temperature: req.Temperature,
		TopP:        req.TopP,
	}
	if req.MaxTokens != nil {
		out.MaxTokens = *req.MaxTokens
	}
	return out
}

func ToAnthropicSystem(messages []Message) (string, []Message) {
	systems := make([]string, 0)
	cleaned := make([]Message, 0, len(messages))
	for _, msg := range messages {
		if strings.EqualFold(msg.Role, "system") {
			if msg.Content != "" {
				systems = append(systems, msg.Content)
			}
			continue
		}
		cleaned = append(cleaned, msg)
	}
	return strings.Join(systems, "\n\n"), cleaned
}
