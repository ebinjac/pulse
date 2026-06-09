package events

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"github.com/redis/go-redis/v9"
)

// RedisBus publishes and subscribes via Redis pub/sub.
type RedisBus struct {
	client *redis.Client
	memory *MemoryBus
}

func NewRedisBus(redisURL string) (*RedisBus, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	client := redis.NewClient(opts)
	return &RedisBus{
		client: client,
		memory: NewMemoryBus(),
	}, nil
}

func (b *RedisBus) Publish(ctx context.Context, topic string, eventType string, data any) error {
	event, err := newEvent(topic, eventType, data)
	if err != nil {
		return err
	}
	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}
	if err := b.client.Publish(ctx, redisChannel(topic), payload).Err(); err != nil {
		return err
	}
	// Also fan out locally so SSE clients in the same API process receive events
	// published from handlers without a round trip through Redis.
	return b.memory.Publish(ctx, topic, eventType, data)
}

func (b *RedisBus) Subscribe(ctx context.Context, topics []string) (<-chan Event, func(), error) {
	if len(topics) == 0 {
		ch := make(chan Event)
		close(ch)
		return ch, func() {}, nil
	}

	channels := make([]string, 0, len(topics))
	for _, topic := range topics {
		if strings.TrimSpace(topic) == "" {
			continue
		}
		channels = append(channels, redisChannel(topic))
	}
	if len(channels) == 0 {
		ch := make(chan Event)
		close(ch)
		return ch, func() {}, nil
	}

	pubsub := b.client.Subscribe(ctx, channels...)
	out := make(chan Event, 64)
	var once sync.Once
	cancel := func() {
		once.Do(func() {
			_ = pubsub.Close()
			close(out)
		})
	}

	go func() {
		defer cancel()
		for {
			msg, err := pubsub.ReceiveMessage(ctx)
			if err != nil {
				return
			}
			var event Event
			if err := json.Unmarshal([]byte(msg.Payload), &event); err != nil {
				continue
			}
			select {
			case out <- event:
			case <-ctx.Done():
				return
			}
		}
	}()

	// Merge local memory subscriptions for same-process publishers.
	localCh, localCancel, err := b.memory.Subscribe(ctx, topics)
	if err != nil {
		cancel()
		return nil, nil, err
	}

	merged := make(chan Event, 64)
	var mergeOnce sync.Once
	stopMerge := func() {
		mergeOnce.Do(func() {
			localCancel()
			cancel()
			close(merged)
		})
	}

	forward := func(source <-chan Event) {
		for event := range source {
			select {
			case merged <- event:
			default:
			}
		}
	}

	go forward(out)
	go forward(localCh)
	go func() {
		<-ctx.Done()
		stopMerge()
	}()

	return merged, stopMerge, nil
}

func (b *RedisBus) Close() error {
	_ = b.memory.Close()
	return b.client.Close()
}

func (b *RedisBus) Ping(ctx context.Context) error {
	return b.client.Ping(ctx).Err()
}
