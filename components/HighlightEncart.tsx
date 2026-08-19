import { splitChatQuestion } from "@/lib/chat-question";
import { speechRuns } from "@/lib/emphasize-truc";

/** Le point — une question, hors du paragraphe. */
export default function HighlightEncart({
  text,
  trucs,
}: {
  text: string;
  trucs?: string[];
}) {
  const t = text.trim();
  if (!t) return null;
  return (
    <div
      role="note"
      className="mt-3 first:mt-0 rounded-2xl border border-teal/40 bg-teal-soft px-4 py-3"
    >
      <p className="text-[15px] font-medium leading-snug text-teal-ink">
        <SpokenBits text={t} trucs={trucs} />
      </p>
    </div>
  );
}

function SpokenBits({ text, trucs }: { text: string; trucs?: string[] }) {
  const runs = speechRuns(text, trucs ?? []);
  return (
    <>
      {runs.map((r, i) =>
        r.strong ? (
          <strong key={i} className="font-bold text-teal-ink">
            {r.text}
          </strong>
        ) : (
          <span key={i}>{r.text}</span>
        ),
      )}
    </>
  );
}

export function AssistantSpeech({
  content,
  className = "whitespace-pre-wrap text-[17px] leading-relaxed text-ink",
  trucs,
}: {
  content: string;
  className?: string;
  trucs?: string[];
}) {
  const { body, point } = splitChatQuestion(content);
  const names = trucs ?? [];
  const bodyHasStrong = body
    ? speechRuns(body, names).some((r) => r.strong)
    : false;
  return (
    <>
      {body ? (
        <p className={className}>
          <SpokenBits text={body} trucs={names} />
        </p>
      ) : null}
      {point ? (
        <HighlightEncart text={point} trucs={bodyHasStrong ? [] : names} />
      ) : null}
    </>
  );
}
