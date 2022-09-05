"use strict";

// https://mdn.github.io/dom-examples/service-worker/simple-service-worker/

// navigator.serviceWorker.ready.then((reg)=>console.warn('the service worker registration is now ready',reg));
//^this fires when you press install...





/* SERVICE WORKER */

function Service(){

	//Will be set to true when you can send
	this.connected=false;

	Object.defineProperty(this,'_private',{value:{
		msgId:1
		,pending:{}
		,handlers:{}
	}});

}



/**
 * Connect to a running service worker
 *
 * @return void
 */
Service.prototype.connect=function(){
	if(!Service.isRunning()){
		console.error("service worker not running");
		return Promise.resolve(false);
	}else if(this.connected){
		console.warn("socket already connected to service");
		return Promise.resolve(true)
	}else{
		console.log("setting up MessageChannel to service...",this);
		//We can talk to the service worker using the .postMessage() method, but the service worker can't
		//respond unless we give him a means of doing so, enter MessageChannels.
		this._private.channel = new MessageChannel();

		//The channel has 2 ports. 
		//We keep port1 and listen to it for responses messages from the service
		let onconnect=exposedPromise();
		this._private.channel.port1.onmessage=onconnect.resolve;
		onconnect.then(firstmessage=>{
			if(firstmessage.data=='REGISTERED'){
				//change handler on port 
				this._private.channel.port1.onmessage=receiveResponse.bind(this);

				//set this service as connected
				this.connected=true;
				console.warn("CONNECTED to serviceworker.js!");
			}else{
				console.error("BUGBUG: unexpected first message from service:",firstmessage);
			}
		})

		//We transfer ownership of port2 to the service which it can use to respond to us
		navigator.serviceWorker.controller.postMessage('REGISTER', [this._private.channel.port2]);

		//Return the promise we created above which resolves on connection
		return onconnect; 
	}
}


/**
 * Set at onmessage handler by Service.prototype.connect once connection to service has been established.
 * Should be bound to Service instance
 * @param object event
 * @return void
 * */
function receiveResponse(event){
	try{	
		if(event.data && event.data.msgId){
	  		if(this._private.pending.hasOwnProperty(event.data.msgId)){
				this._private.pending[event.data.msgId].callback(event.data.err,event.data.response);
					//^this is an exposedPromise()
	  		}else{
	  			console.warn("BUGBUG: Not a pending message:", event.data,this);
	  		}
		}else if(event.data && event.data.subject){
			let h=this._private.handlers, s=event.data.subject;
			if(h[s]){
				h[s](event.data.payload);
			}else if(h['*']){
				h['*'](s,event.data.payload);
			}else{
				console.warn("Unhandled broadcast:",event.data);
			}
		}else{
			console.warn('BUGBUG: Unknown message format received from service:',event,this);
		
		}
	}catch(e){
		logErrors(e);
	}
}

Service.prototype.send=function(method,payload,timeout){
	if(!this.connected)
		return Promise.reject("Not connected to service, cannot send yet!");

	try{
		let msgId=this._private.msgId++;
		let promise=exposedPromise(timeout||10000);
		this._private.pending[msgId]=promise;
		var msg={msgId,method,payload};
		console.warn("SENDING:",msg);
		navigator.serviceWorker.controller.postMessage(msg);
		return promise;
	}catch(e){
		return Promise.reject(e);
	}
}


Service.prototype.clearData=async function(){
	if(this.connected){
		try{
			console.log('clearing cached content...');
			await this.send('clearCache');
		}catch(e){
			logErrors(e);
		}
		try{
			console.log('deleting database...');
			await this.send('destroyDatabase');
		}catch(e){
			logErrors(e);
		}
		try{
			console.log('canceling background sync...');
			await this.send('removeBackgroundSync');
		}catch(e){
			logErrors(e);
		}
	}else{
		console.log("not connected to serviceworker, cannot clear background data");
	}
}	


Service.prototype.setBroadcastHandler=function(subject,handler){
	if(handler){
		if(typeof handler!='function')
			throw new TypeError("Expected handler function, got: "+typeof handler);
		this._private.handlers[subject]=handler;
	}else{
		delete this._private.handlers[subject];
	}
}


