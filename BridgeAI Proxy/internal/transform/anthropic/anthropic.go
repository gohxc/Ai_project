package anthropic

import (
	"strings"

	"bridgeai-proxy/internal/model"
)

type MessageRequest struct {
	Model       string    `json:"model"`
	MaxTokens   int       `json:"max_tokens"`
	System      string    `json:"system,omitempty"`
	Messages    []Message `json:"messages"`
	Stream      bool      `json:"stream,omitempty"`
	Temperature *float64  `json:"temperature,omitempty"`
	TopP        *float64  `json:"top_p,omitempty"`
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type MessageResponse struct {
	ID         string        `json:"id"`
	Type       string        `json:"type"`
	Role       string        `json:"role"`
	Model      string        `json:"model"`
	Content    []ContentBlock `json:"content"`
	StopReason string        `json:"stop_reason,omitempty"`
	Usage      *Usage        `json:"usage,omitempty"`
}

type ContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
}

type Usage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

type ProviderRequest struct {
	Model       string    `json:"model"`
	MaxTokens   int       `json:"max_tokens"`
	System      string    `json:"system,omitempty"`
	Messages    []Message `json:"messages"`
	Stream      bool      `json:"stream,omitempty"`
	Temperature *float64  `json:"temperature,omitempty"`
	TopP        *float64  `json:"top_p,omitempty"`
}

func ToProviderRequest(req MessageRequest, provider model.Provider) ProviderRequest {
	messages := make([]Message, 0, len(req.Messages))
	for _, msg := range req.Messages {
		if msg.Content == "" {
			continue
		}
		messages = append(messages, msg)
	}
	return ProviderRequest{
		Model:       provider.Model,
		MaxTokens:   req.MaxTokens,
		System:      req.System,
		Messages:    messages,
		Stream:      req.Stream,
		Temperature: req.Temperature,
		TopP:        req.TopP,
	}
}

func ToOpenAIMessages(system string, messages []Message) []struct{ Role, Content string } {
	out := make([]struct{ Role, Content string }, 0, len(messages)+1)
	if strings.TrimSpace(system) != "" {
		out = append(out, struct{ Role, Content string }{Role: "system", Content: system})
	}
	for _, msg := range messages {
		out = append(out, struct{ Role, Content string }{Role: msg.Role, Content: msg.Content})
	}
	return out
}
