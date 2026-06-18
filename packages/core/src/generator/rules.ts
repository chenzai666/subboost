import type { CustomProxyGroup, CustomRule } from "@subboost/core/types/config";
import { getCustomGroupRuleOrderKey, getCustomRuleOrderKey } from "@subboost/core/rules/custom-rule-utils";
import { resolveProxyGroupModuleName } from "@subboost/core/proxy-group-name";
import { PROXY_GROUP_MODULES, type ProxyGroupModule, type ProxyGroupRule } from "./proxy-group-modules";
import { getEffectiveModuleRules, getModuleRuleOrderKey, type ModuleRuleExclusions } from "./module-rules";
import { createPolicyTargetResolver } from "./policy-targets";

type CustomRuleLike = Pick<CustomRule, "id" | "type" | "value" | "target" | "noResolve">;

export type GeneratedRuleEntryKind = "module" | "custom-rule" | "custom-group-rule" | "special";

export interface GeneratedRuleEntry {
  key: string;
  text: string;
  kind: GeneratedRuleEntryKind;
  sourceLabel: string;
  summary: string;
  target: string;
  noResolve: boolean;
  editable: boolean;
}

export interface RulesGenerateOptions {
  enabledModules: string[];
  customRules: CustomRuleLike[];
  customProxyGroups?: CustomProxyGroup[];
  moduleRuleOverrides?: Record<string, ProxyGroupRule[]>;
  moduleRuleExclusions?: ModuleRuleExclusions;
  proxyGroupNameOverrides?: Record<string, string>;
  experimentalCnUseCnRuleSet?: boolean;
  cnIpNoResolve?: boolean;
  ruleOrder?: string[];
  availablePolicyTargets?: string[];
  fallbackPolicyTarget?: string;
}

export const EXPERIMENTAL_CN_RULE: ProxyGroupRule = {
  id: "cn",
  name: "国内域名 (完整)",
  behavior: "domain",
  path: "geosite/cn.mrs",
};

/**
 * 规则生成顺序（按自上而下、首次命中即停原则）
 *
 * ⚠️ 顺序非常重要！子域名/特定服务必须在通用服务之前：
 * - 私有网络和高置信国内规则在服务父规则前，避免国内子服务被父规则抢先命中
 * - Gemini 在 AI/谷歌前（Gemini 用谷歌域名）
 * - 油管视频在谷歌前（YouTube 是谷歌子域名）
 * - 谷歌学术在谷歌前（谷歌学术属于谷歌域名）
 * - cn 完整域名规则是低置信补充，仍通过 special:experimental-cn 后置到 geolocation-!cn 之后
 */
const RULE_ORDER: string[] = [
  "ad",
  "private",
  "gemini",
  "ai",
  "cn",
  "youtube",
  "google-scholar",
  "education",
  "cloud",
  "google",
  "telegram",
  "github",
  "microsoft",
  "apple",
  "twitter",
  "meta",
  "discord",
  "social-other",
  "netflix",
  "disney",
  "streaming-west",
  "streaming-asia",
  "steam",
  "gaming-pc",
  "gaming-console",
  "dev-tools",
  "storage",
  "payment",
  "crypto",
  "news",
  "shopping",
  "adult",
  "global",
];

export function resolveModuleName(moduleId: string, overrides?: Record<string, string>): string {
  const mod = PROXY_GROUP_MODULES.find((m) => m.id === moduleId);
  if (!mod) return moduleId;
  return resolveProxyGroupModuleName(mod, overrides?.[moduleId]);
}

export function resolveModuleNameFromModule(module: ProxyGroupModule, overrides?: Record<string, string>): string {
  return resolveModuleName(module.id, overrides);
}

export { getEffectiveModuleRules };

const PRESET_MODULE_RULE_ORDER_KEYS = PROXY_GROUP_MODULES.flatMap((module) =>
  module.rules.map((rule) => getModuleRuleOrderKey(module.id, rule.id))
);
const PRESET_MODULE_RULE_ORDER_KEY_SET = new Set(PRESET_MODULE_RULE_ORDER_KEYS);

