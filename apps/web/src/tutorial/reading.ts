/** How long a caption needs on screen to be read, in ms: a board's caption and a picture's words alike. `**` marks don't count. */
export const reading = (say: string) => Math.min(9000, 2600 + 48 * say.replaceAll('**', '').length);
