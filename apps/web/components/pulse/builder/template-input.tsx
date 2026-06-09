"use client"

import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react"
import Editor from "@monaco-editor/react"
import type { TemplateSuggestion } from "../template-intelligence"
import { Card, Chip, Input, ListBox } from "@heroui/react"
import { cn } from "@workspace/ui/lib/utils"
import { BuilderField, builderControlClass } from "./builder-controls"

export function TemplateInput({
  value,
  onChange,
  suggestions,
  className,
  containerClassName,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  suggestions: TemplateSuggestion[]
  className?: string
  containerClassName?: string
  placeholder?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [activeRange, setActiveRange] = useState<{ start: number; end: number; query: string } | null>(null)

  const visibleSuggestions = useMemo(() => {
    if (!activeRange) return []
    const query = normalizeTemplateQuery(activeRange.query)
    return suggestions
      .filter((suggestion) => suggestionMatchesQuery(suggestion, query))
      .slice(0, 8)
  }, [activeRange, suggestions])

  function updateTemplateContext(nextValue: string, caret: number | null) {
    if (caret === null) {
      setActiveRange(null)
      return
    }
    const beforeCaret = nextValue.slice(0, caret)
    const start = beforeCaret.lastIndexOf("{{")
    if (start === -1) {
      setActiveRange(null)
      return
    }
    const closedAfterStart = beforeCaret.indexOf("}}", start)
    if (closedAfterStart !== -1) {
      setActiveRange(null)
      return
    }
    setActiveRange({ start, end: caret, query: nextValue.slice(start + 2, caret) })
  }

  function insertSuggestion(suggestion: TemplateSuggestion) {
    if (!activeRange) return
    const nextValue = `${value.slice(0, activeRange.start)}${suggestion.token}${value.slice(activeRange.end)}`
    onChange(nextValue)
    setActiveRange(null)
    window.requestAnimationFrame(() => {
      const nextCursor = activeRange.start + suggestion.token.length
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  return (
    <div className={cn("relative min-w-0 flex-1", containerClassName)}>
      <Input
        ref={inputRef}
        variant="secondary"
        fullWidth
        placeholder={placeholder}
        className={cn("min-h-9 font-mono text-xs", className)}
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          updateTemplateContext(event.target.value, event.target.selectionStart)
        }}
        onClick={(event) => updateTemplateContext(event.currentTarget.value, event.currentTarget.selectionStart)}
        onKeyUp={(event) => updateTemplateContext(event.currentTarget.value, event.currentTarget.selectionStart)}
        onBlur={() => window.setTimeout(() => setActiveRange(null), 120)}
      />
      {visibleSuggestions.length > 0 ? (
        <Card className="absolute left-0 right-0 top-[calc(100%+4px)] z-40 max-h-64 overflow-auto shadow-lg">
          <Card.Content className="gap-0.5 p-1">
            <ListBox
              aria-label="Template suggestions"
              onAction={(key) => {
                const suggestion = visibleSuggestions.find((item) => `${item.kind}-${item.key}` === key)
                if (suggestion) insertSuggestion(suggestion)
              }}
            >
              {visibleSuggestions.map((suggestion) => (
                <ListBox.Item
                  key={`${suggestion.kind}-${suggestion.key}`}
                  id={`${suggestion.kind}-${suggestion.key}`}
                  textValue={suggestion.token}
                  className="rounded-md px-2 py-1.5 text-xs"
                >
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-mono font-semibold text-foreground">{suggestion.token}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">{suggestion.detail}</span>
                    </span>
                    <Chip size="sm" variant="soft" className="shrink-0 text-[9px] uppercase">
                      <Chip.Label>{suggestion.kind}</Chip.Label>
                    </Chip>
                  </div>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Card.Content>
        </Card>
      ) : null}
    </div>
  )
}

export function BuilderTemplateField({
  label,
  className,
  containerClassName,
  inputClassName,
  ...templateProps
}: {
  label: string
  className?: string
  containerClassName?: string
  inputClassName?: string
} & Omit<ComponentProps<typeof TemplateInput>, "className" | "containerClassName">) {
  return (
    <BuilderField label={label} className={className}>
      <TemplateInput
        containerClassName={containerClassName}
        className={cn("font-mono text-xs", inputClassName)}
        {...templateProps}
      />
    </BuilderField>
  )
}

export function TemplateBodyEditor({
  value,
  onChange,
  theme,
  suggestions,
}: {
  value: string
  onChange: (value: string) => void
  theme: string
  suggestions: TemplateSuggestion[]
}) {
  const suggestionsRef = useRef(suggestions)
  const providerRef = useRef<{ dispose: () => void } | null>(null)
  suggestionsRef.current = suggestions

  useEffect(() => {
    return () => providerRef.current?.dispose()
  }, [])

  return (
    <Editor
      height="180px"
      language="json"
      theme={theme}
      value={value}
      onChange={(val) => onChange(val ?? "")}
      onMount={(_editor, monaco) => {
        providerRef.current?.dispose()
        providerRef.current = monaco.languages.registerCompletionItemProvider("json", {
          triggerCharacters: ["{"],
          provideCompletionItems: (model: any, position: any) => templateCompletionItems(monaco, model, position, suggestionsRef.current),
        })
      }}
      options={{
        minimap: { enabled: false },
        fontSize: 12,
        fontFamily: "var(--font-mono), monospace",
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        padding: { top: 8, bottom: 8 },
        tabSize: 2,
        fixedOverflowWidgets: true,
      }}
    />
  )
}

function templateCompletionItems(monaco: any, model: any, position: any, suggestions: TemplateSuggestion[]) {
  const lineUntilCursor = model.getValueInRange({
    startLineNumber: position.lineNumber,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  })
  const templateMatch = lineUntilCursor.match(/\{\{[^}]*$/)
  if (!templateMatch) return { suggestions: [] }
  const range = new monaco.Range(position.lineNumber, position.column - templateMatch[0].length, position.lineNumber, position.column)

  return {
    suggestions: suggestions
      .filter((suggestion) => suggestionMatchesQuery(suggestion, normalizeTemplateQuery(templateMatch[0].slice(2))))
      .map((suggestion) => ({
      label: suggestion.label,
      kind: suggestion.kind === "secret" ? monaco.languages.CompletionItemKind.Value : monaco.languages.CompletionItemKind.Variable,
      detail: suggestion.detail,
      documentation: suggestion.scriptAccessor,
      insertText: suggestion.token,
      range,
    })),
  }
}

function normalizeTemplateQuery(query: string) {
  return query
    .replace(/^\{\{/, "")
    .replace(/^variables\./, "")
    .replace(/^secrets\./, "")
    .replace(/[}\s]/g, "")
    .toLowerCase()
}

function suggestionMatchesQuery(suggestion: TemplateSuggestion, query: string) {
  if (!query) return true
  return (
    suggestion.key.toLowerCase().includes(query) ||
    suggestion.label.toLowerCase().includes(query) ||
    suggestion.token.toLowerCase().includes(query)
  )
}