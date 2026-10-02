import { AiIntent } from '@talentpulse/shared';

export function classifyIntentByRules(question: string): AiIntent {
  const q = question.trim().toLowerCase();

  // 1. Metric Diagnosis ("why did X fall/rise/drop", "diagnose change")
  if (
    /(why did|why have|what caused|diagnos|root cause|what happened to)/i.test(q) &&
    /(application|cpa|cpc|spend|hire|conversion|volume|rate|drop|fall|decrease|spike)/i.test(q)
  ) {
    return 'metric_diagnosis';
  }

  if (/(why|explain).*?(drop|fall|fell|decrease|spike|decline|loss).*?(month|week|quarter|application|cpa)/i.test(q)) {
    return 'metric_diagnosis';
  }

  // 2. Candidate Search
  if (
    /(top candidates?|find candidates?|search candidates?|who knows|who has experience|recommend candidates?|find (engineers?|developers?|architects?|designers?))/i.test(q) ||
    (/(candidates?|profiles?)/i.test(q) && /(for|with|skills?|backend|frontend|devops|cloud|ai|lead)/i.test(q))
  ) {
    return 'candidate_search';
  }

  // 3. Knowledge / Policies / Handbooks
  if (
    /(interview policy|interview guidelines?|onboarding|handbook|company policy|leave policy|reimbursement|fair hiring|diversity policy|job template|sourcing guide|code of conduct|evaluation rubric)/i.test(q) ||
    (/(what is our|what are our|how do we handle|how does).*?(policy|process|program|guide|rubric|rule|standard)/i.test(q))
  ) {
    return 'knowledge';
  }

  // 4. Campaign Recommendation (Task 19+)
  if (
    /(recommend.*allocation|recommend.*budget|optimize.*budget|how should we allocate|suggest budget)/i.test(q)
  ) {
    return 'campaign_recommendation';
  }

  // 5. Smalltalk / Greeting / Capabilities
  if (
    /^(hi|hello|hey|good morning|good afternoon|good evening|greetings)\b/i.test(q) ||
    /^(who are you|what can you do|what are your capabilities|help me|help)\b/i.test(q)
  ) {
    return 'smalltalk';
  }

  // 6. Analytics SQL (counts, aggregations, averages, comparisons)
  if (
    /(lowest cpa|highest cpa|lowest cpc|highest cpc|highest ctr|lowest ctr|top publisher|top campaign|which publisher|which campaign|how many|total spend|spend by|applications by|hires by|cost per hire|metrics?|funnel)/i.test(q)
  ) {
    return 'analytics_sql';
  }

  // Default to analytics_sql if contains metric keywords
  if (/(spend|cpa|cpc|ctr|applications|hires|impressions|clicks|conversion)/i.test(q)) {
    return 'analytics_sql';
  }

  return 'unsupported';
}

export async function classifyIntent(question: string): Promise<AiIntent> {
  // Deterministic rule classification provides zero-latency robust parsing
  return classifyIntentByRules(question);
}
