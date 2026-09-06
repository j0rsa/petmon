use serde_json::{json, Value};

use crate::error::{AppError, AppResult};

struct PromptArg {
    name: &'static str,
    description: &'static str,
    required: bool,
}

struct PromptDef {
    name: &'static str,
    description: &'static str,
    arguments: &'static [PromptArg],
    template: &'static str,
}

const PROMPTS: &[PromptDef] = &[
    PromptDef {
        name: "daily-summary",
        description: "Full daily snapshot: nutrition, toileting, and health for one pet.",
        arguments: &[PromptArg {
            name: "pet_name",
            description: "Pet name as shown in petmon (e.g. Mittens)",
            required: true,
        }],
        template: "\
Using petmon MCP tools, prepare a caregiver-friendly daily summary for \"{pet_name}\":

1. Resolve the pet via pets.list if you only have the name.
2. Call pets.nutrition-context, pets.elimination-context, and pets.health-context for that pet.
3. Summarize in plain language (not clinical jargon):
   - Nutrition: use status.on_track from pets.nutrition-context (or nutrition.on-track); note weekly trend if relevant
   - Toileting: today's wee/poop/vomit/nothing counts; anything unusual in the 7-day trend
   - Health: latest weight and 30-day trend; recent wellbeing check-ins and notes
4. Flag anything worth watching; keep it concise.",
    },
    PromptDef {
        name: "nutrition-check",
        description: "Is the pet on track with nutrition today?",
        arguments: &[PromptArg {
            name: "pet_name",
            description: "Pet name as shown in petmon",
            required: true,
        }],
        template: "\
Using petmon MCP tools, check nutrition for \"{pet_name}\":

1. Resolve the pet via pets.list if needed.
2. Call nutrition.on-track for that pet (or pets.nutrition-context if you also need weekly trend or today's records).
3. Answer for a pet owner using status.on_track / summary: Is intake on track right now? How far ahead or behind the liquid schedule? Only mention weekly comparison if you fetched nutrition-context.
Use casual terms (wet food, water, liquids) in your reply.",
    },
    PromptDef {
        name: "toileting-check",
        description: "Summarize today's toileting and recent trends.",
        arguments: &[PromptArg {
            name: "pet_name",
            description: "Pet name as shown in petmon",
            required: true,
        }],
        template: "\
Using petmon MCP tools, check toileting for \"{pet_name}\":

1. Resolve the pet via pets.list if needed.
2. Call pets.elimination-context for that pet.
3. Summarize today's wee, poop, vomit, and nothing (no-output) counts. Note anything unusual in the 7-day trend.
Use casual terms (wee, poop, vomit, nothing) in your reply — not urination/defecation/no_output.",
    },
    PromptDef {
        name: "health-check",
        description: "Latest weight, trend, and recent wellbeing check-ins.",
        arguments: &[PromptArg {
            name: "pet_name",
            description: "Pet name as shown in petmon",
            required: true,
        }],
        template: "\
Using petmon MCP tools, check health for \"{pet_name}\":

1. Resolve the pet via pets.list if needed.
2. Call pets.health-context for that pet.
3. Summarize for a pet owner:
   - Latest weight and 30-day average/trend (stable, up, or down)
   - Recent wellbeing check-ins (level + any caregiver notes)
   - Anything worth watching",
    },
    PromptDef {
        name: "log-intake",
        description: "Log a nutrition entry (water, liquids, wet food, or dry food).",
        arguments: &[
            PromptArg {
                name: "pet_name",
                description: "Pet name as shown in petmon",
                required: true,
            },
            PromptArg {
                name: "category",
                description: "One of: water, liquids, wet_food, dry_food",
                required: true,
            },
            PromptArg {
                name: "amount",
                description: "Amount in ml (water/liquids) or g (wet_food/dry_food)",
                required: true,
            },
        ],
        template: "\
Using petmon MCP tools, log nutrition for \"{pet_name}\":

1. Resolve the pet via pets.list if needed.
2. Create a record with nutrition.records.create:
   - category: {category}
   - amount: {amount}
   - unit: ml for water/liquids, g for wet_food/dry_food
3. Confirm what was logged and show updated on-track status via nutrition.on-track.",
    },
    PromptDef {
        name: "vet-handoff",
        description: "Structured health brief for a vet visit or caregiver handoff.",
        arguments: &[
            PromptArg {
                name: "pet_name",
                description: "Pet name as shown in petmon",
                required: true,
            },
            PromptArg {
                name: "days",
                description: "Lookback period in days (default 14)",
                required: false,
            },
        ],
        template: "\
Using petmon MCP tools, prepare a vet/caregiver handoff brief for \"{pet_name}\" covering the last {days} days:

1. Resolve the pet via pets.list if needed.
2. Gather context: pets.health-context, pets.elimination-context, pets.nutrition-context, and nutrition.analytics.range-summary for the period.
3. Produce a structured brief:
   - Pet profile (species, breed, feeding notes if relevant)
   - Weight: latest, trend over the period
   - Wellbeing: recent check-in levels and caregiver notes
   - Toileting: vomit episodes, unproductive visits (nothing), frequency changes, concerning subtypes
   - Nutrition: average daily fluid/food intake vs schedule
4. Use clear headings; flag concerns explicitly; suitable to copy into a message for a vet.",
    },
    // Arg-free prompts for voice clients (e.g. Pebble Index) that only expose prompts with no arguments.
    PromptDef {
        name: "household-overview",
        description: "Daily snapshot for every pet in petmon (no pet name required).",
        arguments: &[],
        template: "\
Using petmon MCP tools, prepare a caregiver-friendly daily summary for every pet:

1. Call pets.list.
2. For each pet, call pets.nutrition-context, pets.elimination-context, and pets.health-context.
3. Summarize per pet in plain language (not clinical jargon):
   - Nutrition: on-track status and anything notable in the weekly trend
   - Toileting: today's wee/poop/vomit counts; unusual 7-day trends
   - Health: latest weight and trend; recent wellbeing check-ins
4. Keep each pet's section short; flag anything worth watching.",
    },
    PromptDef {
        name: "household-nutrition",
        description: "Nutrition on-track check for every pet (no pet name required).",
        arguments: &[],
        template: "\
Using petmon MCP tools, check nutrition for every pet:

1. Call pets.list.
2. For each pet, call nutrition.on-track (or pets.nutrition-context if you need today's records).
3. Answer for a pet owner: Is each pet on track right now? How far ahead or behind the liquid schedule?
Use casual terms (wet food, water, liquids) in your reply.",
    },
    PromptDef {
        name: "household-toileting",
        description: "Today's toileting summary for every pet (no pet name required).",
        arguments: &[],
        template: "\
Using petmon MCP tools, check toileting for every pet:

1. Call pets.list.
2. For each pet, call pets.elimination-context.
3. Summarize today's wee, poop, vomit, and nothing counts. Note anything unusual in the 7-day trend.
Use casual terms (wee, poop, vomit) in your reply — not urination/defecation.",
    },
];

fn find_prompt(name: &str) -> Option<&'static PromptDef> {
    PROMPTS.iter().find(|p| p.name == name)
}

fn arg_string<'a>(arguments: &'a Value, key: &str) -> Option<&'a str> {
    arguments
        .get(key)
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

