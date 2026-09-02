export type FeedbackRating = "up" | "down";

/** 👍 seul peut partir tout de suite ; 👎 ou texte → bouton Envoyer. */
export function shouldInstantSendThumb(opts: {
  rating: FeedbackRating;
  message: string;
  instantUp: boolean;
}): boolean {
  return (
    opts.instantUp && opts.rating === "up" && opts.message.trim().length === 0
  );
}
