import { Tenant } from "@fider/models"
import { statusTone, statusInfo } from "./status"

describe("ui2 status tones", () => {
  test("built-in slugs run gray, blue, orange, green", () => {
    expect(statusTone("open")).toBe("review")
    expect(statusTone("planned")).toBe("planned")
    expect(statusTone("started")).toBe("progress")
    expect(statusTone("completed")).toBe("shipped")
    expect(statusTone("declined", "closed-declined")).toBe("review")
    expect(statusTone("duplicate", "duplicate")).toBe("review")
  })

  test("custom slugs map by name, then by kind", () => {
    expect(statusTone("under-review", "open")).toBe("review")
    expect(statusTone("in-progress", "active")).toBe("progress")
    expect(statusTone("shipped-v2", "closed-completed")).toBe("shipped")
    expect(statusTone("planned-q1", "active")).toBe("planned")
    expect(statusTone("waiting-on-legal", "active")).toBe("progress")
    expect(statusTone("released-to-beta-customers", "closed-completed")).toBe("shipped")
    expect(statusTone("wontfix", "closed-declined")).toBe("review")
    expect(statusTone("mystery")).toBe("review")
    expect(statusTone("contract-renewal", "active")).toBe("progress")
    expect(statusTone("Under Review")).toBe("review")
  })

  test("statusInfo uses the tenant's label and kind for custom statuses", () => {
    const tenant = {
      statuses: [
        {
          id: 9,
          slug: "cooking",
          label: "Cooking",
          kind: "active",
          color: "",
          icon: "",
          showOnHome: true,
          showOnRoadmap: true,
          filterable: true,
          sortOrder: 1,
          isSystem: false,
          isActive: true,
        },
      ],
    } as unknown as Tenant
    expect(statusInfo(tenant, "cooking")).toEqual({ slug: "cooking", label: "Cooking", tone: "progress" })
  })
})
