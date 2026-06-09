package store

import (
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func (s *MemoryStore) ListApplicationServices(applicationID string) []domain.ApplicationService {
	s.mu.RLock()
	defer s.mu.RUnlock()
	services := make([]domain.ApplicationService, 0)
	for _, service := range s.applicationServices {
		if service.ApplicationID == applicationID {
			services = append(services, service)
		}
	}
	return services
}

func (s *MemoryStore) GetApplicationService(id string) (domain.ApplicationService, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	service, ok := s.applicationServices[id]
	return service, ok
}

func (s *MemoryStore) UpsertApplicationService(service domain.ApplicationService) domain.ApplicationService {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UTC()
	if service.ID == "" {
		service.ID = "svc-" + randomID()
	}
	if service.CreatedAt.IsZero() {
		service.CreatedAt = now
	}
	service.UpdatedAt = now
	s.applicationServices[service.ID] = service
	return service
}

func (s *MemoryStore) DeleteApplicationService(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.applicationServices[id]; !ok {
		return false
	}
	delete(s.applicationServices, id)
	return true
}
