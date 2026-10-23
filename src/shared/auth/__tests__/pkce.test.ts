/**
 * PKCE 与授权 URL（SPEC §6.2 / §12.1）。
 *
 * 最关键的一条是 **RFC 7636 附录 B 的测试向量**：它同时钉住「SHA-256 → base64url 无 padding」
 * 这两个容易各错一半的地方（多一个 `=` 或换了 base64 标准，服务端 PKCE 校验就永远过不了）。
 */
import { describe, expect, it } from "vitest"
import { buildAuthorizeUrl, challengeOf, createPkce, parseCallbackUrl, randomToken } from "@/shared/auth/pkce"

/** RFC 7636 附录 B */
const RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
const RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"

describe("challengeOf（S256）", () => {
  it("与 RFC 7636 附录 B 的测试向量一致", async () => {
    expect(await challengeOf(RFC_VERIFIER)).toBe(RFC_CHALLENGE)
  })

  it("输出无 padding，且是 base64url 字符集", async () => {
    const challenge = await challengeOf(randomToken(32))
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(challenge).not.toContain("=")
  })
})

describe("randomToken", () => {
  it("32 字节 → 43 字符（RFC 7636 要求 43–128）", () => {
    expect(randomToken(32)).toHaveLength(43)
  })

  it("只含 base64url 字符且无 padding", () => {
    for (const token of [randomToken(), randomToken(16), randomToken(64)]) {
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(token).not.toContain("=")
    }
  })

  /** SPEC §12.1 U1：`randomToken(32)` × 100 长度 43、字符集合规、100 次互不相同 */
  it("100 次调用互不相同（熵来源是 crypto，不是 Math.random）", () => {
    const seen = new Set<string>()
    for (let index = 0; index < 100; index += 1) {
      const token = randomToken()
      expect(token).toHaveLength(43)
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
      seen.add(token)
    }
    // 只比两次的话，一个「自带计数器 + 时间戳」的假随机源也能过
    expect(seen.size).toBe(100)
  })

  it("不同长度按需产出", () => {
    expect(randomToken(16)).toHaveLength(22) // 16 字节 → ceil(16/3)*4 - padding = 22
    expect(randomToken(64)).toHaveLength(86)
  })
})

describe("createPkce", () => {
  it("challenge 是 verifier 的 S256，两者都符合字符集", async () => {
    const { verifier, challenge } = await createPkce()
    expect(verifier).toHaveLength(43)
    expect(await challengeOf(verifier)).toBe(challenge)
  })
})

describe("buildAuthorizeUrl", () => {
  const base = "https://aiction.app"

  it("参数齐全且顺序固定", () => {
    const url = buildAuthorizeUrl({
      extId: "ext-123",
      platform: "chrome",
      state: "st-abc",
      challenge: "ch-xyz",
      redirectUri: "https://ext-123.chromiumapp.org/",
      baseUrl: base
    })

    expect(url).toBe(
      "https://aiction.app/auth/extension/authorize" +
        "?ext_id=ext-123" +
        "&platform=chrome" +
        "&state=st-abc" +
        "&code_challenge=ch-xyz" +
        "&code_challenge_method=S256" +
        "&redirect_uri=https%3A%2F%2Fext-123.chromiumapp.org%2F"
    )
  })

  it("redirect_uri 的尾斜杠被保留（服务端白名单逐字比对）", () => {
    const url = new URL(
      buildAuthorizeUrl({
        extId: "ext-123",
        platform: "firefox",
        state: "s",
        challenge: "c",
        redirectUri: "https://ext-123.chromiumapp.org/",
        baseUrl: base
      })
    )
    expect(url.searchParams.get("redirect_uri")).toBe("https://ext-123.chromiumapp.org/")
  })
})

describe("parseCallbackUrl", () => {
  it("取出 code 与 state", () => {
    expect(parseCallbackUrl("https://abc.chromiumapp.org/?code=c1&state=s1")).toEqual({ code: "c1", state: "s1" })
  })

  it("拒绝授权时带 error", () => {
    expect(parseCallbackUrl("https://abc.chromiumapp.org/?error=access_denied&state=s1")).toEqual({
      error: "access_denied",
      state: "s1"
    })
  })

  it("非 URL 输入返回空对象（不抛错）", () => {
    expect(parseCallbackUrl("not a url")).toEqual({})
  })

  it("空参数不产生键（避免 undefined 参与 state 比对）", () => {
    expect(parseCallbackUrl("https://abc.chromiumapp.org/?code=&state=")).toEqual({})
  })
})
