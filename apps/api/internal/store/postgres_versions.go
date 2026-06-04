package store

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	pulsedb "github.com/ensemble-pulse/pulse/apps/api/internal/db"
	"github.com/jackc/pgx/v5"
)

func (s *PostgresStore) GetMonitorDetail(id string) (domain.MonitorDetail, bool) {
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

func (s *PostgresStore) SaveMonitorDraft(monitor domain.Monitor) domain.Monitor {
	monitor = NormalizeMonitor(monitor)
	if monitor.ID == "" {
		return monitor
	}

	payload, err := marshalMonitorConfig(monitor)
	if err != nil {
		log.Printf("marshal monitor draft: %v", err)
		return monitor
	}

	ctx := context.Background()
	if err := s.queries.UpsertMonitorDraft(ctx, pulsedb.UpsertMonitorDraftParams{
		MonitorID:  monitor.ID,
		ConfigJson: payload,
	}); err != nil {
		log.Printf("upsert monitor draft: %v", err)
		return monitor
	}

	if err := s.queries.SetMonitorDraftFlags(ctx, pulsedb.SetMonitorDraftFlagsParams{
		ID:                  monitor.ID,
		HasUnpublishedDraft: true,
	}); err != nil {
		log.Printf("set monitor draft flags: %v", err)
	}

	published, ok := s.GetMonitor(monitor.ID)
	if ok {
		published.HasUnpublishedDraft = true
		return published
	}

	monitor.HasUnpublishedDraft = true
	return monitor
}

func (s *PostgresStore) GetMonitorDraft(id string) (domain.Monitor, bool) {
	published, ok := s.GetMonitor(id)
	if !ok {
		return domain.Monitor{}, false
	}

	row, err := s.queries.GetMonitorDraft(context.Background(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return published, true
		}
		return domain.Monitor{}, false
	}

	monitor, err := unmarshalMonitorConfig(id, row.ConfigJson, published)
	if err != nil {
		log.Printf("unmarshal monitor draft: %v", err)
		return domain.Monitor{}, false
	}

	monitor.HasUnpublishedDraft = published.HasUnpublishedDraft
	monitor.PublishedVersion = published.PublishedVersion
	return monitor, true
}

func (s *PostgresStore) DiscardMonitorDraft(id string) (domain.Monitor, bool) {
	published, ok := s.GetMonitor(id)
	if !ok {
		return domain.Monitor{}, false
	}

	if err := s.saveDraftSnapshot(published); err != nil {
		log.Printf("discard monitor draft: %v", err)
	}

	ctx := context.Background()
	_ = s.queries.SetMonitorDraftFlags(ctx, pulsedb.SetMonitorDraftFlagsParams{
		ID:                  id,
		HasUnpublishedDraft: false,
	})

	published.HasUnpublishedDraft = false
	if refreshed, ok := s.GetMonitor(id); ok {
		return refreshed, true
	}
	return published, true
}

func (s *PostgresStore) PublishMonitorDraft(id string, changeNote string, createdBy string) (domain.Monitor, error) {
	draft, ok := s.GetMonitorDraft(id)
	if !ok {
		return domain.Monitor{}, errors.New("monitor not found")
	}

	published := s.GetMonitorPublishedSnapshot(id, draft)
	published = s.UpsertMonitor(published)

	if err := s.insertVersionSnapshot(published, changeNote, createdBy, "publish"); err != nil {
		return domain.Monitor{}, err
	}

	nextVersion := published.PublishedVersion + 1
	ctx := context.Background()
	if err := s.queries.BumpPublishedVersion(ctx, pulsedb.BumpPublishedVersionParams{
		ID:               id,
		PublishedVersion: int32(nextVersion),
	}); err != nil {
		return domain.Monitor{}, err
	}

	_ = s.saveDraftSnapshot(published)
	published.PublishedVersion = nextVersion
	published.HasUnpublishedDraft = false

	if refreshed, ok := s.GetMonitor(id); ok {
		return refreshed, nil
	}
	return published, nil
}

func (s *PostgresStore) ListMonitorVersions(id string) []domain.MonitorVersionSummary {
	rows, err := s.queries.ListMonitorVersions(context.Background(), id)
	if err != nil {
		log.Printf("list monitor versions: %v", err)
		return nil
	}

	versions := make([]domain.MonitorVersionSummary, 0, len(rows))
	for _, row := range rows {
		versions = append(versions, domain.MonitorVersionSummary{
			ID:            row.ID,
			MonitorID:     row.MonitorID,
			VersionNumber: int(row.VersionNumber),
			ChangeNote:    pgTextString(row.ChangeNote),
			CreatedBy:     row.CreatedBy,
			Source:        row.Source,
			CreatedAt:     pgTime(row.CreatedAt),
		})
	}

	return versions
}

func (s *PostgresStore) GetMonitorVersion(id string, versionNumber int) (domain.MonitorVersion, bool) {
	row, err := s.queries.GetMonitorVersion(context.Background(), pulsedb.GetMonitorVersionParams{
		MonitorID:     id,
		VersionNumber: int32(versionNumber),
	})
	if err != nil {
		return domain.MonitorVersion{}, false
	}

	published, ok := s.GetMonitor(id)
	if !ok {
		return domain.MonitorVersion{}, false
	}

	config, err := unmarshalMonitorConfig(id, row.ConfigJson, published)
	if err != nil {
		log.Printf("unmarshal monitor version: %v", err)
		return domain.MonitorVersion{}, false
	}

	return domain.MonitorVersion{
		ID:            row.ID,
		MonitorID:     row.MonitorID,
		VersionNumber: int(row.VersionNumber),
		Config:        config,
		ChangeNote:    pgTextString(row.ChangeNote),
		CreatedBy:     row.CreatedBy,
		Source:        row.Source,
		CreatedAt:     pgTime(row.CreatedAt),
	}, true
}

func (s *PostgresStore) RollbackMonitorVersion(id string, versionNumber int, changeNote string, createdBy string) (domain.Monitor, error) {
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
	if err := s.insertVersionSnapshot(published, note, createdBy, "rollback"); err != nil {
		return domain.Monitor{}, err
	}

	nextVersion := published.PublishedVersion + 1
	ctx := context.Background()
	if err := s.queries.BumpPublishedVersion(ctx, pulsedb.BumpPublishedVersionParams{
		ID:               id,
		PublishedVersion: int32(nextVersion),
	}); err != nil {
		return domain.Monitor{}, err
	}

	_ = s.saveDraftSnapshot(published)
	published.PublishedVersion = nextVersion
	published.HasUnpublishedDraft = false

	if refreshed, ok := s.GetMonitor(id); ok {
		return refreshed, nil
	}
	return published, nil
}

func (s *PostgresStore) GetMonitorPublishedSnapshot(id string, config domain.Monitor) domain.Monitor {
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

func (s *PostgresStore) ensureInitialVersionSnapshot(monitor domain.Monitor) {
	ctx := context.Background()
	maxVersion, err := s.queries.GetMaxMonitorVersion(ctx, monitor.ID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		log.Printf("get max monitor version: %v", err)
		return
	}
	if maxVersion > 0 {
		return
	}

	if monitor.PublishedVersion == 0 {
		monitor.PublishedVersion = 1
	}
	_ = s.insertVersionSnapshot(monitor, "Initial published version", "", "initial")
	_ = s.saveDraftSnapshot(monitor)
}

func (s *PostgresStore) insertVersionSnapshot(monitor domain.Monitor, changeNote string, createdBy string, source string) error {
	payload, err := marshalMonitorConfig(monitor)
	if err != nil {
		return err
	}

	ctx := context.Background()
	maxVersion, err := s.queries.GetMaxMonitorVersion(ctx, monitor.ID)
	if err != nil {
		return err
	}

	versionNumber := maxVersion + 1
	if versionNumber <= int32(monitor.PublishedVersion) {
		versionNumber = int32(monitor.PublishedVersion) + 1
	}

	return s.queries.InsertMonitorVersion(ctx, pulsedb.InsertMonitorVersionParams{
		ID:            "mver-" + randomID(),
		MonitorID:     monitor.ID,
		VersionNumber: versionNumber,
		ConfigJson:    payload,
		ChangeNote:    pgNullableText(changeNote),
		CreatedBy:     pgNullableText(createdBy),
		Source:        source,
		CreatedAt:     pgTimestamp(time.Now().UTC()),
	})
}

func (s *PostgresStore) saveDraftSnapshot(monitor domain.Monitor) error {
	payload, err := marshalMonitorConfig(monitor)
	if err != nil {
		return err
	}

	return s.queries.UpsertMonitorDraft(context.Background(), pulsedb.UpsertMonitorDraftParams{
		MonitorID:  monitor.ID,
		ConfigJson: payload,
	})
}
