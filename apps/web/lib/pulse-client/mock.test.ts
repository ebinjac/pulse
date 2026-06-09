import { describe, expect, it } from "vitest"
import { createMockPulseClient } from "./mock"

describe("createMockPulseClient", () => {
  it("returns empty monitor list by default", async () => {
    const client = createMockPulseClient()
    await expect(client.listMonitors()).resolves.toEqual([])
  })

  it("allows overriding client methods", async () => {
    const client = createMockPulseClient({
      listMonitors: async () => [{ id: "m1", name: "Test" } as never],
    })
    const monitors = await client.listMonitors()
    expect(monitors).toHaveLength(1)
    expect(monitors[0]?.name).toBe("Test")
  })
})
