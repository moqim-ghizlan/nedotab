/**
 * "Ouvrir le chat" (V4.29). The side panel shows the NedoTab page itself with the assistant
 * open (newtab.html?panneau=chat, declared as side_panel.default_path): same account, same
 * history, nothing to duplicate. `sidePanel.open` is called straight from the click handler
 * (no await before it, or Chrome refuses). Without a side panel (other browser), the chat
 * opens in a NedoTab tab.
 */
export function ouvrirChat({ chromeApi = globalThis.chrome, fenetre = window } = {}) {
  const repli = () => {
    chromeApi?.tabs?.create({ url: chromeApi.runtime.getURL("newtab.html?panneau=chat") });
    fenetre.close();
  };
  if (!chromeApi?.sidePanel?.open) return repli();
  // The window id comes from the tab read at start-up (popup.js): nothing is awaited here.
  const windowId = ouvrirChat.windowId;
  if (windowId == null) return repli();
  chromeApi.sidePanel.open({ windowId }).then(
    () => fenetre.close(),
    () => repli(),
  );
}
ouvrirChat.windowId = null;
