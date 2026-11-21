chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'optimise-selection', title: 'Optimise selected text', contexts: ['selection'] });
});
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'optimise-selection' || !tab?.windowId || !info.selectionText) return;
  // Open must be initiated during the user gesture; store only the selected text.
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(console.error);
  chrome.storage.session.set({ selectedPrompt: info.selectionText }).catch(console.error);
});