function buildModuleRuleEntry(
  module: ProxyGroupModule,
  rule: ProxyGroupRule,
  proxyGroupNameOverrides?: Record<string, string>,
  cnIpNoResolve?: boolean,
  resolvePolicyTarget: (target: string) => string = (target) => target
): GeneratedRuleEntry {
  const target = resolvePolicyTarget(resolveModuleNameFromModule(module, proxyGroupNameOverrides));
  const noResolve =
    module.id === "cn" && rule.id === "cn-ip" && typeof cnIpNoResolve === "boolean"
      ? cnIpNoResolve
      : Boolean(rule.noResolve);
  let text = `RULE-SET,${rule.id},${target}`;
  if (noResolve) text += ",no-resolve";

  return {
    key: getModuleRuleOrderKey(module.id, rule.id),
    text,
    kind: "module",
    sourceLabel: target,
    summary: rule.name,
    target,
    noResolve,
    editable: false,
  };
}

function buildCustomRuleEntry(
  rule: CustomRuleLike,
  resolvePolicyTarget: (target: string) => string = (target) => target
): GeneratedRuleEntry {
  const noResolve = Boolean(rule.noResolve) && (rule.type === "IP-CIDR" || rule.type === "IP-CIDR6");
  const target = resolvePolicyTarget(rule.target);
  let text = `${rule.type},${rule.value},${target}`;
  if (noResolve) text += ",no-resolve";

  return {
    key: getCustomRuleOrderKey(rule.id),
    text,
    kind: "custom-rule",
    sourceLabel: "自定义规则",
    summary: rule.value,
    target,
    noResolve,
    editable: true,
  };
}

function buildCustomGroupRuleEntry(
  group: CustomProxyGroup,
  rule: CustomProxyGroup["rules"][number],
  resolvePolicyTarget: (target: string) => string = (target) => target
): GeneratedRuleEntry {
  const noResolve = Boolean(rule.noResolve);
  const target = resolvePolicyTarget(group.name);
  let text = `RULE-SET,${rule.id},${target}`;
  if (noResolve) text += ",no-resolve";

  return {
    key: getCustomGroupRuleOrderKey(group.id, rule.id),
    text,
    kind: "custom-group-rule",
    sourceLabel: `自定义分组 · ${group.name}`,
    summary: rule.name,
    target,
    noResolve,
    editable: true,
  };
}

function buildOrderedEditableEntries(
  customRules: CustomRuleLike[],
  customProxyGroups: CustomProxyGroup[],
  ruleOrder?: string[],
  resolvePolicyTarget: (target: string) => string = (target) => target
): GeneratedRuleEntry[] {
  const defaultEntries: GeneratedRuleEntry[] = [
    ...customRules.map((rule) => buildCustomRuleEntry(rule, resolvePolicyTarget)),
    ...customProxyGroups.flatMap((group) =>
      group.rules.map((rule) => buildCustomGroupRuleEntry(group, rule, resolvePolicyTarget))
    ),
  ];
  const editableKeys = defaultEntries.map((entry) => entry.key);
  const normalizedEditableOrder = normalizeEditableRuleOrderKeys(ruleOrder, editableKeys);
  const byKey = new Map(defaultEntries.map((entry) => [entry.key, entry]));

  return normalizedEditableOrder.map((key) => byKey.get(key)).filter(Boolean) as GeneratedRuleEntry[];
}

function buildSpecialRuleEntry(
  key: string,
  text: string,
  summary: string,
  target: string
): GeneratedRuleEntry {
  return {
    key,
    text,
    kind: "special",
    sourceLabel: "系统规则",
    summary,
    target,
    noResolve: false,
    editable: false,
  };
}

function normalizeRuleOrderInput(ruleOrder: string[] | undefined): string[] {
  if (!Array.isArray(ruleOrder)) return [];
  const next: string[] = [];
  const seen = new Set<string>();
  for (const rawKey of ruleOrder) {
    const key = typeof rawKey === "string" ? rawKey.trim() : "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(key);
  }
  return next;
}

function normalizeEditableRuleOrderKeys(ruleOrder: string[] | undefined, editableRuleKeys: string[]): string[] {
  if (editableRuleKeys.length === 0) return [];
  const editableSet = new Set(editableRuleKeys);
  const cleaned = normalizeRuleOrderInput(ruleOrder);
  const next: string[] = [];
  const used = new Set<string>();

  for (const key of cleaned) {
    if (!editableSet.has(key) || used.has(key)) continue;
    used.add(key);
    next.push(key);
  }

  for (const key of editableRuleKeys) {
    if (used.has(key)) continue;
    used.add(key);
    next.push(key);
  }

  return next;
}

