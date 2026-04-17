/**
 * Token-aware text chunker
 * ~500 tokens/chunk, 50-token overlap, sentence-boundary aware
 * Approximation: 1 token ≈ 4 characters
 */

const CHARS_PER_TOKEN = 4;

const toChars = (tokens) => tokens * CHARS_PER_TOKEN;

const splitIntoSentences = (text) => {
  // Split on sentence-ending punctuation followed by whitespace
  return text.match(/[^.!?]+[.!?]+[\s]*/g) || [text];
};

const chunkText = (text, chunkSizeTokens = 500, overlapTokens = 50) => {
  const chunkSizeChars = toChars(chunkSizeTokens);
  const overlapChars = toChars(overlapTokens);

  const sentences = splitIntoSentences(text.trim());
  const chunks = [];
  let current = "";
  let chunkIndex = 0;

  for (const sentence of sentences) {
    // If adding this sentence exceeds chunk size, save current chunk and start new one
    if (current.length + sentence.length > chunkSizeChars && current.length > 0) {
      chunks.push({
        text: current.trim(),
        chunkIndex,
        estimatedTokens: Math.ceil(current.length / CHARS_PER_TOKEN),
      });
      chunkIndex++;
      // Start next chunk with overlap from end of current
      current = current.slice(-overlapChars) + sentence;
    } else {
      current += sentence;
    }
  }

  // Push remaining text
  if (current.trim().length > 0) {
    chunks.push({
      text: current.trim(),
      chunkIndex,
      estimatedTokens: Math.ceil(current.length / CHARS_PER_TOKEN),
    });
  }

  return chunks;
};

module.exports = { chunkText };
