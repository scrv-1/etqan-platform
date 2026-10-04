import { AnalyzeLearningResponse } from "@workspace/api-zod";
import type { AnalysisInput } from "@workspace/api-zod";

const normalize = (text:string) => text.normalize("NFKC").replace(/\s+/g," ").trim();

/** A quote must actually occur in the supplied segment. This validates provenance,
 * not the truth of an inference; every returned item still needs learner review. */
export function verifyAnalysis(value: unknown, segments: AnalysisInput["segments"]) {
  const output = AnalyzeLearningResponse.parse(value);
  const keys = new Set(output.concepts.map(c => c.key));
  if (keys.size !== output.concepts.length) throw new Error("Duplicate concept identifiers");
  const lookup = new Map(segments.map(s => [s.id, normalize(s.text)]));
  const grounded = (ref: {segmentId:string;quote:string}) => {
    const quote = normalize(ref.quote);
    return quote.length >= 8 && lookup.get(ref.segmentId)?.includes(quote);
  };
  const before = output.concepts.length + output.relations.length + output.questions.length;
  output.concepts = output.concepts.filter(c => grounded(c.reference));
  const accepted = new Set(output.concepts.map(c=>c.key));
  output.relations = output.relations.filter(r =>
    accepted.has(r.fromKey) && accepted.has(r.toKey) && r.fromKey !== r.toKey && grounded(r.reference));
  output.questions = output.questions.filter(q =>
    accepted.has(q.conceptKey) && grounded(q.reference) &&
    (q.kind !== "mcq" || (q.choices.length >= 2 && q.correctChoice < q.choices.length &&
      new Set(q.choices.map(normalize)).size === q.choices.length)));
  const removed = before - output.concepts.length - output.relations.length - output.questions.length;
  output.warnings = ["هذه مقترحات واستنتاجات آلية وليست اقتباسات كاملة أو دليل إتقان. راجعها قبل القبول."];
  if (removed) output.warnings.push(`حُذف ${removed} مقترحًا لعدم تحقق الإحالة أو الاتساق.`);
  if (!output.concepts.length) throw new Error("No grounded concepts");
  return output;
}