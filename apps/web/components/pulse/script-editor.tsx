"use client"

import { useRef, useState } from "react"
import {
  Code2,
  Variable,
  KeyRound,
  FileJson,
  Terminal,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  Copy,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

interface ScriptEditorProps {
  value: string
  onChange: (value: string) => void
  stepName?: string
}

const snippets = [
  { label: "Set Variable", icon: Variable, code: `pm.variables.set("key", "value");` },
  { label: "Get Variable", icon: Variable, code: `pm.variables.get("key")` },
  { label: "Get Secret", icon: KeyRound, code: `pm.secrets.get("alias")` },
  { label: "Add Header", icon: FileJson, code: `pm.request.headers.add("Header-Name", "value");` },
  { label: "Set Body", icon: FileJson, code: `pm.request.body = JSON.stringify({\n  \n});` },
  { label: "Set Method", icon: Code2, code: `pm.request.method = "POST";` },
  { label: "Log", icon: Terminal, code: `console.log("debug:", );` },
  { label: "UUID", icon: Copy, code: `const uuid = crypto.randomUUID();\npm.variables.set("uuid", uuid);` },
  { label: "Timestamp", icon: Terminal, code: `const timestamp = new Date().toISOString();\npm.variables.set("timestamp", timestamp);` },
  { label: "Base64", icon: Code2, code: `const encoded = btoa("value");\npm.variables.set("encoded", encoded);` },
] as const

const apiReference = [
  { signature: "pm.variables.set(key, value)", description: "Set a variable" },
  { signature: "pm.variables.get(key)", description: "Get a variable value" },
  { signature: "pm.variables.toObject()", description: "Get all variables" },
  { signature: "pm.secrets.get(alias)", description: "Get a secret value" },
  { signature: "pm.request.url", description: "Get/set request URL" },
  { signature: "pm.request.method", description: "Get/set request method" },
  { signature: "pm.request.body", description: "Get/set request body" },
  { signature: "pm.request.headers.add(k, v)", description: "Add a header" },
  { signature: "pm.request.headers.get(k)", description: "Get a header" },
  { signature: "pm.request.headers.remove(k)", description: "Remove a header" },
  { signature: "console.log(...)", description: "Log to console output" },
] as const

export function ScriptEditor({ value, onChange, stepName }: ScriptEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showHelp, setShowHelp] = useState(false)

  function insertSnippet(snippet: string) {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newValue = value.substring(0, start) + snippet + value.substring(end)
    onChange(newValue)
    // Restore cursor position after the snippet
    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = start + snippet.length
      textarea.focus()
    })
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Code2 className="size-4 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
          Pre-request Script
        </span>
        {stepName && (
          <span className="text-[10px] text-muted-foreground font-mono">— {stepName}</span>
        )}
      </div>

      {/* Snippet toolbar */}
      <div className="flex flex-wrap gap-1.5">
        {snippets.map((snippet) => {
          const Icon = snippet.icon
          return (
            <Button
              key={snippet.label}
              variant="outline"
              size="sm"
              type="button"
              onClick={() => insertSnippet(snippet.code)}
              className="h-7 text-[11px] px-2 gap-1"
            >
              <Icon className="size-3" />
              {snippet.label}
            </Button>
          )
        })}
      </div>

      {/* Code editor textarea */}
      <textarea
        ref={textareaRef}
        className="min-h-[200px] w-full resize-y rounded-md bg-zinc-950 p-4 font-mono text-xs leading-5 text-zinc-100 outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-border/50"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={`// Pre-request script for ${stepName ?? "this step"}\n// Use pm.variables, pm.secrets, pm.request to configure the request\n`}
      />

      {/* Help panel toggle */}
      <div>
        <button
          type="button"
          onClick={() => setShowHelp(!showHelp)}
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors py-1"
          )}
        >
          {showHelp ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          <HelpCircle className="size-3" />
          API Reference
        </button>

        {showHelp && (
          <div className="mt-2 rounded-lg border border-border/50 bg-background/50 p-4 space-y-1">
            <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider mb-2">
              Available APIs
            </div>
            <div className="space-y-0.5">
              {apiReference.map((ref) => (
                <div key={ref.signature} className="flex items-baseline gap-3 text-xs">
                  <code className="font-mono text-primary bg-muted/50 px-1.5 py-0.5 rounded text-[11px] shrink-0">
                    {ref.signature}
                  </code>
                  <span className="text-muted-foreground">— {ref.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