fn substitute(template: &str, arguments: &Value, defaults: &[(&str, &str)]) -> String {
    let mut text = template.to_string();
    for (key, default) in defaults {
        let value = arg_string(arguments, key).unwrap_or(default);
        text = text.replace(&format!("{{{key}}}"), value);
    }
    text
}

/// Prompt descriptors for `prompts/list`.
pub fn prompt_list() -> Value {
    json!({
        "prompts": PROMPTS.iter().map(|prompt| {
            json!({
                "name": prompt.name,
                "description": prompt.description,
                "arguments": prompt.arguments.iter().map(|arg| {
                    json!({
                        "name": arg.name,
                        "description": arg.description,
                        "required": arg.required,
                    })
                }).collect::<Vec<_>>(),
            })
        }).collect::<Vec<_>>(),
    })
}

/// Render a prompt template for `prompts/get`.
pub fn get_prompt(name: &str, arguments: Option<&Value>) -> AppResult<Value> {
    let prompt =
        find_prompt(name).ok_or_else(|| AppError::NotFound(format!("Unknown prompt: {name}")))?;

    let arguments = arguments.cloned().unwrap_or_else(|| json!({}));

    for arg in prompt.arguments {
        if arg.required && arg_string(&arguments, arg.name).is_none() {
            return Err(AppError::BadRequest(format!(
                "Missing required argument: {}",
                arg.name
            )));
        }
    }

    let text = match prompt.name {
        "vet-handoff" => substitute(
            prompt.template,
            &arguments,
            &[("pet_name", ""), ("days", "14")],
        ),
        "log-intake" => substitute(
            prompt.template,
            &arguments,
            &[("pet_name", ""), ("category", ""), ("amount", "")],
        ),
        _ => substitute(prompt.template, &arguments, &[("pet_name", "")]),
    };

    Ok(json!({
        "description": prompt.description,
        "messages": [
            {
                "role": "user",
                "content": {
                    "type": "text",
                    "text": text,
                }
            }
        ]
    }))
}
