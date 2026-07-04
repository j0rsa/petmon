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

1. Resolve the pet via pets/list if you only have the name.
2. Call pets/nutrition-context, pets/elimination-context, and pets/health-context for that pet.
3. Summarize in plain language (not clinical jargon):
   - Nutrition: fluid/food logged today vs active schedule; how today compares to the 7-day trend
   - Toileting: today's wee/poop/vomit counts; anything unusual in the 7-day trend
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

1. Resolve the pet via pets/list if needed.
2. Call pets/nutrition-context for that pet.
3. Answer for a pet owner: Is intake on track today? What's missing vs the active schedule? How does today compare to the past week?
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

1. Resolve the pet via pets/list if needed.
2. Call pets/elimination-context for that pet.
3. Summarize today's wee, poop, and vomit counts. Note anything unusual in the 7-day trend.
Use casual terms (wee, poop, vomit) in your reply — not urination/defecation.",
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

1. Resolve the pet via pets/list if needed.
2. Call pets/health-context for that pet.
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

1. Resolve the pet via pets/list if needed.
2. Create a record with nutrition/records/create:
   - category: {category}
   - amount: {amount}
   - unit: ml for water/liquids, g for wet_food/dry_food
3. Confirm what was logged and show today's updated totals via pets/nutrition-context.",
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

1. Resolve the pet via pets/list if needed.
2. Gather context: pets/health-context, pets/elimination-context, pets/nutrition-context, and nutrition/analytics/range-summary for the period.
3. Produce a structured brief:
   - Pet profile (species, breed, feeding notes if relevant)
   - Weight: latest, trend over the period
   - Wellbeing: recent check-in levels and caregiver notes
   - Toileting: vomit episodes, frequency changes, concerning subtypes
   - Nutrition: average daily fluid/food intake vs schedule
4. Use clear headings; flag concerns explicitly; suitable to copy into a message for a vet.",
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
