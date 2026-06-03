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
import Editor from "@monaco-editor/react"
import { useTheme } from "next-themes"

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

const pmTypes = `
declare namespace pm {
  namespace variables {
    /**
     * Set a variable.
     * @param key The variable name.
     * @param value The variable value.
     */
    function set(key: string, value: string): void;
    /**
     * Get a variable value.
     * @param key The variable name.
     */
    function get(key: string): string | undefined;
    /**
     * Returns all variables as a plain object.
     */
    function toObject(): Record<string, string>;
  }

  namespace secrets {
    /**
     * Get an encrypted secret value by alias name.
     * @param alias The secret alias.
     */
    function get(alias: string): string | undefined;
  }

  namespace request {
    /** The target URL for the step execution. */
    let url: string;
    /** The HTTP request method (e.g. GET, POST, PUT, DELETE). */
    let method: string;
    /** The raw request body payload. */
    let body: string;
    namespace headers {
      /**
       * Add a request header.
       * @param key Header name.
       * @param value Header value.
       */
      function add(key: string, value: string): void;
      /**
       * Get a request header value.
       * @param key Header name.
       */
      function get(key: string): string | undefined;
      /**
       * Remove a request header by name.
       * @param key Header name.
       */
      function remove(key: string): void;
    }
  }
}
`

export function ScriptEditor({ value, onChange, stepName }: ScriptEditorProps) {
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const [showHelp, setShowHelp] = useState(false)
  const { resolvedTheme } = useTheme()

  const editorTheme = resolvedTheme === "light" ? "light" : "vs-dark"

  function handleEditorBeforeMount(monaco: any) {
    // Configure Monaco compiler checking options for JavaScript
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    })

    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      allowNonTsExtensions: true,
      checkJs: true,
    })

    // Inject typings to enable custom IntelliSense autocomplete for the pm.* API
    const libUri = "ts:filename/pulse-env.d.ts"
    monaco.languages.typescript.javascriptDefaults.addExtraLib(pmTypes, libUri)
  }

  function handleEditorDidMount(editor: any, monaco: any) {
    editorRef.current = editor
    monacoRef.current = monaco
  }

  function insertSnippet(snippet: string) {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return

    const selection = editor.getSelection()
    const range = new monaco.Range(
      selection.startLineNumber,
      selection.startColumn,
      selection.endLineNumber,
      selection.endColumn
    )

    const op = {
      range,
      text: snippet,
      forceMoveMarkers: true,
    }

    editor.executeEdits("snippet-insert", [op])
    editor.focus()
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
              className="h-7 text-[11px] px-2 gap-1 cursor-pointer"
            >
              <Icon className="size-3" />
              {snippet.label}
            </Button>
          )
        })}
      </div>

      {/* Monaco Code Editor container */}
      <div className="min-h-[220px] w-full rounded-md border border-border/50 overflow-hidden bg-[#1e1e1e] dark:bg-[#1e1e1e] light:bg-[#fffffe] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
        <Editor
          height="220px"
          language="javascript"
          theme={editorTheme}
          value={value}
          onChange={(val) => onChange(val ?? "")}
          beforeMount={handleEditorBeforeMount}
          onMount={handleEditorDidMount}
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
      </div>

      {/* Help panel toggle */}
      <div>
        <button
          type="button"
          onClick={() => setShowHelp(!showHelp)}
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors py-1 cursor-pointer"
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