Service.prototype.fakeIncomingBroadcast=function(subject,payload){
	console.log("FAKE BROADCAST:",{subject,payload});
	this._private.channel.port1.onmessage({data:{subject,payload}})
}


Service.isSupported=function(){
	return 'serviceWorker' in navigator; 
}
Service.isRunning=function(){
	return Service.isSupported() && navigator.serviceWorker.controller;
}
Service.isRegistered=async function(){
	try{
		//service can still be running if it's just been unregistered
		// if(Service.isRunning()){
		// 	return true;
		// }else 
		if(!Service.isSupported()){
			return false;
		}else{
			let registration=await Promise.race([
				new Promise(res=>setTimeout(()=>res(false),100))
				,navigator.serviceWorker.getRegistration()
			])
			return registration && registration.active ? true : false
			//TODO: this isn't really right, installation may take longer if we eg. fetch stuff in it, but the
			//      registration will be done... but how are we using this function??
		}
	}catch(e){
		logErrors(e);
		return false;
	}
}
Service.getRegistration=async function(){
	if(Service.isSupported()){
		if(Service.isRegistered())
			return navigator.serviceWorker.getRegistration();
		else
			throw new Error("No serviceWorker registered");
	}else{
		throw new Error("ServiceWorkers not supported");
	}
}

Service.install=async function(){
	if (!Service.isSupported()) {
		throw new Error("serviceWorkers are not supported by your browser");
	}else if(Service.isRunning()){ 
		throw new Error("serviceWorker is currently running (although it might not be registered, ie. uninstall in progress)");
	}else{
		var registration;
		if(await Service.isRegistered()){
			throw new Error("service worker already registered");
		}else{
			console.log("registering service worker...");
			registration=await navigator.serviceWorker.register('/serviceworker.js',{scope: '/'})
			var i=20;
			while(i--){
				await sleep(500);
				if(await Service.isRegistered()){
					console.warn("Registered service worker"); 
					break;
					//NOTE: installation will continue in background, see onInstall() in serviceworker.js
				}

			}
			if(i<1){
				throw new Error("Service worker still not registered and active after 10 seconds. "
					+"Install may have failed or not finished yet, check console");
			}
			
		}
	}
}

Service.uninstall=async function(){
	try{
		if(await Service.isRegistered()){
			console.log("service worker found, unregistering...")
			let registration=await navigator.serviceWorker.getRegistration();
			await registration.unregister();
			await sleep(500);
			if(await Service.isRegistered()){
				throw new Error("BUGBUG: Service still seems to be registered")
			}else{
				console.warn("Uninstalled app!");
			}
		}else{
			console.debug("no service worker registered");
		}

	}catch(e){
		logErrors(e);
		return Promise.reject("Failed to uninstall app, see console.");
	}
}

Service.checkUpdate=async function(){
	try{
		let registration=await navigator.serviceWorker.getRegistration();
		let promise=listenOnce(registration,'updatefound',2000);		
		console.log("Checking for updated serviceworker.js...");
		registration.update();
		await promise; //resolves if update is found, rejects (throws) on timeout
		return true;
	}catch(cause){
		if(cause=='timeout')
			return false;
		throw new Error("Failed to check for updated service worker",{cause});
	}
}

const service=new Service();



































/* INSTALL POPUP */
/*
 This shows extra details and information about the install process but is usually not used as the
 "Install App" button on the website calls installApp() directly...
*/

function showInstall(){
	showServiceState();
	checkNotifications();
	document.getElementById('overlay').classList.remove('hidden');
}
function hideInstall(overlay,evt){
	if(overlay==evt.target){
		document.getElementById('overlay').classList.add('hidden');
	}
}
function showState(elem,show,tooltip){
	try{
		if(show=='cross')
			console.warn(tooltip);
		else if(tooltip)
			console.log(tooltip);
		
		if(typeof elem=='string')
			elem=document.querySelector(elem) || document.getElementById(elem);
		
		if(!elem || !elem.classList){
			console.error("Not valid element:",elem,show,tooltip);
		}else{
			if(!elem.classList.contains('state')){
				let alt=elem.parentNode.querySelector('.state');
				if(alt)
					elem=alt
				else{
					console.error("Could not find .state elem from:",elem);
					return;
				}
			}
			elem.classList.remove('checkmark');
			elem.classList.remove('cross');
			elem.classList.remove('info');
			if(show && show!='nothing'){
				elem.classList.add(show);
			}
			elem.title=tooltip;
		}

	}catch(e){
		console.warn("Could not show state of something",e,arguments);
	}
}

