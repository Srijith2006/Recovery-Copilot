/**
 * Root-cause classification engine (FR-5, FR-6, FR-7).
 *
 * Strategy: rules first, LLM fallback only when rules don't confidently
 * match. Rules are cheap, deterministic, auditable, and cover the vast
 * majority of Razorpay error codes we'll see. The LLM fallback exists for
 * the messy long tail (vague error_description text, new/unseen error
 * codes) so we don't just dump everything into "unclassified".
 *
 * Every classification decision is STORED on the case (root_cause +
 * root_cause_reason), never recomputed on the fly — see schema.sql.
 */

const ROOT_CAUSES = [
  'insufficient_funds',
  'card_expired',
  'bank_timeout',
  'mandate_lapsed',
  'risk_block',
  'checkout_abandoned',
  'unclassified',
];

// Playbook assignment is rule-based and 1:1 with root cause for now.
// (Playbook *execution* — actually sending nudges/links — is the next
// build step; this just tags which playbook a case should run.)
const PLAYBOOK_BY_ROOT_CAUSE = {
  insufficient_funds: 'retry_with_delay_and_nudge',
  card_expired: 'request_card_update',
  bank_timeout: 'immediate_retry',
  mandate_lapsed: 'remandate_request',
  risk_block: 'manual_review_hold',
  checkout_abandoned: 'cart_recovery_link',
  unclassified: 'manual_review_generic',
};

// Ordered rule list: (error_reason | error_code substring) -> root cause.
// Matched against the lowercased error_reason first, then error_description,
// since error_reason is the most stable/structured signal Razorpay gives us.
const RULES = [
  { test: /insufficient|balance|nsf/, rootCause: 'insufficient_funds', reason: (d) => `Payment failed due to insufficient funds: "${d.error_description || d.error_reason}".` },
  { test: /card_expired|expired/, rootCause: 'card_expired', reason: (d) => `Card expired at time of charge: "${d.error_description || d.error_reason}".` },
  { test: /timeout|gateway_timeout|issuer_unavailable|bank.*(down|unreachable)/, rootCause: 'bank_timeout', reason: (d) => `Issuing bank/gateway did not respond in time: "${d.error_description || d.error_reason}".` },
  { test: /mandate_lapsed|mandate.*(expired|invalid)|e-?mandate/, rootCause: 'mandate_lapsed', reason: (d) => `Payment mandate has lapsed and needs re-authorization: "${d.error_description || d.error_reason}".` },
  { test: /risk_declined|fraud|risk.*(block|decline)/, rootCause: 'risk_block', reason: (d) => `Transaction was blocked by risk/fraud controls: "${d.error_description || d.error_reason}".` },
];

function ruleClassify(details) {
  const haystack = `${details.error_reason || ''} ${details.error_description || ''} ${details.error_code || ''}`.toLowerCase();
  for (const rule of RULES) {
    if (rule.test.test(haystack)) {
      return { rootCause: rule.rootCause, reason: rule.reason(details), method: 'rule', confidence: 0.9 };
    }
  }
  return null;
}

/**
 * LLM fallback for cases the rules engine can't confidently place.
 * Uses a small, cheap model since this is a narrow classification task,
 * not open-ended generation. Fails soft: if no API key or the call errors,
 * we fall back to 'unclassified' rather than blocking case creation.
 */
async function llmClassify(details) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith('sk-ant-xxxx')) {
    return null; // no usable key configured — skip straight to unclassified
  }

  const model = process.env.ANTHROPIC_CLASSIFIER_MODEL || 'claude-3-5-haiku-20241022';
  const allowedCauses = ROOT_CAUSES.filter((c) => c !== 'checkout_abandoned'); // not reachable from a failure event

  const prompt = `You are classifying a failed payment for a revenue-recovery system.
Given this raw error signal from a payment gateway, pick the single best matching root cause
from this exact list: ${allowedCauses.join(', ')}.

error_code: ${details.error_code || 'unknown'}
error_reason: ${details.error_reason || 'unknown'}
error_description: ${details.error_description || 'unknown'}
error_source: ${details.error_source || 'unknown'}

Respond with ONLY a JSON object, no prose, no markdown fences:
{"root_cause": "<one of the list>", "reason": "<one sentence, plain language, explaining why>"}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error('[classification] LLM call failed:', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === 'text');
    if (!textBlock) return null;

    const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!allowedCauses.includes(parsed.root_cause)) return null;

    return {
      rootCause: parsed.root_cause,
      reason: parsed.reason || 'Classified by LLM fallback (no reason returned).',
      method: 'llm',
      confidence: 0.6,
    };
  } catch (err) {
    console.error('[classification] LLM fallback error:', err.message);
    return null;
  }
}

/**
 * Classifies a failure signal into a root cause + stored reason + playbook.
 * `details` shape: { error_code, error_reason, error_description, error_source }
 * Returns synchronously when a rule matches; awaits the LLM only when needed.
 */
async function classify(details = {}) {
  const ruleResult = ruleClassify(details);
  if (ruleResult) {
    return { ...ruleResult, playbook: PLAYBOOK_BY_ROOT_CAUSE[ruleResult.rootCause] };
  }

  const llmResult = await llmClassify(details);
  if (llmResult) {
    return { ...llmResult, playbook: PLAYBOOK_BY_ROOT_CAUSE[llmResult.rootCause] };
  }

  return {
    rootCause: 'unclassified',
    reason: `Could not determine a specific cause from available signal (error_code: ${details.error_code || 'n/a'}, error_reason: ${details.error_reason || 'n/a'}). Flagged for manual review.`,
    method: 'fallback',
    confidence: 0.2,
    playbook: PLAYBOOK_BY_ROOT_CAUSE.unclassified,
  };
}

module.exports = { classify, ROOT_CAUSES, PLAYBOOK_BY_ROOT_CAUSE };