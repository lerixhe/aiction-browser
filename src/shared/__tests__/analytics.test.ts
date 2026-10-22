import { describe, expect, it, vi } from "vitest"

// analytics.ts 顶层会 import posthog；分桶函数是纯函数，不需要真实 SDK
vi.mock("posthog-js/dist/module.no-external", () => ({
  default: { init: () => undefined, capture: () => undefined, identify: () => undefined }
}))

import { lengthBucket, usedRatioBucket } from "@/shared/analytics"

describe("usedRatioBucket（quota_banner_shown.used_ratio_bucket）", () => {
  it("按档位分桶，不报精确比例", () => {
    expect(usedRatioBucket(0)).toBe("0")
    expect(usedRatioBucket(0.12)).toBe("<50")
    expect(usedRatioBucket(0.49)).toBe("<50")
    expect(usedRatioBucket(0.5)).toBe("<80")
    expect(usedRatioBucket(0.79)).toBe("<80")
    expect(usedRatioBucket(0.8)).toBe("<100")
    expect(usedRatioBucket(0.99)).toBe("<100")
    expect(usedRatioBucket(1)).toBe("100")
  })

  it("超出范围的值钳到两端（服务端可能给 used > limit）", () => {
    expect(usedRatioBucket(-0.3)).toBe("0")
    expect(usedRatioBucket(1.7)).toBe("100")
  })

  it("未知值落 unknown（面板侧只有失败归因，不能默认为 0）", () => {
    expect(usedRatioBucket(null)).toBe("unknown")
    expect(usedRatioBucket(undefined)).toBe("unknown")
    expect(usedRatioBucket(Number.NaN)).toBe("unknown")
  })
})

describe("lengthBucket", () => {
  it("长度分桶边界", () => {
    expect(lengthBucket(0)).toBe("0")
    expect(lengthBucket(20)).toBe("1-20")
    expect(lengthBucket(21)).toBe("21-60")
    expect(lengthBucket(200)).toBe("61-200")
    expect(lengthBucket(201)).toBe("200+")
  })
})