/**
 * Show the current state of serviceworker registration and show it in install popup
 * @return void
 * @sync
 */
function showServiceState(err){
	try{
		let elem=document.querySelector('#install>.service .state');
		let button=document.querySelector('#install>.service .enable');
		if(err){
			if(err instanceof Error){
				logErrors(e);
				err="See console"
			}
			showState(elem,'cross',err);
			button.disabled=true;
		}else{
			if (!Service.isSupported()) {
				showState(elem,'cross',"serviceWorkers are not supported by your browser");
				button.disabled=true;
			}else if(Service.isRunning()){
				showState(elem,'checkmark',"A serviceWorker is running in the background");
				button.disabled=true;
			}else{
				//supported, but we don't know if it's been installed but inactive
				showState(elem,'nothing');
				Service.isRegistered().then(reg=>{
					if(reg){
						button.disabled=true;
						showState(elem,'checkmark',"A serviceWorker has been registered but it not yet running, reload browser to run");
					}else{
						button.disabled=false;
						console.log("serviceWorkers are supported, but you havn't installed one yet")
					}
				})
			}
		}
	}catch(e){
		logErrors(e);
		showState(elem,'cross','See console');
	}
}

async function registerService(){
	try{
		if(Service.isSupported()){
			if(await Service.isRegistered()){
				console.log("service worker already registered, waiting for it to become ready...");
				await navigator.serviceWorker.ready;
			}else{
				console.log("registering service worker...");
				await navigator.serviceWorker.register('/serviceworker.js',{scope: '/'})
				await sleep(500);
			}
		}
		showServiceState();
	}catch(e){
		showServiceState(e);
	}
}
async function unregisterService(){
	try{
		await Service.uninstall();
		showServiceState();
	}catch(e){
		showServiceState(e);
	}
}

window.addEventListener('appinstalled', checkHomescreen)

function checkHomescreen(evt){
	var elem=document.querySelector('#install>.homescreen .state');
	if(evt){
		console.log("appinstalled event fired. let's see if getInstalledRelatedApps also contains it...")
		showState(elem,'checkmark');
	}
	navigator.getInstalledRelatedApps().then(arr=>{
		if(evt){
			if(arr.length){
				console.log("navigator.getInstalledRelatedApps() lists the app")
			}else{
				console.warn("navigator.getInstalledRelatedApps() does NOT list the app!",evt);
			}
		}else{
			if(arr.length){
				console.log("App has been added to homescreen")
				showState(elem,'checkmark');
			}else{
				console.log("App has NOT been added to homescreen");
				showState(elem,'nothing');
			}
		}
	})
}


































/* NOTIFICATIONS */

/**
* @return string          Never throws, always returns one of 'supported','unsupported','granted','denied'
*/
function checkNotifications(){
	var perm='unsupported';
	try{
		if(Notification){
			perm=Notification.permission;
		}
		let elem=document.querySelector('#install>.notification .state');
		switch(Notification.permission){
			case 'default':
				showState(elem,'nothing');
				return 'supported';
			case 'granted':
				showState(elem,'checkmark',"Notifications have been enabled");
				break;
			case 'denied':
				showState(elem,'cross','You have denied notifications from being shown');
				break;
			case 'unsupported':
				showState(elem,'cross','Notifications are not supported by your browser');
				break;
			default:
				showState(elem,'cross','unknown notification permission: '+Notification.permission);
				perm='unsupported';
		}
		let btn=document.querySelector('#install>.notification .enable');
		if(btn)
			btn.disabled=true;
	}catch(e){
		logErrors(e);
	}
	return perm;
}

