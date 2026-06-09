package store

import (
	"encoding/json"
	"sort"
	"strings"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func (s *MemoryStore) ListElfQueries(applicationID string) []domain.ElfQuery {
	s.mu.RLock()
	defer s.mu.RUnlock()
	queries := make([]domain.ElfQuery, 0, len(s.elfQueries))
	for _, query := range s.elfQueries {
		if applicationID != "" && query.ApplicationID != applicationID {
			continue
		}
		queries = append(queries, query)
	}
	sort.Slice(queries, func(i, j int) bool {
		return strings.ToLower(queries[i].Name) < strings.ToLower(queries[j].Name)
	})
	return queries
}

func (s *MemoryStore) GetElfQuery(id string) (domain.ElfQuery, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	query, ok := s.elfQueries[id]
	return query, ok
}

func (s *MemoryStore) UpsertElfQuery(query domain.ElfQuery) domain.ElfQuery {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UTC()
	if query.ID == "" {
		query.ID = "elfq-" + randomID()
	}
	if query.CreatedAt.IsZero() {
		query.CreatedAt = now
	}
	query.UpdatedAt = now
	if query.GateMode == "" {
		query.GateMode = "advisory"
	}
	if query.Tags == nil {
		query.Tags = []string{}
	}
	if len(query.SearchBody) == 0 {
		query.SearchBody = json.RawMessage(`{}`)
	}
	s.elfQueries[query.ID] = query
	return query
}

func (s *MemoryStore) DeleteElfQuery(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.elfQueries[id]; !ok {
		return false
	}
	delete(s.elfQueries, id)
	return true
}
