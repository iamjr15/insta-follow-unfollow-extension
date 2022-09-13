const DOMAIN="https://prospectss.com/app"
const tool_name="Instagram Auto Follow-Unfollow"

chrome.runtime.onInstalled.addListener(function (object) {
    if (object.reason == "install") {
        chrome.tabs.create({ url: "https://prospectss.com/instagram-auto-follow-unfollow-tool" });
    }
});
chrome.runtime.setUninstallURL("https://prospectss.com/feedback/uninstall/")

async function authenticate({ email_id, account_key, sendResponse }) {
    try {
        const headers = new Headers();
        headers.append("X-AUTH-TOKEN", "arun@arunpassword");
        headers.append("Content-Type", "application/x-www-form-urlencoded");

        const body = new URLSearchParams();
        body.append("email_id", email_id);
        body.append("account_key", account_key);


        const requestOptions = {
            method: 'POST',
            headers,
            body
        };

        const response = await fetch(`${DOMAIN}/api/extensions/authenticate-account-key/`, requestOptions)

        if (response.status !== 200) {
            throw new Error("Error in authentication")
        }

        const result = await response.json()

        if (result.verified === true) {
            sendResponse({ status: true, data: { email_id, account_key } })
            return;
        }
        if (response.verified === false) {
            sendResponse({ status: false, reason: "wrong" })
            return
        }

        throw new Error("Error in authentication")
    }
    catch (error) {
        console.log(error);
        sendResponse({ status: false, reason: "error" })
    }
}

//check for maintenance
async function checkformaintenance(sendResponse){
    try{
        var headers=new Headers()
        headers.append("X-AUTH-TOKEN","arun@arunpassword")
        var requestOptions={
            method:'GET',
            headers:headers,
            redirect:'follow'
        }
        const response=await fetch(`${DOMAIN}/api/extensions/tool-under-maintenance/?tool_name=${tool_name}`,
            requestOptions
        )
        const data=await response.json()
        if (data.maintenance === true) {
            sendResponse({
              type: "success",
              data: data,
            });
            return;
        } else if (data.maintenance === false) {
            sendResponse({
              type: "error",
              data: data,
            });
            return;
        }
    }
    catch(err){

    }
}

async function deductCredit({ account_key, credit, sendResponse }) {
    try {
        const headers = new Headers();
        headers.append("X-Auth-Token", "arun@arunpassword");
        headers.append("Content-Type", "application/x-www-form-urlencoded");

        const body = new URLSearchParams();
        body.append("account_key", account_key);
        body.append("amount_to_deduct", credit);
        body.append("tool_name", tool_name);
        console.log(typeof(credit), credit);
        console.log(account_key);
        console.log(tool_name)

        const requestOptions = {
            method: 'POST',
            headers,
            body,
        };

        const response = await fetch(`${DOMAIN}/api/extensions/deduct-credits/`, requestOptions)

        if (response.status === 200) {
            console.log("200");
            console.log(response);
            const result = await response.json()
            sendResponse({ status: true, data: result.remaining_credits })
            return
        }

        if (response.status === 500) {
            console.log("500");
            console.log(response);
            const result = await response.json()
            if (result.negative_credits) {
                sendResponse({ status: false, reason: "credits" })
                return
            }
        }

        //throw new Error("Error in credit request")
    }
    catch (error) {
        console.log(error);
        sendResponse({ status: false, reason: "error" })
    }
}


async function checkBusy({ sendResponse }) {
    try {
        const windowList = await chrome.windows.getAll({ populate: true })
        let tabs = {};
        let tabIds = [];

        windowList.forEach(window => {
            window.tabs.forEach(tab => {
                tabIds.push(tab.id);
                tabs[tab.id] = tab;
                if (tab.active === true && tab.currentWindow === true) {
                    tabIds.current = tab.id
                }
            })
        })
        console.log("Window list complete", tabIds.length, tabIds.current);

        const instaTabs = tabIds.filter(id => tabs[id].url.includes("instagram.com"))

        console.log("Insta tabs list", instaTabs.length, instaTabs);

        let flag = false
        let profile = ""
        for (tab of instaTabs) {
            await (new Promise(resolve => {
                chrome.tabs.sendMessage(tab, { type: "busyStatus" }, function ({ data = "" }) {
                    if (data && data.status === true) {
                        flag = true
                        profile = data.profile
                    }
                    resolve()
                })
            }))
            console.log("Check for", tab, flag);
            if (flag) break;
        }

        sendResponse({ status: true, data: { flag, profile } })
    }
    catch (error) {
        console.log(error)
        sendResponse({ status: false, reason: 'tab' })
    }
}


async function usage(accountKey,profileurl,sendResponse) {
    try {
      const headers = new Headers();
        const tool_name="Instagram Auto Follow-Unfollow"
      const used_on=profileurl
     // console.log(name)
      headers.append("X-AUTH-TOKEN", "arun@arunpassword");
      headers.append("Content-Type", "application/x-www-form-urlencoded");
  
      const body = new URLSearchParams();
      body.append("account_key", accountKey);
      body.append("tool_name", tool_name);
      body.append("used_on",used_on)
      console.log(used_on)
  
      const requestOptions = {
        method: "POST",
        headers,
        body,
      };
      console.log("log tools usage");
  
      const response = await fetch(
        `${DOMAIN}/api/extensions/log-tool-usage/`,
        requestOptions
      );
  
        const result = await response.json();
        sendResponse({
          type: "log-tools-usage",
          status: true,
          data:result,
        });
    
    } catch (error) {
      console.log(error);
      sendResponse({
        type: "log-tools-usage",
        status: false,
        message: "Error, please refresh",
      });
    }
  }


chrome.runtime.onMessage.addListener(function ({ type = "", data = "" }, sender, sendResponse) {
    try{
        console.log("Message : ", type, data);
        console.log("sender"+sender)
        if (type === "authentication") {
            const { email_id, account_key } = data
            authenticate({ email_id, account_key, sendResponse })
        }
        if(type==="verifyUser"){
            const {email_id,account_key}=data
            authenticate({email_id,account_key,sendResponse})
        }
        if (type === "checkBusy") {
            checkBusy({ sendResponse })
        }
    
        if (type === "deductCredit") {
            const { account_key, credit } = data;
            console.log(credit);
            deductCredit({ account_key, credit, sendResponse })
        }
        if(type==="log-tools-usage"){
            const { account_key,profileurl } = data;
            usage(account_key,profileurl,sendResponse)
        }
        if(type==="check_maintenance"){
            checkformaintenance(sendResponse)
        }
        //to indicate that response will be sent asynchronously
        return true
    }
    catch(err){

    }
})
