package elfanalytics

import "time"

type TimeWindows struct {
	DeployStart   time.Time
	DeployEnd     time.Time
	BaselineStart time.Time
}

func BuildWindows(deployStart time.Time, baselineWindowHours int, now time.Time) TimeWindows {
	if deployStart.IsZero() {
		deployStart = now.Add(-1 * time.Hour)
	}
	if baselineWindowHours <= 0 {
		baselineWindowHours = 24
	}
	return TimeWindows{
		DeployStart:   deployStart.UTC(),
		DeployEnd:     now.UTC(),
		BaselineStart: deployStart.Add(-time.Duration(baselineWindowHours) * time.Hour).UTC(),
	}
}

func FormatWindow(t time.Time) string {
	return t.UTC().Format(time.RFC3339)
}
