import { splitChatQuestion } from "@/lib/chat-question";

/** Le point — une question ou un pas, hors du paragraphe. */
export default function HighlightEncart({ text }: { text: string }) {
  const t = text.trim();
  if (!t) return null;
  return (
    <div
      role="note"
      className="mt-3 first:mt-0 rounded-2xl border border-teal/35 bg-teal-soft px-4 py-3"
    >
      <p className="text-[15px] font-medium leading-snug text-teal-ink">{t}</p>
    </div>
  );
}

export function AssistantSpeech({
  content,
  className = "whitespace-pre-wrap text-[17px] leading-relaxed text-ink",
}: {
  content: string;
  className?: string;
}) {
  const { body, question } = splitChatQuestion(content);
  return (
    <>
      {body ? <p className={className}>{body}</p> : null}
      {question ? <HighlightEncart text={question} /> : null}
    </>
  );
}
