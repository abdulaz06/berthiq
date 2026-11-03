// Plain-language names for the model's features and the console's terms, so a
// visitor never has to decode `window_slack_min`. Labels only; values are untouched.
const FEATURES: Record<string, string> = {
  total_elapsed_min: "Time since the request",
  time_in_current_stage_min: "Time in the current step",
  last_stage_duration_min: "Length of the last step",
  n_events: "Steps recorded so far",
  max_stage_index: "Furthest step reached",
  rework_count_so_far: "Documents returned so far",
  n_reviews_so_far: "Reviews so far",
  missing_doc_count: "Missing documents",
  loa: "Vessel length",
  draft: "Vessel draft",
  reviewer_queue_len: "Reviewer queue length",
  reviewers_busy: "Reviewers busy",
  cases_awaiting_berth: "Calls awaiting a berth",
  active_cases: "Calls in progress port-wide",
  weather_severity: "Weather",
  window_slack_min: "Time left before the window",
  hour_of_day: "Hour of day",
  is_night: "Night shift",
  current_stage: "Current step",
  vessel_type: "Vessel type",
  cargo_type: "Cargo type",
};

export const featureLabel = (feature: string) =>
  FEATURES[feature] ?? feature.replaceAll("_", " ");

export const GLOSSARY = {
  serviceWindow:
    "The agreed time by which cargo work should start. Missing it delays the ship and everything booked after it.",
  missRisk:
    "The model's estimate that this call starts cargo work after its service window, from what has been recorded so far.",
  authorityReview:
    "Customs, health and port-authority checks of the ship's documents. A reviewer can approve them or send them back.",
  anchorage:
    "Open water outside the port where ships wait until they are cleared and a pilot can bring them in.",
} as const;
