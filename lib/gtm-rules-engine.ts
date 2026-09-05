import { dynamicTool, jsonSchema, type ToolSet } from "ai";
import {
  fetchTaxonomyGtm,
  fetchReferenceConfig,
  type TaxonomyGtm,
  type TaxonomyEvents,
  type ReferenceConfig,
} from "@/lib/reference-data";
import { getOrgEvents, type OrgEvent } from "@/lib/org-events";
import type { GtmContainerMap } from "@/lib/gtm-containers";

// ── Naming helpers ────────────────────────────────────────────────────────────

function applyNamingPattern(name: string, pattern: string | undefined): string {
  if (!pattern) return name;
  return name;
}

function normaliseName(name: string, example: string | undefined): string {
  if (!example) return name;
  if (example.includes("_")) return name.replace(/-/g, "_");
  if (example.includes("-") && !example.includes("_")) return name.replace(/_/g, "-");
  return name;
}

// ── Event name fuzzy match ────────────────────────────────────────────────────

function findClosestEvent(
  eventName: string,
  events: Record<string, unknown>
): string | null {
  const lower = eventName.toLowerCase().replace(/[-\s]/g, "_");
  for (const key of Object.keys(events)) {
    if (key.toLowerCase() === lower) return key;
  }
  return null;
}

// ── MCP tool args types ───────────────────────────────────────────────────────

type Args = Record<string, unknown>;
type TagParam = { key: string; type: string; value?: string };

function exec(t: unknown): (args: Args) => Promise<unknown> {
  return (t as { execute: (args: Args) => Promise<unknown> }).execute;
}

function logArgs(args: Args, maxLength = 300): string {
  try {
    const s = JSON.stringify(args);
    return s.length > maxLength ? s.slice(0, maxLength) + "…" : s;
  } catch {
    return String(args);
  }
}

// ── KROK 1: findConfigIdVariable ─────────────────────────────────────────────
// Returns { count: 0 } | { count: 1; variableName; extractedValue } | { count: N; matches }
// Pattern: "const - {platformLabel} {idTypeLabel} ({value})"

type FindResult =
  | { count: 0 }
  | { count: 1; variableName: string; extractedValue: string }
  | { count: number; matches: string[] };

function findConfigIdVariable(
  variables: Array<{ name: string }>,
  platformLabel: string,
  idTypeLabel: string
): FindResult {
  const prefix = `const - ${platformLabel} ${idTypeLabel} (`;
  const matches = variables.filter(
    (v) => v.name.startsWith(prefix) && v.name.endsWith(")")
  );
  if (matches.length === 0) return { count: 0 };
  if (matches.length === 1) {
    const variableName = matches[0].name;
    const extractedValue = variableName.slice(prefix.length, -1);
    return { count: 1, variableName, extractedValue };
  }
  return { count: matches.length, matches: matches.map((v) => v.name) };
}

// ── Internal API helpers (call raw tools bypassing rules) ─────────────────────

async function rawListVariables(
  rawTools: ToolSet,
  containerId: string,
  workspaceId: string
): Promise<Array<{ name: string }>> {
  const tool = rawTools["gtm_variable"];
  if (!tool) return [];
  try {
    const raw = await exec(tool)({ action: "list", containerId, workspaceId });
    if (Array.isArray(raw)) return raw as Array<{ name: string }>;
    const str = typeof raw === "string" ? raw : JSON.stringify(raw);
    const parsed: unknown = JSON.parse(str);
    if (Array.isArray(parsed)) return parsed as Array<{ name: string }>;
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj?.variable)) return obj.variable as Array<{ name: string }>;
    // MCP may return a double-encoded string
    const inner: unknown = JSON.parse(str);
    if (inner && typeof inner === "object" && "variable" in (inner as object)) {
      return (inner as { variable: Array<{ name: string }> }).variable;
    }
    return [];
  } catch {
    return [];
  }
}

async function rawListTags(
  rawTools: ToolSet,
  containerId: string,
  workspaceId: string
): Promise<string> {
  const tool = rawTools["gtm_tag"];
  if (!tool) return "";
  try {
    const raw = await exec(tool)({ action: "list", containerId, workspaceId });
    return typeof raw === "string" ? raw : JSON.stringify(raw);
  } catch {
    return "";
  }
}

async function rawCreateVariable(
  rawTools: ToolSet,
  containerId: string,
  workspaceId: string,
  config: Args
): Promise<void> {
  const tool = rawTools["gtm_variable"];
  if (!tool) return;
  await exec(tool)({ action: "create", containerId, workspaceId, createOrUpdateConfig: config });
}

