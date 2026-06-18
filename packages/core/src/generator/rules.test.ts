import { describe, expect, it } from "vitest";
import {
  buildGeneratedRuleEntries,
  generateRules,
  hasFullRuleOrderKeys,
  normalizePersistedRuleOrder,
  resolveAppliedRuleOrder,
  resolveModuleName,
} from "./rules";
import { generateClashConfig } from "./index";
import { PROXY_GROUP_MODULES } from "./proxy-groups";
import type { CustomProxyGroup, CustomRule } from "@subboost/core/types/config";

const customRules: CustomRule[] = [
  {
    id: "domain-rule",
    type: "DOMAIN-SUFFIX",
    value: "example.com",
    target: "Missing Target",
  },
  {
    id: "ip-rule",
    type: "IP-CIDR",
    value: "203.0.113.0/24",
    target: "DIRECT",
    noResolve: true,
  },
];

const customGroups: CustomProxyGroup[] = [
  {
    id: "media",
    name: "Media",
    emoji: "M",
    groupType: "select",
    rules: [{ id: "media-rule", name: "Media Rule", behavior: "domain", url: "https://rules.example.com/media.mrs", noResolve: true }],
  },
];

describe("rule generator", () => {
  it("builds generated rule entries with fallback targets and special rules", () => {
    const entries = buildGeneratedRuleEntries({
      enabledModules: ["cn", "global", "final", "streaming-west"],
      customRules,
      customProxyGroups: customGroups,
      experimentalCnUseCnRuleSet: true,
      cnIpNoResolve: false,
      proxyGroupNameOverrides: {
        cn: "CN Direct",
        final: "Final",
        "streaming-west": "Streaming",
      },
      availablePolicyTargets: ["DIRECT", "🔒 CN Direct", "🐟 Final", "📺 Streaming", "Media"],
      fallbackPolicyTarget: "DIRECT",
    });
    const texts = entries.map((entry) => entry.text);
    const customIpEntry = entries.find((entry) => entry.key === "custom-rule:ip-rule");

    expect(resolveModuleName("cn", { cn: "CN Direct" })).toBe("🔒 CN Direct");
    expect(texts).toContain("DOMAIN-SUFFIX,example.com,DIRECT");
    expect(texts).toContain("IP-CIDR,203.0.113.0/24,DIRECT,no-resolve");
    expect(customIpEntry).toMatchObject({
      summary: "203.0.113.0/24",
      text: "IP-CIDR,203.0.113.0/24,DIRECT,no-resolve",
    });
    expect(texts).toContain("RULE-SET,media-rule,Media,no-resolve");
    expect(texts).toContain("RULE-SET,apple-tvplus,📺 Streaming");
    expect(entries.find((entry) => entry.text === "RULE-SET,apple-tvplus,📺 Streaming")).toMatchObject({
      key: "module:streaming-west:apple-tvplus",
      kind: "module",
    });
    expect(entries.some((entry) => entry.key === "special:apple-tvplus")).toBe(false);
    expect(texts).toContain("RULE-SET,cn,🔒 CN Direct");
    expect(texts).toContain("MATCH,🐟 Final");
    expect(texts.find((text) => text.startsWith("RULE-SET,cn-ip,"))).toBe("RULE-SET,cn-ip,🔒 CN Direct");
  });

  it("removes deleted preset module rules from generated rules and providers", () => {
    const enabledModules = PROXY_GROUP_MODULES.map((proxyModule) => proxyModule.id);
    const allPresetRuleIds = PROXY_GROUP_MODULES.flatMap((proxyModule) => proxyModule.rules.map((rule) => rule.id));
    const duplicateRuleIds = allPresetRuleIds.filter((id, index) => allPresetRuleIds.indexOf(id) !== index);

    expect(duplicateRuleIds).toEqual([]);

    for (const proxyModule of PROXY_GROUP_MODULES) {
      for (const rule of proxyModule.rules) {
        const config = generateClashConfig({
          nodes: [],
          template: "full",
          userConfig: {
            enabledGroups: enabledModules,
            enabledRules: enabledModules,
            customRules: [],
            ruleProviderBaseUrl: "https://example.com/rules",
            experimentalCnUseCnRuleSet: false,
          },
          moduleRuleExclusions: { [proxyModule.id]: [rule.id] },
        });
        const rules = Array.isArray(config.rules) ? config.rules : [];
        const providers = config["rule-providers"] as Record<string, unknown> | undefined;

        expect(rules.filter((line) => line.startsWith(`RULE-SET,${rule.id},`))).toEqual([]);
        expect(providers?.[rule.id]).toBeUndefined();
      }
    }
  });

  it("handles Apple TV+ deletion and moves without special-rule leftovers", () => {
    const enabledModules = PROXY_GROUP_MODULES.map((module) => module.id);
    const baseConfig = {
      nodes: [],
      template: "full" as const,
      userConfig: {
        enabledGroups: enabledModules,
        enabledRules: enabledModules,
        customRules: [],
        ruleProviderBaseUrl: "https://example.com/rules",
        experimentalCnUseCnRuleSet: false,
      },
    };
    const baseline = generateClashConfig(baseConfig);
    const deleted = generateClashConfig({
      ...baseConfig,
      moduleRuleExclusions: { "streaming-west": ["apple-tvplus"] },
    });
    const moved = generateClashConfig({
      ...baseConfig,
      moduleRuleExclusions: { "streaming-west": ["apple-tvplus"] },
      moduleRuleOverrides: {
        google: [
          {
            id: "apple-tvplus",
            name: "Apple TV+",
            behavior: "domain",
            path: "geosite/apple-tvplus.mrs",
          },
        ],
      },
    });
    const baselineRules = baseline.rules as string[];
    const appleTvPlusIndex = baselineRules.indexOf("RULE-SET,apple-tvplus,📺 欧美流媒体");
    const appleIndex = baselineRules.indexOf("RULE-SET,apple,🍏 苹果服务");
    const hboIndex = baselineRules.indexOf("RULE-SET,hbo,📺 欧美流媒体");

    expect(appleTvPlusIndex).toBeGreaterThanOrEqual(0);
    expect(appleTvPlusIndex).toBeLessThan(appleIndex);
    expect(appleTvPlusIndex).toBeLessThan(hboIndex);
    expect((deleted.rules as string[]).filter((line) => line.startsWith("RULE-SET,apple-tvplus,"))).toEqual([]);
    expect((deleted["rule-providers"] as Record<string, unknown> | undefined)?.["apple-tvplus"]).toBeUndefined();
    expect((moved.rules as string[]).filter((line) => line.startsWith("RULE-SET,apple-tvplus,"))).toEqual([
      "RULE-SET,apple-tvplus,🔍 谷歌服务",
    ]);
    expect((moved["rule-providers"] as Record<string, { url?: string }> | undefined)?.["apple-tvplus"]?.url).toBe(
      "https://example.com/rules/geosite/apple-tvplus.mrs"
    );
  });

  it("normalizes persisted order in editable-only and full-order modes", () => {
    const editableOrder = normalizePersistedRuleOrder({
      enabledModules: ["cn", "global", "final"],
      customRules,
      customProxyGroups: customGroups,
      ruleOrder: ["custom-group:media:media-rule", "missing", "custom-rule:domain-rule"],
    });
    const fullOrder = normalizePersistedRuleOrder({
      enabledModules: ["cn", "global", "final"],
      customRules,
      customProxyGroups: customGroups,
      ruleOrder: ["module:global:geolocation-!cn", "custom-rule:domain-rule", "special:match"],
    });
    const applied = resolveAppliedRuleOrder({
      enabledModules: ["cn", "global", "final"],
      customRules,
      customProxyGroups: customGroups,
      ruleOrder: ["module:global:geolocation-!cn"],
    });

    expect(hasFullRuleOrderKeys(["custom-rule:domain-rule"])).toBe(false);
    expect(hasFullRuleOrderKeys(["module:global:geolocation-!cn"])).toBe(true);
    expect(editableOrder).toEqual(["custom-group:media:media-rule", "custom-rule:domain-rule", "custom-rule:ip-rule"]);
    expect(fullOrder).toEqual(["module:global:geolocation-!cn", "custom-rule:domain-rule"]);
    expect(applied).toContain("module:global:geolocation-!cn");
    expect(applied.indexOf("custom-rule:domain-rule")).toBeLessThan(applied.indexOf("module:global:geolocation-!cn"));
    expect(generateRules({
      enabledModules: [],
      customRules: [],
      fallbackPolicyTarget: "DIRECT",
    })).toEqual(["MATCH,DIRECT"]);
  });

  it("keeps inactive preset anchors so deleted or moved rules can restore their full-order position", () => {
    const options = {
      enabledModules: PROXY_GROUP_MODULES.map((module) => module.id),
      customRules: [],
      customProxyGroups: [],
      fallbackPolicyTarget: "DIRECT",
    };
    const baselineOrder = buildGeneratedRuleEntries(options)
      .filter((entry) => entry.key !== "special:match")
      .map((entry) => entry.key);

    for (const module of PROXY_GROUP_MODULES) {
      for (const rule of module.rules) {
        const sourceKey = `module:${module.id}:${rule.id}`;
        const targetModuleId = module.id === "google" ? "ai" : "google";
        const movedKey = `module:${targetModuleId}:${rule.id}`;
        const baselineIndex = baselineOrder.indexOf(sourceKey);
        expect(baselineIndex).toBeGreaterThanOrEqual(0);

        const afterDeleteOrder = normalizePersistedRuleOrder({
          ...options,
          moduleRuleExclusions: { [module.id]: [rule.id] },
          ruleOrder: baselineOrder,
        });
        const afterDeleteApplied = resolveAppliedRuleOrder({
          ...options,
          moduleRuleExclusions: { [module.id]: [rule.id] },
          ruleOrder: afterDeleteOrder,
        });
        const afterRestoreApplied = resolveAppliedRuleOrder({
          ...options,
          ruleOrder: afterDeleteOrder,
        });
        const afterMoveOrder = normalizePersistedRuleOrder({
          ...options,
          moduleRuleExclusions: { [module.id]: [rule.id] },
          moduleRuleOverrides: { [targetModuleId]: [rule] },
          ruleOrder: baselineOrder,
        });
        const afterMoveApplied = resolveAppliedRuleOrder({
          ...options,
          moduleRuleExclusions: { [module.id]: [rule.id] },
          moduleRuleOverrides: { [targetModuleId]: [rule] },
          ruleOrder: afterMoveOrder,
        });

        expect(afterDeleteOrder).toContain(sourceKey);
        expect(afterDeleteApplied).not.toContain(sourceKey);
        expect(afterRestoreApplied.indexOf(sourceKey)).toBe(baselineIndex);
        expect(afterMoveOrder).toContain(sourceKey);
        expect(afterMoveApplied.indexOf(movedKey)).toBe(baselineIndex);
      }
    }
  });

  it("keeps missing editable rules near their canonical neighbors in full-order mode", () => {
    const options = {
      enabledModules: ["ad", "private", "global", "final"],
      customRules,
      customProxyGroups: [],
      fallbackPolicyTarget: "DIRECT",
    };
    const entries = buildGeneratedRuleEntries(options);
    const adKey = entries.find((entry) => entry.key.startsWith("module:ad:"))?.key;
    if (!adKey) throw new Error("Expected ad module rule");

    const applied = resolveAppliedRuleOrder({
      ...options,
      ruleOrder: [adKey],
    });

    expect(resolveModuleName("missing-module")).toBe("missing-module");
    expect(applied.slice(applied.indexOf(adKey) + 1, applied.indexOf(adKey) + 3)).toEqual([
      "custom-rule:domain-rule",
      "custom-rule:ip-rule",
    ]);
    expect(
      buildGeneratedRuleEntries({
        enabledModules: ["final"],
        customRules: [
          {
            id: "domain-no-resolve",
            type: "DOMAIN-SUFFIX",
            value: "example.org",
            target: "DIRECT",
            noResolve: true,
          },
        ],
        customProxyGroups: [
          {
            id: "plain",
            name: "Plain",
            emoji: "P",
            groupType: "select",
            rules: [{ id: "plain-rule", name: "Plain Rule", behavior: "domain", url: "https://rules.example.com/plain.mrs" }],
          },
        ],
        fallbackPolicyTarget: "DIRECT",
      }).map((entry) => entry.text)
    ).toEqual(["DOMAIN-SUFFIX,example.org,DIRECT", "RULE-SET,plain-rule,Plain", "MATCH,🐟 漏网之鱼"]);
    expect(
      normalizePersistedRuleOrder({
        enabledModules: [],
        customRules: [],
        ruleOrder: ["custom-rule:missing"],
      })
    ).toEqual([]);
    expect(
      normalizePersistedRuleOrder({
        enabledModules: ["streaming-west"],
        customRules: [],
        customProxyGroups: [],
        ruleOrder: ["special:apple-tvplus", "module:streaming-west:apple-tvplus"],
      })
    ).toEqual(["module:streaming-west:apple-tvplus"]);
  });
});
