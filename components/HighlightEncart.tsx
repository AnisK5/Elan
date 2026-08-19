import { splitChatQuestion } from "@/lib/chat-question";
import { findTrucInText, splitAroundTruc } from "@/lib/emphasize-truc";

/** Le point — une question ou un pas, hors du paragraphe. */
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
      className="mt-3 first:mt-0 rounded-2xl border border-teal/35 bg-teal-soft px-4 py-3"
    >
      <p className="text-[15px] font-medium leading-snug text-teal-ink">
        <SpokenBits text={t} trucs={trucs} />
      </p>
    </div>
  );
}

function SpokenBits({ text, trucs }: { text: string; trucs?: string[] }) {
  const hit = splitAroundTruc(text, trucs ?? []);
  if (!hit) return text;
  return (
    <>
      {hit.before}
      <strong className="font-semibold">{hit.match}</strong>
      {hit.after}
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
  const inBody = body ? findTrucInText(body, names) : null;
  const encartTrucs = inBody ? [] : names;
  return (
    <>
      {body ? (
        <p className={className}>
          <SpokenBits text={body} trucs={names} />
        </p>
      ) : null}
      {point ? <HighlightEncart text={point} trucs={encartTrucs} /> : null}
    </>
  );
}