async function rawCreateTag(
  rawTools: ToolSet,
  containerId: string,
  workspaceId: string,
  config: Args
): Promise<void> {
  const tool = rawTools["gtm_tag"];
  if (!tool) return;
  await exec(tool)({ action: "create", containerId, workspaceId, createOrUpdateConfig: config });
}

// ── Ensure DLV ecommerce.items exists, return its reference string ────────────

async function ensureEcommerceItemsDlv(
  rawTools: ToolSet,
  containerId: string,
  workspaceId: string
): Promise<string> {
  const dlvName = "DLV - ecommerce.items";
  try {
    const vars = await rawListVariables(rawTools, containerId, workspaceId);
    if (!vars.some((v) => v.name === dlvName)) {
      await rawCreateVariable(rawTools, containerId, workspaceId, {
        name: dlvName,
        type: "v",
        parameter: [
          { key: "name", type: "TEMPLATE", value: "ecommerce.items" },
          { key: "dataLayerVersion", type: "INTEGER", value: "2" },
        ],
      });
    }
  } catch {
    // Non-fatal
  }
  return `{{${dlvName}}}`;
}

// ── Platform → consent settings lookup ───────────────────────────────────────

function buildTypeToPlatform(platforms: Record<string, unknown>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [platformKey, platform] of Object.entries(platforms)) {
    const tagTypes = (platform as Record<string, unknown>).tag_types;
    if (!tagTypes || typeof tagTypes !== "object" || Array.isArray(tagTypes)) continue;
    for (const typeDef of Object.values(tagTypes as Record<string, unknown>)) {
      const gtmType = (typeDef as Record<string, unknown>)?.gtm_type;
      if (typeof gtmType === "string" && !map.has(gtmType)) {
        map.set(gtmType, platformKey);
      }
    }
  }
  return map;
}

// ── Rules engine factory ──────────────────────────────────────────────────────

const PUBLIC_ID_RE = /^GTM-[A-Z0-9]+$/i;

function resolveContainerId(args: Args, containerMap: GtmContainerMap): Args {
  const raw = args.containerId as string | undefined;
  if (!raw || !PUBLIC_ID_RE.test(raw)) return args;
  const upper = raw.toUpperCase();
  const info = containerMap.get(upper) ?? containerMap.get(raw);
  if (!info) return args;
  const changes: Args = { containerId: info.containerId };
  const logParts = [`containerId ${raw} → ${info.containerId}`];
  if (args.accountId && args.accountId !== info.accountId) {
    changes.accountId = info.accountId;
    logParts.push(`accountId ${args.accountId as string} → ${info.accountId}`);
  }
  console.log(`[rules] translated ${logParts.join(", ")}`);
  return { ...args, ...changes };
}

function orgEventsToTaxonomy(events: Awaited<ReturnType<typeof getOrgEvents>>): TaxonomyEvents {
  const ga4: Record<string, { description?: string; parameters?: Record<string, { type?: string; required?: boolean; description?: string }> }> = {};
  const meta: Record<string, { description?: string; parameters?: Record<string, { type?: string; required?: boolean; description?: string }> }> = {};
  const tiktok: Record<string, { description?: string; parameters?: Record<string, { type?: string; required?: boolean; description?: string }> }> = {};

  for (const e of events) {
    const params: Record<string, { type?: string; required?: boolean; description?: string }> = {};
    for (const p of e.parameters) params[p] = {};
    ga4[e.event_name] = { description: e.description, parameters: params };
    if (e.meta_event) meta[e.meta_event] = {};
    if (e.tiktok_event) tiktok[e.tiktok_event] = {};
  }

  return {
    platforms: {
      ga4: { events: ga4 },
      ...(Object.keys(meta).length > 0 ? { meta: { events: meta } } : {}),
      ...(Object.keys(tiktok).length > 0 ? { tiktok: { events: tiktok } } : {}),
    },
  };
}