async function enableNotifications(){
	try{
		switch(checkNotifications()){
			case 'granted':
				break;
			case 'supported':
				let p=exposedPromise();
				Notification.requestPermission(p.resolve);
				await p;
				if(checkNotifications()=='granted')
					break;
			case 'denied':
			case 'unsupported':
				console.warn("Notifications will not be shown which defeats the main purpose of installing a PWA");
				return false;
		}
		return true;
	}catch(e){
		logErrors(e);
		return false;
	}
}


function showNotification(){
	try{
		//Default to toast if need be...
		if(!Notification || Notification.permission!='granted'){
			console.warn("Not allowed to show notifications");
			showToast.apply(this,arguments);
		}else{
			let obj=prepareNotificationObj.apply(this,arguments)
			console.log("NOTIFY:",obj);
			new Notification(obj.title, obj);
		}
	}catch(e){
		logErrors(e);
	} 	
}

function showToast(){
	try{
		let obj=prepareNotificationObj.apply(this,arguments)
		console.log("TOAST:",obj);
		let toast=document.getElementById('toast-template').content.cloneNode(true).children[0];
		toast.id='toast-'+toast.tag
		if(obj.title!=prepareNotificationObj().title)
			toast.querySelector('.toast-title').innerText=obj.title;
		toast.querySelector('.toast-body').innerText=obj.body;
		document.getElementById("toasts").appendChild(toast);
		setTimeout(()=>expireToast(toast),5000);
	}catch(e){
		logErrors(e);
	}
}

async function expireToast(toast,fast){
	try{
		toast.classList.add('fade-out'+(fast?'-fast':''));
		await sleep(fast?200:1000);
	}catch(e){}
	try{
		toast.remove()
	}catch(e){}
}

function showLeastInstrusiveNotification(){
	if(document.hidden)
		showNotification.apply(this,arguments);
	else
		showToast.apply(this,arguments);
}






















/* WEBSITE */

/**
* Uninstall service, clear cache and reload page
*
* @return void
* @async
*/
function hardReload(){
	Service.uninstall().then(()=>{
		console.log("clearing cache and reloading page")
		location.reload(true)
	});
}


/**
* Enables notification, (re-)registers the service worker and reloads the page
*
* @return void
* @async
*/
async function installApp(){
	try{
		showToast("Installing app...");
		//First make sure notifications are allowed, else wait for them to be
		await enableNotifications(); //will continue even if notifications are not allowed

		//Uninstall possible existing service. This will also clear the services cache and IndexedDB
		if(await Service.isRegistered()){
			if(service.connected)
				await service.clearData();
			await Service.uninstall();
		}

		//Install new service
		await Service.install();

		//setup onesignal
		 window.OneSignal = window.OneSignal || [];
		  OneSignal.push(function() {
		    OneSignal.init({
		      appId: "d5abed7b-6cb5-4b40-99d5-2c503ec49996",
		    });
		  });

	}catch(e){
		logErrors(e);
	}

	//Reload the page
	location.reload(true);
}

/**
 * Check if we're running in a window which looks like an app, not a browser window
 * 
 * @return boolean   
 */
function inStandaloneMode(){
	return window.matchMedia('(display-mode: standalone)').matches;
}


/**
 * Called from seperate script tag at bottom of DOM. Checks if a service is running in which case
 * it changes the layout of the page and connects to the service
 * 
 * @return void
 * @async
 */
async function initApp(){
	try{
		if(!Service.isRunning()){
			console.warn("Not running app because service is not running");
		}else{
			console.warn("RUNNING APP")
			document.body.replaceChild(document.getElementById('app').content,document.getElementById('website'));
			
			//connect to service
			await service.connect();
			
			//Announce we're running in background
			showToast('Paragast is running in the background');

			service.setBroadcastHandler('notification',showLeastInstrusiveNotification);
			service.setBroadcastHandler('headlines',populateTable);
			service.setBroadcastHandler('checked_headlines',setLastCheck);

			await db.setup()

			setLastCheck(await getLast('checked_headlines'));

			// populateTable();//this asks the service
			populateTable(await db.getAll('headlines')); //this checks the db directly

			//For demo purpose check for new headlines
			setTimeout(updateTable,3000);
			var c=setInterval(async ()=>{

				if(!await updateTable()){
					clearTimeout(c);
				}
			},15000);

		}
	}catch(e){
		logErrors(e);
	}
}


























