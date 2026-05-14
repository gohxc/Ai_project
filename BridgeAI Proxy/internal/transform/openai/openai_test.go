package openai

import "testing"

func TestToAnthropicSystemMovesSystemMessages(t *testing.T) {
	system, messages := ToAnthropicSystem([]Message{
		{Role: "system", Content: "You are helpful."},
		{Role: "user", Content: "Hello"},
		{Role: "system", Content: "Be concise."},
	})

	if system != "You are helpful.\n\nBe concise." {
		t.Fatalf("unexpected system: %q", system)
	}
	if len(messages) != 1 || messages[0].Role != "user" || messages[0].Content != "Hello" {
		t.Fatalf("unexpected messages: %#v", messages)
	}
}
