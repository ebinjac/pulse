package elfanalytics

import (
	"strings"
	"time"
)

type TemplateContext struct {
	DeployStart    time.Time
	DeployEnd      time.Time
	BaselineStart  time.Time
	Environment    string
	ElfAppID       string
	LogServiceName string
}

func SubstituteTemplates(body string, ctx TemplateContext) string {
	replacements := map[string]string{
		"{{deployStart}}":    FormatWindow(ctx.DeployStart),
		"{{deployEnd}}":      FormatWindow(ctx.DeployEnd),
		"{{baselineStart}}":  FormatWindow(ctx.BaselineStart),
		"{{environment}}":    ctx.Environment,
		"{{elfAppId}}":       ctx.ElfAppID,
		"{{logServiceName}}": ctx.LogServiceName,
	}
	for placeholder, value := range replacements {
		body = strings.ReplaceAll(body, placeholder, value)
	}
	return body
}
