package scripting

import (
	"fmt"
	"strings"
	"time"

	"github.com/dop251/goja"
)

// RequestOverrides holds mutations that scripts can make to the outgoing HTTP request.
type RequestOverrides struct {
	URL     string
	Method  string
	Headers map[string]string
	Body    string
}

// ScriptContext holds the input/output data for a script execution.
type ScriptContext struct {
	Variables map[string]string            // read/write — merged back after execution
	Secrets   map[string]string            // read-only access to resolved secrets
	Steps     map[string]map[string]string // previous step outputs (read-only)
	Request   *RequestOverrides            // mutable request fields
	Console   []string                     // captured console.log output
}

const scriptTimeout = 5 * time.Second

// Execute runs a JavaScript script in a sandboxed goja VM with the pm.* API surface.
func Execute(script string, ctx *ScriptContext) error {
	vm := goja.New()

	// --- pm.variables ---
	variables := vm.NewObject()
	variables.Set("set", func(call goja.FunctionCall) goja.Value {
		key := call.Argument(0).String()
		value := call.Argument(1).String()
		ctx.Variables[key] = value
		return goja.Undefined()
	})
	variables.Set("get", func(call goja.FunctionCall) goja.Value {
		key := call.Argument(0).String()
		if val, ok := ctx.Variables[key]; ok {
			return vm.ToValue(val)
		}
		return goja.Undefined()
	})
	variables.Set("toObject", func(call goja.FunctionCall) goja.Value {
		copy := make(map[string]string, len(ctx.Variables))
		for k, v := range ctx.Variables {
			copy[k] = v
		}
		return vm.ToValue(copy)
	})

	// --- pm.environment (alias for pm.variables, Postman compat) ---
	environment := vm.NewObject()
	environment.Set("set", func(call goja.FunctionCall) goja.Value {
		key := call.Argument(0).String()
		value := call.Argument(1).String()
		ctx.Variables[key] = value
		return goja.Undefined()
	})
	environment.Set("get", func(call goja.FunctionCall) goja.Value {
		key := call.Argument(0).String()
		if val, ok := ctx.Variables[key]; ok {
			return vm.ToValue(val)
		}
		return goja.Undefined()
	})

	// --- pm.secrets ---
	secrets := vm.NewObject()
	secrets.Set("get", func(call goja.FunctionCall) goja.Value {
		alias := call.Argument(0).String()
		if val, ok := ctx.Secrets[alias]; ok {
			return vm.ToValue(val)
		}
		return goja.Undefined()
	})

	// --- pm.request.headers ---
	headers := vm.NewObject()
	headers.Set("add", func(call goja.FunctionCall) goja.Value {
		key := call.Argument(0).String()
		value := call.Argument(1).String()
		ctx.Request.Headers[key] = value
		return goja.Undefined()
	})
	headers.Set("get", func(call goja.FunctionCall) goja.Value {
		key := call.Argument(0).String()
		if val, ok := ctx.Request.Headers[key]; ok {
			return vm.ToValue(val)
		}
		return goja.Undefined()
	})
	headers.Set("remove", func(call goja.FunctionCall) goja.Value {
		key := call.Argument(0).String()
		delete(ctx.Request.Headers, key)
		return goja.Undefined()
	})

	// --- pm.request ---
	reqObj := vm.NewObject()
	reqObj.Set("url", ctx.Request.URL)
	reqObj.Set("method", ctx.Request.Method)
	reqObj.Set("body", ctx.Request.Body)
	reqObj.Set("headers", headers)

	// --- pm ---
	pm := vm.NewObject()
	pm.Set("variables", variables)
	pm.Set("environment", environment)
	pm.Set("secrets", secrets)
	pm.Set("request", reqObj)
	vm.Set("pm", pm)

	// --- console ---
	consoleObj := vm.NewObject()
	consoleObj.Set("log", func(call goja.FunctionCall) goja.Value {
		args := make([]string, len(call.Arguments))
		for i, arg := range call.Arguments {
			args[i] = arg.String()
		}
		ctx.Console = append(ctx.Console, strings.Join(args, " "))
		return goja.Undefined()
	})
	vm.Set("console", consoleObj)

	// --- Execute with timeout ---
	type result struct {
		err error
	}
	done := make(chan result, 1)

	go func() {
		defer func() {
			if r := recover(); r != nil {
				done <- result{err: fmt.Errorf("script panic: %v", r)}
			}
		}()
		_, err := vm.RunString(script)
		done <- result{err: err}
	}()

	timer := time.NewTimer(scriptTimeout)
	defer timer.Stop()

	select {
	case <-timer.C:
		vm.Interrupt("script timeout")
		return fmt.Errorf("script exceeded %s timeout", scriptTimeout)
	case res := <-done:
		if res.err != nil {
			return fmt.Errorf("script error: %w", res.err)
		}
	}

	// Read back mutable request properties
	if v := reqObj.Get("url"); v != nil && !goja.IsUndefined(v) {
		ctx.Request.URL = v.String()
	}
	if v := reqObj.Get("method"); v != nil && !goja.IsUndefined(v) {
		ctx.Request.Method = v.String()
	}
	if v := reqObj.Get("body"); v != nil && !goja.IsUndefined(v) {
		ctx.Request.Body = v.String()
	}

	return nil
}