export async function wrapToolsWithRules(rawTools: ToolSet, containerMap: GtmContainerMap, orgId: string): Promise<ToolSet> {
  const [taxonomyGtm, rawOrgEvents, referenceConfig] = await Promise.all([
    fetchTaxonomyGtm().catch(() => ({} as TaxonomyGtm)),
    getOrgEvents(orgId).catch(() => [] as OrgEvent[]),
    fetchReferenceConfig().catch(() => ({} as ReferenceConfig)),
  ]);
  const taxonomyEvents = orgEventsToTaxonomy(rawOrgEvents);

  const wrapped: ToolSet = {};

  for (const [toolName, tool] of Object.entries(rawTools)) {
    // Action-based tools (Stape MCP): gtm_tag, gtm_variable, gtm_trigger
    const isGtmTag = toolName === "gtm_tag";
    const isGtmVariable = toolName === "gtm_variable";
    const isGtmTrigger = toolName === "gtm_trigger";
    const isActionBased = isGtmTag || isGtmVariable || isGtmTrigger;

    // Legacy tool names (fallback for non-Stape APIs)
    const legacyMutatingTags =
      !isActionBased &&
      (toolName.includes("create_tag") || toolName.includes("update_tag"));
    const legacyMutatingTriggers =
      !isActionBased &&
      (toolName.includes("create_trigger") || toolName.includes("update_trigger"));
    const legacyMutatingVariables =
      !isActionBased &&
      (toolName.includes("create_variable") || toolName.includes("update_variable"));
    const legacyMutating = legacyMutatingTags || legacyMutatingTriggers || legacyMutatingVariables;

    // Non-mutating tools: simple pass-through with containerId resolution
    if (!isActionBased && !legacyMutating) {
      wrapped[toolName] = dynamicTool({
        description: (tool as { description?: string }).description ?? "",
        inputSchema:
          (tool as { inputSchema?: ReturnType<typeof jsonSchema> }).inputSchema ??
          jsonSchema<Args>({ type: "object", properties: {} }),
        execute: async (rawInput) => {
          const translated = resolveContainerId(rawInput as Args, containerMap);
          console.log(`[rules:${toolName}] →`, logArgs(translated));
          const t0 = Date.now();
          try {
            const result = await exec(tool)(translated);
            console.log(`[rules:${toolName}] ✓ [${Date.now() - t0}ms]`);
            return result;
          } catch (err) {
            console.error(`[rules:${toolName}] ✗ [${Date.now() - t0}ms]:`, err instanceof Error ? err.stack ?? err.message : err);
            throw err;
          }
        },
      });
      continue;
    }

    // Mutating / action-based tools: apply full rules pipeline
    wrapped[toolName] = dynamicTool({
      description: (tool as { description?: string }).description ?? "",
      inputSchema:
        (tool as { inputSchema?: ReturnType<typeof jsonSchema> }).inputSchema ??
        jsonSchema<Args>({ type: "object", properties: {} }),
      execute: async (rawInput) => {
        const args = rawInput as Args;
        const action = args.action as string | undefined;

        // Determine mutation type — for action-based tools, read from action field
        const isMutatingTags =
          (isGtmTag && (action === "create" || action === "update")) || legacyMutatingTags;
        const isMutatingTriggers =
          (isGtmTrigger && (action === "create" || action === "update")) || legacyMutatingTriggers;
        const isMutatingVariables =
          (isGtmVariable && (action === "create" || action === "update")) || legacyMutatingVariables;
        const isMutating = isMutatingTags || isMutatingTriggers || isMutatingVariables;

        // Read-only actions (list, get, remove, revert): just pass through
        if (!isMutating) {
          const translated = resolveContainerId(args, containerMap);
          console.log(`[rules:${toolName}:${action ?? "?"}] →`, logArgs(translated));
          const t0 = Date.now();
          try {
            const result = await exec(tool)(translated);
            console.log(`[rules:${toolName}:${action ?? "?"}] ✓ [${Date.now() - t0}ms]`);
            return result;
          } catch (err) {
            console.error(`[rules:${toolName}:${action ?? "?"}] ✗ [${Date.now() - t0}ms]:`, err instanceof Error ? err.stack ?? err.message : err);
            throw err;
          }
        }

        const mutated: Args = resolveContainerId({ ...args }, containerMap);

        // ── Config accessors ───────────────────────────────────────────────────
        // For Stape MCP (gtm_tag/gtm_variable/gtm_trigger), data is in createOrUpdateConfig.
        // For legacy APIs, data is at the top level.
        const getCfg = (): Args => {
          if (isActionBased) return (mutated.createOrUpdateConfig ?? {}) as Args;
          return mutated;
        };
        const patchCfg = (patch: Partial<Args>): void => {
          if (isActionBased) {
            mutated.createOrUpdateConfig = { ...(mutated.createOrUpdateConfig as Args ?? {}), ...patch };
          } else {
            Object.assign(mutated, patch);
          }
        };

        const cfg = getCfg();
        const tagType = isMutatingTags ? ((cfg.type as string | undefined) ?? "") : "";

        // Working copy of parameters (mutable)
        const tagParams: TagParam[] = isMutatingTags
          ? (Array.isArray(cfg.parameter) ? [...(cfg.parameter as TagParam[])] : [])
          : [];

        const getParam = (key: string): string | undefined =>
          tagParams.find((p) => p.key === key)?.value;

        const setParam = (key: string, type: string, value: string): void => {
          const existing = tagParams.find((p) => p.key === key);
          if (existing) existing.value = value;
          else tagParams.push({ key, type, value });
        };

        const commitParams = (): void => patchCfg({ parameter: tagParams });

        const containerId = mutated.containerId as string;
        const workspaceId = mutated.workspaceId as string;

        // ── 1. NAMING ──────────────────────────────────────────────────────────
        const naming = taxonomyGtm.naming_taxonomy;
        const cfgName = cfg.name as string | undefined;
        if (naming && typeof cfgName === "string") {
          if (isMutatingTags && naming.tag) {
            patchCfg({ name: applyNamingPattern(normaliseName(cfgName, naming.tag.example), naming.tag.pattern) });
          } else if (isMutatingTriggers && naming.trigger) {
            patchCfg({ name: normaliseName(cfgName, naming.trigger.example) });
          } else if (isMutatingVariables && naming.variable) {
            patchCfg({ name: normaliseName(cfgName, naming.variable.example) });
          }
        }

        // ── 2. TAG TYPE VALIDATION ─────────────────────────────────────────────
        if (isMutatingTags && tagType && taxonomyGtm.platforms) {
          const allAllowedTypes = Array.from(
            new Set(
              Object.values(taxonomyGtm.platforms).flatMap((p) =>
                Object.values(p.tag_types ?? {})
                  .map((t) => ((t as unknown as Record<string, unknown>)?.gtm_type) as string | undefined)
                  .filter((v): v is string => typeof v === "string")
              )
            )
          );
          if (allAllowedTypes.length > 0 && !allAllowedTypes.includes(tagType)) {
            throw new Error(
              `Tag type "${tagType}" is not allowed. Permitted types: ${allAllowedTypes.join(", ")}.`
            );
          }
        }

        // ── 3. INITIALIZATION TRIGGER FOR CONFIG TAGS ──────────────────────────
        // googtag (config) and gclidw (Conversion Linker) must fire on Initialization - All Pages
        if (isMutatingTags) {
          const CONFIG_TAG_TYPES = ["googtag", "gclidw"];
          const INIT_TRIGGER_ID = "2147479572";
          if (CONFIG_TAG_TYPES.includes(tagType)) {
            const existing = (getCfg().firingTriggerId as string[] | undefined) ?? [];
            if (!existing.includes(INIT_TRIGGER_ID)) {
              patchCfg({ firingTriggerId: [...existing, INIT_TRIGGER_ID] });
            }
          }
        }

        // ── 4. CONSENT SETTINGS ────────────────────────────────────────────────
        // Google platforms (GA4, Ads, Floodlight): notSet (no additional consent check).
        // Meta: needed with ad_storage.
        if (isMutatingTags) {
          const consentSettingsMap = (taxonomyGtm as Record<string, unknown>).consent_settings as
            | Record<string, { additional_consent_required?: string[] }>
            | undefined;

          if (consentSettingsMap && taxonomyGtm.platforms) {
            const typeToPlatform = buildTypeToPlatform(
              taxonomyGtm.platforms as Record<string, unknown>
            );
            let platformKey = typeToPlatform.get(tagType);
            // Heuristic for gallery templates (Meta uses pixelId param)
            if (!platformKey) {
              const hasPixelId = tagParams.some((p) => p.key === "pixelId");
              const typeIsMetaLike =
                tagType.includes("meta") || tagType.includes("facebook") || tagType.includes("fbq");
              if (hasPixelId || typeIsMetaLike) platformKey = "meta";
            }
            if (platformKey) {
              const additional = consentSettingsMap[platformKey]?.additional_consent_required ?? [];
              if (additional.length === 0) {
                mutated.consentSettings = { consentStatus: "notSet" };
              } else {
                mutated.consentSettings = {
                  consentStatus: "needed",
                  consentType: {
                    type: "LIST",
                    list: additional.map((v) => ({ type: "STRING", value: v })),
                  },
                };
              }
            }
          }
        }

        // ── 5. CONFIG TAG DEPENDENCY (auto-create if required) ─────────────────
        if (isMutatingTags && taxonomyGtm.platforms) {
          const implRules = (taxonomyGtm as Record<string, unknown>).implementation_rules as
            | Record<string, Record<string, { rule?: string; requires_existing_config?: boolean }>>
            | undefined;

          if (implRules) {
            for (const [platformKey, platform] of Object.entries(taxonomyGtm.platforms)) {
              const platformTyped = platform as {
                platform_name?: string;
                tag_types?: Record<string, { gtm_type?: string }>;
              };
              const tagTypes = platformTyped.tag_types ?? {};
              // Find which type key this tagType maps to
              let tagTypeKey: string | null = null;
              for (const [tk, td] of Object.entries(tagTypes)) {
                if (td.gtm_type === tagType) { tagTypeKey = tk; break; }
              }
              if (!tagTypeKey) continue;
              const typeRule = implRules[platformKey]?.[tagTypeKey];
              if (typeRule?.rule !== "require_existing_config_or_autocreate") continue;

              // Find config tag type for this platform
              const configGtmType = tagTypes["configuration"]?.gtm_type;
              if (!configGtmType) continue;

              try {
                const existingStr = await rawListTags(rawTools, containerId, workspaceId);
                if (!existingStr.includes(`"${configGtmType}"`)) {
                  await rawCreateTag(rawTools, containerId, workspaceId, {
                    name: `${platformTyped.platform_name ?? platformKey} - config`,
                    type: configGtmType,
                    parameter: [],
                    firingTriggerId: ["2147479572"],
                  });
                }
              } catch {
                // Non-fatal
              }
              break;
            }
          }
        }

        // ── 6. REQUIRED RESOURCES FROM REFERENCE-CONFIG ────────────────────────
        if (isMutatingTags && referenceConfig.triggers) {
          const createTriggerTool = rawTools["gtm_trigger"];
          if (createTriggerTool) {
            try {
              const existingTriggersRaw = await exec(rawTools["gtm_trigger"] ?? createTriggerTool)({
                action: "list", containerId, workspaceId,
              });
              const existingStr =
                typeof existingTriggersRaw === "string"
                  ? existingTriggersRaw
                  : JSON.stringify(existingTriggersRaw);
              for (const refTrigger of referenceConfig.triggers) {
                if (!existingStr.includes(refTrigger.name)) {
                  const { name, type, filter, ...rest } = refTrigger;
                  await exec(createTriggerTool)({
                    action: "create", containerId, workspaceId,
                    createOrUpdateConfig: {
                      name, type,
                      ...(filter ? { filter } : {}),
                      ...rest,
                    },
                  });
                }
              }
            } catch {
              // Non-fatal
            }
          }
        }

        if (isMutatingTags && referenceConfig.variables) {
          const createVarTool = rawTools["gtm_variable"];
          if (createVarTool) {
            try {
              const vars = await rawListVariables(rawTools, containerId, workspaceId);
              const existingNames = new Set(vars.map((v) => v.name));
              for (const refVar of referenceConfig.variables) {
                if (!existingNames.has(refVar.name)) {
                  await exec(createVarTool)({
                    action: "create", containerId, workspaceId,
                    createOrUpdateConfig: { ...refVar },
                  });
                }
              }
            } catch {
              // Non-fatal
            }
          }
        }

        // ── 7. EVENT / PARAMETER NAME VALIDATION (GA4, Meta) ───────────────────
        if (isMutatingTags) {
          const isGA4Event = tagType === "gaawe" || tagType.includes("ga4");
          const isMeta =
            tagType.includes("meta") || tagType.includes("facebook") || tagType.includes("fbq") ||
            tagParams.some((p) => p.key === "pixelId");

          const eventName = extractEventName(mutated, tagParams);

          if (eventName && taxonomyEvents.platforms) {
            const platformKey = isGA4Event ? "ga4" : isMeta ? "meta" : null;
            if (platformKey) {
              const platformData = taxonomyEvents.platforms[platformKey];
              if (platformData?.events) {
                const events = platformData.events;
                if (!events[eventName]) {
                  const corrected = findClosestEvent(eventName, events);
                  if (corrected) {
                    setEventNameInParams(tagParams, corrected);
                    commitParams();
                  } else {
                    const available = Object.keys(events).join(", ");
                    throw new Error(
                      `Event name "${eventName}" is not in the ${platformKey.toUpperCase()} taxonomy. ` +
                        `Available events: ${available}.`
                    );
                  }
                }
                // Parameter name validation
                const paramNames = extractParamNames(tagParams);
                const allowedParams = Object.keys(events[eventName]?.parameters ?? {});
                if (allowedParams.length > 0) {
                  for (const param of paramNames) {
                    if (!allowedParams.includes(param)) {
                      const corrected = findClosestEvent(param, events[eventName]?.parameters ?? {});
                      if (corrected) replaceParamNameInParams(tagParams, param, corrected);
                    }
                  }
                  commitParams();
                }
              }
            }
          }
        }

        // ── 8. REQUIRED PARAMETER VALIDATION (GA4, Meta) ───────────────────────
        if (isMutatingTags && rawOrgEvents.length > 0) {
          const isGA4Event = tagType === "gaawe";
          const isMeta =
            tagType.includes("meta") || tagType.includes("facebook") || tagType.includes("fbq") ||
            tagParams.some((p) => p.key === "pixelId");

          if (isGA4Event || isMeta) {
            const eventName = extractEventName(mutated, tagParams);
            if (eventName) {
              const orgEvent = isGA4Event
                ? rawOrgEvents.find((e) => e.event_name === eventName)
                : rawOrgEvents.find((e) => e.meta_event === eventName);
              if (orgEvent) {
                const required = isMeta
                  ? (orgEvent.required_meta_parameters ?? [])
                  : (orgEvent.required_parameters ?? []);
                if (required.length > 0) {
                  const present = extractParamNames(tagParams);
                  const missing = required.filter((p) => !present.includes(p));
                  if (missing.length > 0) {
                    throw new Error(
                      `Tag for event "${eventName}" is missing required parameters: ${missing.join(", ")}. ` +
                        `All required parameters must be included before creating the tag.`
                    );
                  }
                }
              }
            }
          }
        }

        // ── 9. GOOGTAG: Tag ID → constant variable (KROKs 2, 3.1 partial, 4) ───
        // When a googtag config tag is created with a literal tag ID, wrap it in a const variable.
        // GA4: G-XXXXX → "const - GA4 ID (G-XXXXX)"
        // GAds: AW-XXXXX → "const - GAds Conversion ID (AW-XXXXX)"
        // Floodlight: DC-XXXXX → "const - FL Advertiser ID (DC-XXXXX)"
        if (isMutatingTags && tagType === "googtag") {
          const tagIdParam = tagParams.find((p) => p.key === "tagId");
          if (tagIdParam?.value && !tagIdParam.value.startsWith("{{")) {
            const rawId = tagIdParam.value;
            let platformLabel = "";
            let idTypeLabel = "";
            if (rawId.startsWith("G-")) { platformLabel = "GA4"; idTypeLabel = "ID"; }
            else if (rawId.startsWith("AW-")) { platformLabel = "GAds"; idTypeLabel = "Conversion ID"; }
            else if (rawId.startsWith("DC-")) { platformLabel = "FL"; idTypeLabel = "Advertiser ID"; }

            if (platformLabel) {
              try {
                const vars = await rawListVariables(rawTools, containerId, workspaceId);
                const found = findConfigIdVariable(vars, platformLabel, idTypeLabel);
                if (found.count === 0) {
                  const varName = `const - ${platformLabel} ${idTypeLabel} (${rawId})`;
                  await rawCreateVariable(rawTools, containerId, workspaceId, {
                    name: varName,
                    type: "c",
                    parameter: [{ key: "value", type: "TEMPLATE", value: rawId }],
                  });
                  setParam("tagId", "TEMPLATE", `{{${varName}}}`);
                  commitParams();
                } else if (found.count === 1) {
                  setParam("tagId", "TEMPLATE", `{{${(found as { count: 1; variableName: string }).variableName}}}`);
                  commitParams();
                } else {
                  const ms = (found as { count: number; matches: string[] }).matches;
                  throw new Error(
                    `Multiple ${platformLabel} ${idTypeLabel} variables found: ${ms.join(", ")}. ` +
                      `Please specify which one to use for this tag.`
                  );
                }
              } catch (e) {
                if (e instanceof Error && e.message.startsWith("Multiple")) throw e;
                // Other errors: non-fatal, proceed with literal ID
              }
            }
          }
        }

        // ── 10. AWCT: Conversion ID → constant variable (KROK 3.1) ──────────────
        // When creating an awct (Google Ads Conversion Tracking) tag, wrap the literal
        // Conversion ID in a "const - GAds Conversion ID (*)" variable.
        if (isMutatingTags && tagType === "awct") {
          const convIdParam = tagParams.find((p) => p.key === "conversionId");
          if (convIdParam?.value && !convIdParam.value.startsWith("{{")) {
            const rawId = convIdParam.value;
            try {
              const vars = await rawListVariables(rawTools, containerId, workspaceId);
              const found = findConfigIdVariable(vars, "GAds", "Conversion ID");
              if (found.count === 0) {
                const varName = `const - GAds Conversion ID (${rawId})`;
                await rawCreateVariable(rawTools, containerId, workspaceId, {
                  name: varName,
                  type: "c",
                  parameter: [{ key: "value", type: "TEMPLATE", value: rawId }],
                });
                setParam("conversionId", "TEMPLATE", `{{${varName}}}`);
                commitParams();
              } else if (found.count === 1) {
                setParam("conversionId", "TEMPLATE", `{{${(found as { count: 1; variableName: string }).variableName}}}`);
                commitParams();
              } else {
                const ms = (found as { count: number; matches: string[] }).matches;
                throw new Error(
                  `Multiple GAds Conversion ID variables found: ${ms.join(", ")}. ` +
                    `Please specify which one to use.`
                );
              }
            } catch (e) {
              if (e instanceof Error && e.message.startsWith("Multiple")) throw e;
            }
          }
        }

        // ── 11. AWCT: Product-level sales data (KROK 3.4) ─────────────────────
        // When creating awct for ecommerce conversions (conversionValue + currencyCode set),
        // auto-enable product reporting with Data Layer source and ecommerce.items DLV.
        if (isMutatingTags && tagType === "awct") {
          const hasConvValue = !!getParam("conversionValue");
          const hasCurrency = !!getParam("currencyCode");
          const alreadyEnabled = getParam("enableProductReporting") === "true";

          // Auto-enable product reporting for ecommerce awct (has value + currency set)
          if (hasConvValue && hasCurrency && !alreadyEnabled) {
            setParam("enableProductReporting", "BOOLEAN", "true");
          }

          // Enforce correct config when product reporting is on
          if (getParam("enableProductReporting") === "true") {
            // Always use Data Layer as source
            setParam("productReportingDataSource", "TEMPLATE", "s-32");

            // Ensure items DLV exists and is referenced
            if (!getParam("items")) {
              try {
                const itemsRef = await ensureEcommerceItemsDlv(rawTools, containerId, workspaceId);
                setParam("items", "TEMPLATE", itemsRef);
              } catch {
                // Non-fatal
              }
            }
            commitParams();
          }
        }

        // ── 12. CONVERSION LINKER AUTO-CREATE (KROK 3.5) ──────────────────────
        // When creating any Google Ads tag (awct or sp), ensure a gclidw tag exists.
        if (isMutatingTags && (tagType === "awct" || tagType === "sp")) {
          try {
            const existingStr = await rawListTags(rawTools, containerId, workspaceId);
            const hasLinker = existingStr.includes('"gclidw"') || existingStr.includes("\"type\":\"gclidw\"");
            if (!hasLinker) {
              await rawCreateTag(rawTools, containerId, workspaceId, {
                name: "GAds - config - Conversion Linker",
                type: "gclidw",
                parameter: [],
                firingTriggerId: ["2147479572"],
              });
            }
          } catch {
            // Non-fatal
          }
        }

        // ── 13. META: Pixel ID → constant variable (KROK 5) ───────────────────
        // When creating a Meta gallery template tag with a literal pixelId,
        // wrap it in a "const - Meta Pixel ID (*)" variable.
        if (isMutatingTags) {
          const pixelIdParam = tagParams.find((p) => p.key === "pixelId");
          if (pixelIdParam?.value && !pixelIdParam.value.startsWith("{{")) {
            const rawId = pixelIdParam.value;
            try {
              const vars = await rawListVariables(rawTools, containerId, workspaceId);
              const found = findConfigIdVariable(vars, "Meta", "Pixel ID");
              if (found.count === 0) {
                const varName = `const - Meta Pixel ID (${rawId})`;
                await rawCreateVariable(rawTools, containerId, workspaceId, {
                  name: varName,
                  type: "c",
                  parameter: [{ key: "value", type: "TEMPLATE", value: rawId }],
                });
                setParam("pixelId", "TEMPLATE", `{{${varName}}}`);
                commitParams();
              } else if (found.count === 1) {
                setParam("pixelId", "TEMPLATE", `{{${(found as { count: 1; variableName: string }).variableName}}}`);
                commitParams();
              } else {
                const ms = (found as { count: number; matches: string[] }).matches;
                throw new Error(
                  `Multiple Meta Pixel ID variables found: ${ms.join(", ")}. ` +
                    `Please specify which one to use.`
                );
              }
            } catch (e) {
              if (e instanceof Error && e.message.startsWith("Multiple")) throw e;
            }
          }
        }

        // ── 14. META: ecommerce content_type + content_ids CJS (KROK 5) ────────
        // For Meta ecommerce events (Purchase, AddToCart, ViewContent), auto-set
        // content_type="product" and content_ids referencing a CJS variable.
        if (isMutatingTags) {
          const META_ECOMMERCE_EVENTS = ["Purchase", "AddToCart", "ViewContent"];
          const metaEventName = getParam("event") ?? getParam("eventName") ?? getParam("event_name");
          if (metaEventName && META_ECOMMERCE_EVENTS.includes(metaEventName)) {
            if (!getParam("content_type")) {
              setParam("content_type", "TEMPLATE", "product");
            }
            if (!getParam("content_ids")) {
              try {
                // Ensure ecommerce.items DLV exists first
                await ensureEcommerceItemsDlv(rawTools, containerId, workspaceId);

                const cjsName = "CJS - Meta content_ids";
                const vars = await rawListVariables(rawTools, containerId, workspaceId);
                if (!vars.some((v) => v.name === cjsName)) {
                  const cjsCode =
                    "function() {\n" +
                    "  var items = {{DLV - ecommerce.items}} || [];\n" +
                    "  return items.map(function(i) { return i.item_id || i.id || ''; });\n" +
                    "}";
                  await rawCreateVariable(rawTools, containerId, workspaceId, {
                    name: cjsName,
                    type: "jsm",
                    parameter: [{ key: "javascript", type: "TEMPLATE", value: cjsCode }],
                  });
                }
                setParam("content_ids", "TEMPLATE", `{{${cjsName}}}`);
              } catch {
                // Non-fatal
              }
            }
            commitParams();
          }
        }

        // ── Execute the original tool with mutated args ─────────────────────────
        console.log(`[rules:${toolName}:${action ?? "?"}] →`, logArgs(mutated));
        const t0 = Date.now();
        try {
          const result = await exec(tool)(mutated);
          console.log(`[rules:${toolName}:${action ?? "?"}] ✓ [${Date.now() - t0}ms]`);
          return result;
        } catch (err) {
          console.error(`[rules:${toolName}:${action ?? "?"}] ✗ [${Date.now() - t0}ms]:`, err instanceof Error ? err.stack ?? err.message : err);
          throw err;
        }
      },
    });
  }

  return wrapped;
}

