package events

import (
	"context"
	"sync"
)

// MemoryBus is an in-process pub/sub bus for local development.
type MemoryBus struct {
	mu          sync.RWMutex
	subscribers map[string]map[chan Event]struct{}
}

func NewMemoryBus() *MemoryBus {
	return &MemoryBus{subscribers: map[string]map[chan Event]struct{}{}}
}

func (b *MemoryBus) Publish(_ context.Context, topic string, eventType string, data any) error {
	event, err := newEvent(topic, eventType, data)
	if err != nil {
		return err
	}

	b.mu.RLock()
	targets := make([]chan Event, 0)
	for ch := range b.subscribers[topic] {
		targets = append(targets, ch)
	}
	b.mu.RUnlock()

	for _, ch := range targets {
		select {
		case ch <- event:
		default:
		}
	}
	return nil
}

func (b *MemoryBus) Subscribe(ctx context.Context, topics []string) (<-chan Event, func(), error) {
	ch := make(chan Event, 64)
	registered := make([]string, 0, len(topics))

	b.mu.Lock()
	for _, topic := range topics {
		if topic == "" {
			continue
		}
		if b.subscribers[topic] == nil {
			b.subscribers[topic] = map[chan Event]struct{}{}
		}
		b.subscribers[topic][ch] = struct{}{}
		registered = append(registered, topic)
	}
	b.mu.Unlock()

	var once sync.Once
	cancel := func() {
		once.Do(func() {
			b.mu.Lock()
			for _, topic := range registered {
				if subs, ok := b.subscribers[topic]; ok {
					delete(subs, ch)
					if len(subs) == 0 {
						delete(b.subscribers, topic)
					}
				}
			}
			b.mu.Unlock()
			close(ch)
		})
	}

	go func() {
		<-ctx.Done()
		cancel()
	}()

	return ch, cancel, nil
}

func (b *MemoryBus) Close() error {
	b.mu.Lock()
	defer b.mu.Unlock()
	for topic, subs := range b.subscribers {
		for ch := range subs {
			close(ch)
		}
		delete(b.subscribers, topic)
	}
	return nil
}