function normalizeFullRuleOrderKeys(ruleOrder: string[] | undefined, allRuleKeys: string[]): string[] {
  const allSet = new Set(allRuleKeys);
  return normalizeRuleOrderInput(ruleOrder).filter(
    (key) => allSet.has(key) || PRESET_MODULE_RULE_ORDER_KEY_SET.has(key)
  );
}

function applyEditableOnlyOrder(editableRuleKeys: string[], allRuleKeys: string[], editableOrder: string[]): string[] {
  const editableSet = new Set(editableRuleKeys);
  let editableIndex = 0;
  return allRuleKeys.map((key) => {
    if (!editableSet.has(key)) return key;
    const nextKey = editableOrder[editableIndex];
    editableIndex += 1;
    return nextKey ?? key;
  });
}

function usesFullRuleOrder(ruleOrder: string[] | undefined, editableRuleKeys: string[], allRuleKeys: string[]): boolean {
  const allSet = new Set([...allRuleKeys, ...PRESET_MODULE_RULE_ORDER_KEYS]);
  const editableSet = new Set(editableRuleKeys);
  return normalizeRuleOrderInput(ruleOrder).some((key) => allSet.has(key) && !editableSet.has(key));
}

function getRuleIdFromModuleRuleOrderKey(key: string): string | null {
  const parts = key.split(":");
  if (parts.length !== 3 || parts[0] !== "module") return null;
  return parts[2] || null;
}

function insertMovedModuleRuleAtSourceAnchor(
  orderedKeys: string[],
  activeRuleKeys: Set<string>,
  key: string
): boolean {
  const ruleId = getRuleIdFromModuleRuleOrderKey(key);
  if (!ruleId) return false;

  const anchorIndex = orderedKeys.findIndex((candidate) => {
    if (activeRuleKeys.has(candidate)) return false;
    if (!PRESET_MODULE_RULE_ORDER_KEY_SET.has(candidate)) return false;
    return getRuleIdFromModuleRuleOrderKey(candidate) === ruleId;
  });
  if (anchorIndex < 0) return false;

  orderedKeys.splice(anchorIndex, 0, key);
  return true;
}

export function hasFullRuleOrderKeys(ruleOrder: string[] | undefined): boolean {
  return normalizeRuleOrderInput(ruleOrder).some((key) => key.startsWith("module:") || key.startsWith("special:"));
}

type CanonicalRuleEntries = {
  preMatchEntries: GeneratedRuleEntry[];
  matchEntry: GeneratedRuleEntry;
};

