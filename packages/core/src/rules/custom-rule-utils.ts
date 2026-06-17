import type { CustomProxyGroup, CustomRule } from "@subboost/core/types/config";

export const CUSTOM_RULE_TYPES = [
  "DOMAIN",
  "DOMAIN-SUFFIX",
  "DOMAIN-KEYWORD",
  "IP-CIDR",
  "IP-CIDR6",
  "GEOIP",
  "GEOSITE",
  "PROCESS-NAME",
  "DST-PORT",
  "SRC-PORT",
  "RULE-SET",
] as const satisfies readonly CustomRule["type"][];

const customRuleTypeSet = new Set<string>(CUSTOM_RULE_TYPES);

export function isCustomRuleType(value: string): value is CustomRule["type"] {
  return customRuleTypeSet.has(value);
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSlug(value: string): string {
  let out = "";
  let pendingDash = false;
  for (const char of value.toLowerCase()) {
    const isAsciiLetterOrDigit = (char >= "a" && char <= "z") || (char >= "0" && char <= "9");
    if (isAsciiLetterOrDigit) {
      if (pendingDash && out) out += "-";
      out += char;
      pendingDash = false;
    } else {
      pendingDash = true;
    }
  }
  return out || "item";
}

function buildDeterministicCustomRuleId(rule: Pick<CustomRule, "type" | "value" | "target">, index: number): string {
  return [
    "custom-rule",
    toSlug(rule.type),
    toSlug(rule.value).slice(0, 24),
    toSlug(rule.target).slice(0, 24),
    String(index + 1),
  ].join("-");
}

export function createCustomRuleId(): string {
  return `custom-rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ensureCustomRuleId(
  rule: Omit<CustomRule, "id"> & Partial<Pick<CustomRule, "id">>,
  index = 0
): CustomRule {
  const id = toTrimmedString(rule.id) || buildDeterministicCustomRuleId(rule, index);
  return {
    ...rule,
    id,
  };
}

export function ensureCustomRulesHaveIds(rules: CustomRule[] | Array<Omit<CustomRule, "id"> & Partial<Pick<CustomRule, "id">>>): CustomRule[] {
  return Array.isArray(rules) ? rules.map((rule, index) => ensureCustomRuleId(rule, index)) : [];
}

export function getCustomRuleOrderKey(ruleId: string): string {
  return `custom-rule:${ruleId}`;
}

export function getCustomGroupRuleOrderKey(groupId: string, ruleId: string): string {
  return `custom-group:${groupId}:${ruleId}`;
}

export function listEditableRuleOrderKeys(customRules: CustomRule[], customProxyGroups: CustomProxyGroup[] = []): string[] {
  const keys: string[] = [];
  for (const rule of ensureCustomRulesHaveIds(customRules)) {
    keys.push(getCustomRuleOrderKey(rule.id));
  }
  for (const group of customProxyGroups) {
    const groupId = toTrimmedString(group?.id);
    if (!groupId || !Array.isArray(group?.rules)) continue;
    for (const rule of group.rules) {
      const ruleId = toTrimmedString(rule?.id);
      if (!ruleId) continue;
      keys.push(getCustomGroupRuleOrderKey(groupId, ruleId));
    }
  }
  return keys;
}

export function reconcileRuleOrder(
  ruleOrder: string[] | undefined,
  customRules: CustomRule[],
  customProxyGroups: CustomProxyGroup[] = []
): string[] {
  const available = listEditableRuleOrderKeys(customRules, customProxyGroups);
  if (available.length === 0) return [];

  const availableSet = new Set(available);
  const next: string[] = [];
  const seen = new Set<string>();

  if (Array.isArray(ruleOrder)) {
    for (const rawKey of ruleOrder) {
      const key = toTrimmedString(rawKey);
      if (!key || seen.has(key) || !availableSet.has(key)) continue;
      seen.add(key);
      next.push(key);
    }
  }

  for (const key of available) {
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(key);
  }

  return next;
}
