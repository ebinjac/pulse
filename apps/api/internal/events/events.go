package events

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

const redisChannelPrefix = "pulse:events:"

// Event types streamed to clients.
const (
	TypeValidationStatusChanged = "validation.status_changed"
	TypeValidationRunLinked     = "validation.run_linked"
	TypeValidationReportUpdated = "validation.report_updated"
	TypeRunQueued               = "run.queued"
	TypeRunCompleted            = "run.completed"
	TypeAlertCreated            = "alert.created"
	TypeAlertAcknowledged       = "alert.acknowledged"
	TypeAlertResolved           = "alert.resolved"
)

// Event is a single server-push message.
type Event struct {
	ID        string          `json:"id"`
	Type      string          `json:"type"`
	Topic     string          `json:"topic"`
	Timestamp time.Time       `json:"timestamp"`
	Data      json.RawMessage `json:"data"`
}

// Publisher emits events to subscribers.
type Publisher interface {
	Publish(ctx context.Context, topic string, eventType string, data any) error
}

// Subscriber receives events for one or more topics.
type Subscriber interface {
	Subscribe(ctx context.Context, topics []string) (<-chan Event, func(), error)
}

// Bus combines publishing and subscribing.
type Bus interface {
	Publisher
	Subscriber
	Close() error
}

// NoopPublisher drops all events.
type NoopPublisher struct{}

func (NoopPublisher) Publish(context.Context, string, string, any) error { return nil }

// NoopBus is a Bus that drops publishes and returns an empty subscription.
type NoopBus struct{}

func (NoopBus) Publish(context.Context, string, string, any) error { return nil }

func (NoopBus) Subscribe(ctx context.Context, _ []string) (<-chan Event, func(), error) {
	ch := make(chan Event)
	go func() {
		<-ctx.Done()
		close(ch)
	}()
	return ch, func() {}, nil
}

func (NoopBus) Close() error { return nil }

func TopicValidation(validationID string) string {
	return "validation:" + validationID
}

func TopicApplicationRunBatch(applicationID, batchID string) string {
	return fmt.Sprintf("application:%s:run-batch:%s", applicationID, batchID)
}

func TopicAlerts() string {
	return "alerts"
}

func redisChannel(topic string) string {
	return redisChannelPrefix + topic
}

func newEvent(topic, eventType string, data any) (Event, error) {
	payload, err := json.Marshal(data)
	if err != nil {
		return Event{}, err
	}
	return Event{
		ID:        fmt.Sprintf("%d", time.Now().UnixNano()),
		Type:      eventType,
		Topic:     topic,
		Timestamp: time.Now().UTC(),
		Data:      payload,
	}, nil
}
