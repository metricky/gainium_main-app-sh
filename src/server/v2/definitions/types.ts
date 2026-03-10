/**
 * Field and section definition types for AI agent discovery endpoints.
 *
 * These types describe what each bot/indicator field expects: its data type,
 * whether it's required, validation constraints, allowed enum values, and an
 * example value. They are intentionally runtime-serialisable (plain objects,
 * no class instances) so they can be returned directly from HTTP handlers.
 */

/** Describes how a field value is represented at runtime. */
export type FieldType =
  | 'string' // plain string (non-numeric)
  | 'number' // JS number
  | 'numberInString' // numeric value encoded as a string, e.g. "2.5"
  | 'boolean' // true / false
  | 'enum' // string that must be one of a fixed set
  | 'array' // array – see itemType
  | 'object' // nested object

export type FieldDefinition = {
  /** Field key as it appears in the settings object. */
  name: string
  /** How the value is represented at runtime. */
  type: FieldType
  /** True when the field must be present in the request body. */
  required: boolean
  /**
   * Human-readable validator names that apply to this field.
   * Derived from ValidatorsEnum entries in the validator config.
   * Examples: "mustBePositive", "mustBeInteger", "mustBeNegative"
   */
  validators: string[]
  /** For enum fields – the exhaustive list of accepted string values. */
  enum?: string[]
  /** For array fields – the element type. */
  itemType?: FieldType
  /** Minimum numeric value (inclusive). */
  min?: number
  /** Maximum numeric value (inclusive). */
  max?: number
  /** Maximum number of decimal places for numeric/numberInString fields. */
  maxPrecision?: number
  /** Maximum string length. */
  maxLength?: number
  /** Default value as used by the platform when the field is omitted. */
  default?: unknown
  /** Short human-readable note: units, edge cases, special behaviour. */
  note?: string
  /** A representative valid value for this field. */
  example?: unknown
}

/** A logical grouping of fields within a bot settings object. */
export type SectionDefinition = {
  /** Stable machine-readable key, e.g. "take_profit", "dca". */
  id: string
  /** Human-readable display name, e.g. "Take Profit". */
  name: string
  /** One-sentence description of what this section controls. */
  description: string
  /**
   * Ordered list of field definitions that belong to this section.
   * Special sentinel values:
   *   - "indicators"       → replaced by the full indicator schema at runtime
   *   - "indicatorGroups"  → replaced by the indicator group schema at runtime
   * (These two are emitted as-is in the field list; discovery handlers expand
   * them when returning per-section detail.)
   */
  fields: FieldDefinition[]
}

/** Full schema definition for one bot type. */
export type BotSchemaDefinition = {
  botType: 'dca' | 'combo' | 'grid'
  /** Human-readable label. */
  label: string
  /** One-sentence description of this bot type. */
  description: string
  /** Sections in display order. Indicators live in the "controller" section. */
  sections: SectionDefinition[]
}

/** Explains how indicator groups work and what fields an IndicatorGroup object has. */
export type IndicatorGroupDefinition = {
  /** What groups are and why they are required. */
  description: string
  /** Validation rules that must hold between an indicator and its group. */
  rules: string[]
  /** Field definitions for a single IndicatorGroup object in settings.indicatorGroups. */
  fields: FieldDefinition[]
}

/** Definition for a single indicator type. */
export type IndicatorDefinition = {
  /** IndicatorEnum value, e.g. "RSI". */
  type: string
  /** Human-readable label, e.g. "RSI". */
  name: string
  /** Brief description of what the indicator measures. */
  description?: string
  /**
   * Fields required for every indicator regardless of type.
   * (type, indicatorLength, indicatorValue, indicatorCondition,
   *  indicatorInterval, groupId, uuid, indicatorAction)
   */
  coreFields: FieldDefinition[]
  /**
   * Fields only relevant for this specific indicator type.
   * All are optional unless noted in the field's `note`.
   */
  typeSpecificFields: FieldDefinition[]
  /** IndicatorAction values this indicator can trigger. */
  supportedActions: string[]
  /** IndicatorSection values this indicator can be placed in (if any). */
  supportedSections?: string[]
  /** A minimal complete payload that would pass validation. */
  example: Record<string, unknown>
  /**
   * Group schema and binding rules.
   * Explains the indicatorGroups array and the groupId coupling constraints.
   * Always present in full indicator detail responses.
   */
  groupDefinition?: IndicatorGroupDefinition
}

/** Summary entry returned by GET /discovery/indicators (index-only). */
export type IndicatorSummary = {
  type: string
  name: string
  description?: string
  supportedActions: string[]
  supportedSections?: string[]
}

/** Summary entry returned by GET /discovery/bots/:botType/sections (index). */
export type SectionSummary = {
  id: string
  name: string
  description: string
  fieldCount: number
}