// ── Helpers to extract/set event names and parameters from GTM tag param arrays ──

function extractEventName(args: Args, tagParams?: TagParam[]): string | null {
  // Try structured parameter array first (Stape MCP: createOrUpdateConfig.parameter)
  const params = tagParams ?? (args.parameter as TagParam[] | undefined);
  if (Array.isArray(params)) {
    const ep = params.find((p) => p.key === "eventName" || p.key === "event_name" || p.key === "event");
    if (ep?.value) return ep.value;
  }
  // Legacy: flat args
  const flat = args.parameter as Array<{ key: string; value?: string }> | undefined;
  if (!Array.isArray(flat)) return null;
  const ep = flat.find((p) => p.key === "eventName" || p.key === "event_name" || p.key === "event");
  return ep?.value ?? null;
}

function setEventNameInParams(tagParams: TagParam[], name: string): void {
  const ep = tagParams.find((p) => p.key === "eventName" || p.key === "event_name" || p.key === "event");
  if (ep) ep.value = name;
}

function extractParamNames(tagParams: TagParam[]): string[] {
  return tagParams
    .filter((p) => p.key === "eventParameters" || p.key === "userProperties")
    .flatMap((p) => {
      try {
        const list = JSON.parse(p.value ?? "[]") as Array<{ name?: string }>;
        return list.map((item) => item.name ?? "").filter(Boolean);
      } catch {
        return [];
      }
    });
}

function replaceParamNameInParams(tagParams: TagParam[], oldName: string, newName: string): void {
  for (const p of tagParams) {
    if (p.key === "eventParameters" || p.key === "userProperties") {
      try {
        const list = JSON.parse(p.value ?? "[]") as Array<{ name?: string }>;
        for (const item of list) {
          if (item.name === oldName) item.name = newName;
        }
        p.value = JSON.stringify(list);
      } catch {
        // ignore
      }
    }
  }
}
