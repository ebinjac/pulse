package events

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

func TestMemoryBusPublishSubscribe(t *testing.T) {
	bus := NewMemoryBus()
	defer bus.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	ch, unsubscribe, err := bus.Subscribe(ctx, []string{TopicValidation("val-1")})
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	defer unsubscribe()

	if err := bus.Publish(ctx, TopicValidation("val-1"), TypeValidationStatusChanged, map[string]any{
		"validationId": "val-1",
		"status":       "post_running",
	}); err != nil {
		t.Fatalf("publish: %v", err)
	}

	select {
	case event := <-ch:
		if event.Type != TypeValidationStatusChanged {
			t.Fatalf("unexpected type: %s", event.Type)
		}
		var payload map[string]any
		if err := json.Unmarshal(event.Data, &payload); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if payload["status"] != "post_running" {
			t.Fatalf("unexpected status: %v", payload["status"])
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for event")
	}
}
