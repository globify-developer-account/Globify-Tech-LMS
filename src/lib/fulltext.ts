/**
 * Builds a MySQL / MariaDB boolean-mode FULLTEXT query from what a person typed.
 *
 * Every word is required (`+`) and matches as a prefix (`*`), so "market fun"
 * finds "Marketing funnels". Operators the person typed are stripped, which
 * also keeps the query from failing to parse.
 *
 * InnoDB does not index words shorter than `innodb_ft_min_token_size` (3) or
 * its default stopwords, and a required word it never indexed makes the whole
 * query match nothing, so those words are dropped. Returns null when no word
 * is left; the caller then relies on its plain `contains` matching.
 */
export function booleanFulltextQuery(input: string, maxWords = 8): string | null {
  const words = input
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((w) => w.length >= MIN_TOKEN && !INNODB_STOPWORDS.has(w));
  const unique = [...new Set(words)].slice(0, maxWords);
  return unique.length ? unique.map((w) => `+${w}*`).join(" ") : null;
}

const MIN_TOKEN = 3;

/** InnoDB's default stopword list (information_schema.INNODB_FT_DEFAULT_STOPWORD). */
const INNODB_STOPWORDS = new Set([
  "a", "about", "an", "are", "as", "at", "be", "by", "com", "de", "en", "for", "from", "how", "i", "in", "is", "it",
  "la", "of", "on", "or", "that", "the", "this", "to", "was", "what", "when", "where", "who", "will", "with", "und", "www",
]);
