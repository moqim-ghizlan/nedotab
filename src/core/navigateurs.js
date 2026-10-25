/**
 * Browser that opens the sites on an iPhone or iPad. iOS opens every link of a home screen
 * app in Safari, whatever the default browser: the other browsers are reached through their
 * own address scheme. Safari (no scheme) is the default, since a browser that is not
 * installed opens nothing.
 */
export const NAVIGATEURS = ["safari", "chrome", "edge", "firefox", "brave"];

export const LIBELLES_NAVIGATEURS = {
  safari: "Safari",
  chrome: "Chrome",
  edge: "Edge",
  firefox: "Firefox",
  brave: "Brave",
};

/** Address that opens `url` in `navigateur`; unchanged for Safari or a non-web address. */
export function urlPourNavigateur(url, navigateur) {
  const texte = String(url ?? "");
  const schema = texte.match(/^(https?):\/\//i)?.[1]?.toLowerCase();
  if (!schema) return texte;
  const reste = texte.slice(schema.length + 3);
  switch (navigateur) {
    case "chrome":
      return `${schema === "https" ? "googlechromes" : "googlechrome"}://${reste}`;
    case "edge":
      return `microsoft-edge-${schema}://${reste}`;
    case "firefox":
      return `firefox://open-url?url=${encodeURIComponent(texte)}`;
    case "brave":
      return `brave://open-url?url=${encodeURIComponent(texte)}`;
    default:
      return texte;
  }
}
