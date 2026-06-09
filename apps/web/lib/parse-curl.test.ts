import { describe, expect, it } from "vitest"
import { parseCurlCommand } from "./parse-curl"

describe("parseCurlCommand", () => {
  it("parses GET with multiline JSON body (Elasticsearch style)", () => {
    const curl = `curl -X GET "http://localhost:9200/testindex/_search" -H 'Content-Type: application/json' -d'
{
  "query": {
    "match": {
      "title": {
        "query": "wnid",
        "fuzziness": "AUTO",
        "prefix_length": 2
      }
    }
  }
}
'`

    const result = parseCurlCommand(curl)
    expect(result).not.toBeNull()
    expect(result?.method).toBe("GET")
    expect(result?.url).toBe("http://localhost:9200/testindex/_search")
    expect(result?.headers["Content-Type"]).toBe("application/json")
    expect(result?.bodyType).toBe("json")
    expect(JSON.parse(result?.body ?? "")).toEqual({
      query: {
        match: {
          title: {
            query: "wnid",
            fuzziness: "AUTO",
            prefix_length: 2,
          },
        },
      },
    })
  })

  it("parses simple POST with inline JSON", () => {
    const curl =
      'curl -X POST "https://api.example.com/users" -H "Content-Type: application/json" -d "{\\"name\\":\\"Alice\\"}"'

    const result = parseCurlCommand(curl)
    expect(result?.method).toBe("POST")
    expect(result?.url).toBe("https://api.example.com/users")
    expect(result?.body).toContain("Alice")
  })

  it("defaults to POST when -d is present without -X", () => {
    const curl = 'curl "https://api.example.com/items" -d "name=test"'
    const result = parseCurlCommand(curl)
    expect(result?.method).toBe("POST")
  })
})
