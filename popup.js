const box = document.getElementById('hide');
chrome.storage.sync.get({ hide: false }, v => { box.checked = v.hide; });
box.addEventListener('change', () => chrome.storage.sync.set({ hide: box.checked }));
fetch(chrome.runtime.getURL('labels.json')).then(r => r.json())
  .then(l => { document.getElementById('info').textContent = `분류된 문제 ${Object.keys(l).length}개`; });
