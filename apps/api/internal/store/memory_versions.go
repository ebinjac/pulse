package store

import (
	"errors"
	"fmt"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

type memoryDraftRecord struct {
	config    domain.Monitor
	updatedAt time.Time
}

type memoryVersionRecord struct {
	summary domain.MonitorVersionSummary
	config  domain.Monitor
}

func (s *MemoryStore) GetMonitorDetail(id string) (domain.MonitorDetail, bool) {
	published, ok := s.GetMonitor(id)
	if !ok {
		return domain.MonitorDetail{}, false
	}

	detail := domain.MonitorDetail{
		Published:           published,
		PublishedVersion:    published.PublishedVersion,
		HasUnpublishedDraft: published.HasUnpublishedDraft,
	}

	if draft, ok := s.GetMonitorDraft(id); ok {
		detail.Draft = &draft
	} else {
		copyDraft := published
		detail.Draft = &copyDraft
	}

	return detail, true
}

func (s *MemoryStore) SaveMonitorDraft(monitor domain.Monitor) domain.Monitor {
	s.mu.Lock()
	defer s.mu.Unlock()

	monitor = NormalizeMonitor(monitor)
	if monitor.ID == "" {
		return monitor
	}

	s.drafts[monitor.ID] = memoryDraftRecord{
		config:    cloneMonitorConfig(monitor),
		updatedAt: time.Now().UTC(),
	}

	if stored, ok := s.monitors[monitor.ID]; ok {
		stored.HasUnpublishedDraft = true
		stored.UpdatedAt = time.Now().UTC()
		s.monitors[monitor.ID] = stored
		return stored
	}

	monitor.HasUnpublishedDraft = true
	return monitor
}

func (s *MemoryStore) GetMonitorDraft(id string) (domain.Monitor, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	published, ok := s.monitors[id]
	if !ok {
		return domain.Monitor{}, false
	}

	record, ok := s.drafts[id]
	if !ok {
		draft := cloneMonitorConfig(published)
		draft.ID = id
		return draft, true
	}

	draft := cloneMonitorConfig(record.config)
	draft.ID = id
	draft.Status = published.Status
	draft.LastRunAt = published.LastRunAt
	draft.LastDurationMS = published.LastDurationMS
	draft.SuccessRate24H = published.SuccessRate24H
	draft.PublishedVersion = published.PublishedVersion
	draft.HasUnpublishedDraft = published.HasUnpublishedDraft
	draft.CreatedAt = published.CreatedAt
	draft.UpdatedAt = record.updatedAt

	return draft, true
}

func (s *MemoryStore) DiscardMonitorDraft(id string) (domain.Monitor, bool) {
	published, ok := s.GetMonitor(id)
	if !ok {
		return domain.Monitor{}, false
	}

	s.mu.Lock()
	s.drafts[id] = memoryDraftRecord{config: cloneMonitorConfig(published), updatedAt: time.Now().UTC()}
	if stored, ok := s.monitors[id]; ok {
		stored.HasUnpublishedDraft = false
		stored.UpdatedAt = time.Now().UTC()
		s.monitors[id] = stored
		published = stored
	}
	s.mu.Unlock()

	return published, true
}

func (s *MemoryStore) PublishMonitorDraft(id string, changeNote string, createdBy string) (domain.Monitor, error) {
	draft, ok := s.GetMonitorDraft(id)
	if !ok {
		return domain.Monitor{}, errors.New("monitor not found")
	}

	published := s.GetMonitorPublishedSnapshot(id, draft)
	published = s.UpsertMonitor(published)
	s.recordVersion(published, changeNote, createdBy, "publish")

	s.mu.Lock()
	published.PublishedVersion++
	published.HasUnpublishedDraft = false
	s.monitors[id] = published
	s.drafts[id] = memoryDraftRecord{config: cloneMonitorConfig(published), updatedAt: time.Now().UTC()}
	s.mu.Unlock()

	return published, nil
}

func (s *MemoryStore) ListMonitorVersions(id string) []domain.MonitorVersionSummary {
	s.mu.RLock()
	defer s.mu.RUnlock()

	records := s.versions[id]
	summaries := make([]domain.MonitorVersionSummary, 0, len(records))
	for _, record := range records {
		summaries = append(summaries, record.summary)
	}
	return summaries
}

func (s *MemoryStore) GetMonitorVersion(id string, versionNumber int) (domain.MonitorVersion, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, record := range s.versions[id] {
		if record.summary.VersionNumber == versionNumber {
			return domain.MonitorVersion{
				ID:            record.summary.ID,
				MonitorID:     record.summary.MonitorID,
				VersionNumber: record.summary.VersionNumber,
				Config:        cloneMonitorConfig(record.config),
				ChangeNote:    record.summary.ChangeNote,
				CreatedBy:     record.summary.CreatedBy,
				Source:        record.summary.Source,
				CreatedAt:     record.summary.CreatedAt,
			}, true
		}
	}
	return domain.MonitorVersion{}, false
}

func (s *MemoryStore) RollbackMonitorVersion(id string, versionNumber int, changeNote string, createdBy string) (domain.Monitor, error) {
	version, ok := s.GetMonitorVersion(id, versionNumber)
	if !ok {
		return domain.Monitor{}, fmt.Errorf("version %d not found", versionNumber)
	}

	published := s.GetMonitorPublishedSnapshot(id, version.Config)
	published = s.UpsertMonitor(published)

	note := changeNote
	if note == "" {
		note = fmt.Sprintf("Rollback to version %d", versionNumber)
	}
	s.recordVersion(published, note, createdBy, "rollback")

	s.mu.Lock()
	published.PublishedVersion++
	published.HasUnpublishedDraft = false
	s.monitors[id] = published
	s.drafts[id] = memoryDraftRecord{config: cloneMonitorConfig(published), updatedAt: time.Now().UTC()}
	s.mu.Unlock()

	return published, nil
}

func (s *MemoryStore) GetMonitorPublishedSnapshot(id string, config domain.Monitor) domain.Monitor {
	published, ok := s.GetMonitor(id)
	if !ok {
		return config
	}
	config.ID = id
	config.Status = published.Status
	config.LastRunAt = published.LastRunAt
	config.LastDurationMS = published.LastDurationMS
	config.SuccessRate24H = published.SuccessRate24H
	config.PublishedVersion = published.PublishedVersion
	config.HasUnpublishedDraft = published.HasUnpublishedDraft
	config.CreatedAt = published.CreatedAt
	config.UpdatedAt = published.UpdatedAt
	return config
}

func (s *MemoryStore) recordVersion(monitor domain.Monitor, changeNote string, createdBy string, source string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.recordVersionLocked(monitor, changeNote, createdBy, source)
}

func (s *MemoryStore) recordVersionLocked(monitor domain.Monitor, changeNote string, createdBy string, source string) {
	versionNumber := monitor.PublishedVersion + 1
	if len(s.versions[monitor.ID]) > 0 {
		last := s.versions[monitor.ID][len(s.versions[monitor.ID])-1]
		versionNumber = last.summary.VersionNumber + 1
	}

	record := memoryVersionRecord{
		summary: domain.MonitorVersionSummary{
			ID:            "mver-" + randomID(),
			MonitorID:     monitor.ID,
			VersionNumber: versionNumber,
			ChangeNote:    changeNote,
			CreatedBy:     createdBy,
			Source:        source,
			CreatedAt:     time.Now().UTC(),
		},
		config: cloneMonitorConfig(monitor),
	}
	s.versions[monitor.ID] = append(s.versions[monitor.ID], record)
}

func cloneMonitorConfig(monitor domain.Monitor) domain.Monitor {
	payload, _ := marshalMonitorConfig(monitor)
	published := domain.Monitor{ID: monitor.ID, PublishedVersion: 1}
	cloned, _ := unmarshalMonitorConfig(monitor.ID, payload, published)
	return cloned
}
