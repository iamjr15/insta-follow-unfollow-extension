const refreshBtn=document.querySelector('.btn')
refreshBtn.onclick=e=>{
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.update(tabs[0].id, {url: tabs[0].url});
  })
}