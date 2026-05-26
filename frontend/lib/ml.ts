const API = process.env.NEXT_PUBLIC_API_GATEWAY_URL || "http://localhost:8080";

export type Classification = {
  type: string;
  type_confidence: number;
  type_top3: { label: string; score: number }[];
  area: string;
  area_confidence: number;
  area_top3: { label: string; score: number }[];
};

export type EffortEstimate = {
  story_points: number;
  pattern: string;
  pattern_confidence: number;
  keyword_score: number;
  matched_keywords: Record<string, string[]>;
  estimated_hours_range: [number, number];
  text_length_chars: number;
};

export type RiskAnalysis = {
  overall_risk: "minimal" | "low" | "medium" | "high";
  risk_score: number;
  risks: { type: string; severity: string; description: string }[];
  count: number;
};

export type FullAnalysis = {
  classification: Classification;
  effort: EffortEstimate;
  risks: RiskAnalysis;
};

export async function analyzeStory(text: string): Promise<FullAnalysis> {
  const res = await fetch(`${API}/ml/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`ML analyze failed: ${res.status}`);
  return res.json();
}