/* APP */

const db=new Database(paragast.database); //db.setup() called in initApp()
Object.defineProperty(window,'db',{value:db});


function broadcast(subject,payload){
	db.fakeIncomingBroadcast(subject,payload);
}
Object.defineProperty(window,'broadcast',{value:broadcast});

Object.defineProperty(window,'notify',{value:showLeastInstrusiveNotification});


function toggleMenu(){
	document.getElementById('menu').classList.toggle('hidden');
	document.querySelector('nav .three-dots').classList.toggle('pressed');
}

async function uninstallApp(){
	try{
		showToast("Uninstalling app...");
		if(db && db.db){
			db.close();	
		}

		//Uninstall possible existing service. This will also clear the services cache and IndexedDB
		if(await Service.isRegistered()){
			if(service.connected)
				await service.clearData();
			await Service.uninstall();
		}else{
			db.destroy();
		}

		//Reload the page
		location.reload(true);
	}catch(e){
		console.error(e);
		showToast("Failed to uninstall app. See console for details.");
	}
}
async function checkForUpdate(){
	if(await Service.checkUpdate()){
		showToast('Found app update')
		//TODO: add info about what the update is... 
	}else{
		showToast("You have the latest version of the app");
	}
}



function demoApp(){
	showNotification("Demo in progress...");
	populateTable();
}

async function updateTable(){
	try{
		console.warn("Asking service to check for new headlines...");
		return await service.send('checkNewHeadlines',3);
	}catch(cause){
		logErrors(new Error("Failed to check for new headlines",{cause}));
	}
}

async function populateTable(headlines){
	try{
		if(!headlines){
			console.warn("Fetching headlines from service...");
			headlines=await service.send('getAllHeadlines');
		}
		if(!Array.isArray(headlines)){
			throw new Error("BUGBUG: populateTable expected an array of headlines at this point, got: "+String(headlines));
		}else if(!headlines.length){
			console.warn("populateTable() got an empty array");
		}else{
			headlines=headlines.sort(sortHeadlines);
			console.warn("Populating table with:",headlines);
			for(let headline of headlines.reverse()){
				addHeadline(headline);
			}
		}
	}catch(cause){
		logErrors(new Error("Failed to populate table",{cause}));
	}
}



function addHeadline(headline){
	let tr=document.getElementById('row-template').content.cloneNode(true).children[0];
	if(headline.id)
		tr.id="headline-"+headline.id;
	for(let elem of Array.from(tr.children)){
		let key=elem.classList[0];
		switch(key){
			case 'publishedAt':
				elem.dataset.published=headline[key];
				updateAge(elem);
				break;
			case 'title':
				elem=elem.appendChild(document.createElement('a'))
				elem.setAttribute('target','_blank');			
				elem.setAttribute('href',headline.url);			
			default:
				elem.innerText=headline[key];
		}
	}
	let body=document.querySelector('#headlines tbody')
	body.insertBefore(tr, body.firstChild);
}



function getAge(timestamp){
	const date=formatDate('object',timestamp);
	if(isNaN(date))
		throw new TypeError("Not a valid timestamp: "+String(timestamp));
	const now=new Date();
	const minutes=Math.round((Date.now()-timestamp)/1000/60);
	if(now.toDateString()==date.toDateString()){
		//Today
		if(minutes<60){
			return minutes+' min ago'
		}else{
			return formatDate('time',date);
		}
	}else{
		let yesterday = new Date(new Date().setDate(new Date().getDate()-1));
		if(yesterday.toDateString()==date.toDateString()){
			return 'Yesterday '+date.getHours()+':'+date.getMinutes();
		}else{
			return date.toDateString();
		}
	}
}
function updateAge(elem){
	elem.innerText=getAge(elem.dataset.published);
}

function updateAllAges(){
	Array.from(document.querySelectorAll('#headlines .publishedAt')).forEach(updateAge);
}

function setLastCheck(ts){
	let date=new Date(ts);
	if(date.getUTCFullYear()>2021)
		document.getElementById('lastHeadlineCheck').innerText='Last checked: '+(new Date(ts)).toLocaleString();
}
