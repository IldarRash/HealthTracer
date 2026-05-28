export const PROPOSAL_EXPLAINER_NO_PROPOSAL_REPLY =
  "I don't see a recent proposal in this chat to explain. If you're asking about a specific suggestion, try referring to it or ask for a new recommendation first.";

type ExplainerPattern = {
  source: string;
  flags: string;
};

export const DEFAULT_PROPOSAL_EXPLAINER_POSITIVE_PATTERNS: readonly ExplainerPattern[] = [
  {
    source: "\\bwhy\\s+(?:this|that|the)\\s+proposal\\b",
    flags: "i",
  },
  {
    source: "\\bwhy\\s+did\\s+you\\s+(?:suggest|recommend|propose)\\b",
    flags: "i",
  },
  {
    source:
      "\\bwhy\\s+(?:did\\s+you|do\\s+you)\\s+(?:want|need)\\s+to\\s+(?:suggest|recommend|propose|change)\\b",
    flags: "i",
  },
  {
    source: "\\bexplain\\s+(?:this|that|the)\\s+proposal\\b",
    flags: "i",
  },
  {
    source: "\\bexplain\\s+(?:why\\s+)?(?:you\\s+)?(?:suggested|recommended|proposed)\\b",
    flags: "i",
  },
  {
    source: "\\bwhy\\s+(?:this|that)\\s+(?:change|suggestion|recommendation)\\b",
    flags: "i",
  },
  {
    source: "почему\\s+(?:ты\\s+)?(?:предложил|предлагаешь|рекомендуешь|хочешь\\s+предложить)",
    flags: "i",
  },
  {
    source: "почему\\s+(?:это|эт[ао])\\s+предложени",
    flags: "i",
  },
  {
    source: "объясни\\s+(?:это\\s+)?предложени",
    flags: "i",
  },
  {
    source: "объясни\\s+(?:почему\\s+)?(?:ты\\s+)?(?:предложил|рекомендуешь)",
    flags: "i",
  },
];

export const DEFAULT_PROPOSAL_EXPLAINER_NEGATIVE_PATTERNS: readonly ExplainerPattern[] = [
  { source: "\\bwhy\\s+should\\s+i\\b", flags: "i" },
  { source: "\\bwhy\\s+(?:do|does|did)\\s+i\\b", flags: "i" },
  { source: "\\bwhy\\s+(?:would|can|could)\\s+i\\b", flags: "i" },
  {
    source:
      "\\bwhy\\s+(?:is|are|was|were)\\s+(?:protein|sleep|water|carbs|fat|calories|exercise|training)\\b",
    flags: "i",
  },
  { source: "\\bwhy\\s+(?:is|are)\\s+it\\b", flags: "i" },
  { source: "почему\\s+(?:мне|я)\\s+(?:должен|нужно|стоит)\\b", flags: "i" },
  { source: "почему\\s+(?:это|так)\\s+(?:важно|полезно|нужно)\\b", flags: "i" },
];
