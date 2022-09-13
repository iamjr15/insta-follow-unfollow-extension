window.addEventListener('load',start)
const TOOL_NAME="Instagram Auto Follow-Unfollow"
const BATCH_SIZE=100
async function start() {
var inMaintenance=false
	//utility functions for chrome localstorage
	const storage = {
		async getKey(key) {
			const data = await new Promise(resolve => {
				chrome.storage.local.get(key, function (data) {
					resolve(data)
				})
			})
			return data[key] ? JSON.parse(data[key]) : null
		},
		async setKey(key, value) {
			let obj = {}
			obj[key] = JSON.stringify(value)
			await new Promise(resolve => {
				chrome.storage.local.set(obj, resolve)
			})
		},
		clearKey(key) {
			chrome.storage.local.remove(key)
		}
	}

	const state = (await storage.getKey("state"))||{}
	if(Object.keys(state).length===0){
		state.status="idle"
		//following,followers
		state.selectedListType = ""
		//unfollow -> userData, follow->profileData
		state.selectedOperationType = "profileData"
		state.checkBeforeStart = false
	}
	let userNames = [];
	// //following,followers
	// state.selectedListType = ""
	// //unfollow -> userData, follow->profileData
	// state.selectedOperationType = "profileData"
	// state.checkBeforeStart = false
	//fetching shared data from instagram js context
	//to content script context
	//available at window._sharedData
	window.addEventListener("message", (event) => {
		// We only accept messages from ourselves
		if (event.source != window)
			return;

		if (event.data.type && event.data.type == "_sharedData") {
			//console.log("Shared Data received");
			state.sharedData = JSON.parse(event.data.text)
		}
	});

	//this script pass the data via message passing technique
	//using to get the shared data object
	let s = document.createElement('script');
	s.src = chrome.runtime.getURL('script.js');
	s.onload = function () {
		this.remove();
	};
	(document.head || document.documentElement).appendChild(s);


	// no. of users followed in current ongoing operation
	let totalFollowed = 0;

	// no. of users unfollowed in current ongoing operation
	let totalUnfollowed = 0;
	let PROFILE = ""
	let isUiOpen = false

	//list of regex to check the profile page
	const notAllowedPages = [/\/explore\/+/, /\/direct\/inbox\/+/, /\/direct\/t\/+/, /\/directory\/hashtags\/+/, /\/directory\/profiles\/+/, /\/explore\/locations\/+/, /\/p\/+/, /\/accounts\/+/, /\/emails\/+/, /\/push\/+/, /\/session\/login_activity\/+/, /\/emails\/emails_sent\/+/]


	//utility functions
	const utils = {
		sleep(time) {
			return new Promise(resolve => setTimeout(resolve, time))
		},
		numberFromString(str) {
			const numArray = str.match(/[0-9]/g)
			return parseInt(numArray.reduce((str, num) => str + num, ""))
		},
		logError(error) {
			//console.error(error.name, error.message, error)
		},
		setKey(key, value) {
			localStorage.setItem(key, JSON.stringify(value))
		},
		getKey(key) {
			return JSON.parse(localStorage.getItem(key))
		},
		clearKey(key) {
			localStorage.removeItem(key)
		}
	}


	//markup pages

	const pages = {

		//loads the authentication page
		loadAuthenticate() {
			let content = pages.headerMarkup()
			content += `
            <main class="authenticateBodyHeight grid place-center">
              <div>
                <h1 class="m-s text-center text-heading">Welcome</h1>
                <p class="m-m text-center text-para">To continue you need to first authenticate yourself</p>
                <form id="auth-form">
					<div class="input-group m-s">
                    	<input type="text" id="account_key" minlength="19" maxlength="19" placeholder="Enter Account Key" required/>
                  	</div>
                  	<div class="input-group m-s">
                    	<input type="email" id="email_id" placeholder="Enter your email" style="text-transform: lowercase;" required/>
                  	</div>
                  	<div class="input-group m-m">
                    	<button id="authenticate_button" type="submit" class="button-primary flex justify-between align-center" style= "flex-direction: row;">
                      	<span>Authenticate</span>
                      	<span>
                        	<img src=${chrome.runtime.getURL('extension-icon/chevron-right.svg')} alt="chevron right">
                      	</span>
                    	</button>
					</div>
                </form>
				<div class="input-group">
                <a style="text-decoration:none; "href='https://prospectss.com/app/signup/' target='_blank'>
                <button  style= "flex-direction: row; color=white; align-items:center; position: relative; width: 210px; height: 40px; left: 70px; bottom:0px;" class="button-primary flex justify-between align-center">
                <span class="text-white font-medium">New user? Signup here </span>   
				<span>
					<img src=${chrome.runtime.getURL('extension-icon/chevron-right.svg')} alt="chevron right">
			  	</span>
                </button>
                </a>
            	</div>
				<div style="display: flex; flex-direction: row; position: relative; bottom: -160px; left: 25px;">
					<a href="https://prospectss.com/feedback/live-support/" target="_blank" style="text-decoration: none;">
						<button type="button" class="btn5 button-primary1" style="display:flex; flex-direction:row;">
							<p class="dot"></p>
							<p style="margin:14px auto">Live Support</p>
						</button>
					</a>
					<a href="https://prospectss.tawk.help/category/instagram-auto-follow-unfollow-tool" target="_blank" style="text-decoration: none;">
						<button type="button" class="btn4 button-primary1">
							<span style="font-size: 11px; margin:1px auto">📖</span>
							<p style="margin:14px auto">KnowledgeBase</p>
						</button>
					</a>
				</div>
            </div>
            </main>
            <footer class="authenticate-footer flex justify-center align-center">
              <div>
                <div class="m-s help text-center">
                  <a href="https://prospectss.com/app/profile/" target="_blank" rel="noopener noreferrer">Where I can find the account key?</a>
                </div> 
              </div>
            </footer>`
			document.querySelector('#extensionBody').innerHTML = content
			document.querySelector("#extensionBody #auth-form").addEventListener('submit', authenticate)

			async function authenticate(event) {
				event.preventDefault()
				const account_key = event.target[0].value
				const email_id = event.target[1].value.toLowerCase();

				const payload = {
					type: 'authentication',
					data: { account_key, email_id }
				}
				const response = await sendMessage(payload)
	
				if (response.status) {
					await storage.setKey('login', payload.data)
					openUI()
					return
				}

				if (!response.status && response.reason === 'wrong') {
					pages.loadWrong()
					return
				}

				// if (!response.status && response.reason === 'error') 
				pages.loadWrong()

			}
		},

       
       

		//header markup component
		headerMarkup() {

			var manifestData = chrome.runtime.getManifest();
			manifestVersion=manifestData.version;
			
            
			return ` <header class="flex justify-center align-center" >
                      <div class="logo">
                       <a href="http://prospectss.com/"> <img class="logo-image" src="${chrome.runtime.getURL('images/logo-color.png')}" alt="logo" />
                      </a></div>
					  <div class="manifest-version">v${manifestVersion}</div>
                  </header>`
		},

		//loads the loading page
		loadLoading() {
			let content = pages.headerMarkup()
			content += `
			<main class="flex-col align-center justify-center">
				<div>
					<div class="text-center">
					<img class="page_image" src=${chrome.runtime.getURL("/extension-icon/refresher.svg")} alt="loading">
					</div>
					<h1 class="text-center text-heading text-center m-m m-nb">Fetching details...</h1>
				</div>
				<div style="display: flex; flex-direction: row; position: relative; bottom: -220px;">
					<a href="https://prospectss.com/feedback/live-support/" target="_blank" style="text-decoration: none;">
						<button type="button" class="btn5 button-primary1" style="display:flex; flex-direction:row;">
							<p class="dot"></p>
							<p style="margin:14px auto">Live Support</p>
						</button>
					</a>
					<a href="https://prospectss.tawk.help/category/instagram-auto-follow-unfollow-tool" target="_blank" style="text-decoration: none;">
						<button type="button" class="btn4 button-primary1">
							<span style="font-size: 11px; margin:1px auto">📖</span>
							<p style="margin:14px auto">KnowledgeBase</p>
						</button>
					</a>
				</div>
			</main>
			`
			content += pages.footerLoginMarkup()

			document.querySelector('#extensionBody').innerHTML = content
			document.querySelector('#extensionBody #logout').addEventListener('click', logout)
		},

		//page for maintenance mode
		loadMaintenance(deadline){
			var content=pages.headerMarkup()
			content += `
			<main class="main flex justify-center align-center">
			  <div aria-label="maintenance-mode">
				<div class="m-s text-center">
				  <div class="text-center" style="padding-bottom:30px">
					<h1 style="color:#5F49CC;font-size:1.8em;">Maintenance Mode</h1>
				  </div>
				  <h2 style="font-size:1.4em;padding-bottom:46px;">${TOOL_NAME}<br> is under maintenance</h2>
				  <div class="flex-col align-center">
					<img src="https://i.imgur.com/dKvUw0V.gif" class="maintenance-icon" style="width:65%; border-radius: 8px;" alt="maintenance"></img>
					<div id="msg-scraping" class='text-center none' style="padding-top:20px;font-size:1.2em;">Data Sent</div>
					<!--div class="support-btns-container flex justify-center align-center">
					  <a href='https://prospectss.com/feedback/live-support/' target='_blank' style="text-decoration:none;">
						<button class='mx-2 px-4 py-2 border-2 rounded'><span style='color: #2DCE89;'>&#11044;</span> Live Support</button>
					  </a>
					</div-->
				  </div>
				  <div class="text-center" style="padding-top:50px;padding-bottom:50px">
					<h3 style="font-size:1.4em;">Maintenance mode ends in</h3>
					<p id= "deadline" style="font-size:1em"></p>
				  </div>
				</div>
				<div class='flex justify-center'>
				  <a href='https://prospectss.com/feedback/live-support/' target='_blank' style="padding:5px;text-decoration:none;">
				  <button class='mx-2 px-4 py-2 border-2 rounded'><span style='color: #2DCE89;'>&#11044;</span> Live Support</button>
				  </a>
				</div>
			  </div>
			</main>
		  `
		  content+=`
			<footer class="footer-loggedIn">
			<a href="https://prospectss.com/" rel="noopener noreferrer" target="_blank" style="text-decoration:none;">
			  <button class="button-primary d-flex justify-center align-center"
			  style="padding:10px;border:none;border-radius:10px;width:100%;cursor:pointer;">
				  <span>Try 50+ More Growth Marketing Tools</span>
			  </button>
			</a>
			</footer>`
			document.querySelector('#extensionBody').innerHTML = content
			document.querySelector('#extensionBox').style.height="600px"
			const node=document.querySelector('#deadline')
			
	        let Days = 0;

	        if (deadline.includes("day") || deadline.includes("days")) {
	            //console.log("days");
	            Days = parseInt(deadline.split(" day,")[0] || deadline.split(" days,")[0]);
	            deadline = deadline.split(" day, ")[1] || deadline.split(" days, ")[1];
	        }

			//set deadline for maintenance mode
			hrs = deadline.split(":")[0];
			mins = deadline.split(":")[1];
			secs = deadline.split(":")[2].split(".")[0];

			if (Days > 0) {
    	        // add days * 24 hours to hrs
    	        hrs = parseInt(hrs) + parseInt(Days) * 24;
    	    }
			//console.log(hrs, mins, secs);
		
			deadline = new Date(Date.now() + hrs * 60 * 60 * 1000 + mins * 60 * 1000 + secs * 1000);
				
			const timerStartedOn=new Date()

			const intervalId=setInterval(()=>{
				const remainingTime = deadline - new Date();

				const days = Math.floor(remainingTime / (24 * 60 * 60 * 1000));
				const hours = Math.floor((remainingTime % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
				const minutes = Math.floor((remainingTime % (60 * 60 * 1000)) / (60 * 1000));
				const seconds = Math.floor((remainingTime % (60 * 1000)) / 1000);
		  
				
				if (remainingTime <= 0) {
				  //console.log("Clearing dm interval timer");
				  clearInterval(intervalId);
				  window.location.reload();
				  return;
				}
				// Check for maintenance mode 10 minutes before deadline ends
				if (remainingTime == (10 *60 *1000)) {
				 //console.log("checking for maintenance mode 10 minutes before deadline ends");
				  clearInterval(intervalId);
				  window.location.reload();
				  return;
				}
				
				/* Check for maintenance again after every 6 hours ( meathod 1 )
				if (remainingTime % (6 * 60 * 1000) == 0) {
				  //console.log("checking for maintenance mode 6 hours before deadline ends");
				  clearInterval(intervalId);
				  start();
				  return;
				}*/
				/*
				// Check for maintenance again after 6 hours ( meathod 2 )
				timesincetimerstarted = Math.round((new Date() - timerStartedOn) / 1000);
				if (timesincetimerstarted == (6 * 60 * 60)) {
				  //console.log("checking for maintenance mode 6 hours after deadline ends", timesincetimerstarted);
				  clearInterval(intervalId);
				  window.location.reload();
				  return;
				}*/
				if (days > 1) {
    	            node.innerHTML = `<b>${days}</b> days, <b>${hours}</b> hours, <b>${minutes}</b> minutes, <b>${seconds}</b> seconds.`;
    	        }
    	        else if (days == 1) {
    	            node.innerHTML = `<b>${days}</b> day, <b>${hours}</b> hours, <b>${minutes}</b> minutes, <b>${seconds}</b> seconds.`;
    	        } else if (days == 0) {
    	            node.innerHTML = `<b>${hours}</b> hours, <b>${minutes}</b> minutes, <b>${seconds}</b> seconds.`;
	            }
			},1000)
			return intervalId
		},
		//main page of extension
		async loadFinal(onlyCustom) {
			let content = pages.headerMarkup()
			content += `<main class="bodyHeight" style="height:auto;">`
			
			if(!onlyCustom){
				content += pages.profileCardMarkup('profileData', '')
				content += pages.profileCardMarkup('userData', 'none')
			
				content += `
				<div class="flex bodyCardHeight" id="boxContainer">
					<div id="followBox" class="border_and_text-secondary">Follow</div>
					<div id="unfollowBox">Unfollow</div>
				</div>`
			}
			content+=
       	 	`<div id="optionContainer" style="height:36rem;">

            	<div id="followOptions" class="flex align-center justify-center" style="padding-top:10px;">
					<div class="selectListMenu listOptions">`
			if(!onlyCustom) content+=
						`<h1 class="text-center">Which List to Follow?</h1>
						<button id="followersList" style="flex-direction: row;">
							<p class="m-n">${state.profileData.username} Followers List (${convertToInternationalCurrencySystem(state.profileData.followers)})
							</p>
							<img class="icon" src=${chrome.runtime.getURL("/extension-icon/chevron-right_signup.svg")} />
						</button>
						<button id="followingList" style="flex-direction: row;>
							<p class="m-n">${state.profileData.username} Following List (${convertToInternationalCurrencySystem(state.profileData.following)})</p>
							<img class="icon" src="${chrome.runtime.getURL("/extension-icon/chevron-right_signup.svg")}" />
						</button>`
			else content+=`
						<button id="refreshExtension" style="flex-direction: row;padding:20px;">
							<p class="m-n">Refresh Extension
							</p>
							<img class="icon" src=${chrome.runtime.getURL('extension-icon/reload.svg')} />
						</button>
						<div class="flex-col align-center justify-center" style="font-size:1.2em;text-align:center;padding:20px;">
							<span>Please open a profile page. Url will look like this</span>
							<span>instagram.com/&lt;username&gt;</span>
							<span style="padding-top:20px;">OR</span>
						</div>
						`
			content+=
						`<button id="followCsvList" style="flex-direction: row;>
							<p class="m-n">Upload a list of Instagram users whom you want to follow</p>
							<img class="icon" src="${chrome.runtime.getURL("/extension-icon/chevron-right_signup.svg")}" />
						</button>

						<p class="text-center m-m">You can change the tab, extension will run in the background.</p>
						<div style="display: flex; flex-direction: row; position: relative; bottom: -50px;">
							<a href="https://prospectss.com/feedback/live-support/" target="_blank" style="text-decoration: none;">
								<button type="button" class="btn5 button-primary1" style="display:flex; flex-direction:row;">
									<p class="dot1"></p>
									<p style="margin:14px auto">Live Support</p>
								</button>
							</a>
							<a href="https://prospectss.tawk.help/category/instagram-auto-follow-unfollow-tool" target="_blank" style="text-decoration: none;">
								<button type="button" class="btn4 button-primary1" style="display:flex; flex-direction:row;">
									<span style="font-size: 11px; margin-right:4px">📖</span>
									<p style="margin:14px auto">KnowledgeBase</p>
								</button>
							</a>
						</div>
					</div>
					

					<div class="flex-col followOperation  none" style="margin:auto">
						<div class="warning_message m-m fw-b none">
							<p></p>
						</div>
						<h1 class="profileInfo text-center m-m fs-l" style="/*margin-top: 50px;*/">${(state.selectedListType=="followCSV"||state.selectedListType=="")?`Following from the<br>uploaded list`:`Following from ${state.profileData.username} ${state.selectedListType} list `}</h1>
						<div class="followNumber m-m">
							<h1 class="text-center" style="font-size:40px;"></h1>
							<p class="text-center fw-b fs-m color-lightBlack none m-m">Total followed</p>
						</div>
						<div class="m-m">
							<p id="myp" class="text-center followOperationTime">
							<style>
								#extensionBox #myp{
									background-color: white;	
								}
							  </style>
							  
							</p>
							<p  id="hide1" class="text-center nextFollowTime">
								<style>
								#extensionBox #hide1{
									background-color: white;	
								}
							</style>
							</p>
						</div>
						<div id="csvConfig" class="none flex-col align-center" style="padding-bottom:20px;">
							<label for="uploadCSV" class="text-center" style="cursor:pointer;font-size:1em;">Upload a list of Instagram users whom you want to follow</label>
							<input id="uploadCSV" type="file" accept=".csv"></input>
							<div id="csvCol" class="flex-col align-center">
							</div>
							<style>
								input[type="file"]{
									width:15em;
									cursor:pointer;
								}
								input::file-selector-button {
									background-color:rgb(105, 108, 228);
									color:#fff;
									border:none;
									padding:5px 10px;
									border-radius:5px;
									cursor:pointer;
								}
							</style>
						</div>
						<div id="followConfig">
						<div>
							<label for="follow_profile_checkbox" class="text_light_theme" style="display:flex; flex-direction:row;">
								<input type="checkbox" name="follow_profile_checkbox" id="follow_profile_checkbox" class="follow_profile_checkbox">Don't follow if the user does not have a profile picture</input>
							</label>
						</div>
						<div>
							<label for="follow_private_checkbox" class="text_light_theme" style="display:flex; flex-direction:row;">
								<input type="checkbox" name="follow_private_checkbox" id="follow_private_checkbox" >Don't follow if the user account is private </input>
							</label>
						 </div>
								<div>
							<label for="follow_limit_checkbox" class="text_light_theme" style="display:flex; flex-direction:row;">
								<input type="checkbox" name="follow_limit_checkbox" id="follow_limit_checkbox" class="follow_limit_checkbox">Set max user limit</input>
							</label>
						</div>
						<div id="follow_limit_input_container"></div>
					</div>
					<div id="followUpdate" class="none">
						<p class="text-center m-m">Scrape in progress do not close this tab or this window.</p>
					</div>
					<div>
						<button id="start_following_button" class="btn button-primary optionButton fs-xl">Start Following</button>
						<button id="stop_following_button" class="btn optionButton fs-xl none" style= "margin-top: -12px;">Stop Following</button>
						<button id="finish_following_button" class="btn button-progress fs-xl none">Done</button>
						<div>
						<a id="a5">Download CSV</a>
						</div>
					</div>
					<p style="margin-bottom:30px;"class="text-center m-m">You can change the tab, extension will run in the background.</p>
					<div style="display: flex; flex-direction: row;">
						<a href="https://prospectss.com/feedback/live-support/" target="_blank" style="text-decoration: none;"><button  type="button" class="btn5 button-primary1" ><p class="dot"></p><p style="margin:14px auto">Live Support</p></button></a>
						<a  href="https://prospectss.tawk.help/category/instagram-auto-follow-unfollow-tool" target="_blank" style="text-decoration: none;"><button  type="button" class="btn4 button-primary1" ><span style="font-size: 11px; margin:1px auto">📖</span><p style="margin:14px auto">KnowledgeBase</p></button></a>
					</div>
				</div>
            </div>`

			if(!onlyCustom) content+=
            `<div id="unfollowOptions" style="padding-top:60px;">
            	<div class="warning_message m-m fw-b none">
					<p style="color:red;"></p>
				</div>
				<h1 class="selfInfo text-center m-m fs-l">Unfollowing from ${state.userData.username} following list</h1>
				
				<div class="unfollowNumber m-m">
					<h1 class="text-center" style="font-size:40px;">0/ ${convertToInternationalCurrencySystem(state.userData.following)}</h1>
					<p class="text-center fw-b fs-m color-lightBlack none m-m">Total unfollowed</p>
				</div>

				<div class="m-m">
					<p class="text-center m-m selectedOption"></p>
					<p id="myp2" class="text-center m-m unfollowOperationTime">
						<style>
						#extensionBox #myp2{
							background-color: white;	
						}
					</style>	
					</p>
					<p id="hide2" class="text-center nextUnfollowTime">
						<style>
						#extensionBox #hide2{
							background-color: white;
							color:red	
						}
					</style>
					</p>
				</div>

				<div id="unfollowConfig">
					<div>
						<label for="unfollow_option_menu" class="block text_light_theme mb-m">Choose unfollow type:
						<select id="cars">
							<option selected value="0">Everyone who do not Follow you</option>
							<option value="1">Everyone who Follow you</option>
							<option value="2">Everyone</option>
						</select>
						</label>
					</div>
					<div>
						<label for="unfollow_limit_checkbox" class="text_light_theme" style="display:flex; flex-direction:row;">
						<input type="checkbox" name="unfollow_limit_checkbox" class="unfollow_limit_checkbox" id="unfollow_limit_checkbox">Set max user limit</label>
					</div>
					<div id="unfollow_limit_input_container"></div>
				</div>
				<div id="unfollowUpdate" class="none">
						<p class="text-center m-m">Scrape in progress do not close this tab or this window.</p>
				</div>
				<div>
					<button id="start_unfollowing_button" class="btn button-primary optionButton fs-xl">Start Unfollowing</button>
					<button id="stop_unfollowing_button" class="btn optionButton fs-xl none" style= "margin-top: -12px;" >Stop Unfollowing</button>
					<button id="finish_unfollowing_button" class="btn optionButton button-progress fs-xl none">Done</button>
					<div>
						<a id="a6" >Download CSV</a>
					</div>
					
				</div>
				<p style="margin-bottom:35px; margin-top:15px;" class="text-center">You can change the tab, extension will run in the background.</p>
				<div style="display: flex; flex-direction: row;">
					<a href="https://prospectss.com/feedback/live-support/" target="_blank" style="text-decoration: none;"><button  type="button" class="btn5 button-primary1" ><p class="dot"></p><p style="margin:14px auto">Live Support</p></button></a>
					<a  href="https://prospectss.tawk.help/category/instagram-auto-follow-unfollow-tool" target="_blank" style="text-decoration: none;"><button  type="button" class="btn4 button-primary1" ><span style="font-size: 11px; margin:1px auto">📖</span><p style="margin:14px auto">KnowledgeBase</p></button></a>
				</div>
			</div>
			`

			content += `</main>`
			content += pages.footerLoginMarkup()
			$().innerHTML = content

			//selection of list
			if(!onlyCustom){
				$('#followersList').addEventListener('click', () => setList('followers'))
				$('#followingList').addEventListener('click', () => setList('following'))
			}
			else $('#refreshExtension').addEventListener('click',()=>{window.location.reload()})
			$('#followCsvList').addEventListener('click',()=>setList('followCSV'))
			$('#uploadCSV').addEventListener('input',e=>{
				//parse CSV using papaParse
				Papa.parse(e.target.files[0],{
					header:true,
					dynamicTyping:true,
					complete:(csv)=>{
						var columns=csv.meta.fields
						columns.unshift("Select Columns with usernames")
						document.querySelector('#csvCol').innerHTML=`
							<label for="selectCol" class="text-center" style="font-size:.9em;">Please select column of usernames in csv</label>
							<select id="selectCol" style="min-width:80%;padding:3px;cursor:pointer;">
								${columns.map(col=>`<option>${col}</option>`)}
							</select>
						`
						document.querySelector('#selectCol').addEventListener('input',e=>{
							const column=e.target.value

							state.followProfileList=csv.data.map(row=>row[column])
							state.followProfileList=state.followProfileList.filter(val=>val)

							updateFollowNumber(0,state.followProfileList.length)
							updateFollowTime(state.followProfileList.length)
							console.log(state.followProfileList)
						})
					}
				})

			})

			function setList(list) {
				//update global state
				state.selectedListType = list

				//change the ui
				$('.followOperation').classList.remove('none')
				$('.listOptions').classList.add('none')
				if(list==="followCSV"){
					// $('#followConfig').classList.add('none')
					$('.followNumber h1').innerHTML =""
					$('.followOperationTime').innerHTML = ""

					$('#csvConfig').classList.remove('none')
					//update the ui data from state
					$('.profileInfo').innerHTML = "Following from the<br>uploaded list"
					return
				}

				//update the ui data from state
				$('.profileInfo').innerHTML = `Following from ${state.profileData.username} ${state.selectedListType} list`
				updateFollowNumber(0, state.profileData[state.selectedListType])
				updateFollowTime()
			}
			if(!onlyCustom){
				//if user is at own profile page
				if (state.userData.username === state.profileData.username) state.selectedListType = "followers"
			}
			//if list is already selected by UI button
			if (state.selectedListType) setList(state.selectedListType)

			//to logoutthe user
			$('#logout').addEventListener('click', logout)
			if(!onlyCustom){
				//changing tab design
				$('#boxContainer').addEventListener('click', function (event) {
					if (event.target.id === "followBox") {
						state.selectedOperationType = "profileData"
						$('.profileData').classList.remove('none')
						$('.userData').classList.add('none')

						$('#followOptions').classList.remove('left')
						$('#unfollowOptions').classList.remove('left')
						$('#followBox').classList.add('border_and_text-secondary')
						$('#unfollowBox').classList.remove('border_and_text-secondary')
					}
					else {
						state.selectedOperationType = "userData"
						$('.userData').classList.remove('none')
						$('.profileData').classList.add('none')

						$('#followOptions').classList.add('left')
						$('#unfollowOptions').classList.add('left')
						$('#followBox').classList.remove('border_and_text-secondary')
						$('#unfollowBox').classList.add('border_and_text-secondary')
						updateUnfollowTime()
					}
				})
			}

			//conditionally adding the input box in follow tab
			$('#follow_limit_checkbox').addEventListener('change', function (event) {
				const container = $('#follow_limit_input_container')
				container.innerHTML = ""
				if (event.target.checked) {
					container.innerHTML = ` <label for="follow_limit_input" class="text_light_theme" style="display:flex; flex-direction:row;">Max Limit:
					<input type="number" id="follow_limit_input" name="follow_limit_input" style="position:relative; left:10px;"></label>`

					$('#follow_limit_input').addEventListener('input', function (event) {
						const value = event.target.value
						this.value = parseInt(value)
						if (value < 1) this.value = 1;
						if (value > state.profileData[state.selectedListType]) this.value = state.profileData[state.selectedListType];
						updateFollowNumber(0, this.value)
						updateFollowTime(this.value)
					})
				} else {
					if(state.selectedListType!="followCSV")
						updateUserCount(state.selectedListType)
					updateFollowTime()
				}
			})

			if(!onlyCustom){
				$('#unfollow_limit_checkbox').addEventListener('change', function (event) {
					const container = $('#unfollow_limit_input_container')
					container.innerHTML = ""
					if (event.target.checked) {
						container.innerHTML = ` <label for="follow_limit_input" class="text_light_theme" style="display:flex; flex-direction:row;">Max Limit:
							<input type="number" id="unfollow_limit_input" name="unfollow_limit_input" style="position:relative; left:10px;"></label>`

						$('#unfollow_limit_input').addEventListener('input', function (event) {
							const value = event.target.value
							this.value = parseInt(value)
							if (value < 1) this.value = 1;
							if (value > state.userData.following) this.value = state.userData.following;
							updateUnfollowNumber(0, this.value)
							updateUnfollowTime(this.value)
						})
					} else {
						updateUnfollowNumber(0, state.userData.following)
						updateUnfollowTime()
					}
				})
			}
			//to start following/unfollowing
			$('#start_following_button').addEventListener('click', followStart)
			$('#stop_following_button').addEventListener('click', followStop)
			$('#finish_following_button').addEventListener('click', followFinish)
			if(!onlyCustom){
				$('#start_unfollowing_button').addEventListener('click', unfollowStart)
				$('#stop_unfollowing_button').addEventListener('click', unfollowStop)
				$('#finish_unfollowing_button').addEventListener('click', unfollowFinish)
			}

			//reload event listener
			document.querySelectorAll('#extensionBody .refresh_button').forEach(node => {
				node.addEventListener('click', ()=>window.location.reload())
			})
			//update download csv button
			setInterval(async()=>{
				var time=new Date()
				var timestamp=`_${time.getDate()}_${time.getMonth()+1}_${time.getFullYear()}_${time.getHours()}${time.getMinutes()}${time.getSeconds()}`
				var exportedFilename = 'AutoFollowUnfollow'+timestamp+'.csv' || 'export'+Date.now()+'.csv'
				try{
					var blob = new Blob([state.csv], { type: 'text/csv;charset=utf-8;' });
					if (navigator.msSaveBlob) { 
						navigator.msSaveBlob(blob,exportedFilename);
					} else {
						var link = document.getElementById("a5");
						link.href = URL.createObjectURL(blob);
						link.setAttribute("download", exportedFilename);
						link = document.getElementById("a6");
						link.href = URL.createObjectURL(blob);
						link.setAttribute("download", exportedFilename);
					}
				}
				catch(err){

				}
			},2000)
		},

		//"something went wrong" page
		loadWrongVerify() {
			var manifestVersion = chrome.runtime.getManifest().version;
		 
			let content = pages.headerMarkup(manifestVersion);
		   
			//add main section
			content += `
				<main class="flex-col justify-center items-center">
					<div>
						<div class="flex justify-center">
							<img class="mx-auto" src=${chrome.runtime.getURL(
					"/extension-icon/wrong.svg"
				  )} alt="authentication successful">
						</div>
						<h1 class="text-center" style="font-size:1.5em;padding:1em;">Verification Failed</h1>
						<p class="text-center" style="color:gray;font-size:.9em;">No user with the provided email and account key pair was found.</p>
					</div>
					<div class='flex justify-center' style="position:relative;top:175px;">
						<a href='https://prospectss.com/feedback/live-support/' target='_blank' style="padding:5px;text-decoration:none;">
						<button class='mx-2 px-4 py-2 border-2 rounded'><span style='color: #2DCE89;'>&#11044;</span> Live Support</button>
						</a>
						<a href='https://prospectss.tawk.help/category/instagram-auto-follow-unfollow-tool' target='_blank' style="padding:5px;text-decoration:none;">
						<button class='mx-2 px-4 py-2 border-2 rounded'>📖 Knowledgebase</button>
						</a>
					</div>
				</main>
				`;
		
			//add footer section
			content =
			  content +
			  `
			<footer class="footer-loggedIn">
			  <button id="wrong-try-again" class="button-primary flex justify-between align-center"
			  	style="padding:10px;border:none;border-radius:10px;width:100%;">
				<span class="text-white font-medium">Try logging in again</span>
				<span style="height:1em;">
				  <img src=${chrome.runtime.getURL(
					"/extension-icon/chevron-right.svg"
				  )} alt="chevron right">
				</span>
			  </button>
			</footer>`;
			document.querySelector("#extensionBody").innerHTML = content;
			document
			  .querySelector("#extensionBody #wrong-try-again")
			  .addEventListener("click", logout);
		  },
		//authentication failed
		loadWrong() {
    
			var manifestVersion = chrome.runtime.getManifest().version;
		 
			let content = pages.headerMarkup(manifestVersion);
		   
		
		   
			content += `
				<main class="flex-col align-center justify-center" style="padding:10px">
					<div class="flex-col align-center">
						<div>
							<img class="mx-auto" src=${chrome.runtime.getURL(
					"/extension-icon/reload.svg"
				  )} alt="reload the page">
						</div>
						<h1 style="font-size:1.5em;padding:1em;">Failed to Authenticate</h1>
						<p style="color:gray;font-size:.9em;text-align:center;">No user with provided email and account key pair was found.</p>
							<button id="qwerty" class="button-primary"
								style="
									padding:10px 30px;
									border-radius:10px;
									border:none;
									margin-top:10px;"
							>Try again</button>
					</div>
					<div class="flex" style="position:relative;top:150px;">
					<a href="https://prospectss.com/feedback/live-support/" target="_blank" style="text-decoration: none;">
						<button type="button" class="btn5 button-primary1" style="display:flex; flex-direction:row;">
							<p class="dot"></p>
							<p style="margin:14px auto">Live Support</p>
						</button>
					</a>
					<a href="https://prospectss.tawk.help/category/instagram-auto-follow-unfollow-tool" target="_blank" style="text-decoration: none;">
						<button type="button" class="btn4 button-primary1">
							<span style="font-size: 11px; margin:1px auto">📖</span>
							<p style="margin:14px auto">KnowledgeBase</p>
						</button>
					</a>
				</div>
				</main>
				
				 `;
			content += pages.footerLoginMarkup();
		
			document.querySelector("#extensionBody").innerHTML = content;
			document
			  .querySelector("#extensionBody #logout")
			  .addEventListener("click", logout);
			document.querySelector("#qwerty").addEventListener("click", logout);
		  },
		//"relaod the page" page
		loadReload() {
			let content = pages.headerMarkup()
			content += `<main class="flex align-center justify-center">
          <div>
            <img class="page_image" style="position: relative; left: 100px;" src=${chrome.runtime.getURL("/extension-icon/reload.svg")} alt="reload the page">
            <h1 class="text-heading text-center m-m m-nb">Couldn't fetch details…</h1>
            <p class="text-para text-center m-s">Refresh the page to continue</p>
			<div style="display: flex; flex-direction: row; position: relative; bottom: -200px;">
				<a href="https://prospectss.com/feedback/live-support/" target="_blank" style="text-decoration: none;">
					<button type="button" class="btn5 button-primary1" style="display:flex; flex-direction:row;">
						<p class="dot"></p>
						<p style="margin:14px auto">Live Support</p>
					</button>
				</a>
				<a href="https://prospectss.tawk.help/category/instagram-auto-follow-unfollow-tool" target="_blank" style="text-decoration: none;">
					<button type="button" class="btn4 button-primary1">
						<span style="font-size: 11px; margin:1px auto">📖</span>
						<p style="margin:14px auto">KnowledgeBase</p>
					</button>
				</a>
			</div>
        </main>`
			content += pages.footerLoginMarkup()

			document.querySelector('#extensionBody').innerHTML = content
			document.querySelector('#extensionBody #logout').addEventListener('click', logout)
		},

		//footer markup
		footerLoginMarkup() {
			return `<footer class="footer-loggedIn">
                    <div class="footer-toolkit">
                      <a style="position: absolute; width: 285px;" href="https://prospectss.com/" rel="noopener noreferrer" target="_blank" class="button-marketing button-primary flex align-center justify-center">
                      
                        <span>Try 50+ More Growth Marketing Tools</span>
                      </a>
                      <a style="position: relative; left: 295px;" id="logout"><img src=${chrome.runtime.getURL("/extension-icon/logout.svg")} alt="logout" title="Logout" style="cursor: pointer;"></a>
                     
                    </div>
                </footer>`
		},

		profileCardMarkup(profileType, displayClass) {

			let imageStr = ""
			if (state[profileType]?.is_verified) {
				imageStr = `<img style="height:18px" src="${chrome.runtime.getURL("/extension-icon/verifiedIcon.png")}" />`
			}

			return `<div class="head_card_container ${displayClass} ${profileType} flex flex-row justify-between">
                <div class="head_card">
                    <img src="${state[profileType].profile}"/>
                    <div class="head_card_body">
                        <h1 class="head_card_username flex align-center fw-b" style="font-size:auto;">${state[profileType].username}
						<span class="verifiedIcon flex align-center">
							${imageStr}
						</span></h1>
                        <div class="head_card_users">
                            <span><b>${convertToInternationalCurrencySystem(state[profileType].followers)}</b> Followers</span>
                            <span><b class="following">${convertToInternationalCurrencySystem(state[profileType].following)}</b> Following</span>
                        </div>	
                    </div>
                </div>
				<img style="margin-top:18px;" class="icon-lg refresh_button pointer" src="${chrome.runtime.getURL('extension-icon/rotate-cw.svg')}" />
            </div>`
		},

		//load public profile page
		loadMessage(message) {
			let content = pages.headerMarkup()
			content += `<main class="flex justify-center align-center">
        <div>
		
        <p class="m-m fs-xl text-center fw-b" style="line-height:1.5">${message}</p>
        </div>
    </main>`
			content += pages.footerLoginMarkup()

			document.querySelector('#extensionBody').innerHTML = content
			document.querySelector('#extensionBody #logout').addEventListener('click', logout)

		}
	}

	function $(query = "") {
		return document.querySelector('#extensionBody ' + query)
	}

	//communication with background
	function messageListener({ type }, sender, sendResponse) {
		if (type === "busyStatus") sendResponse({ type: "busyStatus", data: { status: state.isBusy, profile: PROFILE } })
	}
	chrome.runtime.onMessage.addListener(messageListener)


	//placeholder for extension
	const extensionBox = document.createElement('div')
	extensionBox.setAttribute('id', 'extensionBox')
	extensionBox.setAttribute('class', 'uiClosed')
	extensionBox.innerHTML = `
	<div id="extensionBody"></div>
	<div class="ui_close_button">
		<img src=${chrome.runtime.getURL('extension-icon/rightArrow.svg')} alt="extension menu open button">
	</div>
	</div>
	`
	document.body.appendChild(extensionBox)
	console.clear()
	//console.log("Body appended")
	//setting position for body
	document.body.style.position = "relative"
	
	document.querySelector('.ui_close_button').addEventListener('click', async function () {
		isUiOpen = !isUiOpen
		if (isUiOpen){
			await openUI()
			checkState()
		}
		else closeUI()
	})
	function checkState(){
		//----------------------------------------------------
		//-------- Extension starts making use of State ------
		//----------------------------------------------------
		if(state.status!="idle"){
			// document.querySelector('#extensionBox').classList.remove('uiClosed')
			// await openUI()
			if(inMaintenance)
				return
			// await utils.sleep(3000)
			if(state.status==="following"||state.status==="stopfollowing")
				followStart()
			if(state.status==="unfollowing"||state.status==="stopunfollowing"){
				state.selectedOperationType = "userData"
				$('.userData').classList.remove('none')
				$('.profileData').classList.add('none')

				$('#followOptions').classList.add('left')
				$('#unfollowOptions').classList.add('left')
				$('#followBox').classList.remove('border_and_text-secondary')
				$('#unfollowBox').classList.add('border_and_text-secondary')
				updateUnfollowTime()
				unfollowStart()
			}
		}
	}
	if (state.href != location.href) {
		chrome.storage.local.remove("state")
	}
	//adding buttons again if re render happen 
	// window.onload=()=>{
		buttonChecker()
	// }
	async function buttonChecker() {
		if (document.querySelector('#extensionFollower-btn') === null && state.sharedData) {
			if (!state.profileData || state.href !== window.location.href) {
				//profile page check
				if (!notAllowedPages.find(reg => reg.test(location.pathname)) && location.pathname !== '/') {
					//console.log(location.href);
					//setting at the start 
					const [userData, profileData] = await getBothProfileData()
					state.profileData = profileData
					//console.log(state.profileData)
					state.userData = userData
					state.href = window.location.href

					//react change the child so always selecting again
					const followerButton = document.querySelector("main > div > header > section > ul > li:nth-child(2)")
					const followingButton = document.querySelector("main > div > header > section > ul > li:nth-child(3)")
					if (followerButton) {
						followerButton.appendChild(getButton("Auto Follow/Unfollow", "extensionFollower-btn", true))
					}
					if (followingButton) {
						if (state.profileData.username === state.userData.username) {
							followingButton.appendChild(getButton("Auto Unfollow", "extensionFollowing-btn", true))
						} else {
							followingButton.appendChild(getButton("Auto Follow/Unfollow", "extensionFollowing-btn", true))
							//console.log("different user")
						}
					}
				}
			}
		}
		await utils.sleep(1000)
		buttonChecker()
	}

	//utility function 
	//#region

	function sendMessage(msg) {
		try {
			return new Promise(resolve => chrome.runtime.sendMessage(msg, resolve))
		}
		catch (error) {
			//console.log("Send message error")
			//console.log(error)
			pages.loadReload()
		}
	}

	function convertToInternationalCurrencySystem(labelValue) {

		// Nine Zeroes for Billions
		return Number(labelValue) >= 1.0e+9

			? (Number(labelValue) / 1.0e+9).toFixed(2) + " B"
			// Six Zeroes for Millions 
			: Number(labelValue) >= 1.0e+6

				? (Number(labelValue) / 1.0e+6).toFixed(2) + " M"
				// Three Zeroes for Thousands
				: Number(labelValue) >= 1.0e+3

					? (Number(labelValue) / 1.0e+3).toFixed(2) + " K"

					: Number(labelValue);

	}

	function updateFollowTime(users = state.profileData[state.selectedListType]) {
		const rate = 6
		const { hours, minutes } = estimatedOperationTime(users, rate)
		
			$('.followOperationTime').innerHTML = `Expected time for ${users} Follows </br> ${hours > 1 ? hours + ' hours' : hours + ' hour'} ${minutes > 1 ? minutes + ' minutes' : minutes + ' minute'} `
		
	}

	function updateUnfollowTime(users = state.userData.following) {
		const rate = 6
		const { hours, minutes } = estimatedOperationTime(users, rate)
		
			$('.unfollowOperationTime').innerHTML = `Expected time for ${users} Unfollows </br> ${hours > 1 ? hours + ' hours' : hours + ' hour'} ${minutes > 1 ? minutes + ' minutes' : minutes + ' minute'} `
		
		
	}

	function estimatedOperationTime(users, rate) {
		users = Number(users)
		rate = Number(rate)
		const hours = Math.floor(users / rate);
		const minutes = Math.ceil((users % rate) * 60 / 6);
		//console.log("minutes"+minutes)
		return { hours, minutes }
	}

	function getButton(text, id, addClickListener) {
		const button = document.createElement("button")
		button.setAttribute("id", id)
		button.innerHTML = text
		if (addClickListener) button.addEventListener('click', openUI)
		return button
	}

	async function getBothProfileData() {
		try {
			const userData = await userInfo()
			const profileData = await pageInfo()
			//console.log({ userData }, { profileData });
			const formattedProfileData = formatPageInfo(profileData.data.user)
			const formattedUserData = formatUserInfo(userData.user)
			//console.log("getBothProfileData:",formattedProfileData, formattedUserData)
			return [formattedUserData, formattedProfileData]
		}
		catch (error) {
			//console.log(error);
			utils.logError(error)
			//load reload page maybe
			pages.loadReload()
		}
	}

	function updateUserCount(list) {
		let node = null
		if (list === "followers") {
			node = document.querySelector("main > div > header > section > ul > li:nth-child(2) span")
		}
		//(list === "following") {
		else {
			//console.log(list)
			node = document.querySelector("main > div > header > section > ul > li:nth-child(3) span")
		}
		const num = node.title || node.innerHTML
		updateFollowNumber(0, num)
		return parseInt(num.replaceAll(',', ''))
	}

	async function openUI() {
		//Check for Maintenance Mode
		const payload = {
			type: "check_maintenance"
		}
		inMaintenance=await new Promise((res,rej)=>{chrome.runtime.sendMessage(payload, async(response) => {
				// pages.loadMaintenance("3 days, 20:00:00.000")
				// return res(true)
				if (response.data.maintenance) {
					pages.loadMaintenance(response.data["maintenance mode ends in"]);
					//console.log(response);
					return res(true);
				}
				res(false)
			})
		})
		console.log('testing')
		//opening the ui
		document.querySelector('#extensionBox').classList.remove('uiClosed')
		if(inMaintenance)
			return
		//loading the ui
		pages.loadLoading()
		isUiOpen = true
		state.isBusy = false
		clearWarning()
		//login check
		const data = await storage.getKey("login")
		//console.log(data)
		if (!data) {
				pages.loadAuthenticate()
			return
		}


		//profile page check 
		if (notAllowedPages.find(reg => reg.test(location.pathname))) {
			pages.loadMessage(`
			Please login to Instagram to use this extension`)
			return
		}
		if ( location.pathname === '/') {
			pages.loadFinal(true)
			return
		}



		//setting the data
		if (this.id === "extensionFollower-btn") state.selectedListType = "followers"
		if (this.id === "extensionFollowing-btn") state.selectedListType = "following"
		

		if(!state.userData||!state.profileData||true){
			//get both profile data
			const [userData, profileData] = await getBothProfileData()
			state.userData = userData
			state.profileData = profileData
		}

		//if user is at own profile page
		if (state.userData.username === state.profileData.username) state.selectedListType = "followers"

		//profile is private

		if (state.profileData.isPrivate) {

			const privateFollowingSize = await privateCheck(state.profileData.userId, 'following')
			const privateFollowersSize = await privateCheck(state.profileData.userId, 'followers')

			//console.log({ privateFollowingSize, privateFollowersSize });
			//console.log(state.profileData.following, state.profileData.followers)
			if ((privateFollowingSize == 0 && state.profileData.following != 0) || (privateFollowersSize == 0 && state.profileData.followers != 0)) {
				pages.loadMessage("Please load a profile which is public.")
				return
			}
		}

		//checking for other tabs
		//result for this message will open appropriate message
		const busyResponse = await sendMessage({ type: "checkBusy" })

		if (busyResponse.status) {
			if (busyResponse.data.flag) {
				pages.loadMessage(`Please finish <b><b>${busyResponse.data.profile}</i></b> scraping first then refresh.`)
				return
			}
			pages.loadFinal()
			return
		}
		pages.loadReload()

	}

	function closeUI() {
		document.querySelector('#extensionBox').classList.add('uiClosed')
		isUiOpen = false
	}

	function logout() {
		storage.clearKey("login")
		storage.clearKey("state")
		pages.loadAuthenticate()
		state.forceStopOperation = true
		state.selectedListType = ""
		state.isBusy = false
	}

	function clearWarning() {
		if ($('#followOptions .warning_message p')) {
			$('#followOptions .warning_message p').innerHTML = ""
			$('#followOptions .warning_message').classList.add('none')

		}
		if ($('#unfollowOptions .warning_message p')) {
			$('#unfollowOptions .warning_message p').innerHTML = ""
			$('#unfollowOptions .warning_message').classList.add('none')
		}
	}

	async function deductCredit(credit = 2) {
		const { account_key } = await storage.getKey("login")
		const payload = { type: "deductCredit", data: { account_key, credit } }
		const response = await sendMessage(payload)
		if (response.message === "Not enough credits") throw new Error("Not enough credits left")
		if (!response.status) throw new Error("Unable to deduct credit")
		return response
	}

	
	async function logtoolusage(profileurl) {
		try {
			const { account_key } = await storage.getKey("login");
			
		const payload = {
			type: "log-tools-usage",
			data: { account_key ,profileurl},

		};

		//console.log("log-tools-usage");
			const result = await sendMessage(payload);
		//console.log(result)
		//return await sendMessage(payload);
			
		} catch (error) {
		//console.log(error);
		
		}
	}


	//#endregion

	//manager follow
	//#region

	async function followStart(event) {
		try {
			var logindata=await storage.getKey("login")
			var response=await sendMessage({type:"verifyUser",data:logindata})
			if(response.status){
				//status
			}
			else{
				pages.loadWrongVerify()
				//logout after 4.5 seconds
				setTimeout(()=>logout(),4500)
				return
			}

			//check if any other operation is in progress
			if (state.status==="unfollowing"||state.status==="stopunfollowing") {
				$('#followOptions .warning_message').classList.remove('none')
				$('#followOptions .warning_message').querySelector('p').style.color='red'
				$('#followOptions .warning_message p').innerHTML = `Please finish <b><b>unfollowing</b></b> first !!`
				return
			}

			//checking if any other extension is using the extension
			const checkResponse = await sendMessage({ type: "checkBusy" })
			if (!checkResponse.status) {
				pages.loadReload()
				return
			}

			// if (checkResponse?.data?.flag === true) {
			// 	pages.loadMessage(`Please finish <b><b>${checkResponse.data.profile}</b></b> scraping first then refresh.`)
			// 	return
			// }


			//display stop button and othe data
			toggleFollow()
			
			// disable logout button
			document.getElementById('logout').setAttribute('class', 'logout-disabled')
			

			//resetting the global data
			state.forceStopOperation = false
			totalFollowed = 0

			let maxLimit = null
			//check user profile checkbox state
			const checkProfileImage = $('#follow_profile_checkbox').checked
			const privateNotAllowed = $('#follow_private_checkbox').checked
		
			//check max limit checkbox state
			const checkMaxLimit = $('#follow_limit_checkbox').checked

			if(state.selectedListType==="followCSV"){
				//to make follow from custom list fast
				const CUSTOM_BATCH_SIZE=Math.ceil(BATCH_SIZE/10)
				if(state.status==="idle"){
					state.checkProfileImage=checkProfileImage
					state.privateNotAllowed=privateNotAllowed
					if (checkMaxLimit) state.maxLimit = parseInt($('#follow_limit_input').value)
					else state.maxLimit=state.followProfileList.length
					state.ids=null
					state.status="following"
					state.nextMarker=0
					state.need_fetching=true
					state.totalFollowed=0
					state.itemsFormatted={}
					await storage.setKey("state",state)
				}
				$('#followConfig').classList.add('none')
				if(state.status==="stopfollowing"){
					updateFollowNumber(state.totalFollowed,state.maxLimit)
					$('#followUpdate p').innerHTML = ""
					$('.followNumber p').classList.remove('none')
					updateFollowTime(state.maxLimit- state.totalFollowed)
					followStop()
					return
				}
				console.log('state',state)

				for(let i=state.nextMarker;i<state.maxLimit;){
					if(state.need_fetching){
						var userIds=[]
						$('#followUpdate p').innerHTML = "Fetching Profiles from list"

						for(;userIds.length<Math.min(CUSTOM_BATCH_SIZE,state.maxLimit);i++){
							if (state.forceStopOperation) break;
							try {
								// console.log('prof',state)
								var response = await fetch(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${state.followProfileList[i]}`, {
									method: "GET",
									headers: {
									  "x-ig-app-id": "936619743392459"
									},
									credentials:"include"
								})
								var dataobj = await response.json()
								const idofuser=dataobj.data.user.id
								// var response=await fetch(`https://i.instagram.com/api/v1/users/${idofuser}/info/`,{
								// 	method: "GET",
								// 	headers: {
								// 	  "x-ig-app-id": "936619743392459"
								// 	},
								// 	credentials:"include"
								// })
								// dataobj=await response.json()
								dataobj=await userInfo(idofuser)
								console.log('ii',i)
								// console.log('prof',state.checkProfileImage,state.privateNotAllowed)
								// console.log('prof',dataobj.user.has_anonymous_profile_picture,dataobj.user.is_private)
								if(state.checkProfileImage&&dataobj.user.has_anonymous_profile_picture)
									continue
								if(state.privateNotAllowed&&dataobj.user.is_private)
									continue
								// console.log('pushed',state.followProfileList)
								userIds.push(idofuser)
								if(userIds.length>=Math.min(state.maxLimit,CUSTOM_BATCH_SIZE)){
									userIds=await friendshipStatus(userIds)
									// console.log(userIds)
									// if(userIds.length>=state.maxLimit)
									// 	break
								}
								await utils.sleep(Math.random() * 10000 + 500)
							} catch (err) {

							}
						}
						state.ids=userIds
						state.nextMarker=i
						state.need_fetching=false
						await storage.setKey("state",state)
						// console.log(state)
					}
					if (state.forceStopOperation) break;
					$('#followUpdate p').innerHTML = ""
					await followAll(state.ids, state.maxLimit)
					state.need_fetching=true
				}
				if(state.status!="stopfollowing"){
					$('.followNumber h1').innerHTML = state.totalFollowed
					$('#finish_following_button').classList.remove('none')
					document.getElementById('logout').removeAttribute('class')

                     
					$('#stop_following_button').classList.add('none')
                     
					$('.profileInfo').innerHTML = `followed ${state.totalFollowed} from the uploaded list`
				}
				return
			}

			//if yes get maximum limit value
			if (checkMaxLimit) maxLimit = parseInt($('#follow_limit_input').value) || updateUserCount(state.selectedListType)
			else {
				maxLimit = updateUserCount(state.selectedListType)
			}
			//get list value
			let listType = state.selectedListType

			//make the extension busy
			state.isBusy = true

			$('#followUpdate p').innerHTML = `Getting page info`
			// $('.profileInfo').innerHTML = ""

			const data = await pageInfo()
			
			if(state.status==="idle"){
				state.status="following"
				state.totalFollowed=0
				state.checkProfileImage=checkProfileImage
				state.privateNotAllowed=privateNotAllowed
				state.maxLimit=maxLimit
				state.itemsFormatted={}
				state.ids=null
				state.need_fetching=true
				state.nextMarker=null
				await storage.setKey("state",state)
			}
			
			const pageId = data.data.user.id
			PROFILE = data.data.user.username
			//console.log(pageId,PROFILE)
			//message to display
			if(state.status==="stopfollowing"){
				updateFollowNumber(state.totalFollowed,state.maxLimit)
				$('#followUpdate p').innerHTML = ""
				$('.followNumber p').classList.remove('none')
				updateFollowTime(state.maxLimit- state.totalFollowed)
				followStop()
				return
			}
			$('#followUpdate p').innerHTML = `Finding users which are not followed by you, in the ${listType} of ${PROFILE}`
			
			//console.log({ checkProfileImage, maxLimit, listType, checkMaxLimit, pageId });
			//get all the min(max_limit, 100) users of the list
			//give me this many userid which are not being followed by me

			//issue
			//do request in a batch of 100
			console.log("state",state)
			for (let i = state.totalFollowed, nextMarker = null, ids = []; i < state.maxLimit; i += BATCH_SIZE) {
				if (state.forceStopOperation) break;
				if(state.need_fetching){
				$('#followUpdate p').innerHTML = `Finding users which are not followed by you, in the ${state.selectedListType} of ${state.profileData.username}`
					let result = await userIdsByType(pageId, listType,Math.min(state.maxLimit,BATCH_SIZE), state.checkProfileImage, state.nextMarker,state.privateNotAllowed)
					state.ids = result.ids
					state.nextMarker = result.nextMarker
					state.need_fetching=false
					await storage.setKey("state",state)
				}
				//console.log(result?result:null)
				if (state.forceStopOperation) break;
				
				//console.log(result);	
				
				
				//start sending requests to follow them
				updateFollowNumber(0, maxLimit)
				$('#followUpdate p').innerHTML = ""
				$('.followNumber p').classList.remove('none')
				
				await followAll(state.ids, state.maxLimit)
				state.need_fetching=true
			}
			if(state.status!="stopfollowing"){
				$('.followNumber h1').innerHTML = state.totalFollowed
				$('#finish_following_button').classList.remove('none')
				document.getElementById('logout').removeAttribute('class')


				$('#stop_following_button').classList.add('none')


				$('.profileInfo').innerHTML = `followed ${state.totalFollowed} from ${state.profileData.username} ${state.selectedListType} list`
			}

		}
		catch (error) {
			console.log(error);
			followStop()
			utils.logError(error)
			pages.loadReload()
		}
	}

	function resetState(){
		storage.clearKey("state")
		state.status="idle"
		//following,followers
		state.selectedListType = ""
		//unfollow -> userData, follow->profileData
		state.selectedOperationType = "profileData"
		state.checkBeforeStart = false
		storage.setKey("state",state)
	}
	function followFinish() {
		state.isBusy = false
		PROFILE = ""
		toggleFollow()
		$('#stop_following_button').classList.toggle('none')
		$('#finish_following_button').classList.add('none')
		
		//change the ui
		$('.followOperation').classList.toggle('none')
		$('.listOptions').classList.toggle('none')

		$('.profileInfo').innerHTML = `Following from ${state.profileData.username} ${state.selectedListType} list`

		$('#followUpdate p').innerHTML = ``
		$('.nextFollowTime').innerHTML = ""
		$('.followNumber p').classList.add('none')

		try {
			updateUserCount(state.selectedListType)
			clearWarning()
			updateUnfollowTime()
			unfollowNumber()
		} catch (error) {
			
		}
		updateFollowTime(state.maxLimit-state.totalFollowed)

		if(state.selectedListType=="followCSV"){
			$('#csvConfig').classList.toggle('none')
			updateFollowNumber(0,state.maxLimit)
		}
		//reset data
		$('#follow_profile_checkbox').checked = false
		$('#follow_limit_checkbox').checked = false
		$('#follow_limit_input_container').innerHTML = ""
		resetState()

	}

	function toggleFollow() {
		$('#start_following_button').classList.toggle('none')
		$('#stop_following_button').classList.toggle('none')
		$('#followUpdate').classList.toggle('none')
		$('#followConfig').classList.toggle('none')
		if(state.selectedListType==="followCSV")
			$('#csvConfig').classList.toggle('none')
	}

	//this function will break loops in the manager flow
	//follow finish will be called in every case
	async function followStop() {
		$("#stop_following_button").removeEventListener("click",followStop)
		state.forceStopOperation = true
		state.isBusy = false
		clearWarning()
		PROFILE = ""
		// let waitingTime = state.min*1000*60

		if(state.status==="following"){
			state.waitingTime=new Date(600000+Date.now())
			state.status="stopfollowing"
			await storage.setKey("state",state)
		}
					
		const node = $('.nextFollowTime')
			const timeoutId = setInterval(async function () {
				var remainingtime=new Date(state.waitingTime)-new Date()
				const minutes=Math.floor(remainingtime/(1000*60))
				const seconds=Math.floor(remainingtime%(1000*60)/1000)
				if(minutes==0 && seconds==0){
					// // var x = document.getElementById("hide1");
				
					// $('#hide1').style = "red";
					// if (x.style.display === "none") {
					// x.style.display = "block";
					// } else {
					// x.style.display = "none";
					// }
				}
				if (remainingtime<= 0) {
					clearInterval(timeoutId)
					return
				}
				
				node.innerHTML = `</br><p style="color:red;">This extension will stop in </br> <b>${minutes} minutes ${seconds} seconds</b></p>`

				
					// state.waitingTime -= 1000
				
			}, 1000);
			// await utils.sleep(state.min*60*1000)
			await utils.sleep(new Date(state.waitingTime)-new Date())

			
			// var x = document.getElementById("myp2");
			// 	if (x.style.display === "none") {
			// 	x.style.display = "block";
			// 	} else {
			// 	x.style.display = "none";
			// }
			node.innerHTML=""
			$('#finish_following_button').classList.remove('none')
			$('#stop_following_button').classList.add('none')
			document.getElementById('logout').removeAttribute('class')
	}

	function updateFollowNumber(number, limit) {
		//console.log(number, limit);
		$('.followNumber h1').innerHTML = `${number}/${limit}`
	}

	//#endregion

	//manager unfollow
	//#region
	async function unfollowStart() {
		try {
			var logindata=await storage.getKey("login")
			var response=await sendMessage({type:"verifyUser",data:logindata})
			if(response.status){
				//status
			}
			else{
				pages.loadWrongVerify()
				//logout after 4.5 seconds
				setTimeout(()=>logout(),4500)
				return
			}
			if (state.status==="following"||state.status==="stopfollowing") {
				$('#unfollowOptions .warning_message').classList.remove('none')
				$('#unfollowOptions .warning_message p').innerHTML = `Please finish <b><b>following</b></b> first !!`
				return
			}
			const checkResponse = await sendMessage({ type: "checkBusy" })
			if (!checkResponse.status) {
				pages.loadReload()
				return
			}

			// if (checkResponse?.data?.flag === true) {
			// 	pages.loadMessage(`Please finish <b><b>${checkResponse.data.profile}</b></b> scraping first then refresh.`)
			// 	return
			// }

			toggleUnfollow()
			state.forceStopOperation = false
			totalUnfollowed = 0

			// disable logout button
			document.getElementById('logout').setAttribute('class', 'logout-disabled')

			let maxLimit = state.userData.following
			//check unfollow type option menu
			const menuValue = $('#unfollowOptions #cars').value

			//check max limit checkbox state
			const checkMaxLimit = $('#unfollow_limit_checkbox').checked

			//if yes get maximum limit value
			if (checkMaxLimit) maxLimit = parseInt($('#unfollow_limit_input').value) || maxLimit
			else maxLimit = state.userData.following

			//make the extension busy
			state.isBusy = true
			PROFILE = state.sharedData.config.viewer.username
			//console.log("profile"+PROFILE)
			//console.log({ menuValue, checkMaxLimit, maxLimit })

			if(state.status==="idle"){
				state.status="unfollowing"
				state.totalUnfollowed=0
				state.maxLimit=maxLimit
				state.menuValue=menuValue
				state.itemsFormatted={}
				await storage.setKey("state",state)
			}
			if(state.status==="stopunfollowing"){
				updateUnfollowNumber(state.totalUnfollowed,state.maxLimit)
				$('#unfollowUpdate p').innerHTML = ``
				$('.unfollowNumber p').classList.remove('none')
				updateUnfollowTime(state.maxLimit-state.totalUnfollowed)
				unfollowStop()
				return
			}
			let followingList = []
			let followersList = []
			let result = []

			var following ="following";
			if (state.menuValue === '2') {
				$('#unfollowUpdate p').innerHTML = `Getting ${state.maxLimit} users to unfollow`
					result = await getAllUsers(state.sharedData.config.viewerId, following, state.maxLimit)
				
				
				$('.selectedOption').innerHTML = 'Everyone'
			} else {
				$('#unfollowUpdate p').innerHTML = `Getting list of following`
				followingList = await getAllUsers(state.sharedData.config.viewerId, "following")
				$('#unfollowUpdate p').innerHTML = `Getting list of followers`
				followersList = await getAllUsers(state.sharedData.config.viewerId, "followers")
			}
			// everyone in following who is not in followers
			

				if ( state.menuValue === '0') {
					let followers = {}
					followersList.forEach(id => followers[id] = true)
					result = followingList.filter(id => !followers[id])
					
						$('.selectedOption').innerHTML = 'Everyone who do not Follow you'
					
			}
				//everyone in following who is a follower
			if (state.menuValue === '1') {
				let followers = {}
				followingList.forEach(id => followers[id] = true)
				result = followingList.filter(id => followers[id])
				//console.log("unfollowstart result"+result)
				$('.selectedOption').innerHTML = 'Everyone who Follow you'
			}

			//unfollow result
			updateUnfollowNumber(0, state.maxLimit)
			$('#unfollowUpdate p').innerHTML = ``
			// $('.selfInfo').innerHTML = ""


			result.length = state.maxLimit
			//console.log(result);
			let r = [JSON.stringify( result)]
			
			//console.log(r);

			$('.unfollowNumber p').classList.remove('none')

			await unfollowAll(result)
			if(state.status!="stopunfollowing"){
				$('.unfollowNumber h1').innerHTML = state.totalUnfollowed
				$('#finish_unfollowing_button').classList.remove('none')
				$('#stop_unfollowing_button').classList.add('none')
				document.getElementById('logout').removeAttribute('class')

				$('.selfInfo').innerHTML = `Unfollowed ${state.totalUnfollowed} from ${state.userData.username} following list`
			}
		}
		catch (error) {
			//console.log(error);
			unfollowStop()
			utils.logError(error)
			pages.loadReload()
		}
	}
	
	async function unfollowStop() {
		$("#stop_unfollowing_button").removeEventListener("click",unfollowStop)
		state.forceStopOperation = true
		state.isBusy = false
		clearWarning()
		PROFILE = ""
		// let waitingTime = state.min*1000*60
		
		if(state.status==="unfollowing"){
			state.waitingTime=new Date(600000+Date.now())
			state.status="stopunfollowing"
			await storage.setKey("state",state)
		}
					
		const node = $('.nextUnfollowTime')
			const timeoutId = setInterval(function () {
				var remainingtime=new Date(state.waitingTime)-new Date()
				const minutes=Math.floor(remainingtime/(1000*60))
				const seconds=Math.floor(remainingtime%(1000*60)/1000)
				if(minutes==0 && seconds==0){
				
					// $('#hide2').style = "red";
					// if (x.style.display === "none") {
					// x.style.display = "block";
					// } else {
					// x.style.display = "none";
					// }
				}
				if (remainingtime<= 0) {
					clearInterval(timeoutId)
					return
				}
				
				node.innerHTML = `</br><p style="color:red;">This extension will stop in </br> <b>${minutes} minutes ${seconds} seconds</b></p>`

					// waitingTime -= 1000
				
			}, 1000);
			await utils.sleep(new Date(state.waitingTime)-new Date())

			node.innerHTML=""
			var x = document.getElementById("myp2");
				if (x.style.display === "none") {
				x.style.display = "block";
				} else {
				x.style.display = "none";
			}
			$('.unfollowNumber h1').innerHTML = state.totalUnfollowed
			$('#finish_unfollowing_button').classList.remove('none')
			$('#stop_unfollowing_button').classList.add('none')
			document.getElementById('logout').removeAttribute('class')

			$('.selfInfo').innerHTML = `Unfollowed ${state.totalUnfollowed} from ${state.userData.username} following list`
	}

	function toggleUnfollow() {
		$('#start_unfollowing_button').classList.toggle('none')
		$('#stop_unfollowing_button').classList.toggle('none')
		$('#unfollowUpdate').classList.toggle('none')
		$('#unfollowConfig').classList.toggle('none')
	}

	function unfollowFinish() {
		state.isBusy = false
		PROFILE = ""
		resetState()
		toggleUnfollow()
		$('#stop_unfollowing_button').classList.toggle('none')
		$('#finish_unfollowing_button').classList.add('none')

		$('.selfInfo').innerHTML = `Unfollowing from ${state.userData.username} following list`
		$('.nextUnfollowTime').innerHTML = ""
		$('#unfollowUpdate p').innerHTML = ``
		$('.unfollowNumber p').classList.add('none')

		unfollowNumber()
		updateUnfollowTime()
		clearWarning()

		$('#unfollowOptions #cars').value = 0
		$('#unfollow_limit_checkbox').checked = false
		$('#unfollow_limit_input_container').innerHTML = ""
	}

	async function unfollowNumber(updateOnUI = true) {
		const userData = await userInfo()
		const formattedUserData = formatUserInfo(userData.user)
		//console.log(formattedUserData);
		state.userData = formattedUserData
		//add the code for image as well
		if (updateOnUI)
			updateUnfollowNumber(0, state.userData.following)
		$('.userData .following').innerHTML = convertToInternationalCurrencySystem(state.userData.following)
		updateUnfollowTime()
		return userData
	}

	function updateUnfollowNumber(number, limit) {
		$('.unfollowNumber h1').innerHTML = `${number}/${limit}`
	}

	//#endregion


	//apis
	//#region

	async function unfollowAll(ids) {
		const k=[]
		const t=[]
		//usernames list
		const usernames=[]
		
		var result = {};
		var response=null
		console.log("state",ids)
		console.log(state)
		for (let id =state.totalUnfollowed; id < ids.length||new Date(state.waitingTime)-new Date()>0;) {
			if(!(state.wait?state.wait:false)&&id<ids.length){
				if (state.forceStopOperation) break;
				const url = `https://www.instagram.com/web/friendships/${ids[id]}/unfollow/`
				const profileurl=ids[id]
				logtoolusage(profileurl)
				//console.log(url)
				
				var today=new Date()
				var time1=today.toLocaleTimeString();
				const headers = {}
				headers['x-csrftoken'] = state.sharedData.config.csrf_token
				headers['x-instagram-ajax'] = state.sharedData.rollout_hash
				const response = await fetch(url, { method: 'post', headers, credentials: 'include' })
				if (response.status == 429) {
					id--;
				}
				if (response.status === 200) {
					const data = await storage.getKey("login")
					//console.log("Login data : ", data);
					const creditResponse = await sendMessage({ type: "deductCredit", data: { account_key: data.account_key, credit: 2 } })
					//console.log({ creditResponse });
					if (creditResponse.status === false) {
						//console.log(creditResponse)
						//show message and break
						$('#unfollowUpdate p').innerHTML = `<p class='text-center text-red profileInfo m-m fs-l'>
								You do not have enough credits to reusme your automation/campaign.<br>Please upgrade. <br>
								<a class='btn button-primary optionButton fs-xl' style="text-decoration:none; border-radius:8px;" target='_blank' href='https://prospectss.com/app/plan-manager'>Buy Credits</a>
							</p>`
						$('.selectedOption').style.display="none";
						$('.unfollowOperationTime').innerHTML="";
						$('.followOperationTime').innerHTML="";
						following ="";
						break;
					}
				}
				state.totalUnfollowed = id + 1
				state.waitingTime=new Date(Date.now()+600000)
				state.wait=true
				var data=await userInfo(ids[id])
				usernames.push(data.user.username)
	
				k.push(ids[id])
				t.push(time1)
				
				
				k.forEach((key, i) => result[key] = t[i]);
	
				arr=Object.keys(result)
				downloads()
				id++
			}
			await storage.setKey("state",state)
			updateUnfollowNumber(state.totalUnfollowed, ids.length)

	
			if (ids.length - state.totalUnfollowed>=0) updateFollowTime(ids.length - state.totalUnfollowed)
			//console.log(id, response.status);
			

			
			
			function convertToCSV(objArray) {
				var array = typeof objArray != 'object' ? JSON.parse(objArray) : objArray;
				var str = '';
			
				for (var i = 0; i < array.length; i++) {
					var line = '';
					for (var index in array[i]) {
						if (line != '') line += ','
			
						line += array[i][index];
					}
			
					str += line + '\r\n';
				}
			
				return str;
			}
			
			function exportCSVFile(head , items,filename) {
				if (head ) {
					items.unshift(head );
				}
				var jsonObject = JSON.stringify(items);
			
				var csv =  convertToCSV(jsonObject);
				state.csv=csv
				var time=new Date()
				var timestamp=`_${time.getDate()}_${time.getMonth()+1}_${time.getFullYear()}_${time.getHours()}${time.getMinutes()}${time.getSeconds()}`
				var exportedFilename = filename +timestamp+'.csv' || 'export'+Date.now()+'.csv';
				var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
				if (navigator.msSaveBlob) { 
					navigator.msSaveBlob(blob, exportedFilename);
				} else {
					var link = document.getElementById("a6");
					// if (link.download !== undefined) { 
						
					// 	a6.href = URL.createObjectURL(blob);
            		// 	link.setAttribute("download", exportedFilename);
					// }
				}
			}
			
			async function downloads()
			{
			
				let date = new Date()
				let day = date.getDate();
				let month = date.getMonth()+1;
				let year = date.getFullYear();
	
				let fullDate =`${day}-${month}-${year}`;
				
				  var head = {
					ids:"ids",
					username:"username",
					status:"status",
					Date:"date",
					Time:"Time",
					//username:"UserName"
	
				  };
				var itemsFormatted = [];

				let i=-1;
				k.map((item,index) => {
					i++;
				
							state.itemsFormatted[item]={
								// ids:"\"=\"\""+item+"\"\"\"",
								ids:item,
								// username:"\"=\"\""+usernames[index]+"\"\"\"",
								username:usernames[index],
								status:"Unfollowed",
								date:fullDate,
								// Time:"\"=\"\""+t[i]+"\"\"\"",
								Time:t[i],
								//UserName:"\"=\"\""+userNames[i]+"\"\"\""

							}
						
						
				 });
				 Object.keys(state.itemsFormatted).map(k=>itemsFormatted.push(state.itemsFormatted[k]))
				 var filename='AutoFollowUnfollow';
				 exportCSVFile(head, itemsFormatted,filename);
				 await storage.setKey("state",state)

			
				// format the data
				
				// call the exportCSVFile() function to process the JSON and trigger the download
			}
			downloads()
			
			const node = $('.nextUnfollowTime')

			// let waitingTime = new Date(Date.now()+10*60*1000)
			//console.log(waitingTime)
			//let waitingTime = new Date(Date.now()+600000)
			//console.log(waitingTime)
			const timeoutId = setInterval(async function () {
				const remainingtime=new Date(state.waitingTime)-new Date()
				const minutes=Math.floor(remainingtime/(1000*60))
				const seconds=Math.floor((remainingtime%(1000*60))/1000)
				 state.min=minutes
				
				
				if (remainingtime<=0 ) {
					
					clearInterval(timeoutId)
					state.wait=false
					await storage.setKey("state",state)
					node.innerHTML='UnFollowing....'
					return				
					
				}
				if(state.forceStopOperation == true){
					state.wait=false
					await storage.setKey("state",state)
					clearInterval(timeoutId)
				}
				
					
					if (response!=null&&response.status == 429) {
						node.innerHTML = `Limit reached, retrying in ${minutes} minutes`
					}
					else {
						node.innerHTML = `</br>Next UnFollow request in </br>${minutes} minutes ${seconds} seconds`
					}
					if (document.querySelector('#hide2')) {
						document.querySelector('#hide2').style.color = "black";
					}
					//waitingTime -= 1000
				
			}, 1000);

			await utils.sleep(new Date(state.waitingTime)-new Date())
				
		}

	}

	async function followAll(ids, size) {
		const k=[]
		const t=[]
		//usernames list
		const usernames=[]
		var result = {};
		var arr=[]
		var response=null
		//console.log("ids",ids)
		let id
		if(state.status==="followCSV"){
			id=state.totalFollowed%Math.ceil(BATCH_SIZE/10)
		}
		else id=state.totalFollowed%BATCH_SIZE
		for (; id < ids.length||new Date(state.waitingTime)-new Date()>0;) {
			if(!(state.wait?state.wait:false)&&id<ids.length){
				if (state.forceStopOperation) break;
				const url = `https://www.instagram.com/web/friendships/${ids[id]}/follow/`
				const profileurl=ids[id]
				logtoolusage(profileurl)
				//console.log(url)
			
				var today=new Date()
				var time1=today.toLocaleTimeString();
			
				const headers = {}
				headers['x-csrftoken'] = state.sharedData.config.csrf_token
				headers['x-instagram-ajax'] = state.sharedData.rollout_hash
				response = await fetch(url, { method: 'post', headers, credentials: 'include' })
				if (response.status == 429) {
					id--;
				}
				//deduct for credits
				if (response.status === 200) {
					const data = await storage.getKey("login")
					//console.log("Login data : ", data);
					const creditResponse = await sendMessage({ type: "deductCredit", data: { account_key: data.account_key, credit: 2 } })
					//console.log({ creditResponse });
					if (creditResponse.status === false) {
						//show message and break
						$('#followUpdate p').innerHTML = `<p class='text-center text-red profileInfo m-m fs-l'>
							You do not have enough credits to reusme your automation/campaign.<br>Please upgrade. <br>
							<a class='btn button-primary optionButton fs-xl' style="text-decoration:none; border-radius:8px;" target='_blank' href='https://prospectss.com/app/plan-manager'>Buy Credits</a>
						</p>`
						break;
					}
				}
				state.waitingTime=new Date(Date.now()+600000)
				state.totalFollowed = id + 1
				state.wait=true
				var data=await userInfo(ids[id])
				usernames.push(data.user.username)
				
				k.push(ids[id])
				t.push(time1)
				
				k.forEach((key, i) => result[key] = t[i]);
	
				arr=Object.keys(result)
				downloads()
				id++
			}
			// if (state.forceStopOperation) break;
			// const url = `https://www.instagram.com/web/friendships/${ids[id]}/follow/`
			// const profileurl=ids[id]
			// logtoolusage(profileurl)
			// //console.log(url)
			
			// var today=new Date()
			// var time1=today.toLocaleTimeString();
			
			// const headers = {}
			// headers['x-csrftoken'] = state.sharedData.config.csrf_token
			// headers['x-instagram-ajax'] = state.sharedData.rollout_hash
			// const response = await fetch(url, { method: 'post', headers, credentials: 'include' })
			// if (response.status == 429) {
			// 	id--;
			// }
			// //deduct for credits
			// if (response.status === 200) {
			// 	const data = await storage.getKey("login")
			// 	//console.log("Login data : ", data);
			// 	const creditResponse = await sendMessage({ type: "deductCredit", data: { account_key: data.account_key, credit: 2 } })
			// 	//console.log({ creditResponse });
			// 	if (creditResponse.status === false) {
			// 		//show message and break
			// 		$('#followUpdate p').innerHTML = "<p class='text-center text-red'>Not enough credits left. <a class='text-theme' target='_blank' href='https://prospectss.com/app/plan-manager'>Upgrade</a></p>"
			// 		break;
			// 	}
			// }
			// state.totalFollowed = id + 1
			
			await storage.setKey("state",state)
			
			updateFollowNumber(state.totalFollowed, size)
			//console.log(id, response.status);
			if (ids.length - state.totalFollowed>=0) updateFollowTime(size - state.totalFollowed)

			// var data=await userInfo(ids[id])
			// usernames.push(data.user.username)
			
			
			
			// k.push(ids[id])
			// t.push(time1)
			
			
			// k.forEach((key, i) => result[key] = t[i]);

			// arr=Object.keys(result)
			
			
			function convertToCSV(objArray) {
				var array = typeof objArray != 'object' ? JSON.parse(objArray) : objArray;
				var str = '';
			
				for (var i = 0; i < array.length; i++) {
					var line = '';
					for (var index in array[i]) {
						if (line != '') line += ','
			
						line += array[i][index];
					}
			
					str += line + '\r\n';
				}
			
				return str;
			}
			
			function exportCSVFile(head , items,filename) {
				if (head ) {
					items.unshift(head);
				}
				var jsonObject = JSON.stringify(items);
			
				var csv =  convertToCSV(jsonObject);
				state.csv=csv
				var time=new Date()
				var timestamp=`_${time.getDate()}_${time.getMonth()+1}_${time.getFullYear()}_${time.getHours()}${time.getMinutes()}${time.getSeconds()}`
				var exportedFilename = filename +timestamp+'.csv' || 'export'+Date.now()+'.csv';
				var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
				if (navigator.msSaveBlob) { 
					navigator.msSaveBlob(blob, exportedFilename);
				} else {
					var link = document.getElementById("a5");
				
					// if (link.download !== undefined) { 
					// 	a5.href = URL.createObjectURL(blob);
            		// 	link.setAttribute("download", exportedFilename);
					// }
				}
			}
			
			// const downloads= async() =>
			async function downloads()
			{
			
							
		







				let date = new Date()
				let day = date.getDate();
				let month = date.getMonth()+1;
				let year = date.getFullYear();
	
				let fullDate =`${day}-${month}-${year}`;
				
				  var head = {
					ids:"ids",
					username:"username",
					status:"status",
					Date:"date",
					Time:"Time",
					//username:"UserName"
				  };
				var itemsFormatted = [];
				let i=-1;
								k.map((item,index) => {
									i++;
											state.itemsFormatted[item]={
												ids:item,
												username:usernames[index],
												status:"followed",
												date:fullDate,
												Time:t[i],
												//UserName:"\"=\"\""+userNames[i]+"\"\"\""
			
											}
										
										
								 });
				

				Object.keys(state.itemsFormatted).map(k=>itemsFormatted.push(state.itemsFormatted[k]))
								 var filename='AutoFollowUnfollow';		
							exportCSVFile(head, itemsFormatted,filename);
						
			
				await storage.setKey("state",state)
					
			
		
		
			
				// format the data
				
			 // call the exportCSVFile() function to process the JSON and trigger the download
			}
			// downloads()
			
			const node = $('.nextFollowTime')
			// let waitingTime = new Date(Date.now()+600000)
			const timeoutId = setInterval(async function () {
				const remainingtime=new Date(state.waitingTime)-new Date()
				const minutes=Math.floor(remainingtime/(1000*60))
				const seconds=Math.floor((remainingtime%(1000*60))/1000)
				 state.min=minutes
				
				
				if (remainingtime<=0 ) {
					
					clearInterval(timeoutId)
					state.wait=false
					await storage.setKey("state",state)
					node.innerHTML='Following....'
					return				
					
				}
				if(state.forceStopOperation == true){
					state.wait=false
					await storage.setKey("state",state)
					clearInterval(timeoutId)
				}
				
					
					if (response!=null&&response.status == 429) {
						node.innerHTML = `Limit reached, retrying in ${minutes} minutes`
					}
					else {
						node.innerHTML = `</br>Next Follow request in </br>${minutes} minutes ${seconds} seconds`
					}
					//waitingTime -= 1000
					
					if (document.querySelector('#hide1')) {
						document.querySelector('#hide1').style.color = "black";
					}
				
			}, 1000);
		
			await utils.sleep(new Date(state.waitingTime)-new Date())
		
		}
		

	}

	async function pageInfo() {
		try {
			const pagename = location.href.split('/')[3];
			//console.log(pagename);
			const response = await fetch(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${pagename}`, {
			  method: "GET",
			  headers: {
				"x-ig-app-id": "936619743392459"
			  },
			  credentials:"include"
			});
			const data = await response.json();
			//console.log("pageInfo",data);
			return data;
		}
		catch (error) {
			//console.log(error);
			utils.logError(error)
			throw new Error("Error in loading page info")
		}
	}

	async function getAllUsers(pageId, type, limit = 0) {
		try {
			const ids = []
			let listend = false
			let query = ""

			while (!listend) {
				if (state.forceStopOperation) break;

				let url = `https://i.instagram.com/api/v1/friendships/${pageId}/${type}/${query}`

				const headers = {}
				headers['referer'] = 'https://www.instagram.com'
				headers['x-ig-app-id'] = '936619743392459'

				const response = await fetch(url, { headers, credentials: 'include' })
				const data = await response.json()
				if (data.big_list === false) {
					listend = true
				} else {
					query = `?max_id=${data.next_max_id}`
				}
				//console.log("Many user data", data);

				

				let userIds = data.users.map(user => user.pk)
				
				userNames = data.users.map(user => user.username)
				ids.push(...userIds)

				if (limit && ids.length >= limit) {
					ids.length = limit
					break;
				}

				//the fisrt iteration limit, should be removed
				if (ids.length >= 20000) {
					break;
				}

				await utils.sleep(Math.random() * 1750 + 750)
			}
			//console.log(ids.length, ids)
			return ids
		}
		catch (error) {
			//console.log(error)
			utils.logError(error)
			throw new Error(`All users api not working for ${type}`)
		}
	}

	async function userIdsByType(pageId, type, limit, emptyNotAllowed, nextMarker = null,privateNotAllowed=false) {
		try {
			const ids = []
			let listend = false
			let query = "?count=5000"
			if (nextMarker) {
				query += `&max_id=${nextMarker}`
			}
			
			while (ids.length < limit && !listend) {
				if (state.forceStopOperation) break;
				let url = `https://i.instagram.com/api/v1/friendships/${pageId}/${type}/${query}`
				const headers = {}
				headers['referer'] = 'https://www.instagram.com'
				headers['x-ig-app-id'] = '936619743392459'
				const response = await fetch(url, { headers, credentials: 'include' })
				const data = await response.json()
				
				if (data.big_list === false) {
					listend = true
					nextMarker = null
				} else {
					query = `?count=100&max_id=${data.next_max_id}`
					nextMarker = data.next_max_id
				}
				let userIds = []
				//console.log("Many user data", data);
				if(!privateNotAllowed && !emptyNotAllowed){
					userIds = data.users.map(user => user.pk)
					userNames = data.users.map(user => user.username)
				}

				if(privateNotAllowed){
					const filterUser = data.users.filter(user => !user.is_private)
					
					userIds = filterUser.map(user => user.pk)
					userNames = filterUser.map(user => user.username)
				}

				//filtering out the users who do not have profile picture
				if (emptyNotAllowed) {
					const filteredUser = data.users.filter(user => !user.has_anonymous_profile_picture)
					userIds = filteredUser.map(user => user.pk)
					userNames = filteredUser.map(user => user.username)
				}
				if(privateNotAllowed && emptyNotAllowed){
					const filterUser = data.users.filter(user => !user.is_private)
					const filteredUser = filterUser.filter(user => !user.has_anonymous_profile_picture)
					userIds = filteredUser.map(user => user.pk)
					userNames = filteredUser.map(user => user.username)
				}
				
				const result = await friendshipStatus(userIds)
				
				//console.log("result", result, ids.length, !listend)
				ids.push(...result)
				await utils.sleep(Math.random() * 10000 + 500)

				
			}
			//console.log(ids.length, ids)
			if (ids.length > limit) ids.length = limit
			return { ids, nextMarker}
		}
		catch (error) {
			//console.log(error)
			utils.logError(error)
			throw new Error("Friendship api not working")
		}

	}

	async function friendshipStatus(userIds) {
		try {
			const url = `https://i.instagram.com/api/v1/friendships/show_many/`
			const headers = {}
			headers['x-csrftoken'] = state.sharedData.config.csrf_token
			headers['x-ig-app-id'] = 936619743392459
			headers['content-type'] = 'application/x-www-form-urlencoded'

			const body = `user_ids=${encodeURIComponent(userIds)}`
			const response = await fetch(url, { method: 'post', headers, credentials: 'include', body })
			const data = await response.json()
			

			const result = []
			const friend = data.friendship_statuses

			const responseUserIds = Object.keys(friend)
			//filtering out users whom we already follow
			responseUserIds.forEach(user => {
				if (!friend[user].following) result.push(user)
			})
			//console.log("Friend", result);
			return result
		}
		catch (error) {
			//console.log(error)
			utils.logError(error)
			return []
		}
	}

	async function userInfo(userId = state.sharedData.config.viewerId) {
		try {
			const url = `https://i.instagram.com/api/v1/users/${userId}/info/`
			const headers = {}
			headers['x-csrftoken'] = state.sharedData.config.csrf_token
			headers['x-ig-app-id'] = 936619743392459
			const response = await fetch(url, { headers, credentials: 'include' })
			const data = await response.json()
			//console.log("userInfo:",data)
			return data

		}
		catch (error) {
			//console.log("userInfo error", error)
			utils.logError(error)
			return {}
		}
	}

	async function privateCheck(pageId, type) {
		try {

			const url = `https://i.instagram.com/api/v1/friendships/${pageId}/${type}/`

			const headers = {}
			headers['referer'] = 'https://www.instagram.com'
			headers['x-ig-app-id'] = '936619743392459'

			const response = await fetch(url, { headers, credentials: 'include' })
			const data = await response.json()

			return data?.users?.length || 0

		}
		catch (error) {
			//console.log(error);

			utils.logError(error)
			throw new Error(`Private check api not working for ${type}`)
		}
	}
	//#endregion

	//formatter
	function formatPageInfo(userData) {
		const data = {}
		data.username = userData.username
		data.profile = userData.profile_pic_url_hd || userData.profile_pic_url
		data.userId = userData.id
		data.bio = userData.biography
		data.posts = userData.edge_owner_to_timeline_media.count
		data.following = userData.edge_follow.count
		data.followers = userData.edge_followed_by.count
		data.fullname = userData.full_name
		data.isPrivate = userData.is_private
		data.is_verified = userData.is_verified
		return data
	}

	function formatUserInfo(userData) {
		const data = {}
		data.username = userData.username
		data.profile = userData.profile_pic_url_hd || userData.profile_pic_url
		data.bio = userData.biography
		data.userId = userData.pk
		data.posts = userData.media_count
		data.following = userData.following_count
		data.followers = userData.follower_count
		data.fullname = userData.full_name
		data.isPrivate = userData.is_private
		data.is_verified = userData.is_verified
		return data
	}
}
