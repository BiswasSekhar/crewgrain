const invalid = "Paste the full setup link from your admin.";
const token = /^[a-f0-9]{64}$/i;

/** Extract a token without navigating to or fetching the pasted URL. */
export function setupTokenFromLink(value: string) {
  const text = value.trim();
  if (token.test(text)) return text.toLowerCase();
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error(invalid);
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!(
    url.protocol === "https:" ||
    url.protocol === "crewgrain:" ||
    (url.protocol === "http:" && local)
  ))
    throw new Error(invalid);
  const tokens = [
    ...url.searchParams.getAll("setup"),
    ...new URLSearchParams(url.hash.slice(1)).getAll("setup"),
  ];
  if (tokens.length !== 1 || !token.test(tokens[0])) throw new Error(invalid);
  return tokens[0].toLowerCase();
}