function buildCanonicalRuleEntries(options: Omit<RulesGenerateOptions, "ruleOrder">): CanonicalRuleEntries {
  const {
    enabledModules,
    customRules,
    customProxyGroups = [],
    moduleRuleOverrides,
    moduleRuleExclusions,
    proxyGroupNameOverrides,
    experimentalCnUseCnRuleSet,
    cnIpNoResolve,
    availablePolicyTargets,
    fallbackPolicyTarget,
  } = options;
  const entries: GeneratedRuleEntry[] = [];
  const enabledSet = new Set(enabledModules);
  const resolvePolicyTarget = createPolicyTargetResolver({ availablePolicyTargets, fallbackPolicyTarget });
  const editableEntries = buildOrderedEditableEntries(customRules, customProxyGroups, undefined, resolvePolicyTarget);
  const emittedRuleKeys = new Set<string>();
  let insertedEditableEntries = false;

  const pushEditableEntries = () => {
    if (insertedEditableEntries || editableEntries.length === 0) return;
    insertedEditableEntries = true;
    entries.push(...editableEntries);
  };

  const pushModuleRuleEntry = (module: ProxyGroupModule, rule: ProxyGroupRule) => {
    const entry = buildModuleRuleEntry(module, rule, proxyGroupNameOverrides, cnIpNoResolve, resolvePolicyTarget);
    if (emittedRuleKeys.has(entry.key)) return;
    emittedRuleKeys.add(entry.key);
    entries.push(entry);
  };

  const pushAppleTvPlusAtCanonicalPosition = () => {
    if (!enabledSet.has("streaming-west")) return;
    const streamingWestModule = PROXY_GROUP_MODULES.find((item) => item.id === "streaming-west");
    if (!streamingWestModule) return;

    const appleTvPlusRule = getEffectiveModuleRules(streamingWestModule, moduleRuleOverrides, moduleRuleExclusions)
      .find((rule) => rule.id === "apple-tvplus");
    if (!appleTvPlusRule) return;

    // Keep the existing generated order without turning Apple TV+ into a special system rule.
    pushModuleRuleEntry(streamingWestModule, appleTvPlusRule);
  };

  const processedModules = new Set<string>();

  for (const moduleId of RULE_ORDER) {
    if (!insertedEditableEntries && moduleId === "gemini") {
      pushEditableEntries();
    }

    if (moduleId === "apple") {
      pushAppleTvPlusAtCanonicalPosition();
    }

    if (!enabledSet.has(moduleId)) continue;
    processedModules.add(moduleId);

    const ruleModule = PROXY_GROUP_MODULES.find((item) => item.id === moduleId);
    if (!ruleModule) continue;

    const effectiveRules = getEffectiveModuleRules(ruleModule, moduleRuleOverrides, moduleRuleExclusions);
    for (const rule of effectiveRules) {
      pushModuleRuleEntry(ruleModule, rule);
    }
  }

  for (const ruleModule of PROXY_GROUP_MODULES) {
    if (!enabledSet.has(ruleModule.id)) continue;
    if (processedModules.has(ruleModule.id)) continue;
    if (ruleModule.id === "final") continue;

    const effectiveRules = getEffectiveModuleRules(ruleModule, moduleRuleOverrides, moduleRuleExclusions);
    for (const rule of effectiveRules) {
      pushModuleRuleEntry(ruleModule, rule);
    }
  }

  pushEditableEntries();

  if (Boolean(experimentalCnUseCnRuleSet) && enabledSet.has("cn")) {
    const target = resolvePolicyTarget(resolveModuleName("cn", proxyGroupNameOverrides));
    entries.push(
      buildSpecialRuleEntry("special:experimental-cn", `RULE-SET,${EXPERIMENTAL_CN_RULE.id},${target}`, EXPERIMENTAL_CN_RULE.name, target)
    );
  }

  const finalTarget = resolvePolicyTarget(
    enabledSet.has("final")
      ? resolveModuleName("final", proxyGroupNameOverrides)
      : fallbackPolicyTarget ?? resolveModuleName("select", proxyGroupNameOverrides)
  );
  return {
    preMatchEntries: entries,
    matchEntry: buildSpecialRuleEntry("special:match", `MATCH,${finalTarget}`, "MATCH", finalTarget),
  };
}

export function normalizePersistedRuleOrder(options: RulesGenerateOptions): string[] {
  const { preMatchEntries } = buildCanonicalRuleEntries({
    enabledModules: options.enabledModules,
    customRules: options.customRules,
    customProxyGroups: options.customProxyGroups,
    moduleRuleOverrides: options.moduleRuleOverrides,
    moduleRuleExclusions: options.moduleRuleExclusions,
    proxyGroupNameOverrides: options.proxyGroupNameOverrides,
    experimentalCnUseCnRuleSet: options.experimentalCnUseCnRuleSet,
    cnIpNoResolve: options.cnIpNoResolve,
    availablePolicyTargets: options.availablePolicyTargets,
    fallbackPolicyTarget: options.fallbackPolicyTarget,
  });

  const allRuleKeys = preMatchEntries.map((entry) => entry.key);
  const editableRuleKeys = preMatchEntries.filter((entry) => entry.editable).map((entry) => entry.key);
  const cleaned = normalizeRuleOrderInput(options.ruleOrder);
  if (cleaned.length === 0) return [];

  if (usesFullRuleOrder(cleaned, editableRuleKeys, allRuleKeys)) {
    return normalizeFullRuleOrderKeys(cleaned, allRuleKeys);
  }

  return normalizeEditableRuleOrderKeys(cleaned, editableRuleKeys);
}

