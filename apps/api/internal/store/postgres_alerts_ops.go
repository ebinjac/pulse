package store

import (
	"context"
	"log"
	"strings"
	"time"

	pulsedb "github.com/ensemble-pulse/pulse/apps/api/internal/db"
	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

var activeAlertStatuses = []string{
	string(domain.AlertStatusOpen),
	string(domain.AlertStatusAcknowledged),
	string(domain.AlertStatusSuppressed),
}

func (s *PostgresStore) GetAlert(id string) (domain.AlertEvent, bool) {
	row, err := s.queries.GetAlert(context.Background(), id)
	if err != nil {
		return domain.AlertEvent{}, false
	}
	return alertFromGetRow(row), true
}

func (s *PostgresStore) GetOpenAlert(monitorID string) (domain.AlertEvent, bool) {
	row, err := s.queries.GetActiveAlert(context.Background(), pulsedb.GetActiveAlertParams{
		MonitorID: pgText(monitorID),
		Column2:   activeAlertStatuses,
	})
	if err != nil {
		return domain.AlertEvent{}, false
	}
	return alertFromActiveRow(row), true
}

func (s *PostgresStore) AcknowledgeAlert(id string, acknowledgedBy string) (domain.AlertEvent, bool) {
	alert, ok := s.GetAlert(id)
	if !ok || alert.Status == domain.AlertStatusResolved {
		return domain.AlertEvent{}, false
	}
	now := time.Now().UTC()
	alert.Status = domain.AlertStatusAcknowledged
	alert.AcknowledgedBy = acknowledgedBy
	alert.AcknowledgedAt = &now
	alert.UpdatedAt = now
	s.SaveAlert(alert)
	return alert, true
}

func (s *PostgresStore) SnoozeAlert(id string, until time.Time, reason string) (domain.AlertEvent, bool) {
	alert, ok := s.GetAlert(id)
	if !ok || alert.Status == domain.AlertStatusResolved {
		return domain.AlertEvent{}, false
	}
	alert.Status = domain.AlertStatusSuppressed
	alert.SnoozedUntil = &until
	alert.SuppressionReason = reason
	alert.UpdatedAt = time.Now().UTC()
	s.SaveAlert(alert)
	return alert, true
}

func (s *PostgresStore) ResolveOpenAlerts(monitorID string, resolvedAt time.Time) int {
	count, err := s.queries.ResolveOpenAlerts(context.Background(), pulsedb.ResolveOpenAlertsParams{
		MonitorID:  pgText(monitorID),
		Status:     pgText(string(domain.AlertStatusResolved)),
		ResolvedAt: pgTimestamp(resolvedAt),
		Column4:    activeAlertStatuses,
	})
	if err != nil {
		log.Printf("resolve alerts: %v", err)
		return 0
	}
	return int(count)
}

func (s *PostgresStore) ListMaintenanceWindows(activeOnly bool) []domain.MaintenanceWindow {
	if activeOnly {
		rows, err := s.queries.ListActiveMaintenanceWindows(context.Background(), pgTimestamp(time.Now().UTC()))
		if err != nil {
			log.Printf("list active maintenance windows: %v", err)
			return nil
		}
		windows := make([]domain.MaintenanceWindow, 0, len(rows))
		for _, row := range rows {
			windows = append(windows, maintenanceFromActiveRow(row))
		}
		return windows
	}

	rows, err := s.queries.ListMaintenanceWindows(context.Background())
	if err != nil {
		log.Printf("list maintenance windows: %v", err)
		return nil
	}
	windows := make([]domain.MaintenanceWindow, 0, len(rows))
	for _, row := range rows {
		windows = append(windows, maintenanceFromListRow(row))
	}
	return windows
}

func (s *PostgresStore) CreateMaintenanceWindow(window domain.MaintenanceWindow) domain.MaintenanceWindow {
	now := time.Now().UTC()
	if window.ID == "" {
		window.ID = "maint-" + randomID()
	}
	if window.CreatedAt.IsZero() {
		window.CreatedAt = now
	}
	if window.StartsAt.IsZero() {
		window.StartsAt = now
	}
	if err := s.queries.UpsertMaintenanceWindow(context.Background(), pulsedb.UpsertMaintenanceWindowParams{
		ID:        window.ID,
		ScopeType: window.ScopeType,
		ScopeID:   pgNullableText(window.ScopeID),
		StartsAt:  pgTimestamp(window.StartsAt),
		EndsAt:    pgTimestamp(window.EndsAt),
		Reason:    pgNullableText(window.Reason),
		CreatedBy: pgNullableText(window.CreatedBy),
		CreatedAt: pgTimestamp(window.CreatedAt),
	}); err != nil {
		log.Printf("upsert maintenance window: %v", err)
	}
	return window
}

func (s *PostgresStore) DeleteMaintenanceWindow(id string) bool {
	count, err := s.queries.DeleteMaintenanceWindow(context.Background(), id)
	if err != nil {
		log.Printf("delete maintenance window: %v", err)
		return false
	}
	return count > 0
}

func (s *PostgresStore) IsUnderMaintenance(monitorID, applicationID string, at time.Time) (string, bool) {
	for _, window := range s.ListMaintenanceWindows(true) {
		if at.Before(window.StartsAt) || !at.Before(window.EndsAt) {
			continue
		}
		switch strings.ToLower(window.ScopeType) {
		case "global":
			return windowReason(window), true
		case "application":
			if window.ScopeID == applicationID && applicationID != "" {
				return windowReason(window), true
			}
		case "monitor":
			if window.ScopeID == monitorID {
				return windowReason(window), true
			}
		}
	}
	return "", false
}

func maintenanceFromListRow(row pulsedb.ListMaintenanceWindowsRow) domain.MaintenanceWindow {
	return domain.MaintenanceWindow{
		ID:        row.ID,
		ScopeType: row.ScopeType,
		ScopeID:   row.ScopeID,
		StartsAt:  pgTime(row.StartsAt),
		EndsAt:    pgTime(row.EndsAt),
		Reason:    row.Reason,
		CreatedBy: row.CreatedBy,
		CreatedAt: pgTime(row.CreatedAt),
	}
}

func maintenanceFromActiveRow(row pulsedb.ListActiveMaintenanceWindowsRow) domain.MaintenanceWindow {
	return domain.MaintenanceWindow{
		ID:        row.ID,
		ScopeType: row.ScopeType,
		ScopeID:   row.ScopeID,
		StartsAt:  pgTime(row.StartsAt),
		EndsAt:    pgTime(row.EndsAt),
		Reason:    row.Reason,
		CreatedBy: row.CreatedBy,
		CreatedAt: pgTime(row.CreatedAt),
	}
}

func windowReason(window domain.MaintenanceWindow) string {
	if strings.TrimSpace(window.Reason) != "" {
		return window.Reason
	}
	return window.ScopeType + " maintenance until " + window.EndsAt.Format(time.RFC3339)
}