export function resolveAppliedRuleOrder(options: RulesGenerateOptions): string[] {
  const { preMatchEntries } = buildCanonicalRuleEntries({
    enabledModules: options.enabledModules,
    customRules: options.customRules,
    customProxyGroups: options.customProxyGroups,
    moduleRuleOverrides: options.moduleRuleOverrides,
    moduleRuleExclusions: options.moduleRuleExclusions,
    proxyGroupNameOverrides: options.proxyGroupNameOverrides,
    experimentalCnUseCnRuleSet: options.experimentalCnUseCnRuleSet,
    cnIpNoResolve: options.cnIpNoResolve,
    availablePolicyTargets: options.availablePolicyTargets,
    fallbackPolicyTarget: options.fallbackPolicyTarget,
  });

  const allRuleKeys = preMatchEntries.map((entry) => entry.key);
  const editableRuleKeys = preMatchEntries.filter((entry) => entry.editable).map((entry) => entry.key);
  const persistedOrder = normalizePersistedRuleOrder(options);

  if (persistedOrder.length === 0) {
    return allRuleKeys;
  }

  if (usesFullRuleOrder(persistedOrder, editableRuleKeys, allRuleKeys)) {
    const activeRuleKeySet = new Set(allRuleKeys);
    const next = persistedOrder.filter(
      (key) => activeRuleKeySet.has(key) || PRESET_MODULE_RULE_ORDER_KEY_SET.has(key)
    );
    const seen = new Set(next.filter((key) => activeRuleKeySet.has(key)));
    const editableSet = new Set(editableRuleKeys);
    const missingEditableKeys = editableRuleKeys.filter((key) => !seen.has(key));

    if (missingEditableKeys.length > 0) {
      const firstEditableIndex = allRuleKeys.findIndex((key) => editableSet.has(key));
      let inserted = false;

      for (let prevIndex = firstEditableIndex - 1; prevIndex >= 0; prevIndex -= 1) {
        const prevKey = allRuleKeys[prevIndex];
        const resultIndex = next.indexOf(prevKey);
        if (resultIndex < 0) continue;
        next.splice(resultIndex + 1, 0, ...missingEditableKeys);
        missingEditableKeys.forEach((key) => seen.add(key));
        inserted = true;
        break;
      }

      if (!inserted) {
        for (let nextIndex = firstEditableIndex + missingEditableKeys.length; nextIndex < allRuleKeys.length; nextIndex += 1) {
          const nextKey = allRuleKeys[nextIndex];
          const resultIndex = next.indexOf(nextKey);
          if (resultIndex < 0) continue;
          next.splice(resultIndex, 0, ...missingEditableKeys);
          missingEditableKeys.forEach((key) => seen.add(key));
          inserted = true;
          break;
        }
      }

      if (!inserted) {
        next.push(...missingEditableKeys);
        missingEditableKeys.forEach((key) => seen.add(key));
      }
    }

    for (const key of allRuleKeys) {
      if (seen.has(key)) continue;
      if (insertMovedModuleRuleAtSourceAnchor(next, activeRuleKeySet, key)) {
        seen.add(key);
        continue;
      }
      next.push(key);
      seen.add(key);
    }

    return next.filter((key) => activeRuleKeySet.has(key));
  }

  return applyEditableOnlyOrder(
    editableRuleKeys,
    allRuleKeys,
    normalizeEditableRuleOrderKeys(persistedOrder, editableRuleKeys)
  );
}

export function buildGeneratedRuleEntries(options: RulesGenerateOptions): GeneratedRuleEntry[] {
  const { preMatchEntries, matchEntry } = buildCanonicalRuleEntries({
    enabledModules: options.enabledModules,
    customRules: options.customRules,
    customProxyGroups: options.customProxyGroups,
    moduleRuleOverrides: options.moduleRuleOverrides,
    moduleRuleExclusions: options.moduleRuleExclusions,
    proxyGroupNameOverrides: options.proxyGroupNameOverrides,
    experimentalCnUseCnRuleSet: options.experimentalCnUseCnRuleSet,
    cnIpNoResolve: options.cnIpNoResolve,
    availablePolicyTargets: options.availablePolicyTargets,
    fallbackPolicyTarget: options.fallbackPolicyTarget,
  });
  const orderKeys = resolveAppliedRuleOrder(options);
  const byKey = new Map(preMatchEntries.map((entry) => [entry.key, entry]));
  const orderedEntries = orderKeys.map((key) => byKey.get(key)).filter(Boolean) as GeneratedRuleEntry[];

  return [...orderedEntries, matchEntry];
}

export function generateRules(options: RulesGenerateOptions): string[] {
  return buildGeneratedRuleEntries(options).map((entry) => entry.text);
}
